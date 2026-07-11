'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { SessionEngine } = require('../src-js/core/session-engine');
const { normalizeProviderError } = require('../src-js/core/api-provider-adapter');

function waitFor(predicate, timeoutMs = 3000, intervalMs = 50) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`timeout waiting for condition after ${timeoutMs}ms`));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

async function main() {
  const rateLimitError = normalizeProviderError(
    'openrouter',
    429,
    { error: { message: 'Provider returned error' } },
    { model: 'nousresearch/hermes-3-llama-3.1-405b:free' },
  );

  assert.equal(rateLimitError.isRateLimitError, true, '429 debe tiparse como rate limit');
  assert.equal(rateLimitError.isRetryable, false, '429 no debe reintentarse automaticamente');
  assert.equal(rateLimitError.isUserActionRequired, false, '429 debe permitir fallback de proveedor antes de pedir accion manual');
  assert.match(rateLimitError.message, /HTTP 429/, 'el mensaje debe incluir el codigo 429');
  assert.doesNotMatch(rateLimitError.message, /Provider returned error/i, 'el mensaje no debe dejar el texto remoto generico');

  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-panel-429-'));
  const statePath = path.join(rootDir, 'copilot-agent', 'panel-state.json');
  const auditEvents = [];
  const engine = new SessionEngine({
    rootDir,
    workerCount: 1,
    policyEngine: {
      evaluate() {
        return { risk: 'low', requiresApproval: false };
      },
    },
    providerRouter: {
      async execute() {
        throw rateLimitError;
      },
    },
    auditBus: {
      emit(sessionId, type, payload) {
        auditEvents.push({ sessionId, type, payload });
      },
    },
  });

  const session = engine.createSession({ title: 'rate-limit-smoke' });
  const task = engine.enqueueTask(session.sessionId, {
    goal: 'probar rate limit',
    provider: 'openrouter',
    model: 'nousresearch/hermes-3-llama-3.1-405b:free',
  });

  engine.start();
  await waitFor(() => {
    if (!fs.existsSync(statePath)) return false;
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return state.taskIndex && state.taskIndex[task.taskId] && state.taskIndex[task.taskId].status === 'failed';
  });
  engine.stop();

  const finalState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const storedTask = finalState.taskIndex[task.taskId];

  assert.equal(storedTask.status, 'failed', 'la tarea debe fallar sin quedar reencolada');
  assert.equal(storedTask.retries, 1, 'solo debe contarse el intento real ejecutado');
  assert.equal(finalState.queue.length, 0, 'la cola debe quedar vacia tras un 429 no reintentable');
  assert.equal(
    auditEvents.filter((event) => event.type === 'task.retry.scheduled').length,
    0,
    'no debe emitirse task.retry.scheduled para rate limit',
  );
  assert.equal(
    auditEvents.filter((event) => event.type === 'task.failed').length,
    1,
    'debe emitirse un unico task.failed',
  );

  const legacyRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-panel-legacy-'));
  const legacyStatePath = path.join(legacyRootDir, 'copilot-agent', 'panel-state.json');
  fs.mkdirSync(path.dirname(legacyStatePath), { recursive: true });
  fs.writeFileSync(
    legacyStatePath,
    `${JSON.stringify({
      savedAt: new Date().toISOString(),
      sessions: {
        'panel-legacy': {
          sessionId: 'panel-legacy',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          title: 'legacy-session',
          tasks: ['task-legacy-429'],
        },
      },
      queue: [],
      taskIndex: {
        'task-legacy-429': {
          taskId: 'task-legacy-429',
          sessionId: 'panel-legacy',
          goal: 'legacy rate limit',
          provider: 'openrouter',
          model: 'nousresearch/hermes-3-llama-3.1-405b:free',
          retries: 3,
          maxRetries: 2,
          status: 'failed',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          approval: null,
          result: null,
          error: 'Free JT7 (openrouter): error HTTP 429. Provider returned error',
          risk: 'low',
        },
      },
      workerCount: 1,
    }, null, 2)}\n`,
    'utf8',
  );

  new SessionEngine({
    rootDir: legacyRootDir,
    workerCount: 1,
    policyEngine: {
      evaluate() {
        return { risk: 'low', requiresApproval: false };
      },
    },
    providerRouter: {
      async execute() {
        throw new Error('should not execute during migration smoke');
      },
    },
  });

  const migratedState = JSON.parse(fs.readFileSync(legacyStatePath, 'utf8'));
  const migratedTask = migratedState.taskIndex['task-legacy-429'];
  assert.match(migratedTask.error, /rate limit temporal/i, 'el estado legado debe migrarse a mensaje accionable');
  assert.doesNotMatch(migratedTask.error, /Provider returned error/i, 'la migracion no debe conservar el texto remoto generico');

  console.log('panel_rate_limit_smoke: OK');
}

main().catch((error) => {
  console.error('panel_rate_limit_smoke: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
