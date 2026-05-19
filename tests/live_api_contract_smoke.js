'use strict';

const assert = require('assert');
const {
  requestedProviders,
  buildLivePrompt,
  runLiveApiGate,
  formatLiveApiGate,
} = require('../scripts/freejt7-live-api-gate');

async function main() {
  assert.deepEqual(requestedProviders({ OPENAI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y' }).sort(), ['anthropic', 'openai']);
  assert.deepEqual(requestedProviders({ FREEJT7_LIVE_PROVIDERS: 'openai,local' }), ['openai', 'local']);
  assert.equal(buildLivePrompt('openai').messages[0].role, 'user');

  const skipped = await runLiveApiGate({ env: {} });
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.ok, true);

  const required = await runLiveApiGate({ env: { FREEJT7_LIVE_REQUIRED: '1' } });
  assert.equal(required.status, 'failed');
  assert.equal(required.ok, false);
  assert.match(formatLiveApiGate(skipped), /live API gate: skipped/);
  process.stdout.write('live_api_contract_smoke: ok\n');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.stack || error?.message || error));
    process.exitCode = 1;
  });
}
module.exports = { main };
