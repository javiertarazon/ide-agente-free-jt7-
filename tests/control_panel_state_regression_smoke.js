'use strict';

const assert = require('assert');

const {
  sanitizePanelProviderConfig,
  ensurePanelSeedSession,
} = require('../src-js/core/control-panel.js');

function testSanitizesStandalonePanelState() {
  const catalog = {
    modelsByProvider: {
      openrouter: [{ label: 'GPT OSS 20B', value: 'openai/gpt-oss-20b:free' }],
      clod: [{ label: 'GPT OSS 20B', value: 'OpenAI/gpt-oss-20B' }],
    },
    defaultModelByProvider: {
      openrouter: 'openai/gpt-oss-20b:free',
      clod: 'OpenAI/gpt-oss-20B',
    },
  };

  const sanitized = sanitizePanelProviderConfig({
    provider: 'clod',
    model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8',
    executionMode: 'agent',
    runtimeBackend: 'local',
    policyProfile: 'coding',
    authProfile: 'default',
  }, {
    standaloneMode: true,
    catalog,
  });

  assert.equal(sanitized.provider, 'clod');
  assert.equal(sanitized.executionMode, 'agent');
  assert.equal(sanitized.runtimeBackend, 'auto', 'standalone no debe reabrir en local limitado por persistencia vieja');
  assert.equal(sanitized.model, 'OpenAI/gpt-oss-20B', 'modelo stale fuera de catálogo debe volver al default del proveedor');
}

function testSeedsSessionWhenPanelHasNone() {
  let created = 0;
  const engine = {
    getState() {
      return { sessions: {} };
    },
    createSession(input) {
      created += 1;
      assert.equal(input.title, 'Sesion inicial Free JT7');
      return { sessionId: 'sess-1', title: input.title };
    },
  };

  const sessionId = ensurePanelSeedSession(engine, '');
  assert.equal(sessionId, 'sess-1');
  assert.equal(created, 1, 'debe sembrar una sesión para que el chat sea usable al abrir el panel');
}

function main() {
  testSanitizesStandalonePanelState();
  testSeedsSessionWhenPanelHasNone();
  console.log('control_panel_state_regression_smoke: ok');
}

main();