'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runSubagentsParallel } = require('../src-js/core/subagent-orchestrator');

async function main() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-subagents-ws-'));
  let active = 0;
  let maxActive = 0;
  const result = await runSubagentsParallel({
    workspaceRoot,
    maxConcurrency: 2,
    agents: [
      { id: 'a', goal: 'analiza docs' },
      { id: 'b', goal: 'ejecuta pruebas' },
      { id: 'c', goal: 'resume cambios' },
    ],
    worker: async ({ subagent, sandbox }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      assert.ok(sandbox.taskRoot.includes(subagent.id));
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return { status: 'completed', summary: `ok ${subagent.id}` };
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.subagentCount, 3);
  assert.equal(result.results.length, 3);
  assert.ok(maxActive > 1, 'Debe ejecutar subagentes en paralelo');
  assert.ok(result.results.every((item) => item.sandbox.taskRoot));
  assert.ok(result.results.every((item) => item.sandbox.processIsolation === true));

  const processRun = await runSubagentsParallel({
    workspaceRoot,
    maxConcurrency: 1,
    agents: [
      { id: 'proc', goal: 'ejecuta proceso aislado', command: ['node', '-e', 'console.log(\"subagent-process-ok\")'] },
    ],
  });
  assert.equal(processRun.status, 'completed');
  assert.match(processRun.results[0].output.process.stdout, /subagent-process-ok/);
  assert.equal(processRun.results[0].output.process.isolation.shell, false);
  process.stdout.write('subagent_parallel_orchestrator_smoke: ok\n');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.stack || error?.message || error));
    process.exitCode = 1;
  });
}
module.exports = { main };
