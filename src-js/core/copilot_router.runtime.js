const fs = require("fs");
const os = require("os");
const path = require("path");
const { setupContextInRouter, recordStepWithCompression, finalizeContextSystem } = require("../memory/context-integration");
const { getPluginRuntime } = require('../runtime/plugin-runtime');
const { getRemoteBridge } = require('../runtime/remote-bridge');
const { randomUUID } = require("crypto");
const {
  allocatePromptBudget,
  trimTextToBudget,
  summarizeBudgetUsage,
} = require('./context-budget');

const ROUTER_DEFAULTS = {
  plannerModel: "gpt-5.4",
  executorCheapModel: "claude-haiku-4.5",
  executorContextModel: "gemini-3-flash",
  executorFallbackModel: "gpt-5.4",
  reviewEnabled: true,
  reviewModel: "gpt-5.4",
  reviewMaxFindings: 12,
  reviewMinChangedFiles: 2,
  autoFixEnabled: true,
  autoFixMaxPasses: 1,
  experimentalCodeModel: "",
  autoApproveSafeTools: true,
  sessionWaitTimeoutMs: 180000,
};

const LEGACY_COPILOT_PROVIDER = "copilot";
const LEGACY_COPILOT_COMPATIBILITY_MODE = "copilot-legacy-secondary";
const DEFAULT_EXTERNAL_PROVIDER = "openrouter";
const DEFAULT_EXTERNAL_PROVIDER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

const ROUTER_CONCURRENCY_ERROR = "Free JT7: ya hay una ejecucion activa del router Copilot. Espera a que termine antes de lanzar otra.";

let activeRouterCoreRunToken = null;

function nowIso() {
  return new Date().toISOString();
}

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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendLine(filePath, line) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${line}\n`, "utf8");
}

function sanitizeText(value, maxLength = 12000) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...[truncated]` : text;
}

function maybeCreateRemoteReview(bridge, runId, payload = {}) {
  if (!bridge) {
    return null;
  }
  const residualRisks = Array.isArray(payload.residualRisks) ? payload.residualRisks.filter(Boolean) : [];
  const findings = Array.isArray(payload.findings) ? payload.findings.filter(Boolean) : [];
  if (payload.status === 'completed' && residualRisks.length === 0 && findings.length === 0) {
    return null;
  }
  return bridge.createApprovalTicket(runId, {
    kind: 'route-review',
    summary: payload.summary || 'Revision remota requerida',
    metadata: {
      status: payload.status || 'unknown',
      residualRisks: residualRisks.slice(0, 10),
      changedFiles: Array.isArray(payload.changedFiles) ? payload.changedFiles.slice(0, 25) : [],
      findings: findings.slice(0, 10).map((item) => ({
        id: item.id || '',
        severity: item.severity || 'medium',
        title: item.title || '',
        taskId: item.taskId || '',
      })),
    },
  });
}

function cliLog(adapter, message) {
  if (!adapter) {
    return;
  }
  if (typeof adapter.appendLine === "function") {
    adapter.appendLine(message);
    return;
  }
  if (typeof adapter.log === "function") {
    adapter.log(message);
  }
}

function createRunPaths(workspacePath, runId) {
  const base = path.join(workspacePath, "copilot-agent", "runs");
  ensureDir(base);
  return {
    json: path.join(base, `${runId}.json`),
    events: path.join(base, `${runId}.events.jsonl`),
  };
}

function createRunId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "T");
  return `${stamp}-${randomUUID().slice(0, 8)}`;
}

function readRoutingConfig(workspacePath) {
  const routePath = path.join(workspacePath, ".github", "free-jt7-model-routing.json");
  const data = loadJson(routePath, {});
  const router = data.copilotSdkRouter || {};
  return {
    routePath,
    plannerModel: router.planner?.model || ROUTER_DEFAULTS.plannerModel,
    executorCheapModel: router.execution?.cheapModel || ROUTER_DEFAULTS.executorCheapModel,
    executorContextModel: router.execution?.contextModel || ROUTER_DEFAULTS.executorContextModel,
    executorFallbackModel: router.execution?.fallbackModel || ROUTER_DEFAULTS.executorFallbackModel,
    reviewEnabled: router.review?.enabled ?? ROUTER_DEFAULTS.reviewEnabled,
    reviewModel: router.review?.model || router.synthesis?.model || router.planner?.model || ROUTER_DEFAULTS.reviewModel,
    reviewMaxFindings: Number(router.review?.maxFindings || ROUTER_DEFAULTS.reviewMaxFindings),
    reviewMinChangedFiles: Number(router.review?.minChangedFiles || ROUTER_DEFAULTS.reviewMinChangedFiles),
    autoFixEnabled: router.review?.autoFixEnabled ?? ROUTER_DEFAULTS.autoFixEnabled,
    autoFixMaxPasses: Number(router.review?.autoFixMaxPasses || ROUTER_DEFAULTS.autoFixMaxPasses),
    experimentalCodeModel: router.execution?.experimentalCodeModel || ROUTER_DEFAULTS.experimentalCodeModel,
    synthesisModel: router.synthesis?.model || router.planner?.model || ROUTER_DEFAULTS.plannerModel,
    autoApproveSafeTools: router.permissions?.autoApproveSafeTools ?? ROUTER_DEFAULTS.autoApproveSafeTools,
  };
}

function readVsCodeRouterConfig(vscode) {
  if (!vscode?.workspace?.getConfiguration) {
    return { ...ROUTER_DEFAULTS, cliPath: "" };
  }
  const cfg = vscode.workspace.getConfiguration("freejt7");
  return {
    plannerModel: cfg.get("copilotRouter.plannerModel", ROUTER_DEFAULTS.plannerModel),
    executorCheapModel: cfg.get("copilotRouter.executorCheapModel", ROUTER_DEFAULTS.executorCheapModel),
    executorContextModel: cfg.get("copilotRouter.executorContextModel", ROUTER_DEFAULTS.executorContextModel),
    executorFallbackModel: cfg.get("copilotRouter.executorFallbackModel", ROUTER_DEFAULTS.executorFallbackModel),
    reviewEnabled: cfg.get("copilotRouter.reviewEnabled", ROUTER_DEFAULTS.reviewEnabled),
    reviewModel: cfg.get("copilotRouter.reviewModel", ROUTER_DEFAULTS.reviewModel),
    reviewMaxFindings: cfg.get("copilotRouter.reviewMaxFindings", ROUTER_DEFAULTS.reviewMaxFindings),
    reviewMinChangedFiles: cfg.get("copilotRouter.reviewMinChangedFiles", ROUTER_DEFAULTS.reviewMinChangedFiles),
    autoFixEnabled: cfg.get("copilotRouter.autoFixEnabled", ROUTER_DEFAULTS.autoFixEnabled),
    autoFixMaxPasses: cfg.get("copilotRouter.autoFixMaxPasses", ROUTER_DEFAULTS.autoFixMaxPasses),
    experimentalCodeModel: cfg.get("copilotRouter.experimentalCodeModel", ROUTER_DEFAULTS.experimentalCodeModel),
    autoApproveSafeTools: cfg.get("copilotRouter.autoApproveSafeTools", ROUTER_DEFAULTS.autoApproveSafeTools),
    cliPath: cfg.get("copilotRouter.cliPath", ""),
  };
}

function mergeRouterConfig(workspacePath, vscode) {
  const routing = readRoutingConfig(workspacePath);
  const editor = readVsCodeRouterConfig(vscode);
  return {
    routePath: routing.routePath,
    plannerModel: editor.plannerModel || routing.plannerModel,
    executorCheapModel: editor.executorCheapModel || routing.executorCheapModel,
    executorContextModel: editor.executorContextModel || routing.executorContextModel,
    executorFallbackModel: editor.executorFallbackModel || routing.executorFallbackModel,
    reviewEnabled: editor.reviewEnabled ?? routing.reviewEnabled,
    reviewModel: editor.reviewModel || routing.reviewModel,
    reviewMaxFindings: Number(editor.reviewMaxFindings || routing.reviewMaxFindings),
    reviewMinChangedFiles: Number(editor.reviewMinChangedFiles || routing.reviewMinChangedFiles),
    autoFixEnabled: editor.autoFixEnabled ?? routing.autoFixEnabled,
    autoFixMaxPasses: Number(editor.autoFixMaxPasses || routing.autoFixMaxPasses),
    experimentalCodeModel: editor.experimentalCodeModel || routing.experimentalCodeModel,
    synthesisModel: editor.plannerModel || routing.synthesisModel,
    autoApproveSafeTools: editor.autoApproveSafeTools,
    cliPath: editor.cliPath || "",
    sessionWaitTimeoutMs: Number(routing.sessionWaitTimeoutMs || ROUTER_DEFAULTS.sessionWaitTimeoutMs),
  };
}

function normalizeProviderName(value, fallback = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || fallback;
}

function readVsCodeLegacyCopilotConfig(vscode) {
  if (!vscode?.workspace?.getConfiguration) {
    return {
      legacyProvider: LEGACY_COPILOT_PROVIDER,
      legacyModel: "",
      allowExternalProviderDelegation: false,
      primaryProvider: DEFAULT_EXTERNAL_PROVIDER,
      primaryModel: "",
    };
  }
  const cfg = vscode.workspace.getConfiguration("freejt7");
  return {
    legacyProvider: normalizeProviderName(
      cfg.get("copilotRouter.legacyProvider", LEGACY_COPILOT_PROVIDER),
      LEGACY_COPILOT_PROVIDER,
    ),
    legacyModel: String(cfg.get("copilotRouter.legacyModel", "") || "").trim(),
    allowExternalProviderDelegation: Boolean(cfg.get("copilotRouter.allowExternalProviderDelegation", false)),
    primaryProvider: normalizeProviderName(cfg.get("apiProvider", DEFAULT_EXTERNAL_PROVIDER), DEFAULT_EXTERNAL_PROVIDER),
    primaryModel: String(cfg.get("apiProviderModel", "") || "").trim(),
  };
}

function resolveLegacyCopilotSelection(options = {}) {
  const legacyConfig = readVsCodeLegacyCopilotConfig(options.vscode);
  const explicitProvider = normalizeProviderName(options.providerOverride, "");
  const explicitModel = options.modelOverride === undefined ? undefined : String(options.modelOverride || "").trim();
  let selectedProvider = LEGACY_COPILOT_PROVIDER;
  let selectedProviderModel = "";
  let source = "default-copilot";

  if (explicitProvider) {
    selectedProvider = explicitProvider;
    source = "provider-override";
  } else if (legacyConfig.allowExternalProviderDelegation && legacyConfig.legacyProvider !== LEGACY_COPILOT_PROVIDER) {
    selectedProvider = legacyConfig.legacyProvider;
    source = "legacy-router-config";
  }

  if (selectedProvider !== LEGACY_COPILOT_PROVIDER) {
    const { getFreeModelDefaults } = require("../providers/api-provider-adapter");
    const providerDefaults = getFreeModelDefaults();
    const fallbackModel = providerDefaults[selectedProvider] || DEFAULT_EXTERNAL_PROVIDER_MODEL;
    if (source === "provider-override") {
      selectedProviderModel = explicitModel === undefined ? fallbackModel : (explicitModel || fallbackModel);
    } else {
      selectedProviderModel = legacyConfig.legacyModel || fallbackModel;
    }
  }

  const ignoredPrimaryProvider = (
    selectedProvider === LEGACY_COPILOT_PROVIDER
    && legacyConfig.primaryProvider !== LEGACY_COPILOT_PROVIDER
  );

  return {
    selectedProvider,
    selectedProviderModel,
    source,
    compatibilityMode: LEGACY_COPILOT_COMPATIBILITY_MODE,
    isolatedFromPrimaryProvider: true,
    ignoredPrimaryProvider,
    primaryProviderObserved: legacyConfig.primaryProvider,
    primaryModelObserved: legacyConfig.primaryModel,
    legacyConfigEnabled: Boolean(legacyConfig.allowExternalProviderDelegation),
    legacyConfigProvider: legacyConfig.legacyProvider,
    legacyConfigModel: legacyConfig.legacyModel,
  };
}

function getPathCandidates() {
  const candidates = [];
  const pathParts = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const entry of pathParts) {
    candidates.push(path.join(entry, process.platform === "win32" ? "copilot.cmd" : "copilot"));
    candidates.push(path.join(entry, process.platform === "win32" ? "copilot.bat" : "copilot"));
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      candidates.push(path.join(appData, "npm", "copilot.cmd"));
      candidates.push(path.join(appData, "npm", "copilot"));
    }
  }
  return candidates;
}

function getBundledCliCandidates(extensionPath = "") {
  const root = String(extensionPath || "").trim();
  if (!root) {
    return [];
  }
  const normalizedRoot = path.resolve(root);
  const packageName = `@github/copilot-${process.platform}-${process.arch}`;
  const binaryName = process.platform === "win32" ? "copilot.exe" : "copilot";
  const candidates = [
    path.join(normalizedRoot, "node_modules", packageName, binaryName),
    path.join(normalizedRoot, "node_modules", ".bin", process.platform === "win32" ? "copilot.cmd" : "copilot"),
  ];
  if (process.platform === "win32") {
    candidates.push(path.join(normalizedRoot, "node_modules", ".bin", "copilot.bat"));
  }
  return candidates;
}

function resolveCopilotCliPath(explicitPath = "", extensionPath = "") {
  const direct = String(explicitPath || process.env.FREEJT7_COPILOT_CLI_PATH || "").trim();
  if (direct && fs.existsSync(direct)) {
    return direct;
  }
  for (const candidate of getBundledCliCandidates(extensionPath)) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  for (const candidate of getPathCandidates()) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return direct || (process.platform === "win32" ? "copilot.cmd" : "copilot");
}

function resolveCopilotCliCommand(explicitPath = "", extensionPath = "") {
  const cliPath = resolveCopilotCliPath(explicitPath, extensionPath);
  const lower = cliPath.toLowerCase();
  if (process.platform === "win32" && lower.endsWith(".cmd")) {
    const npmLoader = path.join(path.dirname(cliPath), "node_modules", "@github", "copilot", "npm-loader.js");
    if (fs.existsSync(npmLoader)) {
      return {
        cliPath: process.execPath,
        cliArgs: [npmLoader],
        label: `${process.execPath} ${npmLoader}`,
      };
    }
  }
  return {
    cliPath,
    cliArgs: [],
    label: cliPath,
  };
}

function getCopilotAuthInfo() {
  const envNames = ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"];
  for (const name of envNames) {
    const value = String(process.env[name] || "").trim();
    if (value) {
      return {
        githubToken: value,
        authMode: "env-token",
        apiEnvVar: name,
      };
    }
  }
  return {
    githubToken: "",
    authMode: "copilot-cli",
    apiEnvVar: "",
  };
}

function isDestructiveShell(command) {
  const text = String(command || "").toLowerCase();
  return [
    "rm -rf",
    "git reset --hard",
    "format ",
    "del /f",
    "remove-item -recurse -force",
    "drop database",
  ].some((pattern) => text.includes(pattern));
}

function createPermissionHandler(enabled) {
  if (!enabled) {
    return undefined;
  }
  return async (request) => {
    if (request?.kind === "shell" && isDestructiveShell(request.command)) {
      return { approved: false, reason: "Blocked by Free JT7 Copilot router safety policy" };
    }
    return { approved: true };
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isShellToolName(toolName) {
  const name = String(toolName || '').trim().toLowerCase();
  if (!name) {
    return false;
  }
  if (name.includes('shell') || name.includes('terminal')) {
    return true;
  }
  return ['bash', 'sh', 'exec', 'run_command', 'run_in_terminal'].includes(name);
}

function extractToolCommand(toolArgs) {
  if (typeof toolArgs === 'string') {
    return toolArgs;
  }
  if (!isRecord(toolArgs)) {
    return '';
  }
  for (const key of ['command', 'cmd', 'input', 'script', 'text']) {
    if (typeof toolArgs[key] === 'string' && toolArgs[key].trim()) {
      return toolArgs[key];
    }
  }
  if (Array.isArray(toolArgs.args) && toolArgs.args.length > 0) {
    return toolArgs.args.map((item) => String(item || '')).join(' ').trim();
  }
  return '';
}

function summarizeToolResult(toolResult) {
  if (toolResult == null) {
    return '';
  }
  if (typeof toolResult === 'string') {
    return sanitizeText(toolResult, 2000);
  }
  if (Array.isArray(toolResult)) {
    return sanitizeText(JSON.stringify(toolResult), 2000);
  }
  if (isRecord(toolResult)) {
    const candidate = toolResult.output
      || toolResult.content
      || toolResult.result
      || toolResult.stdout
      || toolResult.message
      || JSON.stringify(toolResult);
    return sanitizeText(candidate, 2000);
  }
  return sanitizeText(String(toolResult), 2000);
}

function normalizePreToolHookOutput(value = {}) {
  if (!isRecord(value)) {
    return {};
  }
  const permissionDecision = String(
    value.permissionDecision != null
      ? value.permissionDecision
      : (value.approved === false ? 'deny' : value.approved === true ? 'allow' : '')
  ).trim().toLowerCase();
  const normalized = {};
  if (['allow', 'deny', 'ask'].includes(permissionDecision)) {
    normalized.permissionDecision = permissionDecision;
  }
  const reason = String(value.permissionDecisionReason || value.reason || '').trim();
  if (reason) {
    normalized.permissionDecisionReason = reason;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'modifiedArgs')) {
    normalized.modifiedArgs = value.modifiedArgs;
  }
  const additionalContext = String(value.additionalContext || '').trim();
  if (additionalContext) {
    normalized.additionalContext = additionalContext;
  }
  if (typeof value.suppressOutput === 'boolean') {
    normalized.suppressOutput = value.suppressOutput;
  }
  return normalized;
}

function normalizePostToolHookOutput(value = {}) {
  if (!isRecord(value)) {
    return {};
  }
  const normalized = {};
  if (Object.prototype.hasOwnProperty.call(value, 'modifiedResult')) {
    normalized.modifiedResult = value.modifiedResult;
  }
  const additionalContext = String(value.additionalContext || '').trim();
  if (additionalContext) {
    normalized.additionalContext = additionalContext;
  }
  if (typeof value.suppressOutput === 'boolean') {
    normalized.suppressOutput = value.suppressOutput;
  }
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
  if (config?.autoApproveSafeTools === false) {
    return {};
  }
  if (isShellToolName(toolName) && isDestructiveShell(command)) {
    return {
      permissionDecision: 'deny',
      permissionDecisionReason: 'Blocked by Free JT7 native tool policy: destructive shell command.',
    };
  }
  return {
    permissionDecision: 'allow',
  };
}

function createSessionHooks({ pluginRuntime, bridge, runId, stage, workingDirectory, output, config }) {
  return {
    onPreToolUse: async (input, invocation) => {
      const baseContext = buildToolHookContext(input, {
        runId,
        sessionId: invocation?.sessionId || '',
        stage,
        workingDirectory,
      });
      const policyOutput = normalizePreToolHookOutput(createNativeToolPolicy(input, config));
      const pluginOutput = normalizePreToolHookOutput(await pluginRuntime.emit('preToolUse', {
        ...baseContext,
        ...policyOutput,
      }));
      const finalOutput = mergeHookOutputs(policyOutput, pluginOutput);
      const decision = finalOutput.permissionDecision || 'allow';
      bridge?.appendSessionEvent(runId, 'tool-pre', {
        stage,
        sessionId: invocation?.sessionId || '',
        toolName: baseContext.toolName,
        command: sanitizeText(baseContext.command || '', 500),
        permissionDecision: decision,
        permissionDecisionReason: finalOutput.permissionDecisionReason || '',
        suppressOutput: Boolean(finalOutput.suppressOutput),
        modifiedArgs: Object.prototype.hasOwnProperty.call(finalOutput, 'modifiedArgs'),
      });
      bridge?.updateSessionState(runId, {
        lastToolEvent: {
          phase: 'pre',
          stage,
          toolName: baseContext.toolName,
          decision,
          reason: finalOutput.permissionDecisionReason || '',
          at: new Date(baseContext.timestamp).toISOString(),
        },
      });
      cliLog(output, `[freejt7-router] tool-pre stage=${stage} tool=${baseContext.toolName || 'unknown'} decision=${decision}`);
      return finalOutput;
    },
    onPostToolUse: async (input, invocation) => {
      const baseContext = buildToolHookContext(input, {
        runId,
        sessionId: invocation?.sessionId || '',
        stage,
        workingDirectory,
      });
      const pluginOutput = normalizePostToolHookOutput(await pluginRuntime.emit('postToolUse', {
        ...baseContext,
        toolResult: input?.toolResult,
      }));
      const finalOutput = mergeHookOutputs({}, pluginOutput);
      const resultPreview = summarizeToolResult(finalOutput.modifiedResult || input?.toolResult);
      bridge?.appendSessionEvent(runId, 'tool-post', {
        stage,
        sessionId: invocation?.sessionId || '',
        toolName: baseContext.toolName,
        command: sanitizeText(baseContext.command || '', 500),
        suppressOutput: Boolean(finalOutput.suppressOutput),
        modifiedResult: Object.prototype.hasOwnProperty.call(finalOutput, 'modifiedResult'),
        resultPreview,
      });
      bridge?.updateSessionState(runId, {
        lastToolEvent: {
          phase: 'post',
          stage,
          toolName: baseContext.toolName,
          resultPreview,
          at: new Date(baseContext.timestamp).toISOString(),
        },
      });
      cliLog(output, `[freejt7-router] tool-post stage=${stage} tool=${baseContext.toolName || 'unknown'}`);
      return finalOutput;
    },
  };
}

function extractTextFromResponse(response) {
  if (!response) {
    return "";
  }
  if (typeof response === "string") {
    return response;
  }
  if (typeof response.data?.content === "string") {
    return response.data.content;
  }
  if (Array.isArray(response.data?.content)) {
    return response.data.content.map((item) => item?.text || item?.content || "").join("\n");
  }
  if (typeof response.message?.content === "string") {
    return response.message.content;
  }
  return JSON.stringify(response, null, 2);
}

function extractJsonCandidate(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return null;
  }
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

function parseJsonResponse(text, fallback) {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    return fallback;
  }
  try {
    return JSON.parse(candidate);
  } catch {
    return fallback;
  }
}

function buildFallbackPlan(goal, config) {
  return {
    summary: "Fallback plan generated because planner JSON could not be parsed.",
    tasks: [
      {
        id: "task-1",
        title: "Execute primary request",
        objective: goal,
        kind: "implementation",
        risk: "medium",
        needsBroadContext: true,
        model: config.executorContextModel,
      },
    ],
  };
}

function normalizePlan(plan, goal, config) {
  const rawTasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const tasks = rawTasks.length ? rawTasks : buildFallbackPlan(goal, config).tasks;
  return {
    summary: plan?.summary || "Plan generated by Free JT7 Copilot router.",
    tasks: tasks.map((task, index) => ({
      id: String(task.id || `task-${index + 1}`),
      title: String(task.title || `Task ${index + 1}`),
      objective: String(task.objective || goal),
      kind: String(task.kind || "implementation"),
      risk: String(task.risk || "medium"),
      needsBroadContext: Boolean(task.needsBroadContext),
      modelHint: String(task.model || task.modelHint || ""),
      dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn.map(String) : [],
      successCriteria: Array.isArray(task.successCriteria) ? task.successCriteria.map(String) : [],
    })),
  };
}

function selectExecutionModel(task, config) {
  const hint = String(task.modelHint || "").trim();
  if (hint) {
    return hint;
  }
  if (task.risk === "high") {
    return config.executorFallbackModel;
  }
  if (task.needsBroadContext) {
    return config.executorContextModel;
  }
  if (task.kind === "implementation" && config.experimentalCodeModel) {
    return config.experimentalCodeModel;
  }
  return config.executorCheapModel;
}

const REVIEW_BLOCKING_SEVERITIES = new Set(["critical", "high"]);
const REVIEW_SEVERITY_ORDER = new Set(["info", "low", "medium", "high", "critical"]);

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }
  return result;
}

function normalizeReviewSeverity(value) {
  const severity = String(value || "medium").trim().toLowerCase();
  return REVIEW_SEVERITY_ORDER.has(severity) ? severity : "medium";
}

function normalizeFinding(item, index) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const title = String(item.title || item.summary || item.message || "").trim();
  const detail = String(item.detail || item.description || item.reason || title || "").trim();
  if (!title && !detail) {
    return null;
  }
  return {
    id: String(item.id || `finding-${index + 1}`),
    severity: normalizeReviewSeverity(item.severity),
    title: title || `Finding ${index + 1}`,
    detail: detail || title || `Finding ${index + 1}`,
    taskId: String(item.taskId || item.task || "").trim(),
    file: String(item.file || item.path || "").trim(),
    recommendation: String(item.recommendation || item.fix || item.suggestedFix || "").trim(),
  };
}

function normalizeFindingList(items, maxFindings) {
  const rawItems = Array.isArray(items) ? items : [];
  const findings = [];
  for (let index = 0; index < rawItems.length; index += 1) {
    if (findings.length >= maxFindings) {
      break;
    }
    const finding = normalizeFinding(rawItems[index], index);
    if (finding) {
      findings.push(finding);
    }
  }
  return findings;
}

function collectExecutionChangedFiles(executionResults) {
  return uniqueStrings((executionResults || []).flatMap((item) => item?.files || []));
}

function collectFailedTaskIds(executionResults) {
  return uniqueStrings((executionResults || [])
    .filter((item) => item?.status === "failed")
    .map((item) => item?.taskId || ""));
}

function shouldRunReviewStage(plan, executionResults, config) {
  if (!config?.reviewEnabled) {
    return false;
  }
  const failedTaskIds = collectFailedTaskIds(executionResults);
  if (failedTaskIds.length > 0) {
    return true;
  }
  if ((plan?.tasks || []).some((task) => String(task?.risk || "").toLowerCase() === "high")) {
    return true;
  }
  if ((executionResults || []).some((item) => Array.isArray(item?.residualRisks) && item.residualRisks.length > 0)) {
    return true;
  }
  const changedFiles = collectExecutionChangedFiles(executionResults);
  return changedFiles.length >= Number(config?.reviewMinChangedFiles || ROUTER_DEFAULTS.reviewMinChangedFiles);
}

function createSkippedReviewResult(executionResults, reason = "Review stage skipped by policy.") {
  const failedTasks = collectFailedTaskIds(executionResults);
  return {
    enabled: false,
    triggered: false,
    status: failedTasks.length > 0 ? "blocked" : "skipped",
    summary: reason,
    findings: [],
    fixesApplied: [],
    residualRisks: uniqueStrings((executionResults || []).flatMap((item) => item?.residualRisks || [])),
    closingGate: {
      passed: failedTasks.length === 0,
      reason: failedTasks.length === 0
        ? reason
        : `Review stage skipped, but ${failedTasks.length} task(s) failed during execution.`,
      blockingFindings: [],
      failedTasks,
    },
    metrics: {
      findingCount: 0,
      blockingFindingCount: 0,
    },
  };
}

function buildFallbackReviewResult(reason) {
  return {
    status: "changes-requested",
    summary: reason,
    findings: [
      {
        id: "review-stage-unparsed",
        severity: "high",
        title: "Review stage no devolvio JSON valido",
        detail: reason,
        recommendation: "Repetir la revision o validar manualmente antes del cierre.",
      },
    ],
    fixesApplied: [],
    residualRisks: [reason],
  };
}

function normalizeReviewResult(review, plan, executionResults, config) {
  const maxFindings = Number(config?.reviewMaxFindings || ROUTER_DEFAULTS.reviewMaxFindings);
  const findings = normalizeFindingList(review?.findings, maxFindings);
  const failedTasks = collectFailedTaskIds(executionResults);
  if (findings.length === 0 && failedTasks.length > 0) {
    findings.push({
      id: "execution-failure",
      severity: "high",
      title: "Hay tareas del executor fallidas",
      detail: `La etapa de ejecucion dejo fallidas: ${failedTasks.join(", ")}.`,
      taskId: failedTasks[0] || "",
      file: "",
      recommendation: "Corregir las tareas fallidas antes de cerrar el router.",
    });
  }
  const blockingFindings = findings.filter((item) => REVIEW_BLOCKING_SEVERITIES.has(item.severity));
  const gatePassed = failedTasks.length === 0 && blockingFindings.length === 0;
  return {
    enabled: true,
    triggered: true,
    status: gatePassed ? "approved" : String(review?.status || (failedTasks.length > 0 ? "blocked" : "changes-requested")),
    summary: String(review?.summary || (gatePassed
      ? "Review stage aprobo el cierre sin hallazgos bloqueantes."
      : "Review stage detecto hallazgos que deben resolverse antes del cierre.")),
    findings,
    fixesApplied: uniqueStrings(review?.fixesApplied || []),
    residualRisks: uniqueStrings([
      ...(review?.residualRisks || []),
      ...(executionResults || []).flatMap((item) => item?.residualRisks || []),
    ]),
    closingGate: {
      passed: gatePassed,
      reason: gatePassed
        ? "Review stage aprobo el cierre."
        : (failedTasks.length > 0
          ? `Hay ${failedTasks.length} tarea(s) fallida(s) en ejecucion.`
          : `Quedaron ${blockingFindings.length} finding(s) bloqueante(s) abiertos.`),
      blockingFindings: blockingFindings.map((item) => item.id),
      failedTasks,
    },
    metrics: {
      findingCount: findings.length,
      blockingFindingCount: blockingFindings.length,
      autoFixRecommended: blockingFindings.length > 0 || failedTasks.length > 0,
    },
  };
}

function collectOpenFindings(reviewStage) {
  const applied = new Set(uniqueStrings(reviewStage?.fixesApplied || []));
  return (Array.isArray(reviewStage?.findings) ? reviewStage.findings : []).filter((item) => !applied.has(item.id));
}

function shouldAttemptAutoFix(reviewStage, config, passIndex) {
  if (!config?.autoFixEnabled) {
    return false;
  }
  const maxPasses = Math.max(0, Number(config?.autoFixMaxPasses || ROUTER_DEFAULTS.autoFixMaxPasses));
  if (passIndex >= maxPasses) {
    return false;
  }
  if (!reviewStage || reviewStage.closingGate?.passed) {
    return false;
  }
  return collectOpenFindings(reviewStage).length > 0 || (reviewStage.closingGate?.failedTasks || []).length > 0;
}

function selectAutoFixModel(reviewStage, config) {
  const hasBlocking = collectOpenFindings(reviewStage).some((item) => REVIEW_BLOCKING_SEVERITIES.has(item.severity));
  if (hasBlocking) {
    return config.executorFallbackModel;
  }
  if (config.experimentalCodeModel) {
    return config.experimentalCodeModel;
  }
  return config.executorContextModel || config.executorCheapModel;
}

function buildAutoFixPrompt(goal, plan, results, reviewStage, passIndex, config) {
  const allocation = allocatePromptBudget(selectAutoFixModel(reviewStage, config), {
    goal: 0.12,
    plan: 0.18,
    results: 0.35,
    review: 0.35,
  });
  const goalInfo = trimTextToBudget(goal, allocation.sections.goal, '...[Free JT7 autofix goal recortado]...');
  const planInfo = trimTextToBudget(JSON.stringify(plan, null, 2), allocation.sections.plan, '...[Free JT7 autofix plan recortado]...');
  const resultsInfo = trimTextToBudget(JSON.stringify(results, null, 2), allocation.sections.results, '...[Free JT7 autofix results recortados]...');
  const reviewInfo = trimTextToBudget(JSON.stringify(reviewStage, null, 2), allocation.sections.review, '...[Free JT7 autofix review recortado]...');
  return {
    prompt: [
      'You are the auto-remediation phase inside Free JT7\'s Copilot router.',
      'Resolve the open findings using tools when needed, then return only valid JSON.',
      'Focus only on unresolved findings and failed tasks that keep the closing gate blocked.',
      'Return only valid JSON with this shape:',
      JSON.stringify({
        status: 'completed',
        summary: 'what was fixed',
        files: ['relative/path'],
        verification: ['command or check'],
        residualRisks: ['remaining risk'],
        fixesApplied: ['finding-1'],
      }, null, 2),
      `Auto-fix pass: ${passIndex + 1}`,
      `Original goal: ${goalInfo.text}`,
      `Plan: ${planInfo.text}`,
      `Execution results so far: ${resultsInfo.text}`,
      `Open review findings: ${reviewInfo.text}`,
    ].join('\n\n'),
    budget: summarizeBudgetUsage('autofix', selectAutoFixModel(reviewStage, config), allocation, {
      goal: goalInfo,
      plan: planInfo,
      results: resultsInfo,
      review: reviewInfo,
    }),
  };
}

function finalizeRouterOutcome(finalResult, executionResults, reviewStage) {
  const review = reviewStage || createSkippedReviewResult(executionResults);
  const completedTasks = uniqueStrings([
    ...((Array.isArray(finalResult?.completedTasks) ? finalResult.completedTasks : [])),
    ...((executionResults || [])
      .filter((item) => item?.status !== "failed")
      .map((item) => item?.taskId || "")),
  ]);
  const changedFiles = uniqueStrings([
    ...(Array.isArray(finalResult?.changedFiles) ? finalResult.changedFiles : []),
    ...collectExecutionChangedFiles(executionResults),
  ]);
  const verification = uniqueStrings([
    ...(Array.isArray(finalResult?.verification) ? finalResult.verification : []),
    ...((executionResults || []).flatMap((item) => item?.verification || [])),
  ]);
  const findings = review.findings?.length
    ? review.findings
    : normalizeFindingList(finalResult?.findings, ROUTER_DEFAULTS.reviewMaxFindings);
  const fixesApplied = uniqueStrings([
    ...(Array.isArray(finalResult?.fixesApplied) ? finalResult.fixesApplied : []),
    ...(Array.isArray(review?.fixesApplied) ? review.fixesApplied : []),
  ]);
  const residualRisks = uniqueStrings([
    ...(Array.isArray(finalResult?.residualRisks) ? finalResult.residualRisks : []),
    ...(Array.isArray(review?.residualRisks) ? review.residualRisks : []),
    ...((executionResults || []).flatMap((item) => item?.residualRisks || [])),
  ]);
  const closingGate = review.closingGate || {
    passed: collectFailedTaskIds(executionResults).length === 0,
    reason: "No explicit review gate was produced.",
    blockingFindings: [],
    failedTasks: collectFailedTaskIds(executionResults),
  };
  const status = closingGate.passed && String(finalResult?.status || "completed").toLowerCase() !== "blocked"
    ? "completed"
    : "blocked";
  return {
    ...finalResult,
    status,
    summary: String(finalResult?.summary || review.summary || "Free JT7 Copilot router finished."),
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

function buildPlannerPrompt(goal, config) {
  const allocation = allocatePromptBudget(config.plannerModel, { goal: 1 });
  const goalInfo = trimTextToBudget(goal, allocation.sections.goal, '...[Free JT7 planner goal recortado]...');
  return {
    prompt: [
    "You are the planning phase of Free JT7's multi-model Copilot router.",
    "Plan the user request and split it into concrete tasks.",
    "Return only valid JSON with this shape:",
    JSON.stringify({
      summary: "short summary",
      tasks: [
        {
          id: "task-1",
          title: "short title",
          objective: "what this subtask must achieve",
          kind: "implementation|analysis|validation|docs",
          risk: "low|medium|high",
          needsBroadContext: true,
          model: config.executorCheapModel,
          successCriteria: ["criterion 1"],
        },
      ],
    }, null, 2),
    "Use model values only from this set when appropriate:",
    `${config.executorCheapModel}, ${config.executorContextModel}, ${config.experimentalCodeModel || "(none)"}, ${config.executorFallbackModel}`,
    "User goal:",
    goalInfo.text,
  ].join("\n\n"),
    budget: summarizeBudgetUsage('planner', config.plannerModel, allocation, { goal: goalInfo }),
  };
}

function buildExecutorPrompt(goal, planSummary, task, model) {
  const allocation = allocatePromptBudget(model, { goal: 0.25, plan: 0.25, review: 0.5 });
  const goalInfo = trimTextToBudget(goal, allocation.sections.goal, '...[Free JT7 executor goal recortado]...');
  const planInfo = trimTextToBudget(planSummary, allocation.sections.plan, '...[Free JT7 executor plan recortado]...');
  const taskInfo = trimTextToBudget(JSON.stringify(task, null, 2), allocation.sections.review, '...[Free JT7 executor task recortada]...');
  return {
    prompt: [
    "You are an execution phase inside Free JT7's Copilot router.",
    "Work in the current workspace, use the available coding tools, and complete only the assigned subtask.",
    "If you need to edit files, do it. If you need to run validation, do it.",
    "Return only valid JSON with this shape:",
    JSON.stringify({
      status: "completed",
      summary: "what was done",
      files: ["relative/path"],
      verification: ["command or check"],
      residualRisks: ["optional risk"],
    }, null, 2),
    `Original goal: ${goalInfo.text}`,
    `Plan summary: ${planInfo.text}`,
    `Assigned task: ${taskInfo.text}`,
  ].join("\n\n"),
    budget: summarizeBudgetUsage('executor', model, allocation, {
      goal: goalInfo,
      plan: planInfo,
      task: taskInfo,
    }),
  };
}

function buildReviewPrompt(goal, plan, results, config) {
  const allocation = allocatePromptBudget(config.reviewModel, { goal: 0.15, plan: 0.25, results: 0.6 });
  const goalInfo = trimTextToBudget(goal, allocation.sections.goal, '...[Free JT7 review goal recortado]...');
  const planInfo = trimTextToBudget(JSON.stringify(plan, null, 2), allocation.sections.plan, '...[Free JT7 review plan recortado]...');
  const resultsInfo = trimTextToBudget(JSON.stringify(results, null, 2), allocation.sections.results, '...[Free JT7 review results recortados]...');
  return {
    prompt: [
    "You are the review phase inside Free JT7's Copilot router.",
    "Review the execution results as a strict second pass and block closure if unresolved high or critical issues remain.",
    "Return only valid JSON with this shape:",
    JSON.stringify({
      status: "approved|changes-requested|blocked",
      summary: "overall review summary",
      findings: [
        {
          id: "finding-1",
          severity: "info|low|medium|high|critical",
          title: "short title",
          detail: "why this matters",
          taskId: "task-1",
          file: "relative/path",
          recommendation: "how to fix or verify",
        },
      ],
      fixesApplied: ["finding ids already covered by the execution results"],
      residualRisks: ["remaining risks after review"],
    }, null, 2),
    `Maximum findings to report: ${Number(config?.reviewMaxFindings || ROUTER_DEFAULTS.reviewMaxFindings)}`,
    "Only report findings that are still open after looking at the execution results.",
    `Original goal: ${goalInfo.text}`,
    `Plan: ${planInfo.text}`,
    `Execution results: ${resultsInfo.text}`,
  ].join("\n\n"),
    budget: summarizeBudgetUsage('review', config.reviewModel, allocation, {
      goal: goalInfo,
      plan: planInfo,
      results: resultsInfo,
    }),
  };
}

function buildSynthesisPrompt(goal, plan, results, reviewStage, model) {
  const allocation = allocatePromptBudget(model, { goal: 0.12, plan: 0.18, results: 0.45, review: 0.25 });
  const goalInfo = trimTextToBudget(goal, allocation.sections.goal, '...[Free JT7 synthesis goal recortado]...');
  const planInfo = trimTextToBudget(JSON.stringify(plan, null, 2), allocation.sections.plan, '...[Free JT7 synthesis plan recortado]...');
  const resultsInfo = trimTextToBudget(JSON.stringify(results, null, 2), allocation.sections.results, '...[Free JT7 synthesis results recortados]...');
  const reviewInfo = trimTextToBudget(JSON.stringify(reviewStage || createSkippedReviewResult(results), null, 2), allocation.sections.review, '...[Free JT7 synthesis review recortado]...');
  return {
    prompt: [
    "You are the synthesis phase of Free JT7's Copilot router.",
    "Summarize the completed work without adding unsupported claims.",
    "Respect the review stage and do not claim closure if the review gate stayed blocked.",
    "Return only valid JSON with this shape:",
    JSON.stringify({
      status: "completed",
      summary: "overall result",
      completedTasks: ["task-1"],
      changedFiles: ["relative/path"],
      verification: ["check"],
      findings: [
        {
          id: "finding-1",
          severity: "high",
          title: "short title",
          detail: "why this matters",
        },
      ],
      fixesApplied: ["finding-2"],
      residualRisks: ["risk"],
    }, null, 2),
    `Original goal: ${goalInfo.text}`,
    `Plan: ${planInfo.text}`,
    `Execution results: ${resultsInfo.text}`,
    `Review stage: ${reviewInfo.text}`,
  ].join("\n\n"),
    budget: summarizeBudgetUsage('synthesis', model, allocation, {
      goal: goalInfo,
      plan: planInfo,
      results: resultsInfo,
      review: reviewInfo,
    }),
  };
}

async function sendSession({ client, model, prompt, systemMessage, workingDirectory, onPermissionRequest, allowTools = true, timeoutMs = ROUTER_DEFAULTS.sessionWaitTimeoutMs, hooks }) {
  const session = await client.createSession({
    model,
    workingDirectory,
    systemMessage: systemMessage ? { content: systemMessage } : undefined,
    onPermissionRequest,
    hooks,
    availableTools: allowTools ? undefined : [],
  });
  try {
    const response = await session.sendAndWait({ prompt }, timeoutMs);
    return extractTextFromResponse(response);
  } finally {
    if (typeof session.destroy === "function") {
      await session.destroy().catch(() => {});
    }
  }
}

function buildRunSkeleton(runId, goal, workspacePath, routing, authInfo, selectedSkills = [], executionMeta = {}) {
  const resolvedProvider = String(executionMeta.provider || "github-copilot-sdk").trim() || "github-copilot-sdk";
  const resolvedModel = String(executionMeta.model || routing.plannerModel).trim() || routing.plannerModel;
  const resolvedAuthMode = String(executionMeta.authMode || authInfo.authMode || "").trim();
  const resolvedReason = String(executionMeta.reason || "copilot sdk router").trim() || "copilot sdk router";
  const resolvedIdeProfiles = Array.isArray(executionMeta.ideDetectedProfiles)
    ? executionMeta.ideDetectedProfiles
    : ["free-jt7"];
  return {
    run_id: runId,
    started_at: nowIso(),
    ended_at: "",
    user_goal: goal,
    scope: "workspace",
    risk_level: "medium",
    status: "running",
    skills_selected: Array.isArray(selectedSkills) && selectedSkills.length
      ? selectedSkills
      : [{ id: "copilot-sdk", category: "development", score: 1.0, gh_path: ".github/skills/copilot-sdk/SKILL.md" }],
    quality_gate: { required: true, passed: false },
    steps: [],
    summary: "",
    rollout_mode: "autonomous",
    model_resolution: {
      ide: "vscode",
      profile: "free-jt7",
      provider: resolvedProvider,
      model: resolvedModel,
      auth_mode: resolvedAuthMode,
      reason: resolvedReason,
      prefer_ide_profile: executionMeta.preferIdeProfile ?? true,
      allow_api_fallback: executionMeta.allowApiFallback ?? false,
      api_env_var: executionMeta.apiEnvVar ?? authInfo.apiEnvVar,
      ide_profile_available: executionMeta.ideProfileAvailable ?? true,
      requested_profile_available: executionMeta.requestedProfileAvailable ?? true,
      ide_detected_profiles: resolvedIdeProfiles,
      ide_evidence: [],
      execution_mode: executionMeta.executionMode || "copilot-sdk",
      selected_provider: executionMeta.selectedProvider || resolvedProvider,
      selected_model: executionMeta.selectedModel || resolvedModel,
      compatibility_mode: executionMeta.compatibilityMode || LEGACY_COPILOT_COMPATIBILITY_MODE,
      legacy_route_isolated: executionMeta.legacyRouteIsolated ?? true,
      legacy_provider_source: executionMeta.legacyProviderSource || "default-copilot",
      ignored_primary_provider: Boolean(executionMeta.ignoredPrimaryProvider),
      primary_provider_observed: executionMeta.primaryProviderObserved || "",
      primary_model_observed: executionMeta.primaryModelObserved || "",
      legacy_config_enabled: Boolean(executionMeta.legacyConfigEnabled),
      legacy_config_provider: executionMeta.legacyConfigProvider || LEGACY_COPILOT_PROVIDER,
      legacy_config_model: executionMeta.legacyConfigModel || "",
      config_namespace: "freejt7.copilotRouter.*",
      routing_file: routing.routePath,
      router: {
        planner: routing.plannerModel,
        executionCheap: routing.executorCheapModel,
        executionContext: routing.executorContextModel,
        executionFallback: routing.executorFallbackModel,
          reviewEnabled: routing.reviewEnabled,
          reviewModel: routing.reviewModel,
          reviewMaxFindings: routing.reviewMaxFindings,
          reviewMinChangedFiles: routing.reviewMinChangedFiles,
          autoFixEnabled: routing.autoFixEnabled,
          autoFixMaxPasses: routing.autoFixMaxPasses,
        executionExperimental: routing.experimentalCodeModel || "",
      },
    },
    execution_route: {
      host: resolvedProvider === LEGACY_COPILOT_PROVIDER ? "copilot" : "external-provider",
      adapter: resolvedProvider === LEGACY_COPILOT_PROVIDER ? "copilot-sdk" : "external-provider",
      provider: resolvedProvider,
      model: resolvedModel,
      compatibility_mode: executionMeta.compatibilityMode || LEGACY_COPILOT_COMPATIBILITY_MODE,
      legacy_route_isolated: executionMeta.legacyRouteIsolated ?? true,
      legacy_secondary: true,
      legacy_provider_source: executionMeta.legacyProviderSource || "default-copilot",
      ignored_primary_provider: Boolean(executionMeta.ignoredPrimaryProvider),
      primary_provider_observed: executionMeta.primaryProviderObserved || "",
      primary_model_observed: executionMeta.primaryModelObserved || "",
      copilot_cli_resolved: false,
      copilot_sdk_created: false,
    },
  };
}

function recordStep(run, eventPath, step) {
  run.steps.push(step);
  appendLine(eventPath, JSON.stringify({
    ts: nowIso(),
    step_id: step.step_id,
    action: step.action,
    command: step.command || "",
    result: sanitizeText(step.result || ""),
    exit_code: step.exit_code ?? 0,
    retry_index: step.retry_index ?? 0,
    evidence_ref: "",
    redaction_applied: false,
  }));
}

async function runCopilotRouter(options) {
  const goal = String(options.goal || "").trim();
  if (!goal) {
    throw new Error("Missing goal for Free JT7 Copilot router");
  }

  const releaseRouterRunLock = beginRouterRunLock();

  const workspacePath = path.resolve(options.workspacePath || process.cwd());
  const runId = String(options.runId || "").trim() || createRunId();
  const runPaths = createRunPaths(workspacePath, runId);
  const routing = mergeRouterConfig(workspacePath, options.vscode);
  const legacySelection = resolveLegacyCopilotSelection({
    providerOverride: options.providerOverride,
    modelOverride: options.modelOverride,
    vscode: options.vscode,
  });
  const {
    selectedProvider,
    selectedProviderModel,
  } = legacySelection;
  const cli = selectedProvider === LEGACY_COPILOT_PROVIDER
    ? resolveCopilotCliCommand(options.cliPath || routing.cliPath, options.extensionPath || "")
    : { cliPath: "", cliArgs: [], label: "skipped (external provider active)" };
  const authInfo = selectedProvider === LEGACY_COPILOT_PROVIDER
    ? getCopilotAuthInfo()
    : { githubToken: "", authMode: "external-provider", apiEnvVar: "" };
  const permissionHandler = createPermissionHandler(routing.autoApproveSafeTools);
  const executionMeta = selectedProvider === LEGACY_COPILOT_PROVIDER
    ? {
        provider: LEGACY_COPILOT_PROVIDER,
        model: routing.plannerModel,
        authMode: authInfo.authMode,
        reason: "copilot legacy secondary route",
        preferIdeProfile: true,
        allowApiFallback: false,
        apiEnvVar: authInfo.apiEnvVar,
        ideProfileAvailable: true,
        requestedProfileAvailable: true,
        ideDetectedProfiles: ["free-jt7"],
        executionMode: "copilot-sdk",
        selectedProvider: LEGACY_COPILOT_PROVIDER,
        selectedModel: routing.plannerModel,
        compatibilityMode: legacySelection.compatibilityMode,
        legacyRouteIsolated: legacySelection.isolatedFromPrimaryProvider,
        legacyProviderSource: legacySelection.source,
        ignoredPrimaryProvider: legacySelection.ignoredPrimaryProvider,
        primaryProviderObserved: legacySelection.primaryProviderObserved,
        primaryModelObserved: legacySelection.primaryModelObserved,
        legacyConfigEnabled: legacySelection.legacyConfigEnabled,
        legacyConfigProvider: legacySelection.legacyConfigProvider,
        legacyConfigModel: legacySelection.legacyConfigModel,
      }
    : {
        provider: selectedProvider,
        model: selectedProviderModel || "default",
        authMode: "external-provider",
        reason: "legacy compatibility external delegation",
        preferIdeProfile: false,
        allowApiFallback: false,
        apiEnvVar: "",
        ideProfileAvailable: false,
        requestedProfileAvailable: false,
        ideDetectedProfiles: [],
        executionMode: "external-provider",
        selectedProvider,
        selectedModel: selectedProviderModel || "default",
        compatibilityMode: legacySelection.compatibilityMode,
        legacyRouteIsolated: legacySelection.isolatedFromPrimaryProvider,
        legacyProviderSource: legacySelection.source,
        ignoredPrimaryProvider: legacySelection.ignoredPrimaryProvider,
        primaryProviderObserved: legacySelection.primaryProviderObserved,
        primaryModelObserved: legacySelection.primaryModelObserved,
        legacyConfigEnabled: legacySelection.legacyConfigEnabled,
        legacyConfigProvider: legacySelection.legacyConfigProvider,
        legacyConfigModel: legacySelection.legacyConfigModel,
      };
  const baseRun = buildRunSkeleton(
    runId,
    goal,
    workspacePath,
    routing,
    authInfo,
    options.selectedSkills || [],
    executionMeta,
  );
  const existingRun = loadJson(runPaths.json, null);
  const run = existingRun && typeof existingRun === "object"
    ? {
        ...baseRun,
        ...existingRun,
        run_id: runId,
        user_goal: goal,
        status: "running",
        ended_at: "",
        summary: "",
        steps: Array.isArray(existingRun.steps) ? existingRun.steps : [],
        quality_gate: existingRun.quality_gate || baseRun.quality_gate,
        skills_selected: Array.isArray(options.selectedSkills) && options.selectedSkills.length
          ? options.selectedSkills
          : (existingRun.skills_selected || baseRun.skills_selected),
        model_resolution: {
          ...(existingRun.model_resolution || {}),
          ...(baseRun.model_resolution || {}),
        },
      }
    : baseRun;
  // Initialize context management system for compression
  const contextSystem = setupContextInRouter(options);
  const _pr = getPluginRuntime();
  _pr.discoverAndLoadIntegrations({
    directories: [path.join(workspacePath, 'integrations')],
    allowExperimental: false,
  });
  const _bridge = getRemoteBridge({ rootDir: workspacePath });
  _bridge.registerSession(runId, {
    goal,
    workspacePath,
    status: 'running',
    skills: Array.isArray(run.skills_selected) ? run.skills_selected.map((item) => item.id || item) : [],
  });
  _bridge.appendSessionEvent(runId, 'task-start', { goal, workspacePath });
  writeJson(runPaths.json, run);
  appendLine(runPaths.events, JSON.stringify({
    ts: nowIso(),
    step_id: "intake",
    action: "task-start",
    command: "",
    result: `goal=${goal}`,
    exit_code: 0,
    retry_index: 0,
    evidence_ref: "",
    redaction_applied: false,
  }));

  cliLog(options.output, `[freejt7-router] run_id=${runId}`);
  if (legacySelection.ignoredPrimaryProvider) {
    cliLog(
      options.output,
      `[freejt7-router] compat mode=${legacySelection.compatibilityMode}; ignoring freejt7.apiProvider=${legacySelection.primaryProviderObserved} for isolated Copilot legacy route`,
    );
  }
  cliLog(options.output, `[freejt7-router] cli=${cli.label}`);
  await _pr.emit('onRouteStart', { goal, runId, workspacePath });
  _bridge.appendSessionEvent(runId, 'route-start', { goal, workspacePath });

  // --- API Provider Delegation ---
  if (selectedProvider !== LEGACY_COPILOT_PROVIDER) {
    const { callProvider } = require("../providers/api-provider-adapter");
    cliLog(options.output, `[freejt7-router] delegating to provider=${selectedProvider} model=${selectedProviderModel || "default"}`);
    const providerResult = await callProvider(
      goal,
      { provider: selectedProvider, model: selectedProviderModel },
      options.secretStorage,
      { workspacePath },
    );
    const providerSummary = String(providerResult?.final?.summary || providerResult?.run?.summary || `Delegado a ${selectedProvider}`);
    recordStepWithCompression(contextSystem, run, runPaths.events, {
      step_id: "provider-delegation",
      action: "provider-delegation",
      command: `${selectedProvider}:${selectedProviderModel || "default"}`,
      result: `${providerSummary}\n\n[freejt7-router] provider_route=external-provider copilot_sdk_created=false`,
      exit_code: 0,
      retry_index: 0,
      risk_level: "medium",
      mode: "autonomous",
    });
    run.model_resolution = {
      ide: "vscode",
      profile: "free-jt7",
      provider: selectedProvider,
      model: selectedProviderModel || "default",
      auth_mode: "external-provider",
      reason: "legacy compatibility external delegation",
      prefer_ide_profile: false,
      allow_api_fallback: false,
      api_env_var: "",
      ide_profile_available: false,
      requested_profile_available: false,
      ide_detected_profiles: [],
      execution_mode: "external-provider",
      selected_provider: selectedProvider,
      selected_model: selectedProviderModel || "default",
      compatibility_mode: legacySelection.compatibilityMode,
      legacy_route_isolated: legacySelection.isolatedFromPrimaryProvider,
      legacy_provider_source: legacySelection.source,
      ignored_primary_provider: legacySelection.ignoredPrimaryProvider,
      primary_provider_observed: legacySelection.primaryProviderObserved,
      primary_model_observed: legacySelection.primaryModelObserved,
      legacy_config_enabled: legacySelection.legacyConfigEnabled,
      legacy_config_provider: legacySelection.legacyConfigProvider,
      legacy_config_model: legacySelection.legacyConfigModel,
      config_namespace: "freejt7.copilotRouter.*",
      router: null,
    };
    run.execution_route = {
      host: "external-provider",
      adapter: "external-provider",
      provider: selectedProvider,
      model: selectedProviderModel || "default",
      compatibility_mode: legacySelection.compatibilityMode,
      legacy_route_isolated: legacySelection.isolatedFromPrimaryProvider,
      legacy_secondary: true,
      legacy_provider_source: legacySelection.source,
      ignored_primary_provider: legacySelection.ignoredPrimaryProvider,
      primary_provider_observed: legacySelection.primaryProviderObserved,
      primary_model_observed: legacySelection.primaryModelObserved,
      copilot_cli_resolved: false,
      copilot_sdk_created: false,
    };
    run.ended_at = nowIso();
    run.status = "completed";
    run.summary = providerSummary;
    run.quality_gate.passed = true;
    writeJson(runPaths.json, run);
    _bridge.appendSessionEvent(runId, 'provider-delegation', {
      provider: selectedProvider,
      model: selectedProviderModel || 'default',
      status: run.status,
      summary: providerSummary,
      copilotCliResolved: false,
      copilotSdkCreated: false,
    });
    _bridge.closeSession(runId, { status: run.status, summary: providerSummary });
    await _pr.emit('onRouteEnd', { goal, runId, status: run.status });
    const delegatedRun = {
      ...(providerResult?.run && typeof providerResult.run === "object" ? providerResult.run : {}),
      run_id: run.run_id,
      status: run.status,
      summary: providerSummary,
      started_at: run.started_at,
      ended_at: run.ended_at,
      model_resolution: run.model_resolution,
      execution_route: run.execution_route,
      quality_gate: run.quality_gate,
      steps: Array.isArray(run.steps) ? run.steps : [],
    };
    return {
      ...(providerResult || {}),
      runId,
      run: delegatedRun,
      final: providerResult?.final || {
        status: "completed",
        summary: providerSummary,
        changedFiles: [],
        verification: [],
        residualRisks: [],
      },
      plan: { summary: `Delegado a ${selectedProvider}`, tasks: [] },
      executionResults: [],
      runPaths,
    };
  }
  // --- End API Provider Delegation ---

  let client;
  try {
    const sdk = await import("@github/copilot-sdk");
    const CopilotClient = sdk.CopilotClient || sdk.default?.CopilotClient;
    if (!CopilotClient) {
      throw new Error("CopilotClient export not found in @github/copilot-sdk");
    }
    client = new CopilotClient({
      cliPath: cli.cliPath,
      cliArgs: cli.cliArgs,
      logLevel: "error",
      githubToken: authInfo.githubToken || undefined,
      useLoggedInUser: !authInfo.githubToken,
    });
    run.execution_route = {
      ...(run.execution_route || {}),
      host: "copilot",
      adapter: "copilot-sdk",
      provider: LEGACY_COPILOT_PROVIDER,
      model: routing.plannerModel,
      copilot_cli_resolved: Boolean(cli.cliPath),
      copilot_sdk_created: true,
    };

    const budgetTelemetry = {
      router: {},
      provider: null,
      autoFixPasses: [],
    };
    const buildSessionHooks = (stage) => createSessionHooks({
      pluginRuntime: _pr,
      bridge: _bridge,
      runId,
      stage,
      workingDirectory: workspacePath,
      output: options.output,
      config: routing,
    });

    const plannerPrompt = buildPlannerPrompt(goal, routing);
    budgetTelemetry.router.planner = plannerPrompt.budget;

    const plannerText = await sendSession({
      client,
      model: routing.plannerModel,
      prompt: plannerPrompt.prompt,
      systemMessage: "Return JSON only. No markdown fences.",
      workingDirectory: workspacePath,
      onPermissionRequest: permissionHandler,
      allowTools: false,
      hooks: buildSessionHooks('planner'),
      timeoutMs: routing.sessionWaitTimeoutMs,
    });

    recordStepWithCompression(contextSystem, run, runPaths.events, {
      step_id: "planner",
      action: "copilot-planner",
      command: routing.plannerModel,
      result: plannerText,
      exit_code: 0,
      retry_index: 0,
      risk_level: "medium",
      mode: "autonomous",
    });

    const plan = normalizePlan(parseJsonResponse(plannerText, buildFallbackPlan(goal, routing)), goal, routing);
    cliLog(options.output, `[freejt7-router] planner generated ${plan.tasks.length} task(s)`);

    const executionResults = [];
    for (let index = 0; index < plan.tasks.length; index += 1) {
      const task = plan.tasks[index];
      const model = selectExecutionModel(task, routing);
      cliLog(options.output, `[freejt7-router] ${task.id} -> ${model}`);
      try {
        const executorPrompt = buildExecutorPrompt(goal, plan.summary, task, model);
        const executorText = await sendSession({
          client,
          model,
          prompt: executorPrompt.prompt,
          systemMessage: "You are a coding executor. Use tools when needed. Return JSON only.",
          workingDirectory: workspacePath,
          onPermissionRequest: permissionHandler,
          allowTools: true,
          hooks: buildSessionHooks(`executor:${task.id}`),
          timeoutMs: routing.sessionWaitTimeoutMs,
        });

        const parsedResult = parseJsonResponse(executorText, {
          status: "completed",
          summary: sanitizeText(executorText, 2000),
          files: [],
          verification: [],
          residualRisks: [],
        });
        parsedResult.taskId = task.id;
        parsedResult.model = model;
        parsedResult.contextBudget = executorPrompt.budget;
        executionResults.push(parsedResult);

        recordStepWithCompression(contextSystem, run, runPaths.events, {
          step_id: task.id,
          action: "copilot-executor",
          command: model,
          result: executorText,
          exit_code: 0,
          retry_index: 0,
          risk_level: task.risk,
          mode: "autonomous",
        });
        _bridge.appendSessionEvent(runId, 'task-result', {
          taskId: task.id,
          model,
          status: parsedResult.status || 'completed',
          summary: parsedResult.summary || '',
        });
      } catch (error) {
        const fallbackText = String(error?.message || error || "executor failure");
        // Bug fix #2: Anthropic rejects multi-turn Claude sessions that contain thinking/redacted_thinking
        // blocks in the assistant turn without the matching extended-thinking config.
        // Retry once with the non-Claude fallback model to avoid this SDK-internal issue.
        if (/thinking or redacted_thinking blocks/i.test(fallbackText)) {
          const retryModel = routing.executorFallbackModel || routing.executorContextModel;
          if (retryModel && retryModel !== model) {
            try {
              cliLog(options.output, `[freejt7-router] thinking-blocks retry: ${model} -> ${retryModel}`);
              const retryPrompt = buildExecutorPrompt(goal, plan.summary, task, retryModel);
              const retryText = await sendSession({
                client,
                model: retryModel,
                prompt: retryPrompt.prompt,
                systemMessage: "You are a coding executor. Use tools when needed. Return JSON only.",
                workingDirectory: workspacePath,
                onPermissionRequest: permissionHandler,
                allowTools: true,
                hooks: buildSessionHooks(`executor-retry:${task.id}`),
                timeoutMs: routing.sessionWaitTimeoutMs,
              });
              const retryResult = parseJsonResponse(retryText, {
                status: "completed",
                summary: sanitizeText(retryText, 2000),
                files: [],
                verification: [],
                residualRisks: [],
              });
              retryResult.taskId = task.id;
              retryResult.model = retryModel;
              retryResult.contextBudget = retryPrompt.budget;
              executionResults.push(retryResult);
              recordStepWithCompression(contextSystem, run, runPaths.events, {
                step_id: task.id,
                action: "copilot-executor",
                command: retryModel,
                result: retryText,
                exit_code: 0,
                retry_index: 1,
                risk_level: task.risk,
                mode: "autonomous",
              });
              _bridge.appendSessionEvent(runId, 'task-result', {
                taskId: task.id,
                model: retryModel,
                status: retryResult.status || 'completed',
                summary: retryResult.summary || '',
                retry: true,
              });
              // eslint-disable-next-line no-continue
              continue;
            } catch (_retryError) {
              // retry also failed — fall through to original error handling below
            }
          }
        }
        executionResults.push({
          taskId: task.id,
          model,
          status: "failed",
          summary: fallbackText,
          files: [],
          verification: [],
          residualRisks: [fallbackText],
        });
        recordStepWithCompression(contextSystem, run, runPaths.events, {
          step_id: task.id,
          action: "copilot-executor",
          command: model,
          result: fallbackText,
          exit_code: 1,
          retry_index: 0,
          risk_level: task.risk,
          mode: "autonomous",
        });
        _bridge.appendSessionEvent(runId, 'task-result', {
          taskId: task.id,
          model,
          status: 'failed',
          summary: fallbackText,
        });
      }
    }

    let reviewStage = createSkippedReviewResult(executionResults);
    const reviewHistory = [];
    if (shouldRunReviewStage(plan, executionResults, routing)) {
      const reviewPrompt = buildReviewPrompt(goal, plan, executionResults, routing);
      budgetTelemetry.router.review = reviewPrompt.budget;
      const reviewText = await sendSession({
        client,
        model: routing.reviewModel,
        prompt: reviewPrompt.prompt,
        systemMessage: "You are a strict verifier. Return JSON only and do not use tools.",
        workingDirectory: workspacePath,
        onPermissionRequest: permissionHandler,
        allowTools: false,
        hooks: buildSessionHooks('review'),
        timeoutMs: routing.sessionWaitTimeoutMs,
      });

      const parsedReview = parseJsonResponse(
        reviewText,
        buildFallbackReviewResult("Review stage returned invalid JSON and the closure gate stays blocked."),
      );
      reviewStage = normalizeReviewResult(parsedReview, plan, executionResults, routing);
      reviewHistory.push({ passIndex: 0, review: reviewStage, budget: reviewPrompt.budget });

      recordStepWithCompression(contextSystem, run, runPaths.events, {
        step_id: "review-stage",
        action: "copilot-review",
        command: routing.reviewModel,
        result: reviewText,
        exit_code: reviewStage.closingGate?.passed ? 0 : 1,
        retry_index: 0,
        risk_level: "medium",
        mode: "autonomous",
      });
      _bridge.appendSessionEvent(runId, 'route-review', {
        status: reviewStage.status,
        summary: reviewStage.summary,
        findings: reviewStage.findings,
        closingGate: reviewStage.closingGate,
      });
      _bridge.recordGateState(runId, reviewStage, { stage: 'review', passIndex: 0, pointerStage: 'review' });
      await _pr.emit('onRouteReview', { goal, runId, review: reviewStage });

      let autoFixPass = 0;
      while (shouldAttemptAutoFix(reviewStage, routing, autoFixPass)) {
        const autoFixModel = selectAutoFixModel(reviewStage, routing);
        const autoFixPrompt = buildAutoFixPrompt(goal, plan, executionResults, reviewStage, autoFixPass, routing);
        budgetTelemetry.autoFixPasses.push(autoFixPrompt.budget);
        const autoFixText = await sendSession({
          client,
          model: autoFixModel,
          prompt: autoFixPrompt.prompt,
          systemMessage: 'You are an auto-remediation executor. Use tools when needed. Return JSON only.',
          workingDirectory: workspacePath,
          onPermissionRequest: permissionHandler,
          allowTools: true,
          hooks: buildSessionHooks(`autofix:${autoFixPass + 1}`),
          timeoutMs: routing.sessionWaitTimeoutMs,
        });
        const autoFixResult = parseJsonResponse(autoFixText, {
          status: 'completed',
          summary: sanitizeText(autoFixText, 2000),
          files: [],
          verification: [],
          residualRisks: [],
          fixesApplied: [],
        });
        autoFixResult.taskId = `review-fix-${autoFixPass + 1}`;
        autoFixResult.model = autoFixModel;
        autoFixResult.contextBudget = autoFixPrompt.budget;
        autoFixResult.fixesApplied = uniqueStrings(autoFixResult.fixesApplied || []);
        executionResults.push(autoFixResult);
        recordStepWithCompression(contextSystem, run, runPaths.events, {
          step_id: autoFixResult.taskId,
          action: 'copilot-autofix',
          command: autoFixModel,
          result: autoFixText,
          exit_code: 0,
          retry_index: autoFixPass,
          risk_level: 'medium',
          mode: 'autonomous',
        });
        _bridge.appendSessionEvent(runId, 'route-autofix', {
          passIndex: autoFixPass + 1,
          taskId: autoFixResult.taskId,
          status: autoFixResult.status || 'completed',
          fixesApplied: autoFixResult.fixesApplied || [],
          summary: autoFixResult.summary || '',
        });
        _bridge.markResumePointer(runId, {
          stage: 'autofix',
          passIndex: autoFixPass + 1,
          lastTaskId: autoFixResult.taskId,
        });

        const reReviewPrompt = buildReviewPrompt(goal, plan, executionResults, routing);
        const reReviewText = await sendSession({
          client,
          model: routing.reviewModel,
          prompt: reReviewPrompt.prompt,
          systemMessage: 'You are a strict verifier. Return JSON only and do not use tools.',
          workingDirectory: workspacePath,
          onPermissionRequest: permissionHandler,
          allowTools: false,
          hooks: buildSessionHooks(`rereview:${autoFixPass + 1}`),
          timeoutMs: routing.sessionWaitTimeoutMs,
        });
        const parsedReReview = parseJsonResponse(
          reReviewText,
          buildFallbackReviewResult('Re-review returned invalid JSON and the closure gate stays blocked.'),
        );
        reviewStage = normalizeReviewResult(parsedReReview, plan, executionResults, routing);
        reviewHistory.push({ passIndex: autoFixPass + 1, review: reviewStage, budget: reReviewPrompt.budget });
        recordStepWithCompression(contextSystem, run, runPaths.events, {
          step_id: `review-stage-${autoFixPass + 2}`,
          action: 'copilot-rereview',
          command: routing.reviewModel,
          result: reReviewText,
          exit_code: reviewStage.closingGate?.passed ? 0 : 1,
          retry_index: autoFixPass,
          risk_level: 'medium',
          mode: 'autonomous',
        });
        _bridge.recordGateState(runId, reviewStage, { stage: 'autofix-review', passIndex: autoFixPass + 1, pointerStage: 'review' });
        await _pr.emit('onRouteReview', { goal, runId, review: reviewStage });
        autoFixPass += 1;
      }
    } else {
      reviewStage = createSkippedReviewResult(executionResults, "Review stage skipped by policy: single-pass low-risk execution.");
      _bridge.appendSessionEvent(runId, 'route-review-skipped', {
        summary: reviewStage.summary,
        closingGate: reviewStage.closingGate,
      });
      _bridge.recordGateState(runId, reviewStage, { stage: 'review-skipped', passIndex: 0, pointerStage: 'review' });
    }

    const synthesisPrompt = buildSynthesisPrompt(goal, plan, executionResults, reviewStage, routing.synthesisModel);
    budgetTelemetry.router.synthesis = synthesisPrompt.budget;
    const synthesisText = await sendSession({
      client,
      model: routing.synthesisModel,
      prompt: synthesisPrompt.prompt,
      systemMessage: "Summarize only from provided execution results. Return JSON only.",
      workingDirectory: workspacePath,
      onPermissionRequest: permissionHandler,
      allowTools: false,
      hooks: buildSessionHooks('synthesis'),
      timeoutMs: routing.sessionWaitTimeoutMs,
    });

    recordStepWithCompression(contextSystem, run, runPaths.events, {
      step_id: "synthesis",
      action: "copilot-synthesis",
      command: routing.synthesisModel,
      result: synthesisText,
      exit_code: 0,
      retry_index: 0,
      risk_level: "medium",
      mode: "autonomous",
    });

    const final = finalizeRouterOutcome(parseJsonResponse(synthesisText, {
      status: executionResults.some((item) => item.status === "failed") ? "partial" : "completed",
      summary: sanitizeText(synthesisText, 2000),
      completedTasks: executionResults.filter((item) => item.status !== "failed").map((item) => item.taskId),
      changedFiles: executionResults.flatMap((item) => item.files || []),
      verification: executionResults.flatMap((item) => item.verification || []),
      findings: reviewStage.findings,
      fixesApplied: reviewStage.fixesApplied,
      residualRisks: executionResults.flatMap((item) => item.residualRisks || []),
    }), executionResults, reviewStage);

    run.ended_at = nowIso();
    run.status = final.status === "completed" ? "completed" : "blocked";
    run.summary = final.summary || "Free JT7 Copilot router finished.";
    run.quality_gate = {
      ...run.quality_gate,
      passed: Boolean(final.closingGate?.passed),
      reviewStageTriggered: Boolean(reviewStage.triggered),
      findingCount: Array.isArray(final.findings) ? final.findings.length : 0,
      blockingFindingCount: Array.isArray(final.closingGate?.blockingFindings) ? final.closingGate.blockingFindings.length : 0,
    };
    run.review_stage = reviewStage;
    run.review_history = reviewHistory.map((entry) => ({
      passIndex: entry.passIndex,
      status: entry.review.status,
      summary: entry.review.summary,
      closingGate: entry.review.closingGate,
      budget: entry.budget,
    }));
    run.context_budget = {
      ...budgetTelemetry,
      memory: contextSystem?.hierarchy?.getStats ? contextSystem.hierarchy.getStats() : null,
    };
    writeJson(runPaths.json, run);
    _bridge.appendSessionEvent(runId, 'route-end', {
      status: run.status,
      summary: run.summary,
      changedFiles: Array.isArray(final.changedFiles) ? final.changedFiles : [],
      findings: Array.isArray(final.findings) ? final.findings : [],
      residualRisks: Array.isArray(final.residualRisks) ? final.residualRisks : [],
      contextBudget: run.context_budget,
    });
    maybeCreateRemoteReview(_bridge, runId, {
      status: run.status,
      summary: run.summary,
      changedFiles: final.changedFiles,
      findings: final.findings,
      residualRisks: final.residualRisks,
    });
    _bridge.markResumePointer(runId, {
      stage: 'completed',
      passIndex: reviewHistory.length ? reviewHistory[reviewHistory.length - 1].passIndex : 0,
      gateStatus: final.closingGate?.passed ? 'passed' : 'blocked',
    });
    _bridge.closeSession(runId, {
      status: run.status,
      summary: run.summary,
    });
    await _pr.emit('onRouteEnd', { goal, runId, status: run.status });
    return {
      runId,
      run,
      final,
      plan,
      executionResults,
      runPaths,
    };
  } catch (error) {
    const message = String(error?.message || error || "unknown router error");
    run.ended_at = nowIso();
    run.status = "blocked";
    run.summary = message;
    run.quality_gate.passed = false;
    recordStepWithCompression(contextSystem, run, runPaths.events, {
      step_id: "router-error",
      action: "copilot-router-error",
      command: cli.label,
      result: message,
      exit_code: 1,
      retry_index: 0,
      risk_level: "medium",
      mode: "autonomous",
    });
    writeJson(runPaths.json, run);
    _bridge.appendSessionEvent(runId, 'route-error', { message });
    maybeCreateRemoteReview(_bridge, runId, {
      status: 'blocked',
      summary: message,
      residualRisks: [message],
    });
    _bridge.closeSession(runId, { status: 'blocked', summary: message });
    if (/No authentication information found|Session was not created with authentication info or custom provider/i.test(message)) {
      throw new Error("Copilot CLI/SDK no tiene autenticacion utilizable. Ejecuta `copilot login`, o configura `COPILOT_GITHUB_TOKEN`, `GH_TOKEN` o `GITHUB_TOKEN` con un token valido para Copilot.");
    }
    await _pr.emit('onError', { goal, runId, error }).catch(() => {});
    throw error;
  } finally {
    releaseRouterRunLock();
    if (contextSystem) {
      await finalizeContextSystem(contextSystem, workspacePath);
    }
    if (client && typeof client.stop === "function") {
      await client.stop().catch(() => {});
    }
  }
}

function parseArgs(argv) {
  const result = { goal: "", workspacePath: process.cwd(), json: false, cliPath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--goal") {
      result.goal = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--workspace") {
      result.workspacePath = argv[index + 1] || result.workspacePath;
      index += 1;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg === "--cli-path") {
      result.cliPath = argv[index + 1] || "";
      index += 1;
    }
  }
  return result;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.goal) {
    console.error("Usage: node copilot_router.js --goal \"...\" [--workspace path] [--json]");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await runCopilotRouter(args);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result.final, null, 2)}\n`);
    } else {
      process.stdout.write(`${result.final.summary}\n`);
    }
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

module.exports = {
  runCopilotRouter,
  runWithRouterRunLock,
  resolveCopilotCliPath,
  resolveCopilotCliCommand,
  readVsCodeLegacyCopilotConfig,
  resolveLegacyCopilotSelection,
  mergeRouterConfig,
  shouldRunReviewStage,
  normalizeReviewResult,
  finalizeRouterOutcome,
  shouldAttemptAutoFix,
  createSessionHooks,
  createNativeToolPolicy,
  buildRunSkeleton,
  main,
};

if (require.main === module) {
  main();
}
