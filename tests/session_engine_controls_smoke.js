'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { SessionEngine } = require('../src-js/core/session-engine');

function createEngine(rootDir) {
  return new SessionEngine({
    rootDir,
    workerCount: 1,
    policyEngine: {
      evaluate() {
        return { risk: 'low', requiresApproval: false };
      },
    },
    providerRouter: {
      async execute(task) {
        return {
          provider: task.provider || 'openrouter',
          model: task.model || 'demo',
          executionMode: task.executionMode || 'agent',
          summary: 'ok',
          raw: {
            run: { summary: 'ok' },
            final: { summary: 'ok' },
          },
        };
      },
    },
  });
}

function createAgentState(taskId, goal, summary) {
  return {
    lastTaskId: taskId,
    lastUserGoal: goal,
    lastAssistantSummary: summary,
    lastRoutePlan: { primaryRoute: 'openclaw-agent' },
    continuationHint: `Objetivo: ${goal} | Ultimo resultado: ${summary}`,
    updatedAt: new Date().toISOString(),
  };
}

async function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-session-controls-'));
  const engine = createEngine(rootDir);
  const session = engine.createSession({ title: 'controls smoke' });

  const yielded = engine.yieldSession(session.sessionId, 'pausa manual');
  assert.ok(yielded, 'yield debe devolver la sesion');
  assert.equal(yielded.status, 'yielded', 'yield debe marcar la sesion como yielded');
  assert.equal(yielded.yield.reason, 'pausa manual');

  const resumedSession = engine.resumeSession(session.sessionId);
  assert.ok(resumedSession, 'resume debe devolver la sesion');
  assert.equal(resumedSession.status, 'active', 'resume debe reactivar la sesion');
  assert.equal(resumedSession.yield, null, 'resume debe limpiar el estado yield');

  const approvalTask = engine.enqueueTask(session.sessionId, {
    goal: 'requiere aprobacion',
    provider: 'openrouter',
    model: 'demo',
  });
  approvalTask.status = 'waiting_approval';

  const approvedTask = engine.resolveApproval(session.sessionId, approvalTask.taskId, true, 'seguir');
  assert.ok(approvedTask, 'approve debe devolver la tarea');
  assert.equal(approvedTask.status, 'queued', 'approve debe reencolar la tarea');
  assert.equal(approvedTask.approval.approved, true);
  assert.equal(approvedTask.chatHistorySnapshot.length, 1, 'approve debe refrescar snapshot conversacional al reencolar');

  const rejectedTask = engine.enqueueTask(session.sessionId, {
    goal: 'rechaza la tarea',
    provider: 'openrouter',
    model: 'demo',
  });
  rejectedTask.status = 'waiting_approval';
  const rejected = engine.resolveApproval(session.sessionId, rejectedTask.taskId, false, 'no');
  assert.ok(rejected, 'reject debe devolver la tarea');
  assert.equal(rejected.status, 'rejected', 'reject debe marcar la tarea como rechazada');
  assert.equal(rejected.approval.approved, false);
  assert.equal(engine.getState().sessions[session.sessionId].agentState.lastTaskId, rejected.taskId, 'reject debe actualizar agentState');

  const queuedTask = engine.enqueueTask(session.sessionId, {
    goal: 'cancelar tarea',
    provider: 'openrouter',
    model: 'demo',
  });
  const canceled = engine.cancelTask(session.sessionId, queuedTask.taskId);
  assert.ok(canceled, 'cancel debe devolver la tarea');
  assert.equal(canceled.status, 'canceled', 'cancel debe marcar la tarea como cancelada');

  const failedTask = engine.enqueueTask(session.sessionId, {
    goal: 'reintentar tarea',
    provider: 'openrouter',
    model: 'demo',
  });
  engine.getState().sessions[session.sessionId].agentState = createAgentState('prev-task', 'objetivo previo', 'resumen previo');
  failedTask.status = 'failed';
  failedTask.error = 'fallo previo';
  const retried = engine.retryTask(session.sessionId, failedTask.taskId);
  assert.ok(retried, 'retry debe devolver la tarea');
  assert.equal(retried.status, 'queued', 'retry debe reencolar la tarea');
  assert.equal(retried.error, null, 'retry debe limpiar el error');
  assert.equal(retried.sessionAgentState.lastTaskId, 'prev-task', 'retry debe refrescar sessionAgentState desde la sesion');

  console.log('session_engine_controls_smoke: ok');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
