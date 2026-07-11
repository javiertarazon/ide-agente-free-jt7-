'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runAcpTask } = require('../src-js/core/acp-adapter');
const { SessionEngine } = require('../src-js/core/session-engine');

function waitFor(check, timeoutMs = 6000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const value = check();
      if (value) {
        resolve(value);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('timeout esperando subagente ACP'));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

async function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-session-acp-'));
  const engine = new SessionEngine({
    rootDir,
    workerCount: 1,
    policyEngine: { evaluate: () => ({ risk: 'low', requiresApproval: false, deniedTools: [], askTools: [], profile: 'coding' }) },
    providerRouter: {
      execute: async (task) => {
        const acp = await runAcpTask(task.goal, {
          runtimeBackend: task.runtimeBackend,
          workspacePath: rootDir,
          provider: task.provider,
          model: task.model,
          actions: [
            { type: 'write', path: 'subagent/acp.txt', content: 'ok session acp\n' },
            { type: 'verify', command: 'node', args: ['--version'] },
          ],
        });
        return {
          provider: acp.provider,
          model: acp.model,
          summary: acp.final.summary,
          executionMode: acp.executionMode,
          raw: acp,
        };
      },
    },
  });

  engine.start();
  const session = engine.createSession({ title: 'acp local subagent' });
  const spawned = engine.spawnSubagent(session.sessionId, {
    goal: 'ejecuta ACP local',
    provider: 'openrouter',
    model: 'demo',
    runtimeBackend: 'acp:codex',
  });

  const completed = await waitFor(() => {
    const task = engine._taskIndex[spawned.task.taskId];
    return task && task.status === 'completed' ? task : null;
  });

  assert.equal(completed.acp.harness, 'codex');
  assert.equal(completed.verification.status, 'verified');
  assert.ok(completed.verification.warnings.some((item) => /fallback local/i.test(item)));
  assert.ok(completed.verification.evidence.some((item) => /escritura verificada/.test(item)));
  assert.equal(fs.readFileSync(path.join(rootDir, 'subagent', 'acp.txt'), 'utf8'), 'ok session acp\n');

  const subagents = engine.listSubagents(session.sessionId);
  assert.equal(subagents.length, 1);
  assert.equal(subagents[0].runtimeBackend, 'acp:codex');

  engine.stop();
  console.log('session_engine_acp_local_subagent_smoke: ok');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
