'use strict';

const path = require('path');
const { createTaskSandbox } = require('./task-sandbox');

function normalizeSubagent(agent, index) {
  const item = agent && typeof agent === 'object' ? agent : { goal: String(agent || '') };
  return {
    id: String(item.id || item.name || `subagent-${index + 1}`).trim(),
    role: String(item.role || item.kind || 'worker').trim(),
    goal: String(item.goal || item.prompt || '').trim(),
    provider: String(item.provider || '').trim(),
    model: String(item.model || '').trim(),
    dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn.map(String) : [],
    metadata: item.metadata && typeof item.metadata === 'object' ? { ...item.metadata } : {},
    command: Array.isArray(item.command) ? item.command.map(String) : (item.command ? String(item.command) : ''),
    cwd: item.cwd ? String(item.cwd) : '',
  };
}

async function runSubagentsParallel(options = {}) {
  const agents = (Array.isArray(options.agents) ? options.agents : []).map(normalizeSubagent);
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
  const sandboxRoot = path.resolve(options.sandboxRoot || path.join(workspaceRoot, '.freejt7', 'subagents'));
  const worker = typeof options.worker === 'function'
    ? options.worker
    : async ({ subagent, sandbox }) => {
      if (subagent.command) {
        const processResult = await sandbox.runProcess(subagent.command, {
          cwd: subagent.cwd || sandbox.taskRoot,
          timeoutMs: options.processTimeoutMs,
          maxOutputBytes: options.maxOutputBytes,
          env: options.processEnv || {},
        });
        return {
          status: processResult.ok ? 'completed' : 'failed',
          summary: processResult.ok
            ? `Subagente ${subagent.id} ejecuto proceso aislado.`
            : `Subagente ${subagent.id} fallo en proceso aislado.`,
          process: processResult,
        };
      }
      return { status: 'completed', summary: `Subagente ${subagent.id} planificado sin worker externo.` };
    };
  const maxConcurrency = Math.max(1, Number(options.maxConcurrency || agents.length || 1));
  const results = [];
  const running = new Set();
  let cursor = 0;

  async function launch(subagent, index) {
    const sandbox = createTaskSandbox({
      workspaceRoot,
      sandboxRoot,
      taskId: subagent.id,
      allowedPaths: [path.join(sandboxRoot, subagent.id)],
      allowedCommands: options.allowedCommands || [],
      networkAllowed: Boolean(options.networkAllowed),
    });
    const startedAt = new Date().toISOString();
    try {
      const output = await worker({ subagent, sandbox, index });
      return {
        subagent,
        sandbox: { taskRoot: sandbox.taskRoot, networkAllowed: sandbox.networkAllowed, processIsolation: true },
        status: output?.status || 'completed',
        summary: String(output?.summary || '').trim(),
        output,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        subagent,
        sandbox: { taskRoot: sandbox.taskRoot, networkAllowed: sandbox.networkAllowed, processIsolation: true },
        status: 'failed',
        summary: String(error?.message || error),
        error: String(error?.stack || error?.message || error),
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }
  }

  while (cursor < agents.length || running.size > 0) {
    while (cursor < agents.length && running.size < maxConcurrency) {
      const index = cursor;
      const promise = launch(agents[index], index).then((result) => {
        results[index] = result;
        running.delete(promise);
      });
      running.add(promise);
      cursor += 1;
    }
    if (running.size > 0) {
      await Promise.race(Array.from(running));
    }
  }

  const ordered = results.filter(Boolean);
  return {
    status: ordered.some((item) => item.status === 'failed') ? 'failed' : 'completed',
    parallel: maxConcurrency > 1,
    maxConcurrency,
    subagentCount: agents.length,
    results: ordered,
    summary: `Free JT7 ejecuto ${ordered.length} subagente(s) con concurrencia ${maxConcurrency}.`,
  };
}

module.exports = {
  normalizeSubagent,
  runSubagentsParallel,
};
