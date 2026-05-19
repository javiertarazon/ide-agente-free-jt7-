'use strict';

const fs = require('fs');
const path = require('path');
const { resolveAgentStateDir } = require('./agent-state-paths');
const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');

function normalizeRuntimeBackend(value) {
  const backend = String(value || '').trim().toLowerCase();
  if (!backend) return 'auto';
  if (backend === 'auto' || backend === 'openclaw' || backend === 'local') return backend;
  if (backend.startsWith('acp:')) return backend;
  return 'auto';
}

class SessionEngine extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.rootDir = opts.rootDir || process.cwd();
    this.statePath = opts.statePath || path.join(this.rootDir, resolveAgentStateDir(this.rootDir), 'panel-state.json');
    this.workerCount = Number(opts.workerCount || 3);
    this.maxChatHistoryEntries = Number(opts.maxChatHistoryEntries || 24);
    this.taskExecutionTimeoutMs = Math.max(30_000, Number(opts.taskExecutionTimeoutMs || 120_000));
    this.policyEngine = opts.policyEngine;
    this.providerRouter = opts.providerRouter;
    this.auditBus = opts.auditBus;
    this.output = opts.output || null;

    this._running = false;
    this._workers = [];
    this._sessions = {};
    this._queue = [];
    this._taskIndex = {};

    this._loadState();
  }

  _emitAudit(sessionId, type, payload = {}) {
    if (this.auditBus) {
      this.auditBus.emit(sessionId, type, payload);
    }
  }

  _saveState() {
    const state = {
      savedAt: new Date().toISOString(),
      sessions: this._sessions,
      queue: this._queue,
      taskIndex: this._taskIndex,
      workerCount: this.workerCount,
    };

    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  _normalizeChatMessage(message) {
    if (!message || typeof message !== 'object') return null;
    const role = String(message.role || '').trim();
    const text = String(message.text || message.content || '').trim();
    if (!role || !text) return null;
    return {
      role,
      text,
      taskId: String(message.taskId || '').trim(),
      provider: String(message.provider || '').trim(),
      model: String(message.model || '').trim(),
      executionMode: String(message.executionMode || '').trim(),
      status: String(message.status || '').trim(),
      at: String(message.at || message.updatedAt || message.createdAt || new Date().toISOString()).trim(),
      isError: Boolean(message.isError),
    };
  }

  _appendSessionMessage(session, message) {
    if (!session) return;
    const normalized = this._normalizeChatMessage(message);
    if (!normalized) return;
    const history = Array.isArray(session.chatHistory) ? session.chatHistory.slice() : [];
    history.push(normalized);
    session.chatHistory = history.slice(-this.maxChatHistoryEntries);
    session.updatedAt = new Date().toISOString();
  }

  _createEmptyAgentState() {
    return {
      lastTaskId: '',
      lastUserGoal: '',
      lastAssistantSummary: '',
      lastRoutePlan: null,
      continuationHint: '',
      updatedAt: '',
    };
  }

  _isJunkSummary(value) {
    const text = String(value || '').trim();
    if (!text) return true;
    return text.length <= 3 && !/[A-Za-z0-9\u00C0-\u024F]/.test(text);
  }

  _extractPayloadText(payload) {
    if (!payload || typeof payload !== 'object') return '';
    if (typeof payload.finalAssistantVisibleText === 'string' && payload.finalAssistantVisibleText.trim()) {
      return payload.finalAssistantVisibleText.trim();
    }
    if (typeof payload.finalAssistantRawText === 'string' && payload.finalAssistantRawText.trim()) {
      return payload.finalAssistantRawText.trim();
    }
    const payloadTexts = Array.isArray(payload.payloads)
      ? payload.payloads.map((item) => String(item?.text || '').trim()).filter(Boolean)
      : [];
    if (payloadTexts.length > 0) {
      return payloadTexts.join('\n\n');
    }
    if (payload.payload && typeof payload.payload === 'object') {
      const nested = this._extractPayloadText(payload.payload);
      if (nested) {
        return nested;
      }
    }
    return '';
  }

  _extractTaskSummary(task) {
    if (!task) return '';
    const candidates = [];
    if (typeof task.result === 'string') {
      candidates.push(task.result);
    }
    if (task.result && typeof task.result.summary === 'string') {
      candidates.push(task.result.summary);
    }
    if (task.result?.run && typeof task.result.run.summary === 'string') {
      candidates.push(task.result.run.summary);
    }
    if (task.result?.final && typeof task.result.final.summary === 'string') {
      candidates.push(task.result.final.summary);
    }
    candidates.push(this._extractPayloadText(task.result));
    candidates.push(this._extractPayloadText(task.result?.raw));
    for (const candidate of candidates) {
      if (!this._isJunkSummary(candidate)) {
        return String(candidate).trim();
      }
    }
    for (const candidate of candidates) {
      const text = String(candidate || '').trim();
      if (text) {
        return text;
      }
    }
    return '';
  }

  _deriveVerification(task, result) {
    const verification = Array.isArray(result?.raw?.final?.verification)
      ? result.raw.final.verification.filter(Boolean).map((item) => String(item))
      : Array.isArray(result?.raw?.run?.verification)
        ? result.raw.run.verification.filter(Boolean).map((item) => String(item))
        : Array.isArray(result?.verification)
          ? result.verification.filter(Boolean).map((item) => String(item))
          : [];
    const changedFiles = Array.isArray(result?.raw?.final?.changedFiles)
      ? result.raw.final.changedFiles.filter(Boolean).map((item) => String(item))
      : Array.isArray(result?.raw?.changedFiles)
        ? result.raw.changedFiles.filter(Boolean).map((item) => String(item))
        : [];
    const route = String(result?.raw?.executionRoute || result?.executionRoute || '').trim();
    const mode = String(result?.executionMode || task?.executionMode || '').trim();
    const warnings = [];
    let status = 'verified';

    if (verification.length === 0) {
      status = 'unverified';
      warnings.push('No se reporto evidencia explicita de verificacion desde la ejecucion.');
    }
    if (mode === 'direct') {
      status = verification.length > 0 ? 'partial' : 'unverified';
      warnings.push('La tarea corrio en modo proveedor directo; no hubo herramientas completas de agente.');
    }
    if (route === 'openclaw-agent' && verification.length === 0) {
      warnings.push('La ruta OpenClaw no devolvio una verificacion detallada en esta corrida.');
    }
    if (route.startsWith('acp:') && verification.length === 0) {
      warnings.push('La ruta ACP no devolvio una verificacion detallada en esta corrida.');
    }
    if (route.startsWith('acp:') && /local-fallback/i.test(route)) {
      warnings.push('La ruta ACP degrado a fallback local seguro.');
    }

    return {
      status,
      evidence: verification,
      changedFiles,
      route,
      warnings,
      checkedAt: new Date().toISOString(),
    };
  }

  _buildSessionAgentStateFromTask(task, previousState = null) {
    const base = previousState && typeof previousState === 'object'
      ? { ...previousState }
      : this._createEmptyAgentState();
    if (!task || typeof task !== 'object') {
      base.updatedAt = new Date().toISOString();
      return base;
    }

    const routePlan = task.routePlan || task.routeMeta?.executionPlan || base.lastRoutePlan || null;
    const summary = this._extractTaskSummary(task) || String(task.error || '').trim();
    const status = String(task.status || '').trim();
    const pieces = [
      task.goal ? `Objetivo: ${String(task.goal).trim()}` : '',
      summary ? `Ultimo resultado: ${summary}` : '',
      status && status !== 'completed' ? `Estado: ${status}` : '',
      routePlan?.primaryRoute ? `Ruta: ${routePlan.primaryRoute}` : '',
      routePlan?.capabilityPlan?.toolMode ? `Capacidades: ${routePlan.capabilityPlan.toolMode}` : '',
    ].filter(Boolean);

    return {
      lastTaskId: String(task.taskId || '').trim(),
      lastUserGoal: String(task.goal || '').trim(),
      lastAssistantSummary: summary,
      lastRoutePlan: routePlan ? JSON.parse(JSON.stringify(routePlan)) : null,
      continuationHint: pieces.join(' | '),
      updatedAt: String(task.updatedAt || new Date().toISOString()).trim(),
    };
  }

  _syncSessionAgentStateFromLatestTask(session) {
    if (!session || typeof session !== 'object') return;
    session.agentState = session.agentState && typeof session.agentState === 'object'
      ? session.agentState
      : this._createEmptyAgentState();
    const taskIds = Array.isArray(session.tasks) ? session.tasks : [];
    const latestTask = taskIds
      .map((taskId) => this._taskIndex[taskId])
      .filter(Boolean)
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0))[0];
    if (!latestTask) {
      return;
    }
    session.agentState = this._buildSessionAgentStateFromTask(latestTask, session.agentState);
  }

  _refreshTaskContinuitySnapshot(session, task) {
    if (!session || !task) return;
    task.chatHistorySnapshot = Array.isArray(session.chatHistory)
      ? session.chatHistory.map((entry) => ({ ...entry }))
      : [];
    task.sessionAgentState = session.agentState ? JSON.parse(JSON.stringify(session.agentState)) : null;
  }

  _rebuildSessionChatHistory(session) {
    if (!session || !Array.isArray(session.tasks)) return [];
    const history = [];
    for (const taskId of session.tasks) {
      const task = this._taskIndex[taskId];
      if (!task) continue;
      const userText = String(task.goal || '').trim();
      if (userText) {
        history.push(this._normalizeChatMessage({
          role: 'user',
          text: userText,
          taskId,
          provider: task.provider,
          model: task.model,
          executionMode: task.executionMode,
          status: task.status,
          at: task.createdAt || task.updatedAt,
        }));
      }
      const summary = this._extractTaskSummary(task);
      if (summary) {
        history.push(this._normalizeChatMessage({
          role: 'assistant',
          text: summary,
          taskId,
          provider: task.provider,
          model: task.model,
          executionMode: task.executionMode,
          status: task.status,
          at: task.updatedAt || task.createdAt,
        }));
        continue;
      }
      if (task.error) {
        history.push(this._normalizeChatMessage({
          role: 'assistant',
          text: String(task.error),
          taskId,
          provider: task.provider,
          model: task.model,
          executionMode: task.executionMode,
          status: task.status,
          at: task.updatedAt || task.createdAt,
          isError: true,
        }));
      }
    }
    return history.filter(Boolean).slice(-this.maxChatHistoryEntries);
  }

  _normalizeLegacyTaskError(task) {
    if (!task || typeof task.error !== 'string') return null;

    const legacyOpenRouter429 = /free jt7 \(openrouter\): error http 429\.\s*provider returned error/i;
    if (!legacyOpenRouter429.test(task.error)) {
      return null;
    }

    const modelInfo = task.model ? ` para el modelo ${task.model}` : '';
    return [
      `Free JT7 (openrouter): HTTP 429${modelInfo}. El proveedor devolvio un rate limit temporal.`,
      'Espera un momento y vuelve a intentar, o cambia a un modelo/proveedor menos saturado desde el panel.',
    ].join('\n\n');
  }

  _migrateLegacyState() {
    let changed = false;
    for (const task of Object.values(this._taskIndex)) {
      const nextError = this._normalizeLegacyTaskError(task);
      if (nextError && nextError !== task.error) {
        task.error = nextError;
        changed = true;
      }
    }
    for (const session of Object.values(this._sessions)) {
      const normalizedHistory = Array.isArray(session.chatHistory)
        ? session.chatHistory.map((entry) => this._normalizeChatMessage(entry)).filter(Boolean)
        : [];
      if (!normalizedHistory.length && Array.isArray(session.tasks) && session.tasks.length > 0) {
        session.chatHistory = this._rebuildSessionChatHistory(session);
        changed = true;
        continue;
      }
      const recoveredHistory = normalizedHistory.map((entry) => {
        if (entry.role !== 'assistant' || !entry.taskId || !this._isJunkSummary(entry.text)) {
          return entry;
        }
        const task = this._taskIndex[entry.taskId];
        const summary = this._extractTaskSummary(task);
        if (!summary || summary === entry.text) {
          return entry;
        }
        changed = true;
        return {
          ...entry,
          text: summary,
          status: task?.status || entry.status,
          provider: task?.provider || entry.provider,
          model: task?.model || entry.model,
          executionMode: task?.executionMode || entry.executionMode,
          at: task?.updatedAt || entry.at,
        };
      });
      if (recoveredHistory.some((entry, index) => entry !== normalizedHistory[index])) {
        session.chatHistory = recoveredHistory.slice(-this.maxChatHistoryEntries);
        continue;
      }
      if (normalizedHistory.length !== (session.chatHistory || []).length) {
        session.chatHistory = normalizedHistory.slice(-this.maxChatHistoryEntries);
        changed = true;
      }
      const previousAgentState = JSON.stringify(session.agentState || null);
      this._syncSessionAgentStateFromLatestTask(session);
      if (JSON.stringify(session.agentState || null) !== previousAgentState) {
        changed = true;
      }
    }
    return changed;
  }

  _loadState() {
    try {
      if (!fs.existsSync(this.statePath)) {
        return;
      }
      const data = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      this._sessions = data.sessions || {};
      this._queue = Array.isArray(data.queue) ? data.queue : [];
      this._taskIndex = data.taskIndex || {};
      if (this._migrateLegacyState()) {
        this._saveState();
      }
      this._reconcileSubagentsState();
      this._recoverStaleInFlightTasks({
        includeQueued: false,
        reason: 'La tarea quedo en ejecucion durante un reinicio del runtime. Reintenta para continuar.',
      });
      this._reconcilePendingApprovals();
    } catch (_) {
      this._sessions = {};
      this._queue = [];
      this._taskIndex = {};
    }
  }

  _reconcilePendingApprovals() {
    let changed = false;
    for (const task of Object.values(this._taskIndex)) {
      if (!task || task.status !== 'waiting_approval') continue;
      if (task.approval && task.approval.approved) continue;
      const policy = this.policyEngine.evaluate(task);
      task.policy = policy;
      task.risk = policy.risk;
      if (!policy.requiresApproval) {
        task.status = 'queued';
        task.updatedAt = new Date().toISOString();
        if (!this._queue.includes(task.taskId)) {
          this._queue.push(task.taskId);
        }
        this._refreshTaskContinuitySnapshot(this._sessions[task.sessionId], task);
        this._updateSessionAgentState(task.sessionId, task);
        this._recalculateSessionStatus(task.sessionId);
        this._updateSubagentFromTask(task);
        changed = true;
      }
    }
    if (changed) {
      this._saveState();
    }
  }

  _recoverStaleInFlightTasks(options = {}) {
    const includeQueued = Boolean(options.includeQueued);
    const reason = String(options.reason || 'Tarea recuperada tras reinicio de runtime.').trim();
    let changed = false;
    for (const task of Object.values(this._taskIndex)) {
      if (!task || !task.sessionId) continue;
      const wasRunning = task.status === 'running';
      const wasQueued = includeQueued && task.status === 'queued';
      if (!wasRunning && !wasQueued) continue;

      const session = this._sessions[task.sessionId];
      task.status = wasRunning ? 'failed' : 'canceled';
      task.error = reason;
      task.updatedAt = new Date().toISOString();
      this._appendSessionMessage(session, {
        role: 'assistant',
        text: task.error,
        taskId: task.taskId,
        provider: task.provider,
        model: task.model,
        executionMode: task.executionMode,
        status: task.status,
        at: task.updatedAt,
        isError: true,
      });
      this._emitAudit(task.sessionId, wasRunning ? 'task.recovered.failed' : 'task.recovered.canceled', {
        taskId: task.taskId,
        reason,
      });
      this._updateSessionAgentState(task.sessionId, task);
      this._updateSubagentFromTask(task);
      changed = true;
    }

    if (!changed) {
      return false;
    }

    this._queue = this._queue.filter((taskId) => this._taskIndex[taskId]?.status === 'queued');
    for (const sessionId of Object.keys(this._sessions)) {
      this._recalculateSessionStatus(sessionId);
    }
    this._saveState();
    return true;
  }

  recoverStuckTasks(options = {}) {
    return this._recoverStaleInFlightTasks(options);
  }

  _reconcileSubagentsState() {
    for (const session of Object.values(this._sessions)) {
      if (!session || typeof session !== 'object') continue;
      session.subagents = session.subagents && typeof session.subagents === 'object'
        ? session.subagents
        : {};
      session.yield = session.yield && typeof session.yield === 'object'
        ? session.yield
        : null;
      session.agentState = session.agentState && typeof session.agentState === 'object'
        ? session.agentState
        : this._createEmptyAgentState();
      for (const [subagentId, subagent] of Object.entries(session.subagents)) {
        if (!subagent || typeof subagent !== 'object') {
          session.subagents[subagentId] = {
            subagentId,
            status: 'unknown',
            taskIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          continue;
        }
        subagent.subagentId = String(subagent.subagentId || subagentId).trim() || subagentId;
        subagent.taskIds = Array.isArray(subagent.taskIds) ? subagent.taskIds.filter(Boolean).map((id) => String(id)) : [];
        subagent.status = String(subagent.status || 'active').trim() || 'active';
        subagent.createdAt = String(subagent.createdAt || new Date().toISOString());
        subagent.updatedAt = String(subagent.updatedAt || subagent.createdAt || new Date().toISOString());
      }
      this._syncSessionAgentStateFromLatestTask(session);
      this._recalculateSessionStatus(session.sessionId);
    }
  }

  _recalculateSessionStatus(sessionId) {
    const session = this._sessions[sessionId];
    if (!session) return;
    if (session.status === 'yielded') {
      session.updatedAt = new Date().toISOString();
      return;
    }
    const taskIds = Array.isArray(session.tasks) ? session.tasks : [];
    const tasks = taskIds.map((taskId) => this._taskIndex[taskId]).filter(Boolean);
    if (!tasks.length) {
      session.status = 'active';
      session.updatedAt = new Date().toISOString();
      return;
    }
    if (tasks.some((task) => task.status === 'running')) {
      session.status = 'running';
      session.updatedAt = new Date().toISOString();
      return;
    }
    if (tasks.some((task) => task.status === 'waiting_approval')) {
      session.status = 'waiting_approval';
      session.updatedAt = new Date().toISOString();
      return;
    }
    if (tasks.some((task) => task.status === 'queued')) {
      session.status = 'queued';
      session.updatedAt = new Date().toISOString();
      return;
    }
    if (tasks.every((task) => task.status === 'completed')) {
      session.status = 'completed';
      session.updatedAt = new Date().toISOString();
      return;
    }
    if (tasks.some((task) => task.status === 'failed' || task.status === 'rejected' || task.status === 'canceled')) {
      session.status = 'attention';
      session.updatedAt = new Date().toISOString();
      return;
    }
    session.status = 'active';
    session.updatedAt = new Date().toISOString();
  }

  _updateSessionAgentState(sessionId, task = null) {
    const session = this._sessions[sessionId];
    if (!session) return;
    session.agentState = session.agentState && typeof session.agentState === 'object'
      ? session.agentState
      : this._createEmptyAgentState();
    if (!task) {
      session.agentState.updatedAt = new Date().toISOString();
      return;
    }
    session.agentState = this._buildSessionAgentStateFromTask(task, session.agentState);
  }

  _updateSubagentFromTask(task) {
    if (!task || !task.sessionId || !task.subagentId) return;
    const session = this._sessions[task.sessionId];
    if (!session || !session.subagents || !session.subagents[task.subagentId]) return;
    const subagent = session.subagents[task.subagentId];
    subagent.lastTaskId = task.taskId;
    subagent.updatedAt = new Date().toISOString();
    if (task.status === 'running' || task.status === 'queued' || task.status === 'waiting_approval') {
      subagent.status = task.status;
      return;
    }
    if (task.status === 'completed') {
      subagent.status = 'completed';
      return;
    }
    if (task.status === 'failed' || task.status === 'canceled' || task.status === 'rejected') {
      subagent.status = 'failed';
    }
  }

  start() {
    if (this._running) return;
    this._running = true;
    for (let i = 0; i < this.workerCount; i += 1) {
      this._runWorker(i + 1);
    }
  }

  stop() {
    this._running = false;
    this._workers = [];
    this._saveState();
  }

  getState() {
    return {
      sessions: this._sessions,
      queue: this._queue,
      workerCount: this.workerCount,
      running: this._running,
    };
  }

  listSessions() {
    return Object.values(this._sessions)
      .map((session) => ({ ...session }))
      .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  }

  getSessionStatus(sessionId) {
    const session = this._sessions[sessionId];
    if (!session) return null;
    this._recalculateSessionStatus(sessionId);
    const taskIds = Array.isArray(session.tasks) ? session.tasks : [];
    const tasks = taskIds.map((taskId) => this._taskIndex[taskId]).filter(Boolean);
    const counters = {
      queued: 0,
      running: 0,
      waiting_approval: 0,
      completed: 0,
      failed: 0,
      rejected: 0,
      canceled: 0,
    };
    for (const task of tasks) {
      const status = String(task.status || '').trim();
      if (Object.prototype.hasOwnProperty.call(counters, status)) {
        counters[status] += 1;
      }
    }
    return {
      sessionId,
      title: session.title,
      status: session.status,
      counters,
      queueDepth: this._queue.filter((taskId) => this._taskIndex[taskId]?.sessionId === sessionId).length,
      activeSubagents: Object.values(session.subagents || {}).filter((item) => item.status !== 'completed').length,
      yielded: Boolean(session.status === 'yielded'),
      yieldReason: String(session.yield?.reason || ''),
      updatedAt: session.updatedAt,
    };
  }

  getSessionHistory(sessionId, opts = {}) {
    const session = this._sessions[sessionId];
    if (!session) return null;
    const limit = Math.max(1, Number(opts.limit || 40));
    const history = Array.isArray(session.chatHistory) ? session.chatHistory.slice(-limit) : [];
    const taskIds = Array.isArray(session.tasks) ? session.tasks.slice(-limit) : [];
    const tasks = taskIds.map((taskId) => this._taskIndex[taskId]).filter(Boolean).map((task) => ({
      taskId: task.taskId,
      status: task.status,
      goal: task.goal,
      provider: task.provider,
      model: task.model,
      executionMode: task.executionMode,
      runtimeBackend: task.runtimeBackend,
      subagentId: task.subagentId || '',
      retries: Number(task.retries || 0),
      maxRetries: Number(task.maxRetries || 0),
      routePlan: task.routePlan || null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));
    return {
      sessionId,
      title: session.title,
      status: session.status,
      history,
      tasks,
      agentState: session.agentState || null,
      yielded: session.status === 'yielded',
      yield: session.yield || null,
      generatedAt: new Date().toISOString(),
    };
  }

  yieldSession(sessionId, reason = '') {
    const session = this._sessions[sessionId];
    if (!session) return null;
    session.status = 'yielded';
    session.yield = {
      reason: String(reason || '').trim(),
      at: new Date().toISOString(),
    };
    session.updatedAt = new Date().toISOString();
    this._saveState();
    this._emitAudit(sessionId, 'session.yielded', { reason: session.yield.reason });
    this.emit('session', { type: 'session.yielded', session });
    return session;
  }

  resumeSession(sessionId) {
    const session = this._sessions[sessionId];
    if (!session) return null;
    session.yield = null;
    session.status = 'active';
    this._recalculateSessionStatus(sessionId);
    this._saveState();
    this._emitAudit(sessionId, 'session.resumed', {});
    this.emit('session', { type: 'session.resumed', session });
    return session;
  }

  spawnSubagent(sessionId, input = {}) {
    const session = this._sessions[sessionId];
    if (!session) return null;
    session.subagents = session.subagents && typeof session.subagents === 'object' ? session.subagents : {};
    const subagentId = String(input.subagentId || `sub-${randomUUID().slice(0, 10)}`).trim();
    const subagent = {
      subagentId,
      name: String(input.name || `Subagente ${Object.keys(session.subagents).length + 1}`),
      goal: String(input.goal || input.prompt || '').trim(),
      parentTaskId: String(input.parentTaskId || '').trim(),
      runtimeBackend: normalizeRuntimeBackend(input.runtimeBackend || 'auto'),
      authProfile: String(input.authProfile || 'default').trim() || 'default',
      status: 'queued',
      taskIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    session.subagents[subagentId] = subagent;
    const task = this.enqueueTask(sessionId, {
      ...(input.task || {}),
      goal: subagent.goal,
      provider: String(input.provider || '').trim(),
      model: String(input.model || '').trim(),
      executionMode: String(input.executionMode || 'agent').trim() || 'agent',
      runtimeBackend: subagent.runtimeBackend,
      authProfile: subagent.authProfile,
      parentTaskId: subagent.parentTaskId,
      subagentId,
      delegatedFrom: String(input.delegatedFrom || 'panel').trim(),
      risk: input.risk || '',
    });
    subagent.taskIds.push(task.taskId);
    subagent.updatedAt = new Date().toISOString();
    this._updateSubagentFromTask(task);
    this._saveState();
    this._emitAudit(sessionId, 'subagent.spawned', {
      subagentId,
      taskId: task.taskId,
      runtimeBackend: subagent.runtimeBackend,
      authProfile: subagent.authProfile,
    });
    this.emit('session', { type: 'subagent.spawned', session, subagent, task });
    return { subagent, task };
  }

  listSubagents(sessionId) {
    const session = this._sessions[sessionId];
    if (!session) return [];
    const items = Object.values(session.subagents || {}).map((entry) => ({ ...entry }));
    items.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
    return items;
  }

  sendToSession(sessionId, taskInput = {}) {
    return this.enqueueTask(sessionId, taskInput);
  }

  createSession(input = {}) {
    const sessionId = input.sessionId || `panel-${randomUUID().slice(0, 8)}`;
    const session = {
      sessionId,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: String(input.title || 'Sesion Free JT7'),
      tasks: [],
      chatHistory: [],
      subagents: {},
      yield: null,
      agentState: this._createEmptyAgentState(),
    };
    this._sessions[sessionId] = session;
    this._saveState();
    this._emitAudit(sessionId, 'session.created', { title: session.title });
    this.emit('session', { type: 'session.created', session });
    return session;
  }

  enqueueTask(sessionId, taskInput = {}) {
    const session = this._sessions[sessionId] || this.createSession({ sessionId, title: taskInput.title || 'Sesion automatica' });
    const taskId = taskInput.taskId || `task-${randomUUID().slice(0, 10)}`;
    const task = {
      taskId,
      sessionId,
      goal: String(taskInput.goal || taskInput.prompt || '').trim(),
      provider: String(taskInput.provider || '').trim(),
      model: String(taskInput.model || '').trim(),
      executionMode: String(taskInput.executionMode || 'agent').trim() || 'agent',
      runId: String(taskInput.runId || '').trim(),
      sessionTitle: String(taskInput.sessionTitle || session.title || '').trim(),
      runtimeBackend: normalizeRuntimeBackend(taskInput.runtimeBackend || 'auto'),
      authProfile: String(taskInput.authProfile || 'default').trim() || 'default',
      parentTaskId: String(taskInput.parentTaskId || '').trim(),
      subagentId: String(taskInput.subagentId || '').trim(),
      delegatedFrom: String(taskInput.delegatedFrom || '').trim(),
      policyProfile: String(taskInput.policyProfile || taskInput.profile || '').trim().toLowerCase(),
      providerPlan: taskInput.providerPlan && typeof taskInput.providerPlan === 'object'
        ? JSON.parse(JSON.stringify(taskInput.providerPlan))
        : null,
      fallbackProviders: Array.isArray(taskInput.fallbackProviders)
        ? taskInput.fallbackProviders.map((item) => (item && typeof item === 'object' ? { ...item } : item)).filter(Boolean)
        : [],
      retries: Number(taskInput.retries || 0),
      maxRetries: Number(taskInput.maxRetries || 2),
      maxRuntimeMs: Number(taskInput.maxRuntimeMs || taskInput.timeoutMs || this.taskExecutionTimeoutMs),
      status: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approval: null,
      result: null,
      error: null,
      risk: null,
      chatHistorySnapshot: [],
      intake: taskInput.intake && typeof taskInput.intake === 'object' ? { ...taskInput.intake } : null,
      selectedSkills: Array.isArray(taskInput.selectedSkills)
        ? taskInput.selectedSkills.map((item) => (item && typeof item === 'object' ? { ...item } : item)).filter(Boolean)
        : [],
      traceClosed: Boolean(taskInput.traceClosed),
      routePlan: null,
    };

    if (this.providerRouter && typeof this.providerRouter.getRoutePlan === 'function') {
      try {
        task.routePlan = this.providerRouter.getRoutePlan(task, {
          defaultProvider: task.provider || 'openrouter',
          defaultModel: task.model || '',
          workspacePath: this.rootDir,
          sessionTitle: session.title || '',
          runtimeBackend: task.runtimeBackend || 'auto',
          authProfile: task.authProfile || 'default',
          fallbackProviders: task.fallbackProviders || [],
        });
      } catch (_) {
        task.routePlan = null;
      }
    }

    const policy = this.policyEngine.evaluate(task);
    task.risk = policy.risk;
    task.policy = policy;

    this._appendSessionMessage(session, {
      role: 'user',
      text: task.goal,
      taskId,
      provider: task.provider,
      model: task.model,
      executionMode: task.executionMode,
      status: task.status,
      at: task.createdAt,
    });
    this._refreshTaskContinuitySnapshot(session, task);

    session.tasks.push(taskId);
    this._taskIndex[taskId] = task;
    this._recalculateSessionStatus(sessionId);
    this._updateSubagentFromTask(task);
    this._queue.push(taskId);

    this._saveState();
    this._emitAudit(sessionId, 'task.enqueued', { taskId, risk: task.risk });
    this.emit('task', { type: 'task.enqueued', task });
    return task;
  }

  resolveApproval(sessionId, taskId, approved, reason = '') {
    const task = this._taskIndex[taskId];
    if (!task || task.sessionId !== sessionId) return null;
    task.approval = {
      approved: Boolean(approved),
      reason: String(reason || ''),
      resolvedAt: new Date().toISOString(),
    };
    task.updatedAt = new Date().toISOString();
    if (approved && task.status === 'waiting_approval') {
      task.status = 'queued';
      this._refreshTaskContinuitySnapshot(this._sessions[sessionId], task);
      this._queue.push(taskId);
    }
    if (!approved) {
      task.status = 'rejected';
      this._updateSessionAgentState(sessionId, task);
    }
    this._recalculateSessionStatus(sessionId);
    this._updateSubagentFromTask(task);
    this._saveState();
    this._emitAudit(sessionId, 'approval.resolved', { taskId, approved: Boolean(approved), reason: task.approval.reason });
    this.emit('task', { type: 'approval.resolved', task });
    return task;
  }

  cancelTask(sessionId, taskId) {
    const task = this._taskIndex[taskId];
    if (!task || task.sessionId !== sessionId) return null;
    task.status = 'canceled';
    task.updatedAt = new Date().toISOString();
    this._queue = this._queue.filter((id) => id !== taskId);
    this._updateSessionAgentState(sessionId, task);
    this._recalculateSessionStatus(sessionId);
    this._updateSubagentFromTask(task);
    this._saveState();
    this._emitAudit(sessionId, 'task.canceled', { taskId });
    this.emit('task', { type: 'task.canceled', task });
    return task;
  }

  retryTask(sessionId, taskId) {
    const task = this._taskIndex[taskId];
    if (!task || task.sessionId !== sessionId) return null;
    if (task.status !== 'failed' && task.status !== 'rejected' && task.status !== 'canceled') return null;
    task.status = 'queued';
    task.error = null;
    task.updatedAt = new Date().toISOString();
    this._refreshTaskContinuitySnapshot(this._sessions[sessionId], task);
    this._queue.push(taskId);
    this._recalculateSessionStatus(sessionId);
    this._updateSubagentFromTask(task);
    this._saveState();
    this._emitAudit(sessionId, 'task.retry.enqueued', { taskId, retries: task.retries });
    this.emit('task', { type: 'task.retry.enqueued', task });
    return task;
  }

  _takeNextTaskId() {
    while (this._queue.length > 0) {
      const taskId = this._queue.shift();
      const task = this._taskIndex[taskId];
      if (!task) continue;
      if (task.status !== 'queued') continue;
      return taskId;
    }
    return null;
  }

  _shouldAutoRetry(error) {
    if (!error) return false;
    if (error.isUserActionRequired || error.isRateLimitError) {
      return false;
    }
    if (error.isRetryable === true) {
      return true;
    }
    const message = String(error.message || error);
    return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/i.test(message);
  }

  _executeWithTaskTimeout(task, promise) {
    const timeoutMs = Math.max(30_000, Number(task?.maxRuntimeMs || this.taskExecutionTimeoutMs || 120_000));
    let settled = false;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const timeoutError = new Error(`Tiempo de ejecucion excedido (${timeoutMs}ms).`);
        timeoutError.isUserActionRequired = true;
        timeoutError.isRetryable = false;
        reject(timeoutError);
      }, timeoutMs);

      Promise.resolve(promise)
        .then((value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  async _runWorker(workerId) {
    const loop = async () => {
      while (this._running) {
        const nextTaskId = this._takeNextTaskId();
        if (!nextTaskId) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }

        const task = this._taskIndex[nextTaskId];
        if (!task) continue;
        await this._processTask(workerId, task);
      }
    };

    const promise = loop().catch((error) => {
      if (this.output) {
        this.output.appendLine(`[freejt7-panel] worker-${workerId} fatal: ${String(error.message || error)}`);
      }
    });
    this._workers.push(promise);
  }

  async _processTask(workerId, task) {
    const policy = this.policyEngine.evaluate(task);
    task.policy = policy;

    if (Array.isArray(policy.deniedTools) && policy.deniedTools.length > 0) {
      task.status = 'rejected';
      task.error = `Bloqueado por policy profile "${policy.profile || 'default'}": tools denegadas (${policy.deniedTools.join(', ')}).`;
      task.updatedAt = new Date().toISOString();
      this._appendSessionMessage(this._sessions[task.sessionId], {
        role: 'assistant',
        text: task.error,
        taskId: task.taskId,
        provider: task.provider,
        model: task.model,
        executionMode: task.executionMode,
        status: task.status,
        at: task.updatedAt,
        isError: true,
      });
      this._updateSessionAgentState(task.sessionId, task);
      this._recalculateSessionStatus(task.sessionId);
      this._updateSubagentFromTask(task);
      this._saveState();
      this._emitAudit(task.sessionId, 'task.denied', {
        taskId: task.taskId,
        deniedTools: policy.deniedTools,
        profile: policy.profile || 'coding',
      });
      this.emit('task', { type: 'task.denied', task, workerId });
      return;
    }

    if (policy.requiresApproval && !(task.approval && task.approval.approved)) {
      task.status = 'waiting_approval';
      task.updatedAt = new Date().toISOString();
      this._updateSessionAgentState(task.sessionId, task);
      this._recalculateSessionStatus(task.sessionId);
      this._updateSubagentFromTask(task);
      this._saveState();
      this._emitAudit(task.sessionId, 'approval.requested', {
        taskId: task.taskId,
        risk: policy.risk,
        profile: policy.profile || 'coding',
        askTools: policy.askTools || [],
      });
      this.emit('task', { type: 'approval.requested', task });
      return;
    }

    task.status = 'running';
    task.updatedAt = new Date().toISOString();
    this._recalculateSessionStatus(task.sessionId);
    this._updateSubagentFromTask(task);
    this._saveState();
    this._emitAudit(task.sessionId, 'task.started', { taskId: task.taskId, workerId });
    this.emit('task', { type: 'task.started', task, workerId });

    try {
      const result = await this._executeWithTaskTimeout(
        task,
        this.providerRouter.execute(task, {
          defaultProvider: task.provider || 'openrouter',
          defaultModel: task.model || '',
          workspacePath: this.rootDir,
          sessionTitle: this._sessions[task.sessionId]?.title || '',
          sessionAgentState: this._sessions[task.sessionId]?.agentState || null,
          runtimeBackend: task.runtimeBackend || 'auto',
          authProfile: task.authProfile || 'default',
          fallbackProviders: task.fallbackProviders || [],
        }),
      );
      task.status = 'completed';
      task.result = result;
      task.routeMeta = result?.raw?.routeMeta || {};
      task.acp = result?.raw?.acp || null;
      task.verification = this._deriveVerification(task, result);
      task.error = null;
      task.updatedAt = new Date().toISOString();
      this._appendSessionMessage(this._sessions[task.sessionId], {
        role: 'assistant',
        text: this._extractTaskSummary(task) || 'Tarea completada.',
        taskId: task.taskId,
        provider: result?.provider || task.provider,
        model: result?.model || task.model,
        executionMode: result?.executionMode || task.executionMode,
        status: task.status,
        at: task.updatedAt,
      });
      this._updateSessionAgentState(task.sessionId, task);
      this._recalculateSessionStatus(task.sessionId);
      this._updateSubagentFromTask(task);
      this._saveState();
      this._emitAudit(task.sessionId, 'task.completed', {
        taskId: task.taskId,
        provider: result.provider,
        model: result.model,
      });
      this._emitAudit(task.sessionId, 'task.verified', {
        taskId: task.taskId,
        verificationStatus: task.verification?.status || 'unknown',
        evidenceCount: Array.isArray(task.verification?.evidence) ? task.verification.evidence.length : 0,
        warnings: task.verification?.warnings || [],
      });
      this.emit('task', { type: 'task.completed', task, workerId });
    } catch (error) {
      task.retries += 1;
      task.error = String(error.message || error);
      task.updatedAt = new Date().toISOString();
      const shouldRetry = this._shouldAutoRetry(error);

      if (shouldRetry && task.retries <= task.maxRetries) {
        task.status = 'queued';
        this._updateSessionAgentState(task.sessionId, task);
        this._refreshTaskContinuitySnapshot(this._sessions[task.sessionId], task);
        this._queue.push(task.taskId);
        this._recalculateSessionStatus(task.sessionId);
        this._updateSubagentFromTask(task);
        this._emitAudit(task.sessionId, 'task.retry.scheduled', {
          taskId: task.taskId,
          retries: task.retries,
          maxRetries: task.maxRetries,
          error: task.error,
        });
        this.emit('task', { type: 'task.retry.scheduled', task, workerId });
      } else {
        task.status = 'failed';
        this._appendSessionMessage(this._sessions[task.sessionId], {
          role: 'assistant',
          text: task.error || 'Tarea fallida.',
          taskId: task.taskId,
          provider: task.provider,
          model: task.model,
          executionMode: task.executionMode,
          status: task.status,
          at: task.updatedAt,
          isError: true,
        });
        this._emitAudit(task.sessionId, 'task.failed', {
          taskId: task.taskId,
          retries: task.retries,
          error: task.error,
        });
        this.emit('task', { type: 'task.failed', task, workerId });
        this._updateSessionAgentState(task.sessionId, task);
        this._recalculateSessionStatus(task.sessionId);
        this._updateSubagentFromTask(task);
      }

      this._saveState();
    }
  }
}

module.exports = {
  SessionEngine,
};
