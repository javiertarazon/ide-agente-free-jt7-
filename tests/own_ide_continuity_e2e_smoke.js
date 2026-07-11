'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { SessionEngine } = require('../src-js/core/session-engine');

function waitForTaskStatus(engine, taskId, expectedStatus, timeoutMs = 7000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const task = engine._taskIndex[taskId];
      if (task && task.status === expectedStatus) {
        resolve(task);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`timeout esperando ${expectedStatus} para ${taskId}`));
        return;
      }
      setTimeout(tick, 40);
    };
    tick();
  });
}

function getEffectiveRouteForUi(task, providerState = {}) {
  const attempts = Array.isArray(task?.routeMeta?.attempts)
    ? task.routeMeta.attempts
    : [];
  const okAttempt = attempts.slice().reverse().find((attempt) => attempt && attempt.ok);
  if (okAttempt) {
    return {
      provider: okAttempt.provider || task.provider || providerState.provider || 'auto',
      model: okAttempt.model || task.model || providerState.model || 'default',
      backend: okAttempt.runtimeBackend || task.runtimeBackend || providerState.runtimeBackend || 'auto',
      fallbackUsed: Boolean(task.routeMeta?.fallbackUsed),
    };
  }
  return {
    provider: task?.provider || providerState.provider || 'auto',
    model: task?.model || providerState.model || 'default',
    backend: task?.runtimeBackend || providerState.runtimeBackend || 'auto',
    fallbackUsed: false,
  };
}

function createMockResult(task, options = {}) {
  const provider = String(options.provider || task.provider || 'openrouter');
  const model = String(options.model || task.model || 'demo');
  const backend = String(options.backend || task.runtimeBackend || 'auto');
  const summary = String(options.summary || 'ok');
  const verification = Array.isArray(options.verification)
    ? options.verification
    : ['smoke verification'];
  const changedFiles = Array.isArray(options.changedFiles)
    ? options.changedFiles
    : ['tests/own_ide_continuity_e2e_smoke.js'];
  const fallbackUsed = Boolean(options.fallbackUsed);
  return {
    provider,
    model,
    executionMode: 'agent',
    summary,
    raw: {
      executionRoute: 'agent-router',
      routeMeta: {
        executionPlan: {
          primaryRoute: backend === 'local' ? 'local-agent' : backend,
          runtimeBackend: backend,
          provider,
          model,
        },
        attempts: [
          {
            attempt: 1,
            provider,
            model,
            authProfile: 'default',
            runtimeBackend: backend,
            ok: true,
            at: '2026-04-27T00:00:00.000Z',
          },
        ],
        fallbackUsed,
        selectedAuthProfile: 'default',
        runtimeBackend: backend,
      },
      final: {
        summary,
        verification,
        changedFiles,
      },
    },
  };
}

async function runInitialContinuityFlow(rootDir, statePath) {
  const providerCalls = [];
  let callCount = 0;
  const engine = new SessionEngine({
    rootDir,
    statePath,
    workerCount: 1,
    policyEngine: {
      evaluate() {
        return { risk: 'low', requiresApproval: false };
      },
    },
    providerRouter: {
      async execute(task) {
        callCount += 1;
        providerCalls.push({
          goal: task.goal,
          runtimeBackend: task.runtimeBackend,
          provider: task.provider,
          model: task.model,
          chatHistorySnapshot: Array.isArray(task.chatHistorySnapshot)
            ? task.chatHistorySnapshot.map((item) => ({ role: item.role, text: item.text }))
            : [],
        });
        if (callCount === 1) {
          return createMockResult(task, {
            provider: 'openrouter',
            model: 'openai/gpt-oss-20b:free',
            backend: 'acp:codex',
            summary: 'checkpoint-1 listo para plan20',
            verification: ['plan20:verificacion-turno-1'],
            fallbackUsed: false,
          });
        }
        return createMockResult(task, {
          provider: 'clod',
          model: 'OpenAI/gpt-oss-20B',
          backend: 'local',
          summary: 'checkpoint-2 continua sobre checkpoint-1',
          verification: ['plan20:verificacion-turno-2'],
          fallbackUsed: true,
        });
      },
    },
  });

  engine.start();
  const session = engine.createSession({ title: 'own-ide continuity plan20' });

  const task1 = engine.enqueueTask(session.sessionId, {
    goal: 'plan20 turno 1: establece checkpoint inicial',
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
    runtimeBackend: 'acp:codex',
    executionMode: 'agent',
  });
  const completed1 = await waitForTaskStatus(engine, task1.taskId, 'completed');

  const task2 = engine.enqueueTask(session.sessionId, {
    goal: 'plan20 turno 2: continua usando checkpoint previo',
    provider: 'clod',
    model: 'OpenAI/gpt-oss-20B',
    runtimeBackend: 'local',
    executionMode: 'agent',
  });
  const completed2 = await waitForTaskStatus(engine, task2.taskId, 'completed');

  const state = engine.getState();
  const sessionState = state.sessions[session.sessionId];
  assert.ok(sessionState, 'la sesion debe existir en estado');
  assert.equal(sessionState.chatHistory.length, 4, 'dos turnos deben producir 4 mensajes user/assistant');
  assert.deepEqual(
    sessionState.chatHistory.map((entry) => entry.role),
    ['user', 'assistant', 'user', 'assistant'],
    'roles esperados en continuidad multi-turno',
  );

  assert.equal(providerCalls.length, 2, 'debe ejecutar dos tareas');
  assert.ok(
    providerCalls[1].chatHistorySnapshot.some((entry) => entry.role === 'assistant' && /checkpoint-1/i.test(entry.text)),
    'el turno 2 debe recibir contexto del assistant previo',
  );

  assert.equal(completed1.verification.status, 'verified');
  assert.equal(completed2.verification.status, 'verified');
  assert.ok(completed2.verification.evidence.some((item) => /plan20:verificacion-turno-2/.test(item)));

  const routeForUi = getEffectiveRouteForUi(completed2, {
    provider: 'openrouter',
    model: 'default',
    runtimeBackend: 'auto',
  });
  assert.equal(routeForUi.provider, 'clod');
  assert.equal(routeForUi.model, 'OpenAI/gpt-oss-20B');
  assert.equal(routeForUi.backend, 'local');
  assert.equal(routeForUi.fallbackUsed, true);

  engine.stop();
  return {
    sessionId: session.sessionId,
    completedTaskId: task2.taskId,
  };
}

async function runRestartContinuityFlow(rootDir, statePath, sessionId) {
  const resumedCalls = [];
  const engine = new SessionEngine({
    rootDir,
    statePath,
    workerCount: 1,
    policyEngine: {
      evaluate() {
        return { risk: 'low', requiresApproval: false };
      },
    },
    providerRouter: {
      async execute(task) {
        resumedCalls.push({
          goal: task.goal,
          chatHistorySnapshot: Array.isArray(task.chatHistorySnapshot)
            ? task.chatHistorySnapshot.map((entry) => ({ role: entry.role, text: entry.text }))
            : [],
        });
        return createMockResult(task, {
          provider: 'openrouter',
          model: 'openai/gpt-oss-20b:free',
          backend: 'acp:codex',
          summary: 'checkpoint-3 continua tras reinicio',
          verification: ['plan20:verificacion-turno-3'],
          fallbackUsed: false,
        });
      },
    },
  });

  engine.start();
  const restoredHistory = engine.getSessionHistory(sessionId, { limit: 20 });
  assert.ok(restoredHistory?.agentState, 'tras reinicio debe existir agentState restaurado');
  assert.ok(/checkpoint-2/i.test(restoredHistory.agentState.lastAssistantSummary), 'tras reinicio agentState debe recordar el ultimo checkpoint visible');
  assert.equal(restoredHistory.agentState.lastRoutePlan.primaryRoute, 'local-agent', 'tras reinicio agentState debe conservar la ultima ruta ejecutada');

  const task3 = engine.enqueueTask(sessionId, {
    goal: 'plan20 turno 3: continua tras reinicio own-ide',
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
    runtimeBackend: 'acp:codex',
    executionMode: 'agent',
  });
  const completed3 = await waitForTaskStatus(engine, task3.taskId, 'completed');

  assert.equal(resumedCalls.length, 1, 'tras reinicio debe ejecutarse un turno nuevo');
  assert.ok(
    resumedCalls[0].chatHistorySnapshot.some((entry) => entry.role === 'assistant' && /checkpoint-2/i.test(entry.text)),
    'el turno tras reinicio debe conservar contexto previo de sesion',
  );

  const sessionHistory = engine.getSessionHistory(sessionId, { limit: 20 });
  assert.ok(sessionHistory, 'session history debe estar disponible');
  assert.equal(sessionHistory.history.length, 6, 'tres turnos deben producir 6 mensajes en historial');

  const persistedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const persistedTask = persistedState.taskIndex[task3.taskId];
  assert.ok(persistedTask, 'la tarea final debe persistirse');
  assert.equal(persistedTask.verification.status, 'verified');
  assert.ok(Array.isArray(persistedTask.routeMeta.attempts));
  assert.ok(persistedTask.routeMeta.attempts[0].ok, 'la metadata de ruta efectiva debe quedar disponible');
  assert.ok(
    Array.isArray(persistedTask.verification.evidence) && persistedTask.verification.evidence.length > 0,
    'la metadata de verificacion debe quedar disponible para UI',
  );

  const routeForUi = getEffectiveRouteForUi(persistedTask, {
    provider: 'openrouter',
    model: 'default',
    runtimeBackend: 'auto',
  });
  assert.equal(routeForUi.provider, 'openrouter');
  assert.equal(routeForUi.backend, 'acp:codex');
  assert.equal(routeForUi.fallbackUsed, false);
  assert.equal(completed3.verification.status, 'verified');

  engine.stop();
}

async function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-own-ide-continuity-'));
  const agentDir = path.join(rootDir, 'copilot-agent');
  fs.mkdirSync(agentDir, { recursive: true });
  const statePath = path.join(agentDir, 'panel-state.json');

  const initial = await runInitialContinuityFlow(rootDir, statePath);
  assert.ok(initial.completedTaskId, 'la primera fase debe cerrar con tarea completada');
  await runRestartContinuityFlow(rootDir, statePath, initial.sessionId);

  console.log('own_ide_continuity_e2e_smoke: ok');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
