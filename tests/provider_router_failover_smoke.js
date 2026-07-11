'use strict';

const assert = require('assert');

const adapterPath = require.resolve('../src-js/providers/api-provider-adapter.js');
const routerPath = require.resolve('../src-js/core/provider-router.js');

const originalAdapter = require.cache[adapterPath];
const originalRouter = require.cache[routerPath];

let directCalls = [];

require.cache[adapterPath] = {
  id: adapterPath,
  filename: adapterPath,
  loaded: true,
  exports: {
    callProvider: async (_request, config) => {
      directCalls.push(config);
      if (config.provider === 'openrouter') {
        const error = new Error('HTTP 429 rate limit');
        error.isRateLimitError = true;
        error.isRetryable = true;
        throw error;
      }
      return {
        run: { summary: `direct ok ${config.provider}` },
        final: { summary: `direct ok ${config.provider}` },
      };
    },
  },
};

delete require.cache[routerPath];
const { ProviderRouter } = require('../src-js/core/provider-router.js');

async function main() {
  const agentCalls = [];
  const router = new ProviderRouter({
    agentRuntime: {
      planTaskExecution(goal, taskContext) {
        return {
          primaryRoute: 'openclaw-agent',
          runtimeBackend: 'openclaw',
          provider: taskContext.provider,
          model: taskContext.model,
          localCapable: /carpeta/i.test(String(goal || '')),
          deterministicLocal: false,
          fallbackOrder: ['provider-direct'],
          reason: 'provider-externo-agent',
          capabilityPlan: {
            toolMode: 'agent-backends',
            localCapable: false,
            deterministicLocal: false,
            localOperations: [],
            selectedSkills: [],
            mcpServers: [{ id: 'free-jt7-local', transport: 'stdio', enabled: true }],
            intakeDefined: false,
          },
        };
      },
      async executeTask(taskContext) {
        agentCalls.push({ provider: taskContext.provider, model: taskContext.model });
        if (taskContext.provider === 'openrouter') {
          const error = new Error('429 provider primary');
          error.isRateLimitError = true;
          error.isRetryable = true;
          throw error;
        }
        return {
          provider: taskContext.provider,
          model: taskContext.model,
          executionRoute: 'openclaw-agent',
          raw: {
            routeMeta: {
              executionPlan: {
                primaryRoute: 'openclaw-agent',
                runtimeBackend: 'openclaw',
                provider: taskContext.provider,
                model: taskContext.model,
                capabilityPlan: {
                  toolMode: 'agent-backends',
                  localCapable: false,
                  deterministicLocal: false,
                  localOperations: [],
                  selectedSkills: [],
                  mcpServers: [{ id: 'free-jt7-local', transport: 'stdio', enabled: true }],
                  intakeDefined: false,
                },
              },
            },
          },
          run: { summary: `agent ok ${taskContext.provider}` },
          final: { summary: `agent ok ${taskContext.provider}` },
        };
      },
    },
    executeAgentTask: async (_goal, taskContext) => {
      agentCalls.push({ provider: taskContext.provider, model: taskContext.model });
      if (taskContext.provider === 'openrouter') {
        const error = new Error('429 provider primary');
        error.isRateLimitError = true;
        error.isRetryable = true;
        throw error;
      }
      return {
        provider: taskContext.provider,
        model: taskContext.model,
        executionRoute: 'openclaw-agent',
        run: { summary: `agent ok ${taskContext.provider}` },
        final: { summary: `agent ok ${taskContext.provider}` },
      };
    },
  });

  const agentResult = await router.execute({
    goal: 'ejecuta la tarea',
    executionMode: 'agent',
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
    fallbackProviders: [
      { provider: 'hf', model: 'Qwen/Qwen2.5-7B-Instruct-Turbo' },
    ],
  }, {
    workspacePath: process.cwd(),
  });

  assert.equal(agentCalls.length, 2, 'debe intentar provider primario y fallback en modo agent');
  assert.equal(agentResult.provider, 'freejt7-agent', 'el modo agent debe exponer a Free JT7 como provider visible');
  assert.equal(agentResult.model, 'freejt7-runtime', 'el modo agent debe conservar el modelo visible del runtime propio');
  assert.equal(agentResult.raw.routeMeta.fallbackUsed, true, 'debe marcar fallbackUsed=true');
  assert.equal(Array.isArray(agentResult.raw.routeMeta.attempts), true, 'debe registrar attempts');
  assert.equal(agentResult.raw.routeMeta.attempts.length >= 2, true, 'debe registrar al menos 2 intentos');
  assert.equal(agentResult.raw.routeMeta.controlPlaneOwner, 'freejt7-agent');
  assert.equal(agentResult.raw.routeMeta.backend.kind, 'openclaw-harness');
  assert.equal(agentResult.raw.routeMeta.backend.provider, 'hf');
  assert.equal(agentResult.raw.routeMeta.executionPlan.primaryRoute, 'openclaw-agent', 'debe preservar el plan de ejecucion del runtime del agente');
  assert.equal(agentResult.raw.routeMeta.executionPlan.capabilityPlan.toolMode, 'agent-backends');
  assert.equal(agentResult.raw.routeMeta.attempts[1].backendProvider, 'hf');

  const directResult = await router.execute({
    goal: 'responde ok',
    executionMode: 'direct',
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
    fallbackProviders: [
      { provider: 'zai', model: 'glm-4.5-flash' },
    ],
  }, {
    workspacePath: process.cwd(),
  });

  assert.equal(directCalls.length >= 1, true, 'modo direct debe intentar provider viable (respetando cooldown)');
  assert.equal(directResult.provider, 'zai', 'fallback direct debe terminar en provider secundario');
  assert.equal(directResult.raw.routeMeta.fallbackUsed, true, 'fallback direct debe quedar trazado');

  console.log('provider_router_failover_smoke: OK');
}

main()
  .catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    if (originalAdapter) {
      require.cache[adapterPath] = originalAdapter;
    } else {
      delete require.cache[adapterPath];
    }
    if (originalRouter) {
      require.cache[routerPath] = originalRouter;
    } else {
      delete require.cache[routerPath];
    }
  });
