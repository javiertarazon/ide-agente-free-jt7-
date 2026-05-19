'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createTaskSandbox, isInside, sanitizeEnv, splitCommand } = require('../src-js/core/task-sandbox');

async function main() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-sandbox-ws-'));
  const sandbox = createTaskSandbox({ workspaceRoot, taskId: 'unit', allowedCommands: ['echo'] });

  assert.ok(isInside(path.join(workspaceRoot, 'a.txt'), workspaceRoot));
  assert.equal(sandbox.assertPathAllowed(path.join(workspaceRoot, 'ok.txt')).endsWith('ok.txt'), true);
  assert.throws(() => sandbox.assertPathAllowed('/etc/passwd'), /ruta fuera de allowlist/);
  assert.equal(sandbox.assertCommandAllowed('node --version'), 'node --version');
  assert.equal(sandbox.assertCommandAllowed('echo hola'), 'echo hola');
  assert.throws(() => sandbox.assertCommandAllowed('curl https://example.com'), /comando fuera de allowlist/);
  assert.throws(() => sandbox.assertNetworkAllowed('https://example.com'), /red bloqueada/);

  const denied = sandbox.evaluateToolRequest({ path: '/etc/passwd' });
  assert.equal(denied.allowed, false);
  assert.equal(denied.decision, 'deny');
  const allowed = sandbox.evaluateToolRequest({ path: path.join(workspaceRoot, 'ok.txt'), command: 'node --version' });
  assert.equal(allowed.allowed, true);
  assert.deepEqual(splitCommand(['node', '-e', 'console.log(1)']), { bin: 'node', args: ['-e', 'console.log(1)'] });
  const env = sanitizeEnv({ PATH: '/bin', OPENAI_API_KEY: 'secret', HTTPS_PROXY: 'proxy' }, { SAFE_FLAG: '1', GH_TOKEN: 'nope' });
  assert.equal(env.PATH, '/bin');
  assert.equal(env.SAFE_FLAG, '1');
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.HTTPS_PROXY, undefined);
  assert.equal(env.GH_TOKEN, undefined);

  const processResult = await sandbox.runProcess(['node', '-e', 'console.log(process.env.FREEJT7_SANDBOX); console.error(process.env.OPENAI_API_KEY || \'redacted\')'], {
    cwd: sandbox.taskRoot,
    env: { OPENAI_API_KEY: 'must-not-leak', SAFE_FLAG: 'ok' },
  });
  assert.equal(processResult.ok, true);
  assert.match(processResult.stdout, /1/);
  assert.match(processResult.stderr, /redacted/);
  assert.equal(processResult.isolation.process, true);
  assert.equal(processResult.isolation.shell, false);
  assert.equal(processResult.isolation.env, 'sanitized');

  const timeoutSandbox = createTaskSandbox({ workspaceRoot, taskId: 'timeout', processTimeoutMs: 100 });
  const timeout = await timeoutSandbox.runProcess(['node', '-e', 'setTimeout(()=>{}, 1000)']);
  assert.equal(timeout.ok, false);
  assert.equal(timeout.timedOut, true);
  process.stdout.write('task_sandbox_smoke: ok\n');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.stack || error?.message || error));
    process.exitCode = 1;
  });
}
module.exports = { main };
