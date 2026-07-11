'use strict';

const https = require('https');
const { callProvider, getApiKey } = require('../providers/api-provider-adapter');
const {
  buildConversationRequest,
  serializeConversationRequest,
} = require('./chat-context');
const { buildSubordinateBackendDescriptor } = require('./openclaw-agent-runtime');
const { runLocalAgentTask } = require('./local-agent-runtime');
const { getAgentFacade, normalizeProviderId, requireProvider, resolveProviderModel } = require('./provider-registry');
const {
  buildChatCompletionPayload,
  buildProviderHeaders,
  getProviderConfig,
} = require('./provider-config');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeBackend(value) {
  const backend = normalizeText(value).toLowerCase();
  if (!backend) return 'auto';
  if (backend === 'auto' || backend === 'openclaw' || backend === 'local') {
    return backend;
  }
  if (backend.startsWith('acp:')) {
    return backend;
  }
  return 'auto';
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createTaggedError(message, flags = {}) {
  const error = new Error(message);
  Object.assign(error, flags);
  return error;
}

function normalizeStreamMessages(input = {}) {
  if (Array.isArray(input.messages) && input.messages.length > 0) {
    return input.messages;
  }
  if (input.conversationRequest) {
    const request = input.conversationRequest;
    if (Array.isArray(request.messages) && request.messages.length > 0) {
      return request.messages;
    }
    const text = normalizeText(request.text || request.prompt || input.prompt || input.goal);
    return text ? [{ role: 'user', content: text }] : [];
  }
  const text = normalizeText(input.prompt || input.goal || input.text);
  return text ? [{ role: 'user', content: text }] : [];
}

function extractStreamToken(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const choice = payload.choices?.[0];
  const delta = choice?.delta;
  const message = choice?.message;
  const content = delta?.content ?? message?.content ?? choice?.text ?? payload.token?.text ?? payload.generated_text;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((entry) => String(entry?.text || entry?.content || '').trim())
      .filter(Boolean)
      .join('');
  }
  return '';
}

function parseStreamChunk(chunk, state, onPayload) {
  state.buffer += String(chunk || '');
  const lines = state.buffer.split(/\r?\n/);
  state.buffer = lines.pop() || '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) continue;
    const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
    if (!data || data === '[DONE]') {
      if (data === '[DONE]') state.done = true;
      continue;
    }
    try {
      onPayload(JSON.parse(data));
    } catch (_) {
      onPayload({ choices: [{ delta: { content: data } }] });
    }
  }
}

function flushStreamBuffer(state, onPayload) {
  const data = String(state.buffer || '').trim();
  state.buffer = '';
  if (!data || data === '[DONE]') return;
  try {
    onPayload(JSON.parse(data));
  } catch (_) {
    onPayload({ choices: [{ delta: { content: data } }] });
  }
}

async function streamCompletion(input = {}, runtime = {}) {
  const providerId = normalizeProviderId(input.providerId || input.provider || runtime.defaultProvider || 'openrouter');
  const provider = requireProvider(providerId);
  if (!provider.streamSupport) {
    throw createTaggedError(`Free JT7: el proveedor ${provider.id} no soporta streaming directo`, {
      isConfigurationError: true,
      isRetryable: false,
    });
  }

  const { modelId } = resolveProviderModel(provider.id, input.modelId || input.model || runtime.defaultModel);
  const apiKeyReader = typeof input.getApiKey === 'function' ? input.getApiKey : getApiKey;
  const apiKey = normalizeText(await apiKeyReader(provider.id, input.secretStorage || runtime.secretStorage, {
    workspacePath: input.workspacePath || runtime.workspacePath,
    authProfile: input.authProfile || runtime.authProfile,
  }));
  if (!apiKey) {
    throw createTaggedError(
      `Free JT7: No hay API Key para "${provider.id}". Usa el comando "Free JT7: Configurar API Key de Proveedor".`,
      { isConfigurationError: true, isUserActionRequired: true, isRetryable: false },
    );
  }

  const providerConfig = getProviderConfig(provider.id);
  const payload = buildChatCompletionPayload({
    providerId: provider.id,
    modelId,
    messages: normalizeStreamMessages(input),
    prompt: input.prompt || input.goal || input.text,
    stream: true,
    maxTokens: input.maxTokens,
  });
  if (payload.messages.length === 0) {
    throw createTaggedError('Free JT7: streamCompletion requiere messages o prompt', {
      isConfigurationError: true,
      isRetryable: false,
    });
  }

  const parsedUrl = new URL(providerConfig.chatCompletionsUrl);
  const body = JSON.stringify(payload);
  const headers = {
    ...buildProviderHeaders(provider.id, apiKey, input.headers),
    'Content-Length': Buffer.byteLength(body),
  };
  const onToken = typeof input.onToken === 'function' ? input.onToken : null;
  const onDone = typeof input.onDone === 'function' ? input.onDone : null;
  const onError = typeof input.onError === 'function' ? input.onError : null;
  const requestImpl = input.requestImpl || https.request;

  return new Promise((resolve, reject) => {
    const state = { buffer: '', done: false };
    const tokens = [];
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      if (onError) {
        try { onError(error); } catch (_) {}
      }
      reject(error);
    };
    const complete = () => {
      if (settled) return;
      settled = true;
      const summary = tokens.join('');
      const result = {
        provider: provider.id,
        model: modelId || 'default',
        summary,
        raw: {
          executionRoute: 'provider-stream',
          stream: true,
          tokenCount: tokens.length,
        },
      };
      if (onDone) {
        try { onDone(result); } catch (_) {}
      }
      resolve(result);
    };

    const req = requestImpl({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + (parsedUrl.search || ''),
      method: 'POST',
      headers,
    }, (res) => {
      if ((res.statusCode || 0) >= 400) {
        let raw = '';
        res.on('data', (chunk) => { raw += String(chunk || ''); });
        res.on('end', () => fail(createTaggedError(`Free JT7 (${provider.id}): error HTTP ${res.statusCode}. ${raw}`.trim(), {
          isRetryable: (res.statusCode || 0) >= 500 || (res.statusCode || 0) === 408,
          isRateLimitError: (res.statusCode || 0) === 429,
        })));
        return;
      }

      const onPayload = (payloadChunk) => {
        const token = extractStreamToken(payloadChunk);
        if (!token) return;
        tokens.push(token);
        if (onToken) onToken(token, payloadChunk);
      };
      res.on('data', (chunk) => parseStreamChunk(chunk, state, onPayload));
      res.on('end', () => {
        flushStreamBuffer(state, onPayload);
        complete();
      });
      res.on('error', fail);
    });

    req.on('error', fail);
    req.write(body);
    req.end();
  });
}

class ProviderRouter {
  constructor(opts = {}) {
    this.context = opts.context;
    this.output = opts.output || null;
    this.agentRuntime = opts.agentRuntime || null;
    this.executeCopilotTask = opts.executeCopilotTask;
    this.executeAgentTask = opts.executeAgentTask || opts.executeCopilotTask || this.agentRuntime?.executeAgentTask;
    this.executeAcpTask = opts.executeAcpTask;
    this.workspacePath = opts.workspacePath || "";
    this.defaultRuntimeBackend = normalizeBackend(opts.defaultRuntimeBackend || 'auto');
    this.defaultAuthProfile = normalizeText(opts.defaultAuthProfile || 'default') || 'default';
    this.cooldownMs = Math.max(1_000, Number(opts.cooldownMs || 45_000));
    this.maxRouteAttempts = Math.max(1, Number(opts.maxRouteAttempts || 4));
    this._cooldowns = new Map();
    this._agentFacade = getAgentFacade();
  }

  _buildFallbackEntries(task = {}, runtime = {}, provider = '', model = '') {
    const normalizedProvider = normalizeText(provider || runtime.defaultProvider || 'openrouter') || 'openrouter';
    const normalizedModel = normalizeText(model || runtime.defaultModel || '');
    const baseBackend = normalizeBackend(task.runtimeBackend || runtime.runtimeBackend || this.defaultRuntimeBackend || 'auto');
    const baseAuthProfile = normalizeText(task.authProfile || runtime.authProfile || this.defaultAuthProfile || 'default') || 'default';
    const providerPlan = task.providerPlan && typeof task.providerPlan === 'object' ? cloneJson(task.providerPlan) : {};
    const result = [];

    const primaryFromPlan = providerPlan.primary && typeof providerPlan.primary === 'object'
      ? providerPlan.primary
      : null;
    result.push({
      provider: normalizeText(primaryFromPlan?.provider || normalizedProvider) || normalizedProvider,
      model: normalizeText(primaryFromPlan?.model || normalizedModel),
      authProfile: normalizeText(primaryFromPlan?.authProfile || baseAuthProfile) || 'default',
      runtimeBackend: normalizeBackend(primaryFromPlan?.runtimeBackend || baseBackend),
      source: 'primary',
    });

    const pushFallback = (entry, sourceLabel) => {
      if (!entry) return;
      if (typeof entry === 'string') {
        const [providerPart, ...modelParts] = entry.split(':');
        const fallbackProvider = normalizeText(providerPart || normalizedProvider) || normalizedProvider;
        const fallbackModel = normalizeText(modelParts.join(':'));
        result.push({
          provider: fallbackProvider,
          model: fallbackModel || normalizedModel,
          authProfile: baseAuthProfile,
          runtimeBackend: baseBackend,
          source: sourceLabel,
        });
        return;
      }
      if (typeof entry !== 'object') return;
      result.push({
        provider: normalizeText(entry.provider || normalizedProvider) || normalizedProvider,
        model: normalizeText(entry.model || normalizedModel),
        authProfile: normalizeText(entry.authProfile || baseAuthProfile) || 'default',
        runtimeBackend: normalizeBackend(entry.runtimeBackend || baseBackend),
        source: sourceLabel,
      });
    };

    if (Array.isArray(providerPlan.fallbacks)) {
      for (const fallback of providerPlan.fallbacks) {
        pushFallback(fallback, 'providerPlan');
      }
    }
    if (Array.isArray(task.fallbackProviders)) {
      for (const fallback of task.fallbackProviders) {
        pushFallback(fallback, 'task.fallbackProviders');
      }
    }
    if (Array.isArray(runtime.fallbackProviders)) {
      for (const fallback of runtime.fallbackProviders) {
        pushFallback(fallback, 'runtime.fallbackProviders');
      }
    }

    const dedup = [];
    const seen = new Set();
    for (const entry of result) {
      const key = `${entry.provider}::${entry.model || 'default'}::${entry.authProfile}::${entry.runtimeBackend}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(entry);
      if (dedup.length >= this.maxRouteAttempts) {
        break;
      }
    }
    return dedup;
  }

  _buildRouteKey(candidate = {}) {
    return `${candidate.provider || 'unknown'}::${candidate.model || 'default'}::${candidate.authProfile || 'default'}`;
  }

  _isOnCooldown(candidate = {}) {
    const routeKey = this._buildRouteKey(candidate);
    const cooldownUntil = Number(this._cooldowns.get(routeKey) || 0);
    if (!cooldownUntil) return false;
    if (Date.now() >= cooldownUntil) {
      this._cooldowns.delete(routeKey);
      return false;
    }
    return true;
  }

  _markCooldown(candidate = {}) {
    const routeKey = this._buildRouteKey(candidate);
    this._cooldowns.set(routeKey, Date.now() + this.cooldownMs);
  }

  _isTransientError(error) {
    if (!error) return false;
    if (error.isRetryable === true || error.isRateLimitError === true) {
      return true;
    }
    const message = normalizeText(error.message || error);
    return /429|rate limit|too many requests|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/i.test(message);
  }

  _shouldTryFallback(error, attemptIndex, totalAttempts) {
    if (attemptIndex >= totalAttempts - 1) return false;
    if (!error) return false;
    if (error.isUserActionRequired || error.isConfigurationError) {
      return false;
    }
    return this._isTransientError(error);
  }

  _buildSummaryFromResult(result, fallback = 'ok') {
    return String(result?.final?.summary || result?.run?.summary || result?.summary || fallback);
  }

  _getExecutionRoute(backend, executionMode) {
    if (executionMode === 'direct') {
      return 'provider-direct';
    }
    if (backend === 'local') {
      return 'local-agent';
    }
    if (backend.startsWith('acp:')) {
      return backend;
    }
    if (backend === 'openclaw') {
      return 'openclaw-agent';
    }
    return 'agent-router';
  }

  _normalizeAgentVisibleIdentity(result = {}, candidate = {}, executionMode = 'agent') {
    const executionRoute = normalizeText(result?.executionRoute || result?.raw?.executionRoute || '');
    const backend = buildSubordinateBackendDescriptor({
      executionRoute,
      runtimeBackend: candidate.runtimeBackend,
      provider: result?.provider || candidate.provider || '',
      model: result?.model || candidate.model || '',
      authProfile: candidate.authProfile,
      fallbackSelected: result?.raw?.routeMeta?.fallbackSelected || result?.routeMeta?.fallbackSelected || result?.raw?.routeMeta?.fallback || '',
    });
    const isSubordinated = executionMode === 'agent'
      && (backend.kind === 'openclaw-harness' || backend.kind === 'provider-direct');
    if (!isSubordinated) {
      return {
        provider: normalizeText(result?.provider || candidate.provider || 'freejt7-agent') || 'freejt7-agent',
        model: normalizeText(result?.model || candidate.model || 'default') || 'default',
        backend,
      };
    }
    return {
      provider: this._agentFacade.providerId,
      model: this._agentFacade.modelId,
      backend,
    };
  }

  getRoutePlan(task = {}, runtime = {}) {
    const executionMode = normalizeText(task.executionMode || runtime.executionMode || 'agent') || 'agent';
    const backend = normalizeBackend(task.runtimeBackend || runtime.runtimeBackend || this.defaultRuntimeBackend);
    if (executionMode === 'direct') {
      return {
        primaryRoute: 'provider-direct',
        runtimeBackend: backend,
        provider: normalizeText(task.provider || runtime.defaultProvider || 'openrouter') || 'openrouter',
        model: normalizeText(task.model || runtime.defaultModel || ''),
        localCapable: false,
        deterministicLocal: false,
        fallbackOrder: [],
        reason: 'executionMode=direct',
      };
    }
    if (this.agentRuntime && typeof this.agentRuntime.planTaskExecution === 'function') {
      return this.agentRuntime.planTaskExecution(
        String(task.goal || task.prompt || '').trim(),
        {
          ...task,
          ...runtime,
          runtimeBackend: backend,
          provider: task.provider || runtime.defaultProvider || '',
          model: task.model || runtime.defaultModel || '',
          workspacePath: runtime.workspacePath || this.workspacePath,
        },
      );
    }
    return {
      primaryRoute: this._getExecutionRoute(backend, executionMode),
      runtimeBackend: backend,
      provider: normalizeText(task.provider || runtime.defaultProvider || 'openrouter') || 'openrouter',
      model: normalizeText(task.model || runtime.defaultModel || ''),
      localCapable: false,
      deterministicLocal: false,
      fallbackOrder: [],
      reason: 'router-fallback-plan',
    };
  }

  async _executeAgentRoute(task, runtime, conversationRequest, candidate, executionMode) {
    const backend = normalizeBackend(candidate.runtimeBackend || task.runtimeBackend || runtime.runtimeBackend || this.defaultRuntimeBackend);
    if (this.agentRuntime && typeof this.agentRuntime.executeTask === 'function') {
      const result = await this.agentRuntime.executeTask({
        ...task,
        conversationRequest,
        provider: candidate.provider,
        model: candidate.model,
        authProfile: candidate.authProfile,
        runtimeBackend: backend,
      }, {
        ...runtime,
        workspacePath: runtime.workspacePath || this.workspacePath,
        runtimeBackend: backend,
        defaultProvider: candidate.provider,
        defaultModel: candidate.model,
      });
      const rawResult = result?.raw && typeof result.raw === 'object' ? result.raw : {};
      const executionRoute = normalizeText(result?.executionRoute || rawResult.executionRoute || this._getExecutionRoute(backend, executionMode)) || this._getExecutionRoute(backend, executionMode);
      const visible = this._normalizeAgentVisibleIdentity({
        ...result,
        raw: rawResult,
        executionRoute,
      }, candidate, executionMode);
      return {
        provider: visible.provider,
        model: visible.model,
        summary: this._buildSummaryFromResult(result, 'ok'),
        raw: {
          ...rawResult,
          ...result,
          executionRoute,
          routeMeta: {
            ...(rawResult.routeMeta || result?.routeMeta || {}),
            controlPlaneOwner: rawResult.routeMeta?.controlPlaneOwner || result?.routeMeta?.controlPlaneOwner || this._agentFacade.providerId,
            backend: rawResult.routeMeta?.backend || result?.routeMeta?.backend || visible.backend,
          },
        },
      };
    }
    const goal = serializeConversationRequest(conversationRequest);
    const commonTaskContext = {
      ...task,
      conversationRequest,
      executionMode,
      provider: candidate.provider,
      model: candidate.model,
      authProfile: candidate.authProfile,
      runtimeBackend: backend,
    };

    if (backend === 'local') {
      const result = await runLocalAgentTask(goal, {
        ...commonTaskContext,
        workspacePath: runtime.workspacePath || this.workspacePath,
        fallbackReason: 'runtimeBackend=local',
      });
      return {
        provider: candidate.provider || 'local',
        model: candidate.model || 'freejt7-local-tools',
        summary: this._buildSummaryFromResult(result, 'ok'),
        raw: {
          ...result,
          executionRoute: 'local-agent',
        },
      };
    }

    if (backend.startsWith('acp:') && typeof this.executeAcpTask === 'function') {
      const result = await this.executeAcpTask(goal, commonTaskContext);
      const visible = this._normalizeAgentVisibleIdentity({
        ...result,
        executionRoute: normalizeText(result?.executionRoute || backend) || backend,
      }, candidate, executionMode);
      return {
        provider: visible.provider,
        model: visible.model,
        summary: this._buildSummaryFromResult(result, 'ok'),
        raw: {
          ...result,
          executionRoute: normalizeText(result?.executionRoute || backend) || backend,
          routeMeta: {
            ...(result?.routeMeta || {}),
            controlPlaneOwner: result?.routeMeta?.controlPlaneOwner || this._agentFacade.providerId,
            backend: result?.routeMeta?.backend || visible.backend,
          },
        },
      };
    }

    const executeAgent = typeof this.executeAgentTask === 'function'
      ? this.executeAgentTask
      : (prompt, context) => runLocalAgentTask(prompt, {
        ...context,
        workspacePath: runtime.workspacePath || this.workspacePath,
        fallbackReason: 'executeAgentTask no configurado',
      });
    const result = await executeAgent(goal, commonTaskContext);
    const visible = this._normalizeAgentVisibleIdentity({
      ...result,
      executionRoute: normalizeText(result?.executionRoute || this._getExecutionRoute(backend, executionMode)) || this._getExecutionRoute(backend, executionMode),
    }, candidate, executionMode);
    return {
      provider: visible.provider,
      model: visible.model,
      summary: this._buildSummaryFromResult(result, 'ok'),
      raw: {
        ...result,
        executionRoute: normalizeText(result?.executionRoute || this._getExecutionRoute(backend, executionMode)) || this._getExecutionRoute(backend, executionMode),
        routeMeta: {
          ...(result?.routeMeta || {}),
          controlPlaneOwner: result?.routeMeta?.controlPlaneOwner || this._agentFacade.providerId,
          backend: result?.routeMeta?.backend || visible.backend,
        },
      },
    };
  }

  async _executeDirectRoute(conversationRequest, runtime, candidate) {
    const result = await callProvider(
      conversationRequest,
      { provider: candidate.provider, model: candidate.model, authProfile: candidate.authProfile },
      this.context?.secrets,
      { workspacePath: runtime.workspacePath || this.workspacePath, authProfile: candidate.authProfile },
    );
    return {
      provider: candidate.provider,
      model: candidate.model || 'default',
      summary: this._buildSummaryFromResult(result, 'ok'),
      raw: {
        ...result,
        executionRoute: 'provider-direct',
      },
    };
  }

  async streamCompletion(input = {}, runtime = {}) {
    return streamCompletion({
      ...input,
      secretStorage: input.secretStorage || this.context?.secrets,
      workspacePath: input.workspacePath || runtime.workspacePath || this.workspacePath,
    }, runtime);
  }

  getHealthStatus() {
    const now = Date.now();
    let activeCooldowns = 0;
    for (const [, until] of this._cooldowns.entries()) {
      if (Number(until) > now) {
        activeCooldowns += 1;
      }
    }
    return {
      ok: true,
      activeCooldowns,
      maxRouteAttempts: this.maxRouteAttempts,
      cooldownMs: this.cooldownMs,
      capabilities: {
        agentRuntime: Boolean(this.agentRuntime),
        executeAgentTask: typeof this.executeAgentTask === 'function',
        executeAcpTask: typeof this.executeAcpTask === 'function',
      },
      providerBackendsSubordinated: Boolean(this.agentRuntime),
      checkedAt: new Date().toISOString(),
    };
  }

  async execute(task = {}, runtime = {}) {
    const provider = normalizeText(task.provider || runtime.defaultProvider || 'openrouter') || 'openrouter';
    const model = normalizeText(task.model || runtime.defaultModel || '');
    const requestedExecutionMode = normalizeText(task.executionMode || runtime.defaultExecutionMode || 'agent').toLowerCase();
    const executionMode = provider === 'copilot'
      ? 'agent'
      : requestedExecutionMode === 'direct'
        ? 'direct'
        : 'agent';
    const goal = normalizeText(task.goal || task.prompt || '');
    const conversationRequest = task.conversationRequest || buildConversationRequest({
      prompt: goal,
      history: task.chatHistorySnapshot || task.historySnapshot || task.history || [],
      sessionTitle: task.sessionTitle || runtime.sessionTitle || '',
      workspacePath: runtime.workspacePath || this.workspacePath,
      channel: 'control-panel',
      intake: task.intake || runtime.intake || null,
      selectedSkills: task.selectedSkills || runtime.selectedSkills || [],
    });

    if (!goal) {
      throw new Error('Task sin goal/prompt');
    }

    const routeCandidates = this._buildFallbackEntries(task, runtime, provider, model);
    const attempts = [];
    let lastError = null;

    for (let index = 0; index < routeCandidates.length; index += 1) {
      const candidate = routeCandidates[index];
      const isCooling = this._isOnCooldown(candidate);
      if (isCooling && index < routeCandidates.length - 1) {
        attempts.push({
          attempt: index + 1,
          provider: candidate.provider,
          model: candidate.model || 'default',
          authProfile: candidate.authProfile,
          runtimeBackend: candidate.runtimeBackend,
          skipped: 'cooldown',
          at: new Date().toISOString(),
        });
        continue;
      }

      try {
        const result = executionMode === 'direct'
          ? await this._executeDirectRoute(conversationRequest, runtime, candidate)
          : await this._executeAgentRoute(task, runtime, conversationRequest, candidate, executionMode);
        attempts.push({
          attempt: index + 1,
          provider: result.provider,
          model: result.model || 'default',
          backendProvider: result.raw?.routeMeta?.backend?.provider || candidate.provider,
          backendModel: result.raw?.routeMeta?.backend?.model || candidate.model || 'default',
          authProfile: candidate.authProfile,
          runtimeBackend: candidate.runtimeBackend,
          ok: true,
          at: new Date().toISOString(),
        });

        const fallbackUsed = index > 0 || attempts.some((item) => item.skipped);
        return {
          provider: result.provider,
          model: result.model || 'default',
          summary: result.summary,
          raw: {
            ...result.raw,
            routeMeta: {
              ...(result.raw?.routeMeta || {}),
              attempts,
              fallbackUsed,
              selectedAuthProfile: candidate.authProfile,
              runtimeBackend: candidate.runtimeBackend,
            },
          },
          executionMode,
        };
      } catch (error) {
        lastError = error;
        const message = normalizeText(error?.message || error);
        const transient = this._isTransientError(error);
        attempts.push({
          attempt: index + 1,
          provider: candidate.provider,
          model: candidate.model || 'default',
          authProfile: candidate.authProfile,
          runtimeBackend: candidate.runtimeBackend,
          ok: false,
          transient,
          error: message,
          at: new Date().toISOString(),
        });
        if (transient) {
          this._markCooldown(candidate);
        }
        if (!this._shouldTryFallback(error, index, routeCandidates.length)) {
          break;
        }
      }
    }

    const finalMessage = normalizeText(lastError?.message || lastError || 'Error sin detalle');
    const error = new Error(`Free JT7 router fallback exhausted: ${finalMessage}`);
    error.routeAttempts = attempts;
    if (lastError && typeof lastError === 'object') {
      error.isUserActionRequired = Boolean(lastError.isUserActionRequired);
      error.isConfigurationError = Boolean(lastError.isConfigurationError);
      error.isRetryable = Boolean(lastError.isRetryable);
      error.isRateLimitError = Boolean(lastError.isRateLimitError);
    }
    throw error;
  }
}

module.exports = {
  ProviderRouter,
  streamCompletion,
};
