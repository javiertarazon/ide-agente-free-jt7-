'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const {
  ensureOpenClawRuntimeConfig,
  cleanupOpenClawStaleLocks,
  buildOpenClawAgentArgs,
  buildOpenClawTaskSessionId,
  getOpenClawGatewayConfig,
  buildOpenClawGatewayUrl,
  normalizeModelSuffix,
  summarizeOpenClawPayload,
  isOpenClawGatewayReady,
  buildSubordinateBackendDescriptor,
} = require('../src-js/core/openclaw-agent-runtime');

function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-openclaw-'));
  const model = 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8';
  const ensured = ensureOpenClawRuntimeConfig(rootDir, {
    provider: 'clod',
    model,
    workspacePath: process.cwd(),
    mcpCommand: 'node',
    mcpArgs: ['servidor mpc free jt7/src/index.js'],
  });

  const providerEntry = ensured.config?.models?.providers?.clod;
  assert.ok(providerEntry, 'debe crear provider custom clod');
  assert.ok(Array.isArray(providerEntry.models), 'debe declarar models[] para clod');
  assert.strictEqual(providerEntry.models[0].id, normalizeModelSuffix('clod', model), 'debe registrar el id del modelo esperado');
  assert.strictEqual(providerEntry.baseUrl, 'https://api.clod.io/v1', 'debe mantener baseUrl del provider custom');

  const visibleSummary = summarizeOpenClawPayload({
    payloads: [
      { text: 'Respuesta completa del agente desde payloads.' },
    ],
  }, '\n}\n');
  assert.strictEqual(
    visibleSummary,
    'Respuesta completa del agente desde payloads.',
    'debe preferir payloads[].text sobre el ultimo renglón del raw output',
  );

  const finalAssistantSummary = summarizeOpenClawPayload({
    finalAssistantVisibleText: 'Texto final visible del asistente.',
  }, '}\n');
  assert.strictEqual(
    finalAssistantSummary,
    'Texto final visible del asistente.',
    'debe usar finalAssistantVisibleText cuando existe',
  );
  assert.strictEqual(
    buildOpenClawTaskSessionId({ sessionId: 'panel-abc', taskId: 'task-123', runId: 'run/unsafe id' }),
    'run-unsafe-id',
    'debe preferir runId/taskId para aislar sesiones OpenClaw por tarea',
  );
  assert.deepStrictEqual(
    getOpenClawGatewayConfig(ensured.config),
    { bind: 'loopback', port: 18789 },
    'debe exponer bind/port del gateway desde la config asegurada',
  );
  assert.strictEqual(
    buildOpenClawGatewayUrl(ensured.config),
    'ws://127.0.0.1:18789',
    'debe construir la URL local esperada del gateway',
  );
  assert.strictEqual(
    isOpenClawGatewayReady('Runtime: stopped\nRPC probe: ok\nListening: 127.0.0.1:18789'),
    true,
    'debe aceptar `RPC probe: ok` como señal de gateway listo',
  );
  assert.strictEqual(
    isOpenClawGatewayReady('Runtime: stopped\nRPC probe: failed\n  gateway closed (1006):'),
    false,
    'debe rechazar probes fallidos del gateway',
  );
  assert.deepStrictEqual(
    buildSubordinateBackendDescriptor({
      executionRoute: 'provider-direct-fallback',
      runtimeBackend: 'openclaw',
      provider: 'openrouter',
      model: 'qwen/qwen3-coder:free',
      authProfile: 'default',
      fallbackSelected: 'provider-direct',
    }),
    {
      kind: 'provider-direct',
      provider: 'openrouter',
      model: 'qwen/qwen3-coder:free',
      runtimeBackend: 'openclaw',
      authProfile: 'default',
      fallbackSelected: 'provider-direct',
    },
    'debe describir el backend subordinado efectivo sin perder provider/model tecnicos',
  );
  const nulArgs = buildOpenClawAgentArgs({
    sessionId: 'panel-\0-123',
    message: 'Instrucciones\0 base\0 del agente',
    thinking: 'med\0ium',
    timeoutSeconds: 90,
  });
  assert.equal(
    nulArgs.some((entry) => entry.includes('\0')),
    false,
    'debe eliminar bytes nulos de los argumentos CLI del agente',
  );

  const switched = ensureOpenClawRuntimeConfig(rootDir, {
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
    workspacePath: process.cwd(),
    mcpCommand: 'node',
    mcpArgs: ['servidor mpc free jt7/src/index.js'],
  });
  assert.equal(
    Boolean(switched.config?.models?.providers?.clod),
    false,
    'debe limpiar providers custom stale cuando cambia del provider clod a otro provider',
  );

  const staleLockDir = path.join(rootDir, '.openclaw', 'state', 'agents', 'main', 'sessions');
  fs.mkdirSync(staleLockDir, { recursive: true });
  const staleLockPath = path.join(staleLockDir, 'stale.jsonl.lock');
  fs.writeFileSync(staleLockPath, 'pid=99999999\n', 'utf8');
  const cleanup = cleanupOpenClawStaleLocks(rootDir, { maxAgeMs: 1 });
  assert.equal(fs.existsSync(staleLockPath), false, 'debe limpiar locks con PID muerto');
  assert.equal(cleanup.removed.length, 1, 'debe reportar el lock eliminado');

  const openclawCheck = spawnSync('openclaw', ['--version'], { encoding: 'utf8' });
  if (openclawCheck.status === 0) {
    execFileSync('openclaw', ['config', 'validate'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCLAW_NO_RESPAWN: '1',
        OPENCLAW_CONFIG_PATH: ensured.configPath,
        OPENCLAW_STATE_DIR: ensured.stateDir,
      },
    });
  }

  console.log('openclaw_runtime_smoke: OK');
}

try {
  main();
} catch (error) {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
}
