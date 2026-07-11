'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { SessionEngine } = require('../src-js/core/session-engine.js');

function waitFor(check, timeoutMs = 5000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (check()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('timeout'));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

async function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-session-tools-'));
  const statePath = path.join(rootDir, 'copilot-agent', 'panel-state.json');
  const engine = new SessionEngine({
    rootDir,
    statePath,
    workerCount: 1,
    policyEngine: { evaluate: () => ({ risk: 'low', requiresApproval: false, deniedTools: [], askTools: [], profile: 'coding' }) },
    providerRouter: {
      execute: async (task) => ({
        provider: task.provider || 'openrouter',
        model: task.model || 'demo',
        summary: `ok ${task.goal}`,
        executionMode: task.executionMode || 'agent',
        raw: {
          executionRoute: task.runtimeBackend === 'local' ? 'local-agent' : 'openclaw-agent',
          routeMeta: {
            executionPlan: {
              primaryRoute: task.runtimeBackend === 'local' ? 'local-agent' : 'openclaw-agent',
              runtimeBackend: task.runtimeBackend,
              provider: task.provider || 'openrouter',
              model: task.model || 'demo',
              capabilityPlan: {
                toolMode: task.runtimeBackend === 'local' ? 'local-tools' : 'openclaw-harness',
                selectedSkills: ['subagent-memory'],
                mcpServers: [{ id: 'free-jt7-local', transport: 'stdio', enabled: true }],
                plannedActions: task.runtimeBackend === 'local' ? ['read:README.md'] : [],
                dispatch: {
                  owner: 'freejt7-agent-runtime',
                  dispatchTarget: task.runtimeBackend === 'local' ? 'local-agent-runtime' : 'openclaw-agent-runtime',
                  trace: [
                    `mcp:free-jt7-local->${task.runtimeBackend === 'local' ? 'local-agent-runtime' : 'openclaw-agent-runtime'}`,
                  ],
                },
              },
            },
          },
          final: {
            summary: `ok ${task.goal}`,
            verification: ['smoke'],
          },
        },
      }),
    },
  });

  engine.start();
  const session = engine.createSession({ title: 'session tools smoke' });
  const spawned = engine.spawnSubagent(session.sessionId, {
    goal: 'revisa la tarea',
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
    runtimeBackend: 'local',
    authProfile: 'default',
  });
  assert.ok(spawned && spawned.task, 'spawnSubagent debe devolver task');

  await waitFor(() => engine._taskIndex[spawned.task.taskId]?.status === 'completed');
  const completedTask = engine._taskIndex[spawned.task.taskId];
  assert.equal(completedTask.routeMeta.executionPlan.capabilityPlan.dispatch.owner, 'freejt7-agent-runtime');
  assert.equal(completedTask.routeMeta.executionPlan.capabilityPlan.dispatch.dispatchTarget, 'local-agent-runtime');
  assert.ok(completedTask.routeMeta.executionPlan.capabilityPlan.dispatch.trace.includes('mcp:free-jt7-local->local-agent-runtime'));

  const status = engine.getSessionStatus(session.sessionId);
  assert.equal(status.sessionId, session.sessionId, 'session_status debe responder sessionId');
  assert.equal(typeof status.counters.completed, 'number', 'session_status debe incluir counters');

  const history = engine.getSessionHistory(session.sessionId, { limit: 10 });
  assert.ok(Array.isArray(history.history), 'session_history debe incluir historial chat');
  assert.ok(Array.isArray(history.tasks), 'session_history debe incluir tareas');

  const subagents = engine.listSubagents(session.sessionId);
  assert.equal(subagents.length, 1, 'debe existir un subagente');
  assert.equal(subagents[0].runtimeBackend, 'local', 'debe persistir runtimeBackend del subagente');

  engine.yieldSession(session.sessionId, 'pausa manual');
  assert.equal(engine.getSessionStatus(session.sessionId).status, 'yielded', 'yield debe mover la sesion a yielded');
  engine.resumeSession(session.sessionId);
  assert.notEqual(engine.getSessionStatus(session.sessionId).status, 'yielded', 'resume debe sacar la sesion de yielded');

  engine.stop();
  console.log('session_engine_subagent_tools_smoke: OK');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
