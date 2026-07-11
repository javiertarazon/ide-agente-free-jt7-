'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_OPENCLAW_CONFIG = Object.freeze({
  gateway: {
    mode: 'local',
    bind: 'loopback',
    port: 18789,
    reload: { mode: 'hybrid' },
  },
  tools: {
    profile: 'coding',
    exec: {
      host: 'sandbox',
      security: 'allowlist',
      ask: 'on-miss',
    },
  },
  plugins: {
    enabled: true,
    entries: {},
  },
  web: {
    enabled: true,
  },
});

const PROVIDER_SPECS = Object.freeze({
  openrouter: {
    modelPrefix: 'openrouter',
    envKeys: ['OPENROUTER_API_KEY'],
  },
  hf: {
    modelPrefix: 'huggingface',
    envKeys: ['HUGGINGFACE_HUB_TOKEN', 'HF_TOKEN', 'HUGGINGFACE_API_KEY'],
  },
  zai: {
    modelPrefix: 'zai',
    envKeys: ['ZAI_API_KEY'],
  },
  clod: {
    modelPrefix: 'clod',
    envKeys: ['CLOD_API_KEY'],
    customProviderBase: {
      baseUrl: 'https://api.clod.io/v1',
      api: 'openai-completions',
      auth: 'api-key',
      apiKey: {
        source: 'env',
        provider: 'default',
        id: 'CLOD_API_KEY',
      },
    },
  },
});

function stripNullBytes(value) {
  return String(value || '').replace(/\0/g, '');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return cloneJson(fallback);
  }
}

function normalizeModelSuffix(provider, model) {
  const raw = String(model || '').trim();
  if (!raw) return '';
  if (provider === 'openrouter') {
    return raw.replace(/^openrouter\//i, '');
  }
  if (provider === 'hf') {
    return raw.replace(/^hf\//i, '').replace(/^huggingface\//i, '');
  }
  if (provider === 'zai') {
    return raw.replace(/^z-ai\//i, '').replace(/^zai\//i, '');
  }
  if (provider === 'clod') {
    return raw.replace(/^clod\//i, '');
  }
  return raw;
}

function normalizeOpenClawModel(provider, model) {
  const spec = PROVIDER_SPECS[provider];
  if (!spec) {
    throw new Error(`Proveedor no soportado por OpenClaw agent: ${provider}`);
  }
  const suffix = normalizeModelSuffix(provider, model);
  return suffix ? `${spec.modelPrefix}/${suffix}` : spec.modelPrefix;
}

function buildOpenClawProviderModels(provider, model) {
  const normalizedSuffix = normalizeModelSuffix(provider, model) || provider;
  return [
    {
      id: normalizedSuffix,
      name: normalizedSuffix,
      api: provider === 'clod' ? 'openai-completions' : undefined,
      reasoning: true,
      input: ['text'],
    },
  ].map((entry) => Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined),
  ));
}

function getOpenClawRuntimePaths(runtimeRoot) {
  const baseDir = path.join(runtimeRoot, '.openclaw');
  return {
    baseDir,
    configPath: path.join(baseDir, 'openclaw.json'),
    stateDir: path.join(baseDir, 'state'),
  };
}

function isProcessAlive(pid) {
  const numericPid = Number(pid || 0);
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return false;
  }
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function readLockPid(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const match = raw.match(/\bpid\s*=\s*(\d+)\b/i) || raw.match(/\b(\d{2,})\b/);
    return match ? Number(match[1]) : 0;
  } catch (_) {
    return 0;
  }
}

function collectFilesRecursive(rootDir, predicate, maxFiles = 2000) {
  const files = [];
  const stack = [rootDir];
  while (stack.length && files.length < maxFiles) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && predicate(fullPath, entry.name)) {
        files.push(fullPath);
        if (files.length >= maxFiles) break;
      }
    }
  }
  return files;
}

function cleanupOpenClawStaleLocks(runtimeRoot, options = {}) {
  const paths = getOpenClawRuntimePaths(runtimeRoot);
  const maxAgeMs = Math.max(1_000, Number(options.maxAgeMs || 30_000));
  const removed = [];
  const kept = [];
  if (!fs.existsSync(paths.stateDir)) {
    return { removed, kept, stateDir: paths.stateDir };
  }
  const lockFiles = collectFilesRecursive(
    paths.stateDir,
    (_fullPath, name) => name.endsWith('.lock'),
    Number(options.maxFiles || 2000),
  );
  const now = Date.now();
  for (const lockPath of lockFiles) {
    let stat = null;
    try {
      stat = fs.statSync(lockPath);
    } catch (_) {
      continue;
    }
    const pid = readLockPid(lockPath);
    const alive = pid > 0 && isProcessAlive(pid);
    const oldEnough = now - stat.mtimeMs >= maxAgeMs;
    if (alive && !oldEnough) {
      kept.push({ path: lockPath, pid, reason: 'active-process' });
      continue;
    }
    if (alive && oldEnough) {
      kept.push({ path: lockPath, pid, reason: 'process-still-alive' });
      continue;
    }
    try {
      fs.rmSync(lockPath, { force: true });
      removed.push({ path: lockPath, pid });
    } catch (error) {
      kept.push({ path: lockPath, pid, reason: String(error?.message || error) });
    }
  }
  return { removed, kept, stateDir: paths.stateDir };
}

function applyOpenClawRuntimeConfig(existingConfig, options = {}) {
  const {
    provider,
    model,
    fallbackModels = [],
    policyProfile = 'coding',
    authProfile = 'default',
    workspacePath,
    mcpServerName = 'free-jt7-local',
    mcpCommand = 'node',
    mcpArgs = [],
  } = options;

  const next = existingConfig && typeof existingConfig === 'object'
    ? cloneJson(existingConfig)
    : cloneJson(DEFAULT_OPENCLAW_CONFIG);

  next.gateway = next.gateway && typeof next.gateway === 'object' ? next.gateway : {};
  next.gateway.mode = 'local';
  next.gateway.bind = next.gateway.bind || 'loopback';
  next.gateway.port = Number(next.gateway.port || 18789);
  next.gateway.reload = next.gateway.reload && typeof next.gateway.reload === 'object'
    ? next.gateway.reload
    : { mode: 'hybrid' };
  next.tools = next.tools && typeof next.tools === 'object' ? next.tools : {};
  next.tools.profile = String(policyProfile || 'coding').trim() || 'coding';
  next.tools.exec = next.tools.exec && typeof next.tools.exec === 'object' ? next.tools.exec : {};
  next.tools.exec.host = next.tools.exec.host || 'sandbox';
  next.tools.exec.security = next.tools.exec.security || 'allowlist';
  next.tools.exec.ask = next.tools.exec.ask || 'on-miss';
  next.web = next.web && typeof next.web === 'object' ? next.web : { enabled: true };
  next.web.enabled = next.web.enabled !== false;
  next.plugins = next.plugins && typeof next.plugins === 'object' ? next.plugins : { enabled: true, entries: {} };
  next.plugins.enabled = next.plugins.enabled !== false;
  next.plugins.entries = next.plugins.entries && typeof next.plugins.entries === 'object' ? next.plugins.entries : {};

  next.agents = next.agents && typeof next.agents === 'object' ? next.agents : {};
  next.agents.defaults = next.agents.defaults && typeof next.agents.defaults === 'object' ? next.agents.defaults : {};
  next.agents.defaults.model = next.agents.defaults.model && typeof next.agents.defaults.model === 'object'
    ? next.agents.defaults.model
    : {};
  next.agents.defaults.model.primary = normalizeOpenClawModel(provider, model);
  const normalizedFallbackModels = Array.isArray(fallbackModels)
    ? fallbackModels
      .map((entry) => {
        try {
          if (typeof entry === 'string') {
            const [providerPart, ...modelParts] = entry.split(':');
            const fallbackProvider = String(providerPart || provider || '').trim().toLowerCase();
            const fallbackModel = String(modelParts.join(':') || '').trim();
            if (!fallbackProvider) return null;
            return normalizeOpenClawModel(fallbackProvider, fallbackModel || model || provider);
          }
          if (!entry || typeof entry !== 'object') return null;
          const fallbackProvider = String(entry.provider || provider || '').trim().toLowerCase();
          const fallbackModel = String(entry.model || model || '').trim();
          if (!fallbackProvider) return null;
          return normalizeOpenClawModel(fallbackProvider, fallbackModel || model || provider);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
    : [];
  if (normalizedFallbackModels.length > 0) {
    next.agents.defaults.model.fallbacks = Array.from(new Set(normalizedFallbackModels));
  }

  next.mcp = next.mcp && typeof next.mcp === 'object' ? next.mcp : {};
  next.mcp.servers = next.mcp.servers && typeof next.mcp.servers === 'object' ? next.mcp.servers : {};
  next.mcp.servers[mcpServerName] = {
    command: mcpCommand,
    args: Array.isArray(mcpArgs) ? mcpArgs.slice() : [],
    cwd: workspacePath || process.cwd(),
  };

  next.models = next.models && typeof next.models === 'object' ? next.models : {};
  next.models.mode = next.models.mode || 'merge';
  next.models.providers = next.models.providers && typeof next.models.providers === 'object' ? next.models.providers : {};

  // Evita que providers custom stale exijan secrets no relacionados al provider activo.
  if (next.models.providers.clod && provider !== 'clod') {
    delete next.models.providers.clod;
  }

  if (provider === 'clod') {
    next.models.providers.clod = {
      ...cloneJson(PROVIDER_SPECS.clod.customProviderBase),
      models: buildOpenClawProviderModels(provider, model),
    };
  }

  next.meta = next.meta && typeof next.meta === 'object' ? next.meta : {};
  next.meta.lastTouchedVersion = 'free-jt7-openclaw-agent';
  next.meta.lastTouchedAt = new Date().toISOString();
  return next;
}

function ensureOpenClawRuntimeConfig(runtimeRoot, options = {}) {
  const paths = getOpenClawRuntimePaths(runtimeRoot);
  fs.mkdirSync(paths.baseDir, { recursive: true });
  fs.mkdirSync(paths.stateDir, { recursive: true });

  const fallback = cloneJson(DEFAULT_OPENCLAW_CONFIG);
  const current = fs.existsSync(paths.configPath)
    ? loadJsonSafe(paths.configPath, fallback)
    : fallback;
  const next = applyOpenClawRuntimeConfig(current, options);
  const currentJson = JSON.stringify(current);
  const nextJson = JSON.stringify(next, null, 2);
  const changed = !fs.existsSync(paths.configPath) || currentJson !== JSON.stringify(next);
  if (changed) {
    fs.writeFileSync(paths.configPath, `${nextJson}\n`, 'utf8');
  }
  return {
    ...paths,
    changed,
    config: next,
  };
}

function buildOpenClawAgentArgs(options = {}) {
  const args = ['agent', '--agent', 'main', '--local', '--json'];
  const sessionId = stripNullBytes(options.sessionId || '').trim();
  if (sessionId) {
    args.push('--session-id', sessionId);
  }
  const thinking = stripNullBytes(options.thinking || 'medium').trim();
  if (thinking) {
    args.push('--thinking', thinking);
  }
  const timeoutSeconds = Number(options.timeoutSeconds || 600);
  if (Number.isFinite(timeoutSeconds) && timeoutSeconds > 0) {
    args.push('--timeout', String(timeoutSeconds));
  }
  args.push('--message', stripNullBytes(options.message || ''));
  return args.map((value) => stripNullBytes(value));
}

function buildOpenClawTaskSessionId(options = {}) {
  const raw = String(options.runId || options.taskId || options.sessionId || '').trim();
  const normalized = raw.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 96);
  return normalized || '';
}

function getOpenClawGatewayConfig(configLike = {}) {
  const root = configLike && typeof configLike === 'object'
    ? (configLike.config && typeof configLike.config === 'object' ? configLike.config : configLike)
    : {};
  const gateway = root.gateway && typeof root.gateway === 'object' ? root.gateway : {};
  const bind = String(gateway.bind || 'loopback').trim().toLowerCase() || 'loopback';
  const rawPort = Number(gateway.port || 18789);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 18789;
  return { bind, port };
}

function buildOpenClawGatewayUrl(configLike = {}) {
  const gateway = getOpenClawGatewayConfig(configLike);
  const host = gateway.bind === 'loopback' ? '127.0.0.1' : '127.0.0.1';
  return `ws://${host}:${gateway.port}`;
}

function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function extractJsonTail(rawText) {
  const text = stripAnsi(rawText).trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {}

  const starts = [];
  for (let i = text.lastIndexOf('{'); i >= 0; i = text.lastIndexOf('{', i - 1)) {
    starts.push(i);
    if (starts.length >= 100) break;
  }
  for (const start of starts) {
    const candidate = text.slice(start).trim();
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }
  return null;
}

function summarizeOpenClawPayload(payload, rawText) {
  if (payload && typeof payload === 'object') {
    if (typeof payload.summary === 'string' && payload.summary.trim()) {
      return payload.summary.trim();
    }
    if (typeof payload.finalAssistantVisibleText === 'string' && payload.finalAssistantVisibleText.trim()) {
      return payload.finalAssistantVisibleText.trim();
    }
    if (typeof payload.finalAssistantRawText === 'string' && payload.finalAssistantRawText.trim()) {
      return payload.finalAssistantRawText.trim();
    }
    if (typeof payload.text === 'string' && payload.text.trim()) {
      return payload.text.trim();
    }
    if (typeof payload.reply === 'string' && payload.reply.trim()) {
      return payload.reply.trim();
    }
    if (Array.isArray(payload.payloads)) {
      const texts = payload.payloads
        .map((item) => String(item?.text || '').trim())
        .filter(Boolean);
      if (texts.length > 0) {
        return texts.join('\n\n');
      }
    }
    if (payload.payload && typeof payload.payload === 'object') {
      const nestedSummary = summarizeOpenClawPayload(payload.payload, '');
      if (nestedSummary) {
        return nestedSummary;
      }
    }
    if (Array.isArray(payload.outputs)) {
      const texts = payload.outputs
        .map((item) => String(item?.text || '').trim())
        .filter(Boolean);
      if (texts.length > 0) {
        return texts.join('\n\n');
      }
    }
  }

  const lines = stripAnsi(rawText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('[agents/auth-profiles]'));
  return lines[lines.length - 1] || '';
}

function isOpenClawFailure(result = {}) {
  if (Number(result.code || 0) !== 0) {
    return true;
  }
  const summary = String(result.summary || '').trim();
  if (!summary) {
    return true;
  }
  return (
    /^⚠️\s*Agent couldn't generate a response/i.test(summary) ||
    /^FailoverError:/i.test(summary) ||
    /^FallbackSummaryError:/i.test(summary) ||
    /^Error:/i.test(summary) ||
    /No API key found/i.test(summary) ||
    /\b401\b/.test(summary) ||
    /\b403\b/.test(summary)
  );
}

function isOpenClawGatewayReady(statusText) {
  const text = stripAnsi(statusText).trim();
  if (!text) {
    return false;
  }
  return /RPC probe:\s*ok\b/i.test(text) || /Listening:\s*[^\s]+/i.test(text);
}

function buildOpenClawEnv(provider, apiKey, baseEnv = {}) {
  const spec = PROVIDER_SPECS[provider];
  if (!spec) {
    throw new Error(`Proveedor no soportado por OpenClaw agent: ${provider}`);
  }
  const env = { ...baseEnv };
  for (const key of spec.envKeys) {
    env[key] = apiKey;
  }
  return env;
}

function buildSubordinateBackendDescriptor(options = {}) {
  const executionRoute = String(options.executionRoute || options.primaryRoute || '').trim();
  const runtimeBackend = String(options.runtimeBackend || '').trim().toLowerCase();
  const fallbackSelected = String(options.fallbackSelected || options.fallback || '').trim().toLowerCase();
  let kind = '';

  if (fallbackSelected === 'provider-direct' || /provider-direct/i.test(executionRoute)) {
    kind = 'provider-direct';
  } else if (executionRoute.startsWith('acp:') || runtimeBackend.startsWith('acp:')) {
    kind = 'acp-harness';
  } else if (executionRoute === 'openclaw-agent' || runtimeBackend === 'openclaw') {
    kind = 'openclaw-harness';
  } else if (/local-agent/i.test(executionRoute) || runtimeBackend === 'local') {
    kind = 'local-tools';
  } else if (executionRoute === 'copilot' || runtimeBackend === 'copilot') {
    kind = 'copilot-legacy';
  } else {
    kind = executionRoute || runtimeBackend || 'unknown-backend';
  }

  const descriptor = {
    kind,
    provider: String(options.provider || '').trim(),
    model: String(options.model || '').trim(),
    runtimeBackend: runtimeBackend || executionRoute || 'auto',
    authProfile: String(options.authProfile || 'default').trim() || 'default',
  };
  if (fallbackSelected) {
    descriptor.fallbackSelected = fallbackSelected;
  }
  return descriptor;
}

module.exports = {
  PROVIDER_SPECS,
  normalizeModelSuffix,
  normalizeOpenClawModel,
  getOpenClawRuntimePaths,
  applyOpenClawRuntimeConfig,
  ensureOpenClawRuntimeConfig,
  cleanupOpenClawStaleLocks,
  buildOpenClawAgentArgs,
  buildOpenClawTaskSessionId,
  getOpenClawGatewayConfig,
  buildOpenClawGatewayUrl,
  extractJsonTail,
  summarizeOpenClawPayload,
  isOpenClawFailure,
  isOpenClawGatewayReady,
  buildOpenClawEnv,
  buildOpenClawProviderModels,
  buildSubordinateBackendDescriptor,
};
