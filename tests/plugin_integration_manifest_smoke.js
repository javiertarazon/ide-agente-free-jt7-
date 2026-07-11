'use strict';

const assert = require('assert');
const path = require('path');

const { PluginRuntime } = require('../src-js/plugins/plugin-runtime');


async function main() {
  const runtime = new PluginRuntime();
  const integrationsRoot = path.join(__dirname, '..', 'integrations');
  const result = runtime.discoverAndLoadIntegrations({
    directories: [integrationsRoot],
    allowExperimental: false,
  });

  assert.equal(result.loaded.length, 1);
  const status = runtime.getStatus();
  assert.equal(status.totalIntegrations, 1);
  assert.equal(status.totalPlugins, 1);
  assert.equal(status.integrations[0].id, 'example-capability-pack');
  assert.equal(status.integrations[0].capabilities.docs, 1);
  assert.equal(status.integrations[0].capabilities.prompts, 1);
  assert.equal(status.integrations[0].capabilities.policies, 1);
  assert.equal(status.integrations[0].capabilities.evaluators, 1);
  assert.equal(status.capabilityIndex.commands.length, 1);
  assert.equal(status.capabilityIndex.tools.length, 1);

  const mutated = await runtime.emit('preToolUse', { toolName: 'shell', toolArgs: { command: 'echo ok' } });
  assert.equal(mutated.additionalContext, 'example-capability-pack: trusted shell review active');
  console.log('plugin_integration_manifest_smoke: ok');
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});