'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_ALLOWED_COMMANDS = Object.freeze(['node', 'npm', 'python', 'python3', 'git', 'ruby']);
const DEFAULT_PROCESS_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const DENIED_ENV_PATTERNS = [/^.*_?PROXY$/i, /^GITHUB_TOKEN$/i, /^GH_TOKEN$/i, /^NPM_TOKEN$/i, /^OPENAI_API_KEY$/i, /^ANTHROPIC_API_KEY$/i, /^DEEPSEEK_API_KEY$/i, /^GEMINI_API_KEY$/i];
const SAFE_ENV_KEYS = Object.freeze(['PATH', 'HOME', 'USER', 'USERNAME', 'SHELL', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'NODE_PATH']);

function normalizePath(filePath) {
  return path.resolve(String(filePath || '') || process.cwd());
}

function isInside(candidate, parent) {
  const rel = path.relative(parent, candidate);
  return rel === '' || (rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function sanitizeTaskId(taskId) {
  return String(taskId || 'task')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'task';
}

function sanitizeEnv(baseEnv = process.env, overrides = {}) {
  const env = {};
  for (const key of SAFE_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(baseEnv, key)) {
      env[key] = String(baseEnv[key]);
    }
  }
  for (const [key, value] of Object.entries(overrides || {})) {
    if (!key || DENIED_ENV_PATTERNS.some((pattern) => pattern.test(key))) continue;
    if (value !== undefined && value !== null) env[key] = String(value);
  }
  env.FREEJT7_SANDBOX = '1';
  return env;
}

function splitCommand(command) {
  if (Array.isArray(command)) {
    return { bin: String(command[0] || '').trim(), args: command.slice(1).map(String) };
  }
  const text = String(command || '').trim();
  if (!text) return { bin: '', args: [] };
  const parts = text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return {
    bin: String(parts[0] || '').replace(/^['"]|['"]$/g, ''),
    args: parts.slice(1).map((part) => String(part).replace(/^['"]|['"]$/g, '')),
  };
}

function createTaskSandbox(options = {}) {
  const workspaceRoot = normalizePath(options.workspaceRoot || process.cwd());
  const sandboxRoot = normalizePath(options.sandboxRoot || path.join(os.tmpdir(), 'freejt7-task-sandbox'));
  const taskId = sanitizeTaskId(options.taskId || `task-${Date.now()}`);
  const taskRoot = normalizePath(path.join(sandboxRoot, taskId));
  const allowedPaths = Array.from(new Set([
    workspaceRoot,
    taskRoot,
    ...(Array.isArray(options.allowedPaths) ? options.allowedPaths : []),
  ].map(normalizePath)));
  const allowedCommands = Array.from(new Set([
    ...DEFAULT_ALLOWED_COMMANDS,
    ...(Array.isArray(options.allowedCommands) ? options.allowedCommands : []),
  ].map((item) => String(item || '').trim()).filter(Boolean)));
  const networkAllowed = Boolean(options.networkAllowed);
  const processTimeoutMs = Math.max(100, Number(options.processTimeoutMs || DEFAULT_PROCESS_TIMEOUT_MS));
  const maxOutputBytes = Math.max(1024, Number(options.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES));

  fs.mkdirSync(taskRoot, { recursive: true });

  function assertPathAllowed(targetPath) {
    const candidate = normalizePath(targetPath);
    if (!allowedPaths.some((allowed) => isInside(candidate, allowed))) {
      const error = new Error(`Free JT7 sandbox: ruta fuera de allowlist: ${candidate}`);
      error.code = 'FREEJT7_SANDBOX_PATH_DENIED';
      throw error;
    }
    return candidate;
  }

  function assertCommandAllowed(command) {
    const parsed = splitCommand(command);
    const base = path.basename(parsed.bin).replace(/\.(cmd|exe|bat)$/i, '');
    if (!base || !allowedCommands.includes(base)) {
      const error = new Error(`Free JT7 sandbox: comando fuera de allowlist: ${base || '(vacio)'}`);
      error.code = 'FREEJT7_SANDBOX_COMMAND_DENIED';
      throw error;
    }
    return Array.isArray(command) ? [parsed.bin, ...parsed.args] : String(command || '').trim();
  }

  function assertNetworkAllowed(url) {
    if (!networkAllowed) {
      const error = new Error(`Free JT7 sandbox: red bloqueada por defecto (${url || 'sin-url'})`);
      error.code = 'FREEJT7_SANDBOX_NETWORK_DENIED';
      throw error;
    }
    return String(url || '').trim();
  }

  function evaluateToolRequest(request = {}) {
    try {
      if (request.path) assertPathAllowed(request.path);
      if (request.cwd) assertPathAllowed(request.cwd);
      if (request.command) assertCommandAllowed(request.command);
      if (request.url || request.network === true) assertNetworkAllowed(request.url || 'network');
      return { allowed: true, decision: 'allow', reason: 'sandbox-allow' };
    } catch (error) {
      return { allowed: false, decision: 'deny', reason: String(error.message || error), code: error.code || 'FREEJT7_SANDBOX_DENIED' };
    }
  }

  function runProcess(command, runOptions = {}) {
    const parsed = splitCommand(Array.isArray(command) ? command : String(command || ''));
    assertCommandAllowed([parsed.bin, ...parsed.args]);
    const cwd = assertPathAllowed(runOptions.cwd || taskRoot);
    const timeoutMs = Math.max(100, Number(runOptions.timeoutMs || processTimeoutMs));
    const outputLimit = Math.max(1024, Number(runOptions.maxOutputBytes || maxOutputBytes));
    const env = sanitizeEnv(runOptions.baseEnv || process.env, runOptions.env || {});
    const startedAt = new Date().toISOString();

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;
      let truncated = false;
      const child = spawn(parsed.bin, parsed.args, {
        cwd,
        env,
        shell: false,
        windowsHide: true,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
      }, timeoutMs);
      const append = (target, chunk) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
        const current = target === 'stdout' ? stdout : stderr;
        if (Buffer.byteLength(current + text, 'utf8') > outputLimit) {
          truncated = true;
          const remaining = Math.max(0, outputLimit - Buffer.byteLength(current, 'utf8'));
          if (remaining > 0) {
            if (target === 'stdout') stdout += text.slice(0, remaining);
            else stderr += text.slice(0, remaining);
          }
          child.kill('SIGTERM');
          return;
        }
        if (target === 'stdout') stdout += text;
        else stderr += text;
      };
      child.stdout.on('data', (chunk) => append('stdout', chunk));
      child.stderr.on('data', (chunk) => append('stderr', chunk));
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          status: null,
          signal: null,
          error: String(error.message || error),
          stdout,
          stderr,
          timedOut: false,
          killed,
          truncated,
          command: parsed.bin,
          args: parsed.args,
          cwd,
          startedAt,
          finishedAt: new Date().toISOString(),
          isolation: { process: true, shell: false, env: 'sanitized', networkAllowed },
        });
      });
      child.on('close', (status, signal) => {
        clearTimeout(timer);
        resolve({
          ok: status === 0 && !killed && !truncated,
          status,
          signal,
          stdout,
          stderr,
          timedOut: killed,
          killed,
          truncated,
          command: parsed.bin,
          args: parsed.args,
          cwd,
          startedAt,
          finishedAt: new Date().toISOString(),
          isolation: { process: true, shell: false, env: 'sanitized', networkAllowed },
        });
      });
    });
  }

  return {
    taskId,
    workspaceRoot,
    sandboxRoot,
    taskRoot,
    allowedPaths,
    allowedCommands,
    networkAllowed,
    processTimeoutMs,
    maxOutputBytes,
    assertPathAllowed,
    assertCommandAllowed,
    assertNetworkAllowed,
    evaluateToolRequest,
    runProcess,
  };
}

module.exports = {
  DEFAULT_ALLOWED_COMMANDS,
  DEFAULT_PROCESS_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_BYTES,
  createTaskSandbox,
  isInside,
  sanitizeEnv,
  splitCommand,
};
