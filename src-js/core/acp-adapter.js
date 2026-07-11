'use strict';

const path = require('path');
const { runLocalAgentTask } = require('./local-agent-runtime');

const DEFAULT_HARNESS = 'codex';
const KNOWN_HARNESSES = new Set(['codex', 'claude-code', 'opencode']);

function normalizeAcpBackend(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return `acp:${DEFAULT_HARNESS}`;
  if (raw.startsWith('acp:')) {
    const harness = raw.split(':').slice(1).join(':').trim() || DEFAULT_HARNESS;
    return `acp:${harness}`;
  }
  return `acp:${raw}`;
}

function parseAcpBackend(value) {
  const runtimeBackend = normalizeAcpBackend(value);
  const harness = runtimeBackend.split(':').slice(1).join(':') || DEFAULT_HARNESS;
  return {
    runtimeBackend,
    harness,
    known: KNOWN_HARNESSES.has(harness),
  };
}

function normalizeGoal(goal, options = {}) {
  return String(goal || options.goal || options.prompt || '').trim();
}

function buildAcpRequest(goal, options = {}) {
  const parsed = parseAcpBackend(options.runtimeBackend || options.backend || `acp:${DEFAULT_HARNESS}`);
  const workspacePath = path.resolve(String(options.workspacePath || process.cwd()));
  const requestGoal = normalizeGoal(goal, options);
  return {
    protocol: 'acp',
    version: 1,
    harness: parsed.harness,
    runtimeBackend: parsed.runtimeBackend,
    knownHarness: parsed.known,
    goal: requestGoal,
    workspacePath,
    provider: String(options.provider || '').trim(),
    model: String(options.model || '').trim(),
    authProfile: String(options.authProfile || 'default').trim() || 'default',
    policyProfile: String(options.policyProfile || 'coding').trim().toLowerCase() || 'coding',
    sessionId: String(options.sessionId || '').trim(),
    runId: String(options.runId || '').trim(),
    conversationRequest: options.conversationRequest || null,
    actions: Array.isArray(options.actions) ? options.actions : [],
    verificationCommands: Array.isArray(options.verificationCommands) ? options.verificationCommands : [],
    createdAt: new Date().toISOString(),
  };
}

function normalizeAcpResult(result, request, fallback = {}) {
  const harness = request.harness || DEFAULT_HARNESS;
  const executionRoute = String(fallback.executionRoute || result?.executionRoute || `acp:${harness}`).trim();
  const summary = String(
    result?.final?.summary
    || result?.run?.summary
    || result?.summary
    || fallback.summary
    || 'ACP task completed.'
  );
  const final = result?.final && typeof result.final === 'object'
    ? { ...result.final }
    : {
      status: 'completed',
      summary,
      changedFiles: [],
      verification: [],
      residualRisks: [],
    };
  final.summary = String(final.summary || summary);
  final.changedFiles = Array.isArray(final.changedFiles) ? final.changedFiles : [];
  final.verification = Array.isArray(final.verification) ? final.verification : [];
  final.residualRisks = Array.isArray(final.residualRisks) ? final.residualRisks : [];

  return {
    provider: String(result?.provider || request.provider || 'freejt7-acp').trim() || 'freejt7-acp',
    model: String(result?.model || request.model || `acp-${harness}`).trim() || `acp-${harness}`,
    executionMode: 'agent',
    executionRoute,
    acp: {
      protocol: request.protocol,
      version: request.version,
      harness,
      runtimeBackend: request.runtimeBackend,
      knownHarness: request.knownHarness,
      fallback: Boolean(fallback.fallback),
    },
    run: {
      status: String(result?.run?.status || final.status || 'completed'),
      summary,
      provider: String(result?.provider || request.provider || 'freejt7-acp').trim() || 'freejt7-acp',
      model: String(result?.model || request.model || `acp-${harness}`).trim() || `acp-${harness}`,
    },
    final,
    raw: result || null,
  };
}

async function runAcpTask(goal, options = {}) {
  const request = buildAcpRequest(goal, options);
  const executeHarnessTask = typeof options.executeHarnessTask === 'function'
    ? options.executeHarnessTask
    : null;

  if (executeHarnessTask) {
    const result = await executeHarnessTask(request);
    return normalizeAcpResult(result, request);
  }

  const local = await runLocalAgentTask(request.goal, {
    ...options,
    workspacePath: request.workspacePath,
    provider: request.provider || 'local',
    model: request.model || `acp-${request.harness}-local`,
    runtimeBackend: request.runtimeBackend,
    fallbackReason: `ACP ${request.harness} sin harness externo disponible; fallback local seguro.`,
  });

  return normalizeAcpResult(local, request, {
    fallback: true,
    executionRoute: `${request.runtimeBackend}:local-fallback`,
    summary: local?.final?.summary || local?.summary || 'ACP fallback local completado.',
  });
}

module.exports = {
  DEFAULT_HARNESS,
  KNOWN_HARNESSES,
  normalizeAcpBackend,
  parseAcpBackend,
  buildAcpRequest,
  normalizeAcpResult,
  runAcpTask,
};
