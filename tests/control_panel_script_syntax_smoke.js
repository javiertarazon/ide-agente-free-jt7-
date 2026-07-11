'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { createPanelHtml } = require('../src-js/core/control-panel.js');

function main() {
  const html = createPanelHtml({}, 'Free JT7 Control Panel', {
    modelsByProvider: { openrouter: [], hf: [], zai: [], clod: [] },
    defaultModelByProvider: { openrouter: '', hf: '', zai: '', clod: '' },
  });
  const scriptMatch = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch && scriptMatch[1], 'Debe extraer script del webview');

  const scriptBody = scriptMatch[1];
  const tempFile = path.join(os.tmpdir(), `freejt7-panel-script-${Date.now()}.js`);
  fs.writeFileSync(tempFile, scriptBody, 'utf8');

  const check = spawnSync(process.execPath, ['--check', tempFile], { encoding: 'utf8' });
  try {
    assert.strictEqual(check.status, 0, `El script del panel debe compilar sin SyntaxError.\n${check.stderr || check.stdout || ''}`);
  } finally {
    try { fs.unlinkSync(tempFile); } catch (_) {}
  }

  process.stdout.write('control_panel_script_syntax_smoke: ok\n');
}

try {
  main();
} catch (error) {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
}

