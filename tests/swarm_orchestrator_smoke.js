'use strict';

const assert = require('assert');
const { buildSwarmPlan } = require('../src-js/core/swarm-orchestrator');

function main() {
  const simple = buildSwarmPlan('crea carpeta en /tmp/demo');
  assert.equal(simple.enabled, false);
  assert.equal(simple.mode, 'single-agent');

  const complex = buildSwarmPlan('haz refactor integral, build, test, package y orquesta en paralelo con subagentes');
  assert.equal(complex.enabled, true);
  assert.equal(complex.mode, 'multi-agent');
  assert.ok(complex.roles.length >= 3);

  console.log('swarm_orchestrator_smoke: OK');
}

main();
