'use strict';

const assert = require('assert');
const { activateCapabilities } = require('../src-js/core/capability-activation');

function main() {
  const out = activateCapabilities('ejecuta test y verifica build', [
    'memory-forensics',
    'document-triage',
    'runtime-debug',
    'web-investigation',
  ]);
  assert.equal(out.profile, 'verification');
  assert.equal(out.activationMode, 'selective');
  assert.ok(out.activatedSkills.includes('memory-forensics') || out.activatedSkills.includes('runtime-debug'));
  console.log('capability_activation_smoke: OK');
}

main();
