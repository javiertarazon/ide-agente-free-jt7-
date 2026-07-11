'use strict';

const path = require('path');
const { resolveAgentStateDir } = require('./agent-state-paths');
const fs = require('fs');
const { SessionEngine } = require('./session-engine');
const { PolicyEngine } = require('./policy-engine');
const { ProviderRouter } = require('./provider-router');
const { AuditBus } = require('./audit-bus');
const { fetchProviderModels } = require('./api-provider-adapter');
const { getRemoteBridge } = require('../runtime/remote-bridge');
const panelHelpers = require('./panel-helpers');
const freeModelsCatalog = require('../free-models-catalog');
const { createPanelHtml } = require('./panel-html');
const panelState = require('./panel-state');

const PANEL_DEFAULT_PROVIDER = panelHelpers.PANEL_DEFAULT_PROVIDER;

const {
  PANEL_PROVIDER_SELECTIONS_KEY,
  PANEL_EXECUTION_MODE_KEY,
  PANEL_RUNTIME_BACKEND_KEY,
  PANEL_POLICY_PROFILE_KEY,
  PANEL_AUTH_PROFILE_KEY,
  PANEL_FALLBACKS_KEY,
  PANEL_ACTIVE_SESSION_KEY,
  PANEL_ACTIVE_PROVIDER_KEY,
  ensurePanelSeedSession,
} = panelState;

function createControlPanel(context, output, options = {}) {
  const workspacePath = options.workspacePath;
  const standaloneMode = panelHelpers.isStandaloneAppMode();
  const prepareTask = typeof options.prepareTask === 'function' ? options.prepareTask : null;
  const finalizeTaskTrace = typeof options.finalizeTaskTrace === 'function' ? options.finalizeTaskTrace : null;
  const remoteBridge = options.remoteBridge || getRemoteBridge({ rootDir: workspacePath });
  const policyEngine = new PolicyEngine({ mode: standaloneMode ? 'autonomous' : (options.policyMode || 'mixed') });
  const providerRouter = new ProviderRouter({
    context,
    output,
    agentRuntime: options.agentRuntime || null,
    executeCopilotTask: options.executeCopilotTask,
    executeAgentTask: options.executeAgentTask,
    executeAcpTask: options.executeAcpTask,
    workspacePath,
  });
  const auditBus = new AuditBus({
    rootDir: workspacePath,
    output,
    remoteBridge,
  });
  const engine = new SessionEngine({
    rootDir: workspacePath,
    workerCount: Number(options.workerCount || 3),
    policyEngine,
    providerRouter,
    auditBus,
    output,
  });

  engine.start();

  function normalizeSelectionMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([provider]) => Boolean(provider))
        .map(([provider, model]) => [String(provider).trim(), String(model || '').trim()]),
    );
  }

  async function getPersistedSelections() {
    return normalizeSelectionMap(await context.globalState?.get?.(PANEL_PROVIDER_SELECTIONS_KEY));
  }

  async function getPersistedExecutionMode() {
    const value = await context.globalState?.get?.(PANEL_EXECUTION_MODE_KEY);
    if (standaloneMode) {
      return 'agent';
    }
    return value === 'direct' ? 'direct' : 'agent';
  }

  async function getPersistedRuntimeBackend() {
    const value = String(await context.globalState?.get?.(PANEL_RUNTIME_BACKEND_KEY) || '').trim().toLowerCase();
    if (!value) return 'auto';
    if (value === 'auto' || value === 'openclaw' || value === 'local') return value;
    if (value.startsWith('acp:')) return value;
    return 'auto';
  }

  async function getPersistedPolicyProfile() {
    const value = String(await context.globalState?.get?.(PANEL_POLICY_PROFILE_KEY) || '').trim().toLowerCase();
    if (value === 'messaging' || value === 'minimal') return value;
    return 'coding';
  }

  async function getPersistedAuthProfile() {
    return String(await context.globalState?.get?.(PANEL_AUTH_PROFILE_KEY) || 'default').trim() || 'default';
  }

  async function getPersistedFallbackProviders() {
    const value = await context.globalState?.get?.(PANEL_FALLBACKS_KEY);
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        return {
          provider: String(item.provider || '').trim().toLowerCase(),
          model: String(item.model || '').trim(),
        };
      })
      .filter((item) => item && item.provider);
  }

  async function getPersistedActiveProvider() {
    const value = String(await context.globalState?.get?.(PANEL_ACTIVE_PROVIDER_KEY) || '').trim();
    return value || PANEL_DEFAULT_PROVIDER;
  }

  async function getPersistedActiveSessionId() {
    return String(await context.globalState?.get?.(PANEL_ACTIVE_SESSION_KEY) || '').trim();
  }

  async function persistActiveSessionId(sessionId) {
    const value = String(sessionId || '').trim();
    await context.globalState?.update?.(PANEL_ACTIVE_SESSION_KEY, value);
    return value;
  }

  async function persistActiveProvider(provider, model, executionMode = 'agent', advanced = {}) {
    const sanitized = panelHelpers.sanitizePanelProviderConfig({
      provider,
      model,
      executionMode,
      runtimeBackend: advanced.runtimeBackend,
      policyProfile: advanced.policyProfile,
      authProfile: advanced.authProfile,
      fallbackProviders: advanced.fallbackProviders,
    }, {
      standaloneMode,
      catalog: currentCatalog,
    });
    const activeProvider = sanitized.provider;
    const activeModel = sanitized.model;
    const normalizedExecutionMode = sanitized.executionMode;
    const runtimeBackend = sanitized.runtimeBackend;
    const policyProfile = sanitized.policyProfile;
    const authProfile = sanitized.authProfile;
    const fallbackProviders = Array.isArray(advanced.fallbackProviders)
      ? advanced.fallbackProviders
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const fallbackProvider = String(item.provider || '').trim().toLowerCase();
          const fallbackModel = String(item.model || '').trim();
          if (!fallbackProvider) return null;
          return { provider: fallbackProvider, model: fallbackModel };
        })
        .filter(Boolean)
      : [];
    const selections = await getPersistedSelections();
    selections[activeProvider] = activeModel;
    await context.globalState?.update?.(PANEL_PROVIDER_SELECTIONS_KEY, selections);
    await context.globalState?.update?.(PANEL_EXECUTION_MODE_KEY, normalizedExecutionMode);
    await context.globalState?.update?.(PANEL_ACTIVE_PROVIDER_KEY, activeProvider);
    await context.globalState?.update?.(PANEL_RUNTIME_BACKEND_KEY, runtimeBackend);
    await context.globalState?.update?.(PANEL_POLICY_PROFILE_KEY, policyProfile);
    await context.globalState?.update?.(PANEL_AUTH_PROFILE_KEY, authProfile);
    await context.globalState?.update?.(PANEL_FALLBACKS_KEY, fallbackProviders);

    return {
      provider: activeProvider,
      model: activeModel,
      executionMode: normalizedExecutionMode,
      runtimeBackend,
      policyProfile,
      authProfile,
      fallbackProviders,
    };
  }

  async function getActiveProviderConfig() {
    const selections = await getPersistedSelections();
    const executionMode = await getPersistedExecutionMode();
    const runtimeBackend = await getPersistedRuntimeBackend();
    const policyProfile = await getPersistedPolicyProfile();
    const authProfile = await getPersistedAuthProfile();
    const fallbackProviders = await getPersistedFallbackProviders();
    const provider = await getPersistedActiveProvider();
    const normalizedProvider = provider === 'copilot' ? PANEL_DEFAULT_PROVIDER : provider;
    const configuredModel = selections[normalizedProvider] || '';
    const model = configuredModel || selections[provider] || freeModelsCatalog.getDefaultModel(provider) || '';
    const sanitized = panelHelpers.sanitizePanelProviderConfig({
      provider: normalizedProvider,
      model,
      executionMode,
      runtimeBackend,
      policyProfile,
      authProfile,
      fallbackProviders,
    }, {
      standaloneMode,
      catalog: currentCatalog,
    });

    const shouldRepairState =
      sanitized.executionMode !== (executionMode === 'direct' ? 'direct' : 'agent')
      || sanitized.runtimeBackend !== runtimeBackend
      || sanitized.policyProfile !== policyProfile
      || sanitized.authProfile !== authProfile
      || sanitized.provider !== normalizedProvider
      || sanitized.model !== model;

    if (shouldRepairState) {
      selections[sanitized.provider] = sanitized.model;
      await context.globalState?.update?.(PANEL_PROVIDER_SELECTIONS_KEY, selections);
      await context.globalState?.update?.(PANEL_EXECUTION_MODE_KEY, sanitized.executionMode);
      await context.globalState?.update?.(PANEL_RUNTIME_BACKEND_KEY, sanitized.runtimeBackend);
      await context.globalState?.update?.(PANEL_POLICY_PROFILE_KEY, sanitized.policyProfile);
      await context.globalState?.update?.(PANEL_AUTH_PROFILE_KEY, sanitized.authProfile);
      await context.globalState?.update?.(PANEL_ACTIVE_PROVIDER_KEY, sanitized.provider);
    }

    return sanitized;
  }

  let currentCatalog = getPanelCatalogSnapshot();

  async function refreshPanelCatalog(postToWebview = false) {
    const nextCatalog = getPanelCatalogSnapshot();
    nextCatalog.modelsByProvider.clod = await fetchProviderModels('clod', context.secrets, { workspacePath });
    if (!Array.isArray(nextCatalog.modelsByProvider.clod) || nextCatalog.modelsByProvider.clod.length === 0) {
      nextCatalog.modelsByProvider.clod = getPanelCatalogSnapshot().modelsByProvider.clod || [];
    }
    currentCatalog = nextCatalog;
    if (postToWebview && panel) {
      panel.webview.postMessage({ type: 'catalog.update', catalog: currentCatalog });
    }
    if (output) {
      output.appendLine(
        `[freejt7-panel] catalog refresh openrouter=${(currentCatalog.modelsByProvider.openrouter || []).length} hf=${(currentCatalog.modelsByProvider.hf || []).length} zai=${(currentCatalog.modelsByProvider.zai || []).length} clod=${(currentCatalog.modelsByProvider.clod || []).length}`,
      );
    }
    return currentCatalog;
  }

  function getControlPlaneSchema() {
    return {
      version: '1.0.0',
      title: 'Free JT7 Panel Control Plane',
      properties: {
        runtimeBackend: {
          type: 'string',
          enum: ['auto', 'openclaw', 'local', 'acp:codex', 'acp:claude-code', 'acp:opencode'],
          default: 'auto',
        },
        policyProfile: {
          type: 'string',
          enum: ['coding', 'messaging', 'minimal'],
          default: 'coding',
        },
        authProfile: {
          type: 'string',
          default: 'default',
        },
        executionMode: {
          type: 'string',
          enum: ['agent', 'direct'],
          default: standaloneMode ? 'agent' : 'agent',
        },
      },
    };
  }

  async function getControlPlaneHealth() {
    const engineState = engine.getState();
    const routerHealth = typeof providerRouter.getHealthStatus === 'function'
      ? providerRouter.getHealthStatus()
      : { ok: true };
    const bridgeSnapshot = remoteBridge && typeof remoteBridge.getSnapshot === 'function'
      ? remoteBridge.getSnapshot()
      : null;
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      sessions: Object.keys(engineState.sessions || {}).length,
      engineQueue: Array.isArray(engineState.queue) ? engineState.queue.length : 0,
      engineRunning: Boolean(engineState.running),
      router: routerHealth,
      bridge: bridgeSnapshot,
    };
  }

  function getLatestEffectiveRoute(taskIndex = {}) {
    const tasks = Object.values(taskIndex)
      .filter(Boolean)
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));
    for (const task of tasks) {
      const attempts = Array.isArray(task?.routeMeta?.attempts) ? task.routeMeta.attempts : [];
      const okAttempt = attempts.slice().reverse().find((attempt) => attempt && attempt.ok);
      if (okAttempt) {
        return {
          provider: String(okAttempt.provider || task.provider || 'auto'),
          model: String(okAttempt.model || task.model || 'default'),
          backend: String(okAttempt.runtimeBackend || task.runtimeBackend || 'auto'),
          fallbackUsed: Boolean(task.routeMeta?.fallbackUsed),
          taskId: String(task.taskId || ''),
        };
      }
      if (task.routePlan && typeof task.routePlan === 'object') {
        return {
          provider: String(task.routePlan.provider || task.provider || 'auto'),
          model: String(task.routePlan.model || task.model || 'default'),
          backend: String(task.routePlan.runtimeBackend || task.runtimeBackend || 'auto'),
          fallbackUsed: false,
          taskId: String(task.taskId || ''),
        };
      }
      if (task.status === 'completed') {
        return {
          provider: String(task.provider || 'auto'),
          model: String(task.model || 'default'),
          backend: String(task.runtimeBackend || 'auto'),
          fallbackUsed: false,
          taskId: String(task.taskId || ''),
        };
      }
    }
    return null;
  }

  function getSloSnapshot(taskIndex = {}) {
    const finished = Object.values(taskIndex)
      .filter((task) => task && ['completed', 'failed', 'rejected', 'canceled'].includes(String(task.status || '')));
    const measuredTasks = finished.length;
    const completed = finished.filter((task) => task.status === 'completed').length;
    const successRate = measuredTasks > 0 ? completed / measuredTasks : null;
    const durations = finished
      .map((task) => Date.parse(task.updatedAt || 0) - Date.parse(task.createdAt || 0))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const avgDurationMs = durations.length
      ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length)
      : null;
    const targetSuccessRate = 0.8;
    return {
      targetSuccessRate,
      targetSuccessRateLabel: '80%',
      successRate,
      successRateLabel: successRate === null ? 'n/a' : `${Math.round(successRate * 100)}%`,
      measuredTasks,
      completed,
      failed: measuredTasks - completed,
      avgDurationMs,
      avgDurationLabel: avgDurationMs === null ? 'n/a' : `${Math.round(avgDurationMs / 1000)}s`,
      ok: successRate === null ? true : successRate >= targetSuccessRate,
    };
  }

  function getRiskSnapshot(taskIndex = {}) {
    let highOrCritical = 0;
    const byLevel = {};
    for (const task of Object.values(taskIndex)) {
      const risk = String(task?.risk || 'unknown').trim() || 'unknown';
      byLevel[risk] = (byLevel[risk] || 0) + 1;
      if (risk === 'high' || risk === 'critical') {
        highOrCritical += 1;
      }
    }
    return { byLevel, highOrCritical };
  }

  function readResumeSnapshot() {
    const resumePath = path.join(workspacePath || process.cwd(), resolveAgentStateDir(workspacePath || process.cwd()), 'RESUME.md');
    try {
      const text = fs.readFileSync(resumePath, 'utf8');
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const updatedLine = lines.find((line) => /Actualizado:/i.test(line)) || '';
      const successLine = lines.find((line) => /^-\s+Último run exitoso:/i.test(line)) || '';
      const lastActionLine = lines.find((line) => line.startsWith('- **')) || successLine;
      const blockerLines = lines.filter((line) => /^- \[[ x]\]/i.test(line));
      const updatedAt = updatedLine.replace(/\*|Actualizado:/gi, '').trim()
        || new Date(fs.statSync(resumePath).mtimeMs).toISOString();
      const parsedLastAction = lastActionLine
        .replace(/^- /, '')
        .replace(/\*\*/g, '')
        .replace(/^Último run exitoso:/i, '')
        .trim();
      return {
        path: resumePath,
        updatedAt: updatedAt || 'n/a',
        lastAction: parsedLastAction || 'n/a',
        activeBlockers: blockerLines.filter((line) => line.startsWith('- [ ]')).length,
      };
    } catch (error) {
      return {
        path: resumePath,
        updatedAt: 'n/a',
        lastAction: 'RESUME.md no disponible',
        activeBlockers: 0,
        error: String(error?.message || error),
      };
    }
  }

  async function getOperationalStatusSnapshot(providerConfig = null) {
    const engineState = engine.getState();
    const taskIndex = engine._taskIndex || {};
    const activeConfig = providerConfig || await getActiveProviderConfig();
    const health = await getControlPlaneHealth();
    const sessionCount = Object.keys(engineState.sessions || {}).length;
    const onboardingComplete = sessionCount > 0
      && Boolean(activeConfig.provider)
      && Boolean(activeConfig.executionMode)
      && Boolean(activeConfig.policyProfile);
    return {
      generatedAt: new Date().toISOString(),
      onboarding: {
        complete: onboardingComplete,
        sessionCount,
        provider: activeConfig.provider,
        executionMode: activeConfig.executionMode,
        runtimeBackend: activeConfig.runtimeBackend,
        policyProfile: activeConfig.policyProfile,
      },
      slo: getSloSnapshot(taskIndex),
      risk: getRiskSnapshot(taskIndex),
      effectiveRoute: getLatestEffectiveRoute(taskIndex) || {
        provider: activeConfig.provider,
        model: activeConfig.model || 'default',
        backend: activeConfig.runtimeBackend || 'auto',
        fallbackUsed: false,
      },
      runtime: health,
      resume: readResumeSnapshot(),
    };
  }

  async function applyControlPlanePatch(patch = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('control.config.patch requiere un objeto JSON.');
    }
    const current = await getActiveProviderConfig();
    const next = {
      provider: current.provider,
      model: current.model,
      executionMode: current.executionMode,
      runtimeBackend: current.runtimeBackend,
      policyProfile: current.policyProfile,
      authProfile: current.authProfile,
      fallbackProviders: current.fallbackProviders,
    };
    if (typeof patch.executionMode === 'string') {
      next.executionMode = patch.executionMode === 'direct' ? 'direct' : 'agent';
    }
    if (typeof patch.runtimeBackend === 'string') {
      const backend = patch.runtimeBackend.trim().toLowerCase();
      next.runtimeBackend = backend || 'auto';
    }
    if (typeof patch.policyProfile === 'string') {
      const profile = patch.policyProfile.trim().toLowerCase();
      next.policyProfile = ['coding', 'messaging', 'minimal'].includes(profile) ? profile : 'coding';
    }
    if (typeof patch.authProfile === 'string') {
      next.authProfile = patch.authProfile.trim() || 'default';
    }
    if (Array.isArray(patch.fallbackProviders)) {
      next.fallbackProviders = patch.fallbackProviders
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const provider = String(item.provider || '').trim().toLowerCase();
          const model = String(item.model || '').trim();
          if (!provider) return null;
          return { provider, model };
        })
        .filter(Boolean);
    }
    return persistActiveProvider(
      next.provider,
      next.model,
      next.executionMode,
      {
        runtimeBackend: next.runtimeBackend,
        policyProfile: next.policyProfile,
        authProfile: next.authProfile,
        fallbackProviders: next.fallbackProviders,
      },
    );
  }

  let panel = null;

  async function postState() {
    if (!panel) return;
    const activeConfig = await getActiveProviderConfig();
    const {
      provider,
      model,
      executionMode,
      runtimeBackend,
      policyProfile,
      authProfile,
      fallbackProviders,
    } = activeConfig;
    const persistedSessionId = await getPersistedActiveSessionId();
    const activeSessionId = ensurePanelSeedSession(engine, persistedSessionId);
    if (activeSessionId && activeSessionId !== persistedSessionId) {
      await persistActiveSessionId(activeSessionId);
    }
    panel.webview.postMessage({
      type: 'state.snapshot',
      provider,
      model,
      executionMode,
      runtimeBackend,
      policyProfile,
      authProfile,
      fallbackProviders: Array.isArray(fallbackProviders)
        ? fallbackProviders.map((item) => `${item.provider}:${item.model || ''}`).join(', ')
        : '',
      activeSessionId,
      catalog: currentCatalog,
      operationalStatus: await getOperationalStatusSnapshot(activeConfig),
      state: {
        ...engine.getState(),
        taskIndex: engine._taskIndex,
      },
    });
  }

  engine.on('task', (event) => {
    const task = event?.task;
    if (
      task
      && task.runId
      && !task.traceClosed
      && ['completed', 'failed', 'rejected', 'canceled'].includes(String(task.status || ''))
      && finalizeTaskTrace
    ) {
      task.traceClosed = true;
      const summary = task.status === 'completed'
        ? String(task?.result?.summary || task?.result?.final?.summary || 'Tarea completada.')
        : String(task.error || `Tarea ${task.status || 'cerrada'}.`);
      Promise.resolve(finalizeTaskTrace(task, summary)).catch((error) => {
        task.traceClosed = false;
        if (output) {
          output.appendLine(`[freejt7-panel] trace close error: ${String(error?.message || error)}`);
        }
      });
    }
    if (!panel) return;
    panel.webview.postMessage({
      type: 'engine.event',
      event,
      state: {
        ...engine.getState(),
        taskIndex: engine._taskIndex,
      },
    });
  });

  engine.on('session', (event) => {
    if (!panel) return;
    panel.webview.postMessage({ type: event.type, session: event.session });
    postState();
  });

  function openPanel() {
    if (!vscode) return;

    if (panel) {
      panel.reveal(vscode.ViewColumn.One);
      postState();
      return;
    }

    panel = vscode.window.createWebviewPanel(
      'freejt7.controlPanel',
      'Free JT7',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    const messageSubscription = panel.webview.onDidReceiveMessage(async (msg) => {
      const type = String(msg?.type || '');

      try {
        if (type === 'panel.ready') {
          if (output) {
            output.appendLine('[freejt7-panel] panel.ready recibido desde webview.');
          }
          await postState();
          return;
        }

        if (type === 'panel.client.error') {
          if (output) {
            output.appendLine(`[freejt7-panel] webview client error (${String(msg.stage || 'unknown')}): ${String(msg.message || 'sin detalle')}`);
          }
          return;
        }

        if (type === 'session.create') {
          const session = engine.createSession({ title: msg.title || 'Sesion Free JT7' });
          await persistActiveSessionId(session.sessionId);
          panel.webview.postMessage({ type: 'session.created', session });
          postState();
          return;
        }

        if (type === 'task.enqueue') {
          let taskInput = msg.task || {};
          await persistActiveSessionId(msg.sessionId);
          if (prepareTask) {
            const session = engine.getState().sessions?.[msg.sessionId];
            taskInput = await prepareTask(taskInput, {
              sessionId: msg.sessionId,
              sessionTitle: session?.title || 'Sesion Free JT7',
            }) || taskInput;
          }
          engine.enqueueTask(msg.sessionId, taskInput);
          postState();
          return;
        }

        if (type === 'session.select') {
          await persistActiveSessionId(msg.sessionId);
          await postState();
          return;
        }

        if (type === 'provider.update') {
          await persistActiveProvider(msg.provider, msg.model, msg.executionMode, {
            runtimeBackend: msg.runtimeBackend,
            policyProfile: msg.policyProfile,
            authProfile: msg.authProfile,
            fallbackProviders: msg.fallbackProviders,
          });
          await postState();
          return;
        }

        if (type === 'session.spawnSubagent') {
          const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
          const spawned = engine.spawnSubagent(msg.sessionId, {
            ...payload,
            executionMode: payload.executionMode || 'agent',
            runtimeBackend: payload.runtimeBackend || 'auto',
            policyProfile: payload.policyProfile || 'coding',
            authProfile: payload.authProfile || 'default',
            fallbackProviders: Array.isArray(payload.fallbackProviders) ? payload.fallbackProviders : [],
          });
          if (spawned && panel) {
            panel.webview.postMessage({
              type: 'subagent.spawned',
              subagent: spawned.subagent,
              task: spawned.task,
            });
          }
          await postState();
          return;
        }

        if (type === 'session.yield') {
          engine.yieldSession(msg.sessionId, msg.reason || '');
          await postState();
          return;
        }

        if (type === 'session.resume') {
          engine.resumeSession(msg.sessionId);
          await postState();
          return;
        }

        if (type === 'session.status') {
          const status = engine.getSessionStatus(msg.sessionId);
          panel.webview.postMessage({ type: 'session.status.result', status });
          return;
        }

        if (type === 'session.history') {
          const history = engine.getSessionHistory(msg.sessionId, { limit: msg.limit || 20 });
          panel.webview.postMessage({ type: 'session.history.result', history });
          return;
        }

        if (type === 'control.health') {
          const health = await getControlPlaneHealth();
          panel.webview.postMessage({ type: 'control.health.result', health });
          return;
        }

        if (type === 'control.schema.lookup') {
          panel.webview.postMessage({ type: 'control.schema.result', schema: getControlPlaneSchema() });
          return;
        }

        if (type === 'control.config.patch') {
          try {
            await applyControlPlanePatch(msg.patch || {});
            panel.webview.postMessage({ type: 'control.patch.result', ok: true });
            await postState();
          } catch (error) {
            panel.webview.postMessage({
              type: 'control.patch.result',
              ok: false,
              message: String(error?.message || error),
            });
          }
          return;
        }

        if (type === 'control.restart.runtime') {
          engine.stop();
          engine.start();
          panel.webview.postMessage({ type: 'control.restart.result', ok: true });
          await postState();
          return;
        }

        if (type === 'catalog.refresh') {
          await refreshPanelCatalog(true);
          await postState();
          return;
        }

        if (type === 'provider.test') {
          const provider = String(msg.provider || '').trim() || (await getActiveProviderConfig()).provider;
          const model = provider === 'copilot'
            ? ''
            : String(msg.model || '').trim() || (await getActiveProviderConfig()).model;
          try {
            const result = await providerRouter.execute({
              goal: 'Responde solo con OK y el modelo usado.',
              provider,
              model,
              executionMode: 'direct',
            }, { workspacePath });
            panel.webview.postMessage({
              type: 'provider.test.result',
              ok: true,
              provider,
              model,
              summary: String(result?.summary || 'ok'),
            });
          } catch (error) {
            panel.webview.postMessage({
              type: 'provider.test.result',
              ok: false,
              provider,
              model,
              message: String(error?.message || error),
            });
          }
          return;
        }

        if (type === 'approval.resolve') {
          engine.resolveApproval(msg.sessionId, msg.taskId, Boolean(msg.approved), msg.reason || '');
          postState();
          return;
        }

        if (type === 'task.cancel') {
          engine.cancelTask(msg.sessionId, msg.taskId);
          postState();
          return;
        }

        if (type === 'task.retry') {
          engine.retryTask(msg.sessionId, msg.taskId);
          postState();
          return;
        }

        if (type === 'state.get') {
          postState();
          return;
        }
      } catch (error) {
        const message = String(error.message || error);
        if (output) {
          output.appendLine(`[freejt7-panel] message handler error: ${message}`);
        }
        if (panel) {
          panel.webview.postMessage({
            type: 'panel.server.error',
            stage: type || 'unknown',
            message,
          });
        }
      }
    });

    panel.webview.html = createPanelHtml(panel.webview, 'Free JT7', currentCatalog, {
      standaloneMode,
    });

    panel.onDidDispose(() => {
      try {
        messageSubscription.dispose();
      } catch (_) {
        // ignore dispose issues
      }
      panel = null;
    });

    refreshPanelCatalog(true).then(() => postState()).catch((error) => {
      if (output) {
        output.appendLine(`[freejt7-panel] catalog refresh error: ${String(error?.message || error)}`);
      }
    });
    postState();
  }

  function dispose() {
    engine.stop();
    if (panel) {
      panel.dispose();
    }
  }

  return {
    openPanel,
    dispose,
    engine,
  };
}

module.exports = {
  createPanelHtml,
  createControlPanel,
  sanitizePanelProviderConfig: panelHelpers.sanitizePanelProviderConfig,
  ensurePanelSeedSession,
};