'use strict';

const assert = require('assert');

const { PolicyEngine } = require('../src-js/core/policy-engine.js');

function main() {
  const engine = new PolicyEngine({ mode: 'mixed', defaultProfile: 'coding' });

  const messaging = engine.evaluate({
    goal: 'ejecuta bash y apply patch en varios archivos',
    executionMode: 'agent',
    policyProfile: 'messaging',
  });
  assert.equal(messaging.profile, 'messaging', 'debe respetar profile solicitado');
  assert.equal(messaging.deniedTools.includes('exec'), true, 'messaging debe denegar exec');
  assert.equal(messaging.deniedTools.includes('write_file'), true, 'messaging debe denegar write_file');

  const coding = engine.evaluate({
    goal: 'ejecuta bash y apply patch en varios archivos',
    executionMode: 'agent',
    policyProfile: 'coding',
  });
  assert.equal(coding.askTools.includes('exec'), true, 'coding debe pedir aprobacion para exec');
  assert.equal(coding.allowTools.includes('write_file'), true, 'coding debe permitir write_file en flujo normal');
  assert.equal(coding.requiresApproval, true, 'coding debe requerir aprobacion cuando hay exec');

  const normalChat = engine.evaluate({
    goal: 'hola, continua la tarea actual',
    executionMode: 'agent',
    policyProfile: 'coding',
  });
  assert.equal(normalChat.requiresApproval, false, 'chat normal no debe quedar bloqueado por aprobacion');

  const minimal = engine.evaluate({
    goal: 'abre browser y consulta url externa',
    executionMode: 'agent',
    policyProfile: 'minimal',
  });
  assert.equal(minimal.deniedTools.includes('browser'), true, 'minimal debe denegar browser');
  assert.equal(minimal.deniedTools.includes('network'), true, 'minimal debe denegar network');

  console.log('policy_engine_profiles_smoke: OK');
}

try {
  main();
} catch (error) {
  console.error(error.stack || String(error));
  process.exitCode = 1;
}
