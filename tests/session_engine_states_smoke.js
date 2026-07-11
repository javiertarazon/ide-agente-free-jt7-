// Smoke test: estados reales de SessionEngine
// Ejecutar: node tests/session_engine_states_smoke.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { SessionEngine } = require('../src-js/core/session-engine');

function waitFor(check, timeoutMs = 5000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (check()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('timeout'));
        return;
      }
      setTimeout(tick, 40);
    };
    tick();
  });
}

function createEngine(rootDir, overrides = {}) {
  const policyEngine = overrides.policyEngine || {
    evaluate(task) {
      return {
        risk: /aprobacion/i.test(String(task.goal || '')) ? 'high' : 'low',
        requiresApproval: /aprobacion/i.test(String(task.goal || '')),
      };
    },
  };
  const providerRouter = overrides.providerRouter || {
    async execute(task) {
      return {
        provider: task.provider || 'openrouter',
        model: task.model || 'demo',
        executionMode: task.executionMode || 'agent',
        summary: `ok:${task.goal}`,
        raw: {
          executionRoute: 'agent-router',
          final: {
            summary: `ok:${task.goal}`,
            verification: ['states smoke'],
          },
        },
      };
    },
  };
  return new SessionEngine({
    rootDir,
    statePath: path.join(rootDir, 'copilot-agent', 'panel-state.json'),
    workerCount: 1,
    policyEngine,
    providerRouter,
  });
}

async function runStateFlowScenario(rootDir) {
  const engine = createEngine(rootDir);
  engine.start();

  const session = engine.createSession({ title: 'states smoke' });
  assert.equal(engine.getSessionStatus(session.sessionId).status, 'active', 'sesion nueva debe iniciar activa');

  const approvalTask = engine.enqueueTask(session.sessionId, {
    goal: 'requiere aprobacion explicita',
    provider: 'openrouter',
    model: 'demo',
  });
  await waitFor(() => engine._taskIndex[approvalTask.taskId]?.status === 'waiting_approval');

  const waiting = engine.getSessionStatus(session.sessionId);
  assert.equal(waiting.status, 'waiting_approval', 'sesion debe quedar waiting_approval');
  assert.equal(waiting.counters.waiting_approval, 1, 'contador waiting_approval debe reflejar la tarea');

  engine.resolveApproval(session.sessionId, approvalTask.taskId, true, 'seguir');
  await waitFor(() => engine._taskIndex[approvalTask.taskId]?.status === 'completed');

  const completed = engine.getSessionStatus(session.sessionId);
  assert.equal(completed.status, 'completed', 'sesion debe volver a completed tras resolver la aprobacion');
  assert.equal(completed.counters.completed, 1, 'contador completed debe reflejar la tarea ejecutada');

  const yielded = engine.yieldSession(session.sessionId, 'handoff manual');
  assert.equal(yielded.status, 'yielded', 'yieldSession debe marcar la sesion como yielded');
  assert.equal(engine.getSessionHistory(session.sessionId).yield.reason, 'handoff manual', 'history debe exponer el motivo del yield');

  const resumed = engine.resumeSession(session.sessionId);
  assert.equal(resumed.status, 'completed', 'resumeSession debe restaurar el estado efectivo previo de la sesion');
  assert.equal(engine.getSessionHistory(session.sessionId).yield, null, 'history debe limpiar yield tras resume');

  engine.stop();
}

function runRestartRecoveryStateScenario(rootDir) {
  const statePath = path.join(rootDir, 'copilot-agent', 'panel-state.json');
  const sessionId = 'session-restart-state';
  const taskId = 'task-running-state';
  fs.writeFileSync(statePath, JSON.stringify({
    savedAt: new Date().toISOString(),
    sessions: {
      [sessionId]: {
        sessionId,
        title: 'Sesion restart state',
        tasks: [taskId],
        chatHistory: [
          {
            role: 'user',
            text: 'continua luego del reinicio',
            taskId,
            at: new Date().toISOString(),
          },
        ],
      },
    },
    queue: [taskId],
    taskIndex: {
      [taskId]: {
        taskId,
        sessionId,
        goal: 'continua luego del reinicio',
        status: 'running',
        provider: 'clod',
        model: 'OpenAI/gpt-oss-20B',
        executionMode: 'agent',
        routePlan: {
          primaryRoute: 'local-agent',
          capabilityPlan: { toolMode: 'local-tools' },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
    workerCount: 1,
  }, null, 2));

  const engine = createEngine(rootDir);
  const status = engine.getSessionStatus(sessionId);
  const history = engine.getSessionHistory(sessionId);

  assert.equal(status.status, 'attention', 'reinicio con tarea running debe dejar la sesion en attention');
  assert.equal(status.counters.failed, 1, 'la tarea recuperada debe contarse como failed');
  assert.equal(history.agentState.lastTaskId, taskId, 'agentState debe apuntar a la tarea recuperada');
  assert.ok(/reinicio del runtime/i.test(history.agentState.lastAssistantSummary), 'agentState debe reflejar la interrupcion por reinicio');
  assert.equal(history.agentState.lastRoutePlan.primaryRoute, 'local-agent', 'agentState debe conservar la routePlan recuperada');
}

async function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-session-states-'));
  fs.mkdirSync(path.join(rootDir, 'copilot-agent'), { recursive: true });

  await runStateFlowScenario(rootDir);
  runRestartRecoveryStateScenario(rootDir);

  console.log('session_engine_states_smoke: ok');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
