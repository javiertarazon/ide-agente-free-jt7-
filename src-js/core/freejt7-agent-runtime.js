'use strict';

const {
  buildConversationRequest,
  serializeConversationRequest,
} = require('./chat-context');
const { buildSubordinateBackendDescriptor } = require('./openclaw-agent-runtime');
const { getAgentFacade, isExternalProvider } = require('./provider-registry');

function noop() {}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeSkillId(skill) {
  if (!skill) return '';
  if (typeof skill === 'string') return skill.trim();
  if (typeof skill === 'object') {
    return String(skill.id || skill.name || skill.label || '').trim();
  }
  return '';
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeMcpServers(servers = []) {
  return Array.isArray(servers)
    ? servers
      .map((server) => {
        if (!server || typeof server !== 'object') return null;
        const id = String(server.id || server.name || '').trim();
        if (!id) return null;
        return {
          id,
          transport: String(server.transport || 'stdio').trim() || 'stdio',
          enabled: server.enabled !== false,
        };
      })
      .filter(Boolean)
    : [];
}

function inferNativeMcpTools(goal, mcpServers = []) {
  if (!Array.isArray(mcpServers) || !mcpServers.some((server) => server && server.enabled !== false)) {
    return [];
  }
  const text = String(goal || '').toLowerCase();
  return [
    /\b(pdf|json|markdown|md\b|documento|document|archivo|ruta|directorio|buscar contenido|contenido)\b/.test(text)
      ? { family: 'documents', reason: 'goal-document-or-path' }
      : null,
    /\b(web|browser|navegador|url|duckduckgo|google|buscar en la web|search web|internet)\b/.test(text)
      ? { family: 'browser', reason: 'goal-web-navigation' }
      : null,
    /\b(abrir|revela|revelar|mostrar en carpeta|explorer|finder|desktop|escritorio)\b/.test(text)
      ? { family: 'desktop', reason: 'goal-desktop-open' }
      : null,
  ].filter(Boolean);
}

function createFreeJt7AgentRuntime(options = {}) {
  const output = options.output || { appendLine: noop };
  const context = options.context || {};
  const agentFacade = getAgentFacade();
  const getWorkspacePath = typeof options.getWorkspacePath === 'function'
    ? options.getWorkspacePath
    : (() => '');
  const getProviderConfig = typeof options.getProviderConfig === 'function'
    ? options.getProviderConfig
    : (() => ({ provider: '', model: '' }));
  const runLocalAgentTask = options.runLocalAgentTask;
  const runOpenClawAgentTask = options.runOpenClawAgentTask;
  const runProviderDirectFallbackTask = options.runProviderDirectFallbackTask;
  const runAcpTask = options.runAcpTask;
  const runCopilotTask = options.runCopilotTask;
  const shouldPreferLocalExecution = typeof options.shouldPreferLocalExecution === 'function'
    ? options.shouldPreferLocalExecution
    : (() => false);
  const canResolveLocalGoal = typeof options.canResolveLocalGoal === 'function'
    ? options.canResolveLocalGoal
    : (() => false);
  const buildLocalActions = typeof options.buildLocalActions === 'function'
    ? options.buildLocalActions
    : (() => []);
  const getMcpServers = typeof options.getMcpServers === 'function'
    ? options.getMcpServers
    : (() => []);
  const shouldUseProviderDirectFallback = typeof options.shouldUseProviderDirectFallback === 'function'
    ? options.shouldUseProviderDirectFallback
    : (() => false);
  const shouldUseLocalAgentFallback = typeof options.shouldUseLocalAgentFallback === 'function'
    ? options.shouldUseLocalAgentFallback
    : (() => false);

  function isContinuationGoal(goal) {
    const text = String(goal || '').trim().toLowerCase();
    if (!text) return false;
    return /^(continua|continuar|continúe|continua con|sigue|seguir|sigue con|retoma|retomar|debes continuar)\b/.test(text)
      || (/^(funciona|y ahora|siguiente paso)\b/.test(text) && text.split(/\s+/).length <= 4);
  }

  function buildContinuationPrompt(goal, sessionAgentState = null) {
    const state = sessionAgentState && typeof sessionAgentState === 'object' ? sessionAgentState : null;
    if (!state || !isContinuationGoal(goal)) {
      return String(goal || '').trim();
    }
    const lastGoal = String(state.lastUserGoal || '').trim();
    const lastSummary = String(state.lastAssistantSummary || '').trim();
    const taskId = String(state.lastTaskId || '').trim();
    const pieces = [
      String(goal || '').trim(),
      'Contexto de continuidad recuperado por Free JT7:',
      lastGoal ? `- Ultimo objetivo: ${lastGoal}` : '',
      lastSummary ? `- Ultimo resultado visible: ${lastSummary}` : '',
      taskId ? `- Ultima tarea: ${taskId}` : '',
      state.continuationHint ? `- Continuation hint: ${String(state.continuationHint).trim()}` : '',
    ].filter(Boolean);
    return pieces.join('\n');
  }

  function buildConversationEnvelope(task = {}, runtime = {}) {
    const originalGoal = String(task.goal || task.prompt || '').trim();
    const goal = buildContinuationPrompt(originalGoal, task.sessionAgentState || runtime.sessionAgentState || null);
    const reuseIncomingConversation = task.conversationRequest && goal === originalGoal;
    const conversationRequest = reuseIncomingConversation ? task.conversationRequest : buildConversationRequest({
      prompt: goal,
      history: task.chatHistorySnapshot || task.historySnapshot || task.history || [],
      sessionTitle: task.sessionTitle || runtime.sessionTitle || '',
      workspacePath: runtime.workspacePath || getWorkspacePath(),
      channel: 'control-panel',
      intake: task.intake || runtime.intake || null,
      selectedSkills: task.selectedSkills || runtime.selectedSkills || [],
    });
    return {
      goal,
      conversationRequest,
      serializedGoal: serializeConversationRequest(conversationRequest),
    };
  }

  function requireWorkspace(kind) {
    const workspacePath = String(getWorkspacePath() || '').trim();
    if (!workspacePath) {
      throw new Error(`Free JT7: abre un workspace antes de usar ${kind} desde el panel.`);
    }
    return workspacePath;
  }

  function buildAgentOptions(goal, taskContext = {}) {
    const effectiveProvider = getProviderConfig();
    return {
      goal,
      workspacePath: requireWorkspace('el modo agente'),
      runtimeRoot: String(taskContext?.runtimeRoot || options.runtimeRoot || '').trim(),
      provider: String(taskContext?.provider || effectiveProvider.provider || '').trim(),
      model: String(taskContext?.model || effectiveProvider.model || '').trim(),
      runtimeBackend: String(taskContext?.runtimeBackend || 'auto').trim().toLowerCase(),
      authProfile: String(taskContext?.authProfile || 'default').trim(),
      policyProfile: String(taskContext?.policyProfile || 'coding').trim(),
      fallbackProviders: Array.isArray(taskContext?.fallbackProviders) ? taskContext.fallbackProviders : [],
      sessionId: String(taskContext?.sessionId || '').trim(),
      runId: String(taskContext?.runId || '').trim(),
      secretStorage: taskContext?.secretStorage || context.secrets,
      conversationRequest: taskContext?.conversationRequest || null,
      selectedSkills: Array.isArray(taskContext?.selectedSkills) ? taskContext.selectedSkills : [],
      intake: taskContext?.intake || null,
    };
  }

  function buildLocalDispatchPlan(goal, taskContext = {}, routePlan = {}) {
    const workspacePath = String(taskContext.workspacePath || getWorkspacePath() || '').trim();
    const planningOptions = {
      ...taskContext,
      workspacePath,
      runtimeBackend: routePlan.runtimeBackend || taskContext.runtimeBackend || 'local',
      provider: routePlan.provider || taskContext.provider || '',
      model: routePlan.model || taskContext.model || '',
    };
    const planned = Array.isArray(buildLocalActions(goal, planningOptions))
      ? buildLocalActions(goal, planningOptions)
      : [];
    return planned.filter(Boolean);
  }

  function summarizePlannedActions(actions = []) {
    return actions.map((action) => {
      const type = String(action?.type || '').trim();
      if (!type) return '';
      if (type === 'read') return `read:${String(action.path || '').trim()}`;
      if (type === 'write') return `write:${String(action.path || '').trim()}`;
      if (type === 'mkdir') return `mkdir:${String(action.path || '').trim()}`;
      if (type === 'inspect_path') return `inspect:${String(action.path || '').trim()}`;
      if (type === 'verify') return `verify:${[action.command, ...(Array.isArray(action.args) ? action.args : [])].filter(Boolean).join(' ')}`;
      if (type === 'system_install') return `system_install:${String(action.package || '').trim()}`;
      return type;
    }).filter(Boolean);
  }

  function inferLocalOperations(goal) {
    const text = String(goal || '').toLowerCase();
    return uniqueStrings([
      /\b(crea|crear|mkdir|carpeta|directorio)\b/.test(text) ? 'filesystem.mkdir' : '',
      /\b(lee|read|revisa|inspecciona|lista|ls|archivo|ruta|directorio)\b/.test(text) ? 'filesystem.read' : '',
      /\b(edita|edit|escribe|write|patch|parche)\b/.test(text) ? 'filesystem.write' : '',
      /\b(build|test|prueba|verifica|lint|doctor|diagnost)\b/.test(text) ? 'shell.verify' : '',
      /\b(instala|install)\b/.test(text) ? 'system.install' : '',
      /\bgit\b/.test(text) ? 'git' : '',
    ]);
  }

  function buildCapabilityPlan(goal, taskContext = {}, routePlan = {}) {
    const skillIds = uniqueStrings((Array.isArray(taskContext?.selectedSkills) ? taskContext.selectedSkills : []).map(normalizeSkillId));
    const localOperations = inferLocalOperations(goal);
    const plannedActions = buildLocalDispatchPlan(goal, taskContext, routePlan);
    const mcpServers = normalizeMcpServers(getMcpServers(taskContext, routePlan));
    const mcpTools = inferNativeMcpTools(goal, mcpServers);
    let toolMode = 'provider-only';
    if (routePlan.primaryRoute === 'local-agent') {
      toolMode = 'local-tools';
    } else if (String(routePlan.primaryRoute || '').startsWith('acp:')) {
      toolMode = 'acp-harness';
    } else if (routePlan.primaryRoute === 'openclaw-agent') {
      toolMode = 'agent-backends';
    } else if (routePlan.primaryRoute === 'copilot-agent') {
      toolMode = 'copilot-legacy';
    }
    const dispatchTarget = routePlan.primaryRoute === 'local-agent'
      ? 'local-agent-runtime'
      : String(routePlan.primaryRoute || '').startsWith('acp:')
        ? 'acp-harness-request'
        : routePlan.primaryRoute === 'openclaw-agent'
          ? 'openclaw-agent-runtime'
          : routePlan.primaryRoute === 'copilot-agent'
            ? 'copilot-legacy-runtime'
            : 'provider-runtime';
    const skillDispatch = skillIds.map((id) => ({
      id,
      activationPath: 'task.selectedSkills',
      dispatchTarget: 'conversation-context',
      providerIndependent: true,
    }));
    const mcpDispatch = mcpServers.map((server) => ({
      id: server.id,
      transport: server.transport,
      enabled: server.enabled !== false,
      activationPath: 'runtime.mcpSnapshot',
      dispatchTarget,
      providerIndependent: true,
    }));
    const nativeToolDispatch = mcpTools.map((tool) => ({
      family: tool.family,
      reason: tool.reason,
      activationPath: 'runtime.mcpSnapshot',
      dispatchTarget,
      providerIndependent: true,
    }));
    const dispatchTrace = [
      ...skillDispatch.map((entry) => `skill:${entry.id}->${entry.dispatchTarget}`),
      ...mcpDispatch.map((entry) => `mcp:${entry.id}->${entry.dispatchTarget}`),
      ...nativeToolDispatch.map((entry) => `mcp-tool:${entry.family}->${entry.dispatchTarget}`),
      ...summarizePlannedActions(plannedActions).map((entry) => `native-tool:${entry}->${dispatchTarget}`),
    ];
    return {
      toolMode,
      controlPlaneOwner: agentFacade.providerId,
      localCapable: Boolean(routePlan.localCapable),
      deterministicLocal: Boolean(routePlan.deterministicLocal),
      localOperations,
      plannedActions: summarizePlannedActions(plannedActions),
      selectedSkills: skillIds,
      skillDispatch,
      mcpServers,
      nativeMcpTools: nativeToolDispatch,
      intakeDefined: Boolean(taskContext?.intake),
      dispatchOwnedByRuntime: plannedActions.length > 0,
      backendHarness: routePlan.primaryRoute === 'openclaw-agent' ? 'openclaw' : '',
      backendProvider: String(routePlan.provider || taskContext?.provider || '').trim(),
      backendModel: String(routePlan.model || taskContext?.model || '').trim(),
      backendFallbacks: Array.isArray(routePlan.fallbackOrder) ? routePlan.fallbackOrder.slice() : [],
      dispatch: {
        owner: 'freejt7-agent-runtime',
        providerIndependent: true,
        dispatchTarget,
        activationPath: 'runtime.capabilityPlan',
        trace: dispatchTrace,
      },
    };
  }

  function finalizePlan(basePlan, goal, taskContext = {}) {
    return {
      ...basePlan,
      capabilityPlan: buildCapabilityPlan(goal, taskContext, basePlan),
    };
  }

  function planTaskExecution(goal, taskContext = {}) {
    const agentOptions = buildAgentOptions(goal, taskContext);
    const runtimeBackend = agentOptions.runtimeBackend;
    const provider = agentOptions.provider;
    const model = agentOptions.model;
    const localCapable = canResolveLocalGoal(goal);
    const deterministicLocal = shouldPreferLocalExecution(goal);

    if (runtimeBackend === 'local') {
      return finalizePlan({
        primaryRoute: 'local-agent',
        runtimeBackend: 'local',
        provider: provider || 'local',
        model: model || 'freejt7-local-tools',
        localCapable: true,
        deterministicLocal,
        fallbackOrder: [],
        reason: 'runtimeBackend=local',
      }, goal, taskContext);
    }

    if (runtimeBackend.startsWith('acp:')) {
      return finalizePlan({
        primaryRoute: runtimeBackend,
        runtimeBackend,
        provider,
        model,
        localCapable,
        deterministicLocal,
        fallbackOrder: localCapable ? ['local-agent'] : [],
        reason: 'runtimeBackend=acp',
      }, goal, taskContext);
    }

    if (provider && provider !== 'copilot') {
      if (deterministicLocal) {
        return finalizePlan({
          primaryRoute: 'local-agent',
          runtimeBackend: 'local',
          provider: 'local',
          model: 'freejt7-local-tools',
          localCapable: true,
          deterministicLocal: true,
          fallbackOrder: [],
          reason: 'goal-resoluble-localmente',
        }, goal, taskContext);
      }
      const fallbackOrder = [];
      if (typeof runProviderDirectFallbackTask === 'function') {
        fallbackOrder.push('provider-direct');
      }
      if (localCapable) {
        fallbackOrder.push('local-agent');
      }
      return finalizePlan({
        primaryRoute: 'openclaw-agent',
        runtimeBackend: 'openclaw',
        provider,
        model,
        localCapable,
        deterministicLocal: false,
        fallbackOrder,
        reason: 'provider-externo-agent',
      }, goal, taskContext);
    }

    return finalizePlan({
      primaryRoute: 'copilot-agent',
      runtimeBackend: 'copilot',
      provider: 'copilot',
      model: '',
      localCapable,
      deterministicLocal,
      fallbackOrder: localCapable ? ['local-agent'] : [],
      reason: 'compatibilidad-copilot-legado',
    }, goal, taskContext);
  }

  function withExecutionPlan(result, plan, extraRouteMeta = {}, taskContext = {}) {
    const baseRouteMeta = result?.raw?.routeMeta && typeof result.raw.routeMeta === 'object'
      ? result.raw.routeMeta
      : result?.routeMeta && typeof result.routeMeta === 'object'
        ? result.routeMeta
        : {};
    const backend = buildSubordinateBackendDescriptor({
      executionRoute: result?.executionRoute || result?.raw?.executionRoute || plan.primaryRoute,
      primaryRoute: plan.primaryRoute,
      runtimeBackend: extraRouteMeta.runtimeBackend || baseRouteMeta.runtimeBackend || plan.runtimeBackend,
      provider: result?.provider || plan.provider || taskContext.provider,
      model: result?.model || plan.model || taskContext.model,
      authProfile: taskContext.authProfile || baseRouteMeta.authProfile || 'default',
      fallbackSelected: extraRouteMeta.fallbackSelected || baseRouteMeta.fallbackSelected || baseRouteMeta.fallback || '',
    });
    const shouldMaskVisibleProvider = backend.kind === 'openclaw-harness' || backend.kind === 'provider-direct';
    const routeMeta = {
      ...cloneJson(baseRouteMeta),
      executionPlan: cloneJson(plan),
      controlPlaneOwner: agentFacade.providerId,
      backend,
      backendSubordinated: shouldMaskVisibleProvider || Boolean(isExternalProvider(backend.provider)),
      visibleProvider: shouldMaskVisibleProvider ? agentFacade.providerId : String(result?.provider || '').trim(),
      visibleModel: shouldMaskVisibleProvider ? agentFacade.modelId : String(result?.model || '').trim(),
      ...cloneJson(extraRouteMeta),
    };
    const visibleProvider = shouldMaskVisibleProvider
      ? agentFacade.providerId
      : String(result?.provider || '').trim();
    const visibleModel = shouldMaskVisibleProvider
      ? agentFacade.modelId
      : String(result?.model || '').trim();
    return {
      ...result,
      provider: visibleProvider || result?.provider,
      model: visibleModel || result?.model,
      routeMeta,
      raw: {
        ...(result?.raw || {}),
        routeMeta,
      },
      run: result?.run ? {
        ...result.run,
        provider: visibleProvider || result.run.provider,
        model: visibleModel || result.run.model,
      } : result?.run,
    };
  }

  async function executeAgentTask(goal, taskContext = {}) {
    if (typeof runLocalAgentTask !== 'function' || typeof runOpenClawAgentTask !== 'function') {
      throw new Error('Free JT7 Agent Runtime no esta configurado correctamente.');
    }

    const agentOptions = buildAgentOptions(goal, taskContext);
    const plan = planTaskExecution(goal, taskContext);
    const provider = agentOptions.provider;
    const model = agentOptions.model;
    const runtimePlannedActions = buildLocalDispatchPlan(goal, taskContext, plan);

    if (plan.primaryRoute === 'local-agent') {
      const localResult = await runLocalAgentTask(context, output, {
        ...agentOptions,
        provider: plan.provider || provider || 'local',
        model: plan.model || model || 'freejt7-local-tools',
        runtimeBackend: plan.runtimeBackend,
        fallbackReason: plan.reason,
        actions: runtimePlannedActions,
        capabilityPlan: plan.capabilityPlan,
      });
      return withExecutionPlan(localResult, plan, {}, taskContext);
    }

    if (plan.primaryRoute.startsWith('acp:')) {
      if (typeof runAcpTask !== 'function') {
        throw new Error('Free JT7 Agent Runtime no tiene backend ACP configurado.');
      }
      const acpResult = await runAcpTask(context, output, {
        ...agentOptions,
        runtimeBackend: plan.primaryRoute,
        actions: runtimePlannedActions,
        capabilityPlan: plan.capabilityPlan,
      });
      return withExecutionPlan(acpResult, plan, {}, taskContext);
    }

    if (plan.primaryRoute === 'openclaw-agent') {
      try {
        const openclawResult = await runOpenClawAgentTask(context, output, agentOptions);
        return withExecutionPlan(openclawResult, plan, {}, taskContext);
      } catch (error) {
        if (plan.fallbackOrder.includes('provider-direct') && shouldUseProviderDirectFallback(error) && typeof runProviderDirectFallbackTask === 'function') {
          try {
            const directResult = await runProviderDirectFallbackTask(context, output, {
              ...agentOptions,
              fallbackReason: String(error?.message || error),
              conversationRequest: taskContext?.conversationRequest || null,
            });
            return withExecutionPlan(directResult, plan, {
              fallbackSelected: 'provider-direct',
              fallbackReason: String(error?.message || error),
            }, taskContext);
          } catch (directError) {
            output.appendLine(`[freejt7-agent-runtime] fallback directo falló: ${String(directError?.message || directError)}`);
            if (plan.fallbackOrder.includes('local-agent') && shouldUseLocalAgentFallback(goal, error, { forceForDeterministicGoal: true })) {
              const localResult = await runLocalAgentTask(context, output, {
                ...agentOptions,
                fallbackReason: String(directError?.message || directError),
                actions: runtimePlannedActions,
                capabilityPlan: plan.capabilityPlan,
              });
              return withExecutionPlan(localResult, plan, {
                fallbackSelected: 'local-agent',
                fallbackReason: String(directError?.message || directError),
              }, taskContext);
            }
          }
        }
        if (!plan.fallbackOrder.includes('local-agent') || !shouldUseLocalAgentFallback(goal, error)) {
          throw error;
        }
        output.appendLine(`[freejt7-agent-runtime] fallback local por OpenClaw no disponible: ${String(error?.message || error)}`);
        const localResult = await runLocalAgentTask(context, output, {
          ...agentOptions,
          fallbackReason: String(error?.message || error),
          actions: runtimePlannedActions,
          capabilityPlan: plan.capabilityPlan,
        });
        return withExecutionPlan(localResult, plan, {
          fallbackSelected: 'local-agent',
          fallbackReason: String(error?.message || error),
        }, taskContext);
      }
    }

    if (typeof runCopilotTask !== 'function') {
      throw new Error('Free JT7 Agent Runtime no tiene ruta Copilot configurada.');
    }
    try {
      const copilotResult = await runCopilotTask(goal, taskContext);
      return withExecutionPlan(copilotResult, plan, {}, taskContext);
    } catch (error) {
      if (!plan.fallbackOrder.includes('local-agent') || !shouldUseLocalAgentFallback(goal, error)) {
        throw error;
      }
      output.appendLine(`[freejt7-agent-runtime] fallback local por Copilot no disponible: ${String(error?.message || error)}`);
      const localResult = await runLocalAgentTask(context, output, {
        goal,
        workspacePath: agentOptions.workspacePath,
        provider: 'local',
        model: 'freejt7-local-tools',
        fallbackReason: String(error?.message || error),
        actions: runtimePlannedActions,
        capabilityPlan: plan.capabilityPlan,
      });
      return withExecutionPlan(localResult, plan, {
        fallbackSelected: 'local-agent',
        fallbackReason: String(error?.message || error),
      }, taskContext);
    }
  }

  async function executeTask(task = {}, runtime = {}) {
    const envelope = buildConversationEnvelope(task, runtime);
    return executeAgentTask(envelope.serializedGoal, {
      ...task,
      ...runtime,
      workspacePath: runtime.workspacePath || getWorkspacePath(),
      conversationRequest: envelope.conversationRequest,
    });
  }

  function getHealthStatus() {
    return {
      ok: true,
      runtimeKind: 'freejt7-agent-runtime',
      ownsFlow: true,
      continuityOwnedByRuntime: true,
      routePlanningOwnedByRuntime: true,
      capabilityPlanningOwnedByRuntime: true,
      backendSubordinationOwnedByRuntime: true,
      skillsOwnedByRuntime: true,
      mcpOwnedByRuntime: true,
      nativeToolsOwnedByRuntime: true,
      supports: {
        openclaw: typeof runOpenClawAgentTask === 'function',
        local: typeof runLocalAgentTask === 'function',
        providerDirect: typeof runProviderDirectFallbackTask === 'function',
        acp: typeof runAcpTask === 'function',
        copilot: typeof runCopilotTask === 'function',
      },
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    executeAgentTask,
    executeTask,
    planTaskExecution,
    getHealthStatus,
  };
}

module.exports = {
  createFreeJt7AgentRuntime,
};
