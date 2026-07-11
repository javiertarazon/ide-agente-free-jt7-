// Smoke test: SessionEngine persiste historial conversacional real
// Ejecutar: node tests/session_engine_context_smoke.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { SessionEngine } = require('../src-js/core/session-engine');

function waitFor(check, timeoutMs = 4000) {
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
      setTimeout(tick, 50);
    };
    tick();
  });
}

async function runSuccessScenario(rootDir) {
  const statePath = path.join(rootDir, 'copilot-agent', 'panel-state.json');
  const engine = new SessionEngine({
    rootDir,
    statePath,
    workerCount: 1,
    policyEngine: { evaluate: () => ({ risk: 'low', requiresApproval: false }) },
    providerRouter: {
      getRoutePlan: (task) => ({
        primaryRoute: /carpeta|directorio/i.test(String(task.goal || '')) ? 'local-agent' : 'openclaw-agent',
        runtimeBackend: /carpeta|directorio/i.test(String(task.goal || '')) ? 'local' : 'openclaw',
        provider: task.provider || 'openrouter',
        model: task.model || '',
        localCapable: true,
        deterministicLocal: false,
        fallbackOrder: ['provider-direct'],
        reason: 'test-plan',
        capabilityPlan: {
          toolMode: 'local-tools',
          localCapable: true,
          deterministicLocal: false,
          localOperations: ['filesystem.read'],
          selectedSkills: ['memory-forensics'],
          mcpServers: [{ id: 'free-jt7-local', transport: 'stdio', enabled: true }],
          intakeDefined: false,
        },
      }),
      execute: async (task) => ({
        provider: 'openrouter',
        model: 'openai/gpt-oss-20b:free',
        summary: `Resumen listo para: ${task.goal}`,
      }),
    },
  });

  engine.start();
  const session = engine.createSession({ title: 'Sesion de contexto' });
  const task = engine.enqueueTask(session.sessionId, {
    goal: 'Analiza la carpeta indicada y continua el hilo.',
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
  });
  assert.strictEqual(engine._taskIndex[task.taskId].routePlan.primaryRoute, 'local-agent', 'debe persistir el plan de ruta encolado');
  assert.strictEqual(engine._taskIndex[task.taskId].routePlan.capabilityPlan.toolMode, 'local-tools', 'debe persistir capabilityPlan en el routePlan');

  await waitFor(() => engine._taskIndex[task.taskId]?.status === 'completed');

  const updatedSession = engine.getState().sessions[session.sessionId];
  assert.strictEqual(updatedSession.chatHistory.length, 2, 'debe guardar user + assistant');
  assert.strictEqual(updatedSession.chatHistory[0].role, 'user', 'primer turno user');
  assert.strictEqual(updatedSession.chatHistory[1].role, 'assistant', 'segundo turno assistant');
  assert.strictEqual(engine._taskIndex[task.taskId].chatHistorySnapshot.length, 1, 'snapshot del task conserva el turno de usuario');
  assert.strictEqual(updatedSession.agentState.lastTaskId, task.taskId, 'debe persistir ultimo taskId en agentState');
  assert.ok(updatedSession.agentState.lastAssistantSummary.includes('Resumen listo para'), 'debe persistir resumen visible para continuidad');
  assert.strictEqual(updatedSession.agentState.lastRoutePlan.primaryRoute, 'local-agent', 'debe persistir ultima routePlan en agentState');

  const persisted = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.strictEqual(persisted.sessions[session.sessionId].chatHistory.length, 2, 'estado persistido conserva chatHistory');
  assert.strictEqual(persisted.taskIndex[task.taskId].routePlan.primaryRoute, 'local-agent', 'estado persistido conserva routePlan');
  assert.strictEqual(persisted.taskIndex[task.taskId].routePlan.capabilityPlan.mcpServers[0].id, 'free-jt7-local', 'estado persistido conserva capabilityPlan');
  assert.strictEqual(persisted.sessions[session.sessionId].agentState.lastTaskId, task.taskId, 'estado persistido conserva agentState');

  engine.stop();
}

async function runFailureScenario(rootDir) {
  const statePath = path.join(rootDir, 'copilot-agent', 'panel-state.json');
  const engine = new SessionEngine({
    rootDir,
    statePath,
    workerCount: 1,
    policyEngine: { evaluate: () => ({ risk: 'low', requiresApproval: false }) },
    providerRouter: {
      execute: async () => {
        throw new Error('Timeout');
      },
    },
  });

  engine.start();
  const session = engine.createSession({ title: 'Sesion con error' });
  const task = engine.enqueueTask(session.sessionId, {
    goal: 'Continua la tarea anterior.',
    provider: 'openrouter',
  });

  await waitFor(() => engine._taskIndex[task.taskId]?.status === 'failed');

  const updatedSession = engine.getState().sessions[session.sessionId];
  assert.strictEqual(updatedSession.chatHistory.length, 2, 'en fallo tambien debe guardar user + assistant');
  assert.strictEqual(updatedSession.chatHistory[1].isError, true, 'el mensaje assistant debe marcar error');
  assert.ok(updatedSession.chatHistory[1].text.includes('Timeout'), 'debe persistir el error real');

  engine.stop();
}

function runLegacySummaryRecoveryScenario(rootDir) {
  const statePath = path.join(rootDir, 'copilot-agent', 'panel-state.json');
  const sessionId = 'session-legacy';
  const taskId = 'task-legacy';
  fs.writeFileSync(statePath, JSON.stringify({
    savedAt: new Date().toISOString(),
    sessions: {
      [sessionId]: {
        sessionId,
        title: 'Sesion legado',
        tasks: [taskId],
        chatHistory: [
          {
            role: 'user',
            text: 'continua con el siguiente paso',
            taskId,
            at: new Date().toISOString(),
          },
          {
            role: 'assistant',
            text: '}',
            taskId,
            at: new Date().toISOString(),
          },
        ],
      },
    },
    queue: [],
    taskIndex: {
      [taskId]: {
        taskId,
        sessionId,
        goal: 'continua con el siguiente paso',
        status: 'completed',
        provider: 'clod',
        model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8',
        executionMode: 'agent',
        result: {
          summary: '}',
          raw: {
            finalAssistantVisibleText: 'Respuesta recuperada desde finalAssistantVisibleText.',
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
    workerCount: 1,
  }, null, 2));

  const engine = new SessionEngine({
    rootDir,
    statePath,
    workerCount: 1,
  });

  const recoveredSession = engine.getState().sessions[sessionId];
  assert.strictEqual(
    recoveredSession.chatHistory[1].text,
    'Respuesta recuperada desde finalAssistantVisibleText.',
    'debe reparar chatHistory legado con summary corrupto',
  );
}

function runLegacyAgentStateRecoveryScenario(rootDir) {
  const statePath = path.join(rootDir, 'copilot-agent', 'panel-state.json');
  const sessionId = 'session-agentstate-legacy';
  const taskId = 'task-agentstate-legacy';
  fs.writeFileSync(statePath, JSON.stringify({
    savedAt: new Date().toISOString(),
    sessions: {
      [sessionId]: {
        sessionId,
        title: 'Sesion legado sin agentState',
        tasks: [taskId],
        chatHistory: [],
      },
    },
    queue: [],
    taskIndex: {
      [taskId]: {
        taskId,
        sessionId,
        goal: 'retoma el analisis de continuidad',
        status: 'completed',
        provider: 'openrouter',
        model: 'openai/gpt-oss-20b:free',
        executionMode: 'agent',
        routePlan: {
          primaryRoute: 'openclaw-agent',
          capabilityPlan: { toolMode: 'openclaw-harness' },
        },
        result: {
          summary: 'Resumen persistido para retomar.',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
    workerCount: 1,
  }, null, 2));

  const engine = new SessionEngine({
    rootDir,
    statePath,
    workerCount: 1,
  });

  const recoveredSession = engine.getState().sessions[sessionId];
  assert.strictEqual(recoveredSession.agentState.lastTaskId, taskId, 'debe reconstruir lastTaskId desde la tarea persistida');
  assert.strictEqual(recoveredSession.agentState.lastUserGoal, 'retoma el analisis de continuidad', 'debe reconstruir el ultimo objetivo');
  assert.strictEqual(recoveredSession.agentState.lastAssistantSummary, 'Resumen persistido para retomar.', 'debe reconstruir el resumen visible');
  assert.strictEqual(recoveredSession.agentState.lastRoutePlan.primaryRoute, 'openclaw-agent', 'debe reconstruir la routePlan persistida');
}

function runRestartRecoveryScenario(rootDir) {
  const statePath = path.join(rootDir, 'copilot-agent', 'panel-state.json');
  const sessionId = 'session-restart-recovery';
  const taskId = 'task-running-before-restart';
  fs.writeFileSync(statePath, JSON.stringify({
    savedAt: new Date().toISOString(),
    sessions: {
      [sessionId]: {
        sessionId,
        title: 'Sesion reiniciada',
        tasks: [taskId],
        chatHistory: [
          {
            role: 'user',
            text: 'continua despues del reinicio',
            taskId,
            at: new Date().toISOString(),
          },
        ],
        agentState: {
          lastTaskId: '',
          lastUserGoal: '',
          lastAssistantSummary: '',
          lastRoutePlan: null,
          continuationHint: '',
          updatedAt: '',
        },
      },
    },
    queue: [taskId],
    taskIndex: {
      [taskId]: {
        taskId,
        sessionId,
        goal: 'continua despues del reinicio',
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

  const engine = new SessionEngine({
    rootDir,
    statePath,
    workerCount: 1,
  });

  const recoveredTask = engine._taskIndex[taskId];
  const recoveredSession = engine.getState().sessions[sessionId];
  assert.strictEqual(recoveredTask.status, 'failed', 'la tarea running debe recuperarse como failed tras reinicio');
  assert.ok(/reinicio del runtime/i.test(recoveredTask.error), 'debe persistir la causa de recuperacion tras reinicio');
  assert.strictEqual(recoveredSession.chatHistory.length, 2, 'debe agregar mensaje assistant al recuperar la tarea');
  assert.strictEqual(recoveredSession.agentState.lastTaskId, taskId, 'agentState debe apuntar a la tarea recuperada');
  assert.ok(/reinicio del runtime/i.test(recoveredSession.agentState.lastAssistantSummary), 'agentState debe reflejar el motivo de interrupcion');
  assert.strictEqual(recoveredSession.agentState.lastRoutePlan.primaryRoute, 'local-agent', 'debe conservar la routePlan al recuperar');
}

async function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-session-engine-'));
  fs.mkdirSync(path.join(rootDir, 'copilot-agent'), { recursive: true });
  await runSuccessScenario(rootDir);
  await runFailureScenario(rootDir);
  runLegacySummaryRecoveryScenario(rootDir);
  runLegacyAgentStateRecoveryScenario(rootDir);
  runRestartRecoveryScenario(rootDir);
  console.log('session_engine_context_smoke: OK');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
