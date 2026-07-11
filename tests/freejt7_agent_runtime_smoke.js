'use strict';

const assert = require('assert');

const { createFreeJt7AgentRuntime } = require('../src-js/core/freejt7-agent-runtime');

async function main() {
  const calls = [];
  const runtime = createFreeJt7AgentRuntime({
    context: { secrets: {} },
    output: { appendLine(message) { calls.push({ type: 'log', message }); } },
    getWorkspacePath: () => '/tmp/workspace',
    getProviderConfig: () => ({ provider: 'openrouter', model: 'qwen/qwen3-coder:free' }),
    runLocalAgentTask: async (_context, _output, options) => {
      calls.push({ type: 'local', goal: options.goal, reason: options.fallbackReason, actions: options.actions });
      return {
        provider: 'local',
        model: 'freejt7-local-tools',
        executionRoute: 'local-agent-tools',
        run: { summary: 'local ok' },
        final: { summary: 'local ok' },
      };
    },
    runOpenClawAgentTask: async (_context, _output, options) => {
      calls.push({ type: 'openclaw', goal: options.goal, provider: options.provider });
      const error = new Error('network connection error');
      error.isRetryable = true;
      throw error;
    },
    runProviderDirectFallbackTask: async (_context, _output, options) => {
      calls.push({ type: 'direct', goal: options.goal, provider: options.provider });
      return {
        provider: options.provider,
        model: options.model,
        executionRoute: 'provider-direct-fallback',
        run: { summary: 'direct ok' },
        final: { summary: 'direct ok' },
      };
    },
    runAcpTask: async () => ({ run: { summary: 'acp ok' }, final: { summary: 'acp ok' } }),
    runCopilotTask: async (goal) => {
      calls.push({ type: 'copilot', goal });
      return {
        provider: 'copilot',
        model: '',
        executionRoute: 'copilot',
        run: { summary: 'copilot ok' },
        final: { summary: 'copilot ok' },
      };
    },
    buildLocalActions: (goal) => /crear carpeta/i.test(String(goal || ''))
      ? [{ type: 'mkdir', path: '/tmp/demo', allowAbsolute: true }]
      : [],
    getMcpServers: () => [{ id: 'free-jt7-local', transport: 'stdio', enabled: true }],
    canResolveLocalGoal: (goal) => /crear carpeta|instala git/i.test(String(goal || '')),
    shouldPreferLocalExecution: (goal) => /crear carpeta/i.test(String(goal || '')),
    shouldUseProviderDirectFallback: (error) => /network connection error/i.test(String(error?.message || error)),
    shouldUseLocalAgentFallback: (goal) => /instala git/i.test(String(goal || '')),
  });

  const localPlan = runtime.planTaskExecution('crear carpeta en /tmp/demo', {
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
  });
  assert.equal(localPlan.primaryRoute, 'local-agent');
  assert.equal(localPlan.reason, 'goal-resoluble-localmente');
  assert.equal(localPlan.capabilityPlan.toolMode, 'local-tools');
  assert.equal(localPlan.capabilityPlan.mcpServers[0].id, 'free-jt7-local');
  assert.equal(localPlan.capabilityPlan.localOperations.includes('filesystem.mkdir'), true);
  assert.deepStrictEqual(localPlan.capabilityPlan.plannedActions, ['mkdir:/tmp/demo']);
  assert.equal(localPlan.capabilityPlan.dispatchOwnedByRuntime, true);
  assert.equal(localPlan.capabilityPlan.dispatch.owner, 'freejt7-agent-runtime');
  assert.equal(localPlan.capabilityPlan.dispatch.providerIndependent, true);
  assert.equal(localPlan.capabilityPlan.dispatch.dispatchTarget, 'local-agent-runtime');
  assert.ok(localPlan.capabilityPlan.dispatch.trace.includes('mcp:free-jt7-local->local-agent-runtime'));
  assert.ok(localPlan.capabilityPlan.dispatch.trace.includes('native-tool:mkdir:/tmp/demo->local-agent-runtime'));

  const mcpPlan = runtime.planTaskExecution('abre sample.pdf, busca free jt7 agent en la web y revela el archivo en el escritorio', {
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
    selectedSkills: [{ id: 'document-triage' }, { id: 'web-investigation' }],
  });
  assert.equal(mcpPlan.primaryRoute, 'openclaw-agent');
  assert.deepStrictEqual(
    mcpPlan.capabilityPlan.nativeMcpTools.map((item) => item.family).sort(),
    ['browser', 'desktop', 'documents'],
  );
  assert.deepStrictEqual(
    mcpPlan.capabilityPlan.skillDispatch.map((item) => item.id),
    ['document-triage', 'web-investigation'],
  );
  assert.equal(mcpPlan.capabilityPlan.dispatch.dispatchTarget, 'openclaw-agent-runtime');
  assert.ok(mcpPlan.capabilityPlan.dispatch.trace.includes('mcp-tool:documents->openclaw-agent-runtime'));
  assert.ok(mcpPlan.capabilityPlan.dispatch.trace.includes('skill:document-triage->conversation-context'));

  const localResult = await runtime.executeAgentTask('crear carpeta en /tmp/demo', {
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
  });
  assert.equal(localResult.final.summary, 'local ok');
  assert.equal(localResult.raw.routeMeta.executionPlan.primaryRoute, 'local-agent');
  assert.equal(calls.some((item) => item.type === 'local'), true, 'debe priorizar runtime local para objetivos deterministas');
  assert.equal(calls.some((item) => item.type === 'openclaw'), false, 'no debe pasar por OpenClaw cuando el objetivo es local-first');
  assert.equal(calls.some((item) => item.type === 'direct'), false, 'no debe ir a provider directo cuando el objetivo es local-first');
  assert.deepStrictEqual(calls.find((item) => item.type === 'local').actions, [{ type: 'mkdir', path: '/tmp/demo', allowAbsolute: true }], 'debe despachar acciones locales preparadas por el runtime');

  calls.length = 0;
  const directResult = await runtime.executeAgentTask('explica el error de mi API', {
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
  });
  assert.equal(directResult.final.summary, 'direct ok');
  assert.equal(directResult.provider, 'freejt7-agent');
  assert.equal(directResult.model, 'freejt7-runtime');
  assert.equal(calls.some((item) => item.type === 'openclaw'), true, 'debe intentar OpenClaw primero');
  assert.equal(calls.some((item) => item.type === 'direct'), true, 'debe usar provider directo como fallback operativo');
  assert.equal(directResult.raw.routeMeta.executionPlan.capabilityPlan.toolMode, 'agent-backends');
  assert.equal(directResult.raw.routeMeta.controlPlaneOwner, 'freejt7-agent');
  assert.equal(directResult.raw.routeMeta.backend.kind, 'provider-direct');
  assert.equal(directResult.raw.routeMeta.backend.provider, 'openrouter');
  assert.equal(directResult.raw.routeMeta.executionPlan.capabilityPlan.dispatch.owner, 'freejt7-agent-runtime');
  assert.equal(directResult.raw.routeMeta.executionPlan.capabilityPlan.dispatch.dispatchTarget, 'openclaw-agent-runtime');

  calls.length = 0;
  const continuityResult = await runtime.executeTask({
    goal: 'continua',
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
    sessionTitle: 'Sesion demo',
    selectedSkills: [{ id: 'memory-forensics' }, { id: 'prompt-engineering-patterns' }],
    chatHistorySnapshot: [
      { role: 'user', text: 'crea el plan base' },
      { role: 'assistant', text: 'Plan base listo con checkpoint-1' },
    ],
  }, {
    workspacePath: '/tmp/workspace',
    sessionAgentState: {
      lastTaskId: 'task-previa',
      lastUserGoal: 'crea el plan base',
      lastAssistantSummary: 'Plan base listo con checkpoint-1',
      continuationHint: 'Objetivo: crea el plan base | Ultimo resultado: Plan base listo con checkpoint-1',
    },
  });
  const openclawCall = calls.find((item) => item.type === 'openclaw');
  assert.ok(openclawCall, 'executeTask debe seguir usando el runtime propio para agent routes');
  assert.match(openclawCall.goal, /Historial conversacional previo:/, 'debe serializar continuidad conversacional dentro del runtime del agente');
  assert.match(openclawCall.goal, /checkpoint-1/, 'debe incluir el contexto previo del assistant');
  assert.match(openclawCall.goal, /Contexto de continuidad recuperado por Free JT7:/, 'debe enriquecer prompts breves de continuidad con agent state persistido');
  assert.deepStrictEqual(
    continuityResult.raw.routeMeta.executionPlan.capabilityPlan.selectedSkills,
    ['memory-forensics', 'prompt-engineering-patterns'],
  );
  assert.ok(
    continuityResult.raw.routeMeta.executionPlan.capabilityPlan.dispatch.trace.includes('skill:memory-forensics->conversation-context'),
    'debe trazar el activation path de skills desde el runtime propio',
  );
  assert.ok(
    continuityResult.raw.routeMeta.executionPlan.capabilityPlan.dispatch.trace.includes('mcp:free-jt7-local->openclaw-agent-runtime'),
    'debe trazar el snapshot MCP sin depender del provider',
  );

  const health = runtime.getHealthStatus();
  assert.equal(health.ok, true);
  assert.equal(health.ownsFlow, true);
  assert.equal(health.continuityOwnedByRuntime, true);
  assert.equal(health.routePlanningOwnedByRuntime, true);
  assert.equal(health.capabilityPlanningOwnedByRuntime, true);
  assert.equal(health.backendSubordinationOwnedByRuntime, true);
  assert.equal(health.skillsOwnedByRuntime, true);
  assert.equal(health.mcpOwnedByRuntime, true);
  assert.equal(health.nativeToolsOwnedByRuntime, true);

  console.log('freejt7_agent_runtime_smoke: OK');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
