'use strict';

const assert = require('assert');

const {
  runNativeAutonomyDoctor,
  formatNativeAutonomyDoctor,
  collectMcpToolNames,
} = require('../src-js/core/native-autonomy-doctor');

function main() {
  const result = runNativeAutonomyDoctor({ rootDir: process.cwd() });
  assert.equal(result.ok, true, JSON.stringify(result.failedRequired, null, 2));
  assert.equal(result.status, 'ok');
  assert.ok(result.summary.checks >= 50, 'Debe cubrir una matriz amplia de autonomia nativa');

  const sections = Object.fromEntries(result.sections.map((section) => [section.id, section]));
  for (const required of ['providers', 'runtimeOwnership', 'mcpMt5', 'skillsSubagents', 'autolearn', 'nativeUiModes', 'ownIdePackaging', 'productHardening']) {
    assert.equal(sections[required]?.status, 'ok', `Seccion requerida no OK: ${required}`);
  }

  const providers = sections.providers.details.providerIds;
  for (const id of ['openrouter', 'openai', 'anthropic', 'deepseek', 'gemini', 'local']) {
    assert.ok(providers.includes(id), `Debe detectar provider ${id}`);
  }

  const mcpTools = sections.mcpMt5.details.toolNames;
  for (const tool of ['jt7_browser_open', 'jt7_system_exec', 'jt7_desktop_open_path', 'jt7_mt5_connect', 'jt7_mt5_open_order']) {
    assert.ok(mcpTools.includes(tool), `Debe detectar tool MCP ${tool}`);
  }

  assert.ok(sections.skillsSubagents.details.skillCount >= 25, 'Debe detectar biblioteca de skills');
  assert.ok(sections.skillsSubagents.details.agentFiles.includes('free-jt7.agent.md'), 'Debe detectar subagente Free JT7');
  assert.equal(collectMcpToolNames('jt7_ping jt7_ping jt7_mt5_connect').join(','), 'jt7_mt5_connect,jt7_ping');
  assert.match(formatNativeAutonomyDoctor(result), /native autonomy doctor: ok/);

  console.log('native_autonomy_doctor_smoke: OK');
}

try {
  main();
} catch (error) {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
}
