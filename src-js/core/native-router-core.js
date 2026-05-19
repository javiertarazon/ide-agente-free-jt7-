'use strict';

const ROUTER_DEFAULTS = {
  reviewEnabled: true,
  reviewMaxFindings: 12,
  reviewMinChangedFiles: 2,
  autoFixEnabled: true,
  autoFixMaxPasses: 1,
  autoApproveSafeTools: true,
};

const ROUTER_CONCURRENCY_ERROR = 'Free JT7: ya hay una ejecucion activa del router nativo. Espera a que termine antes de lanzar otra.';
const REVIEW_BLOCKING_SEVERITIES = new Set(['critical', 'high']);
const REVIEW_SEVERITY_ORDER = new Set(['info', 'low', 'medium', 'high', 'critical']);

let activeRouterCoreRunToken = null;

function beginRouterRunLock() {
  if (activeRouterCoreRunToken) {
    throw new Error(ROUTER_CONCURRENCY_ERROR);
  }
  const token = { startedAt: Date.now() };
  activeRouterCoreRunToken = token;
  return () => {
    if (activeRouterCoreRunToken === token) {
      activeRouterCoreRunToken = null;
    }
  };
}

async function runWithRouterRunLock(work) {
  const release = beginRouterRunLock();
  try {
    return await work();
  } finally {
    release();
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function sanitizeText(value, maxLength = 2000) {
  const text = String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
}

function isShellToolName(toolName) {
  const name = String(toolName || '').trim().toLowerCase();
  if (!name) return false;
  if (name.includes('shell') || name.includes('terminal')) return true;
  return ['bash', 'sh', 'exec', 'run_command', 'run_in_terminal'].includes(name);
}

function extractToolCommand(toolArgs) {
  if (typeof toolArgs === 'string') return toolArgs;
  if (!isRecord(toolArgs)) return '';
  for (const key of ['command', 'cmd', 'input', 'script', 'text']) {
    if (typeof toolArgs[key] === 'string' && toolArgs[key].trim()) return toolArgs[key];
  }
  if (Array.isArray(toolArgs.args) && toolArgs.args.length > 0) {
    return toolArgs.args.map((item) => String(item || '')).join(' ').trim();
  }
  return '';
}

function isDestructiveShell(command) {
  const text = String(command || '').toLowerCase();
  return ['rm -rf', 'git reset --hard', 'format ', 'del /f', 'remove-item -recurse -force', 'drop database']
    .some((pattern) => text.includes(pattern));
}

function summarizeToolResult(toolResult) {
  if (toolResult == null) return '';
  if (typeof toolResult === 'string') return sanitizeText(toolResult, 2000);
  if (Array.isArray(toolResult)) return sanitizeText(JSON.stringify(toolResult), 2000);
  if (isRecord(toolResult)) {
    const candidate = toolResult.output || toolResult.content || toolResult.result || toolResult.stdout || toolResult.message || JSON.stringify(toolResult);
    return sanitizeText(candidate, 2000);
  }
  return sanitizeText(String(toolResult), 2000);
}

function normalizePreToolHookOutput(value = {}) {
  if (!isRecord(value)) return {};
  const permissionDecision = String(
    value.permissionDecision != null
      ? value.permissionDecision
      : (value.approved === false ? 'deny' : value.approved === true ? 'allow' : ''),
  ).trim().toLowerCase();
  const normalized = {};
  if (['allow', 'deny', 'ask'].includes(permissionDecision)) normalized.permissionDecision = permissionDecision;
  const reason = String(value.permissionDecisionReason || value.reason || '').trim();
  if (reason) normalized.permissionDecisionReason = reason;
  if (Object.prototype.hasOwnProperty.call(value, 'modifiedArgs')) normalized.modifiedArgs = value.modifiedArgs;
  const additionalContext = String(value.additionalContext || '').trim();
  if (additionalContext) normalized.additionalContext = additionalContext;
  if (typeof value.suppressOutput === 'boolean') normalized.suppressOutput = value.suppressOutput;
  return normalized;
}

function normalizePostToolHookOutput(value = {}) {
  if (!isRecord(value)) return {};
  const normalized = {};
  if (Object.prototype.hasOwnProperty.call(value, 'modifiedResult')) normalized.modifiedResult = value.modifiedResult;
  const additionalContext = String(value.additionalContext || '').trim();
  if (additionalContext) normalized.additionalContext = additionalContext;
  if (typeof value.suppressOutput === 'boolean') normalized.suppressOutput = value.suppressOutput;
  return normalized;
}

function mergeHookOutputs(base = {}, next = {}) {
  return {
    ...base,
    ...next,
    permissionDecision: next.permissionDecision || base.permissionDecision,
    permissionDecisionReason: next.permissionDecisionReason || base.permissionDecisionReason,
    additionalContext: uniqueStrings([base.additionalContext, next.additionalContext]).join('\n').trim(),
    suppressOutput: typeof next.suppressOutput === 'boolean' ? next.suppressOutput : base.suppressOutput,
    modifiedArgs: Object.prototype.hasOwnProperty.call(next, 'modifiedArgs') ? next.modifiedArgs : base.modifiedArgs,
    modifiedResult: Object.prototype.hasOwnProperty.call(next, 'modifiedResult') ? next.modifiedResult : base.modifiedResult,
  };
}

function buildToolHookContext(input, meta = {}) {
  const toolName = String(input?.toolName || '').trim();
  const toolArgs = Object.prototype.hasOwnProperty.call(input || {}, 'toolArgs') ? input.toolArgs : undefined;
  return {
    runId: meta.runId || '',
    sessionId: meta.sessionId || '',
    stage: meta.stage || '',
    timestamp: Number(input?.timestamp || Date.now()),
    cwd: String(input?.cwd || meta.workingDirectory || '').trim(),
    toolName,
    toolArgs,
    command: extractToolCommand(toolArgs),
  };
}

function createNativeToolPolicy(input, config = {}) {
  const toolName = String(input?.toolName || '').trim();
  const command = extractToolCommand(input?.toolArgs);
  if (config?.autoApproveSafeTools === false) return {};
  if (isShellToolName(toolName) && isDestructiveShell(command)) {
    return {
      permissionDecision: 'deny',
      permissionDecisionReason: 'Blocked by Free JT7 native tool policy: destructive shell command.',
    };
  }
  return { permissionDecision: 'allow' };
}

function createSessionHooks({ pluginRuntime, bridge, runId, stage, workingDirectory, output, config }) {
  const emit = async (name, payload) => (pluginRuntime && typeof pluginRuntime.emit === 'function' ? pluginRuntime.emit(name, payload) : {});
  const log = (line) => output && typeof output.appendLine === 'function' && output.appendLine(line);
  return {
    onPreToolUse: async (input, invocation) => {
      const baseContext = buildToolHookContext(input, { runId, sessionId: invocation?.sessionId || '', stage, workingDirectory });
      const policyOutput = normalizePreToolHookOutput(createNativeToolPolicy(input, config));
      const pluginOutput = normalizePreToolHookOutput(await emit('preToolUse', { ...baseContext, ...policyOutput }));
      const finalOutput = mergeHookOutputs(policyOutput, pluginOutput);
      const decision = finalOutput.permissionDecision || 'allow';
      bridge?.appendSessionEvent?.(runId, 'tool-pre', {
        stage,
        sessionId: invocation?.sessionId || '',
        toolName: baseContext.toolName,
        command: sanitizeText(baseContext.command || '', 500),
        permissionDecision: decision,
        permissionDecisionReason: finalOutput.permissionDecisionReason || '',
        suppressOutput: Boolean(finalOutput.suppressOutput),
        modifiedArgs: Object.prototype.hasOwnProperty.call(finalOutput, 'modifiedArgs'),
      });
      bridge?.updateSessionState?.(runId, {
        lastToolEvent: { phase: 'pre', stage, toolName: baseContext.toolName, decision, reason: finalOutput.permissionDecisionReason || '', at: new Date(baseContext.timestamp).toISOString() },
      });
      log(`[freejt7-native-router] tool-pre stage=${stage} tool=${baseContext.toolName || 'unknown'} decision=${decision}`);
      return finalOutput;
    },
    onPostToolUse: async (input, invocation) => {
      const baseContext = buildToolHookContext(input, { runId, sessionId: invocation?.sessionId || '', stage, workingDirectory });
      const pluginOutput = normalizePostToolHookOutput(await emit('postToolUse', { ...baseContext, toolResult: input?.toolResult }));
      const finalOutput = mergeHookOutputs({}, pluginOutput);
      const resultPreview = summarizeToolResult(finalOutput.modifiedResult || input?.toolResult);
      bridge?.appendSessionEvent?.(runId, 'tool-post', {
        stage,
        sessionId: invocation?.sessionId || '',
        toolName: baseContext.toolName,
        command: sanitizeText(baseContext.command || '', 500),
        suppressOutput: Boolean(finalOutput.suppressOutput),
        modifiedResult: Object.prototype.hasOwnProperty.call(finalOutput, 'modifiedResult'),
        resultPreview,
      });
      bridge?.updateSessionState?.(runId, {
        lastToolEvent: { phase: 'post', stage, toolName: baseContext.toolName, resultPreview, at: new Date(baseContext.timestamp).toISOString() },
      });
      log(`[freejt7-native-router] tool-post stage=${stage} tool=${baseContext.toolName || 'unknown'}`);
      return finalOutput;
    },
  };
}

function normalizeReviewSeverity(value) {
  const severity = String(value || 'medium').trim().toLowerCase();
  return REVIEW_SEVERITY_ORDER.has(severity) ? severity : 'medium';
}

function normalizeFinding(item, index) {
  if (!isRecord(item)) return null;
  const title = String(item.title || item.summary || item.message || '').trim();
  const detail = String(item.detail || item.description || item.reason || title || '').trim();
  if (!title && !detail) return null;
  return {
    id: String(item.id || `finding-${index + 1}`),
    severity: normalizeReviewSeverity(item.severity),
    title: title || `Finding ${index + 1}`,
    detail: detail || title || `Finding ${index + 1}`,
    taskId: String(item.taskId || item.task || '').trim(),
    file: String(item.file || item.path || '').trim(),
    recommendation: String(item.recommendation || item.fix || item.suggestedFix || '').trim(),
  };
}

function normalizeFindingList(items, maxFindings) {
  const findings = [];
  for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
    const finding = normalizeFinding(item, index);
    if (finding) findings.push(finding);
    if (findings.length >= maxFindings) break;
  }
  return findings;
}

function collectExecutionChangedFiles(executionResults) {
  return uniqueStrings((executionResults || []).flatMap((item) => item?.files || []));
}

function collectFailedTaskIds(executionResults) {
  return uniqueStrings((executionResults || []).filter((item) => item?.status === 'failed').map((item) => item?.taskId || ''));
}

function shouldRunReviewStage(plan, executionResults, config) {
  if (!config?.reviewEnabled) return false;
  if (collectFailedTaskIds(executionResults).length > 0) return true;
  if ((plan?.tasks || []).some((task) => String(task?.risk || '').toLowerCase() === 'high')) return true;
  if ((executionResults || []).some((item) => Array.isArray(item?.residualRisks) && item.residualRisks.length > 0)) return true;
  return collectExecutionChangedFiles(executionResults).length >= Number(config?.reviewMinChangedFiles || ROUTER_DEFAULTS.reviewMinChangedFiles);
}

function createSkippedReviewResult(executionResults, reason = 'Review stage skipped by policy.') {
  const failedTasks = collectFailedTaskIds(executionResults);
  return {
    enabled: false,
    triggered: false,
    status: failedTasks.length > 0 ? 'blocked' : 'skipped',
    summary: reason,
    findings: [],
    fixesApplied: [],
    residualRisks: uniqueStrings((executionResults || []).flatMap((item) => item?.residualRisks || [])),
    closingGate: {
      passed: failedTasks.length === 0,
      reason: failedTasks.length === 0 ? reason : `Review stage skipped, but ${failedTasks.length} task(s) failed during execution.`,
      blockingFindings: [],
      failedTasks,
    },
    metrics: { findingCount: 0, blockingFindingCount: 0 },
  };
}

function normalizeReviewResult(review, plan, executionResults, config) {
  const maxFindings = Number(config?.reviewMaxFindings || ROUTER_DEFAULTS.reviewMaxFindings);
  const findings = normalizeFindingList(review?.findings, maxFindings);
  const failedTasks = collectFailedTaskIds(executionResults);
  if (findings.length === 0 && failedTasks.length > 0) {
    findings.push({
      id: 'execution-failure',
      severity: 'high',
      title: 'Hay tareas del executor fallidas',
      detail: `La etapa de ejecucion dejo fallidas: ${failedTasks.join(', ')}.`,
      taskId: failedTasks[0] || '',
      file: '',
      recommendation: 'Corregir las tareas fallidas antes de cerrar el router.',
    });
  }
  const blockingFindings = findings.filter((item) => REVIEW_BLOCKING_SEVERITIES.has(item.severity));
  const gatePassed = failedTasks.length === 0 && blockingFindings.length === 0;
  return {
    enabled: true,
    triggered: true,
    status: gatePassed ? 'approved' : String(review?.status || (failedTasks.length > 0 ? 'blocked' : 'changes-requested')),
    summary: String(review?.summary || (gatePassed ? 'Review stage aprobo el cierre sin hallazgos bloqueantes.' : 'Review stage detecto hallazgos que deben resolverse antes del cierre.')),
    findings,
    fixesApplied: uniqueStrings(review?.fixesApplied || []),
    residualRisks: uniqueStrings([...(review?.residualRisks || []), ...(executionResults || []).flatMap((item) => item?.residualRisks || [])]),
    closingGate: {
      passed: gatePassed,
      reason: gatePassed ? 'Review stage aprobo el cierre.' : (failedTasks.length > 0 ? `Hay ${failedTasks.length} tarea(s) fallida(s) en ejecucion.` : `Quedaron ${blockingFindings.length} finding(s) bloqueante(s) abiertos.`),
      blockingFindings: blockingFindings.map((item) => item.id),
      failedTasks,
    },
    metrics: { findingCount: findings.length, blockingFindingCount: blockingFindings.length, autoFixRecommended: blockingFindings.length > 0 || failedTasks.length > 0 },
  };
}

function collectOpenFindings(reviewStage) {
  const applied = new Set(uniqueStrings(reviewStage?.fixesApplied || []));
  return (Array.isArray(reviewStage?.findings) ? reviewStage.findings : []).filter((item) => !applied.has(item.id));
}

function shouldAttemptAutoFix(reviewStage, config, passIndex) {
  if (!config?.autoFixEnabled) return false;
  const maxPasses = Math.max(0, Number(config?.autoFixMaxPasses || ROUTER_DEFAULTS.autoFixMaxPasses));
  if (passIndex >= maxPasses) return false;
  if (!reviewStage || reviewStage.closingGate?.passed) return false;
  return collectOpenFindings(reviewStage).length > 0 || (reviewStage.closingGate?.failedTasks || []).length > 0;
}

function finalizeRouterOutcome(finalResult, executionResults, reviewStage) {
  const review = reviewStage || createSkippedReviewResult(executionResults);
  const completedTasks = uniqueStrings([
    ...(Array.isArray(finalResult?.completedTasks) ? finalResult.completedTasks : []),
    ...((executionResults || []).filter((item) => item?.status !== 'failed').map((item) => item?.taskId || '')),
  ]);
  const changedFiles = uniqueStrings([...(Array.isArray(finalResult?.changedFiles) ? finalResult.changedFiles : []), ...collectExecutionChangedFiles(executionResults)]);
  const verification = uniqueStrings([...(Array.isArray(finalResult?.verification) ? finalResult.verification : []), ...((executionResults || []).flatMap((item) => item?.verification || []))]);
  const findings = review.findings?.length ? review.findings : normalizeFindingList(finalResult?.findings, ROUTER_DEFAULTS.reviewMaxFindings);
  const fixesApplied = uniqueStrings([...(Array.isArray(finalResult?.fixesApplied) ? finalResult.fixesApplied : []), ...(Array.isArray(review?.fixesApplied) ? review.fixesApplied : [])]);
  const residualRisks = uniqueStrings([...(Array.isArray(finalResult?.residualRisks) ? finalResult.residualRisks : []), ...(Array.isArray(review?.residualRisks) ? review.residualRisks : []), ...((executionResults || []).flatMap((item) => item?.residualRisks || []))]);
  const closingGate = review.closingGate || {
    passed: collectFailedTaskIds(executionResults).length === 0,
    reason: 'No explicit review gate was produced.',
    blockingFindings: [],
    failedTasks: collectFailedTaskIds(executionResults),
  };
  const status = closingGate.passed && String(finalResult?.status || 'completed').toLowerCase() !== 'blocked' ? 'completed' : 'blocked';
  return {
    ...finalResult,
    status,
    summary: String(finalResult?.summary || review.summary || 'Free JT7 native router finished.'),
    completedTasks,
    changedFiles,
    verification,
    findings,
    fixesApplied,
    residualRisks,
    closingGate,
    reviewStage: review,
  };
}

module.exports = {
  ROUTER_DEFAULTS,
  runWithRouterRunLock,
  createNativeToolPolicy,
  createSessionHooks,
  shouldRunReviewStage,
  normalizeReviewResult,
  shouldAttemptAutoFix,
  finalizeRouterOutcome,
};
