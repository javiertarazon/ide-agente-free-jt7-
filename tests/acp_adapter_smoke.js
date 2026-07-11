'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildAcpRequest,
  normalizeAcpBackend,
  parseAcpBackend,
  runAcpTask,
} = require('../src-js/core/acp-adapter');

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-acp-adapter-'));

  assert.equal(normalizeAcpBackend('codex'), 'acp:codex');
  assert.equal(parseAcpBackend('acp:opencode').harness, 'opencode');

  const request = buildAcpRequest('haz smoke ACP', {
    runtimeBackend: 'acp:claude-code',
    workspacePath: tmpRoot,
    provider: 'openrouter',
    model: 'demo',
  });
  assert.equal(request.protocol, 'acp');
  assert.equal(request.harness, 'claude-code');
  assert.equal(request.workspacePath, path.resolve(tmpRoot));

  const fallback = await runAcpTask('escribe resultado local', {
    runtimeBackend: 'acp:codex',
    workspacePath: tmpRoot,
    actions: [
      { type: 'write', path: 'acp/result.txt', content: 'ok acp\n' },
      { type: 'verify', command: 'node', args: ['--version'] },
    ],
  });

  assert.equal(fallback.executionMode, 'agent');
  assert.equal(fallback.executionRoute, 'acp:codex:local-fallback');
  assert.equal(fallback.acp.fallback, true);
  assert.ok(fallback.final.verification.some((item) => item.includes('escritura verificada')));
  assert.equal(fs.readFileSync(path.join(tmpRoot, 'acp', 'result.txt'), 'utf8'), 'ok acp\n');

  const harness = await runAcpTask('harness externo', {
    runtimeBackend: 'acp:opencode',
    workspacePath: tmpRoot,
    executeHarnessTask: async (acpRequest) => ({
      provider: 'freejt7-acp',
      model: acpRequest.harness,
      executionRoute: acpRequest.runtimeBackend,
      final: {
        status: 'completed',
        summary: `ok ${acpRequest.harness}`,
        changedFiles: [],
        verification: ['harness smoke'],
        residualRisks: [],
      },
    }),
  });

  assert.equal(harness.executionRoute, 'acp:opencode');
  assert.equal(harness.acp.fallback, false);
  assert.equal(harness.final.verification[0], 'harness smoke');

  console.log('acp_adapter_smoke: ok');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
