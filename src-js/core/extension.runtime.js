let vscode;
try {
  vscode = require("vscode");
} catch (e) {
  // running outside of VSCode (test environment); provide minimal stubs
  vscode = {
    window: {
      showErrorMessage: () => {},
      showInformationMessage: () => {},
      showWarningMessage: () => {},
      showInputBox: async () => undefined,
      showTextDocument: async () => {},
      createOutputChannel: () => ({append:()=>{},appendLine:()=>{},show:()=>{}}),
    },
    commands: {
      registerCommand: () => ({dispose:()=>{}}),
    },
    workspace: {
      workspaceFolders: [{uri:{fsPath:process.cwd()}}],
      getConfiguration: () => ({get:()=>null}),
      openTextDocument: async () => ({}),
    },
    extensions: {
      getExtension: () => undefined,
    },
  };
}
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { spawn, spawnSync } = require("child_process");
const { createControlPanel } = require("./control-panel");
const {
  callProvider: _callProvider,
  getApiKey,
  getFreeModelsCatalog,
  getFreeModelDefaults,
} = require("../providers/api-provider-adapter");
const {
  buildConversationRequest,
  extractChatContextMessages,
  serializeConversationRequest,
} = require("./chat-context");
const {
  normalizeOpenClawModel,
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
} = require("./openclaw-agent-runtime");
const { runLocalAgentTask, canResolveLocalGoal, deriveLocalActions } = require("./local-agent-runtime");
const { createFreeJt7AgentRuntime } = require("./freejt7-agent-runtime");
const { createDefaultScheduler } = require('../runtime/agent-scheduler');
const { MemoryOrchestrator }     = require('../runtime/memory-orchestrator');
const { getRemoteBridge }        = require('../runtime/remote-bridge');
const { getPluginRuntime }       = require('../runtime/plugin-runtime');
const { runNativeAutonomyDoctor, formatNativeAutonomyDoctor } = require('./native-autonomy-doctor');

const FALLBACK_FREE_MODELS = getFreeModelsCatalog();

const FALLBACK_DEFAULT_MODELS = getFreeModelDefaults();

const DEFAULT_EXTERNAL_PROVIDER = "openrouter";
const DEFAULT_EXTERNAL_MODEL = FALLBACK_DEFAULT_MODELS[DEFAULT_EXTERNAL_PROVIDER] || "";
const GLOBAL_SETTINGS_SYNC_STATE_KEY = "freejt7.globalVsCodeSync";

const INSTALL_IDE_PICK_ITEMS = Object.freeze([
  { label: "VS Code", value: "vscode", detail: "Extensión VS Code y settings de usuario de Code." },
  { label: "Cursor", value: "cursor", detail: "Bridge de workspace y settings de usuario de Cursor." },
  { label: "Kiro", value: "kiro", detail: "Bridge de workspace y settings de usuario de Kiro." },
  { label: "Antigravity", value: "antigravity", detail: "Bridge de workspace y settings de usuario de Antigravity." },
  { label: "Codex", value: "codex", detail: "Config global de Codex en ~/.codex y bridge de workspace." },
  { label: "Claude Code", value: "claude-code", detail: "Config global de Claude Code en ~/.claude y bridge de workspace." },
  { label: "Gemini CLI", value: "gemini-cli", detail: "Config global de Gemini CLI en ~/.gemini y bridge de workspace." },
]);

const INSTALL_IDE_SPECIAL_ITEMS = Object.freeze([
  { label: "Auto", value: "auto", detail: "Detecta IDEs instalados y aplica la integración a los perfiles encontrados." },
  { label: "Todos los IDE soportados", value: "all", detail: "Aplica la integración global y de workspace en todos los IDEs soportados." },
]);

const DEFAULT_ROUTER_SKILLS = [
  {
    id: "agent-orchestration",
    category: "general",
    score: 1,
    gh_path: ".github/skills/agent-orchestration/SKILL.md",
  },
  {
    id: "free-jt7-global-runtime-audit",
    category: "general",
    score: 0.99,
    gh_path: ".github/skills/free-jt7-global-runtime-audit/SKILL.md",
  },
  {
    id: "verification-before-completion",
    category: "general",
    score: 0.98,
    gh_path: ".github/skills/verification-before-completion/SKILL.md",
  },
];

let activeScheduler = null;
let activeControlPanel = null;
const NOOP_OUTPUT = { append() {}, appendLine() {} };

function loadFreeModelsCatalog() {
  // From src-js/core/: "../" = src-js/ (correct)
  // From dist/:        "../" = {root}/ (wrong) → fallback to "../../src-js/"
  const primary = path.resolve(__dirname, "../free-models-catalog.js");
  const secondary = path.resolve(__dirname, "../../src-js/free-models-catalog.js");
  const adapterPrimary = path.resolve(__dirname, "./api-provider-adapter.js");
  const adapterSecondary = path.resolve(__dirname, "../../src-js/core/api-provider-adapter.js");
  const catalogPath = fs.existsSync(primary) ? primary : secondary;
  for (const cachePath of [catalogPath, adapterPrimary, adapterSecondary]) {
    if (fs.existsSync(cachePath)) {
      delete require.cache[cachePath];
    }
  }
  if (fs.existsSync(catalogPath)) {
    return require(catalogPath);
  }
  return {
    getModelsForProvider(provider) {
      return FALLBACK_FREE_MODELS[provider] || [];
    },
    getDefaultModel(provider) {
      return FALLBACK_DEFAULT_MODELS[provider] || "";
    },
  };
}

let freeModelsCatalog = loadFreeModelsCatalog();

function runCommand(bin, args, options, output) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { ...options, shell: false });
    let stderr = "";
    const timeoutMs = Number(options?.timeoutMs || 0);
    let timer = null;

    child.stdout.on("data", (chunk) => {
      output.append(chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      output.append(text);
    });

    child.on("error", (err) => {
      stderr += `${err.message}\n`;
      output.appendLine(err.message);
    });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        stderr += `Timeout de ${timeoutMs}ms\n`;
        try {
          child.kill();
        } catch (_) {}
      }, timeoutMs);
    }

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stderr });
    });
  });
}

function runCommandCapture(bin, args, options, output) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { ...options, shell: false });
    let stdout = "";
    let stderr = "";
    const timeoutMs = Number(options?.timeoutMs || 0);
    let timer = null;

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (output) {
        output.append(text);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (output) {
        output.append(text);
      }
    });

    child.on("error", (err) => {
      stderr += `${err.message}\n`;
      if (output) {
        output.appendLine(err.message);
      }
    });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        stderr += `Timeout de ${timeoutMs}ms\n`;
        try {
          child.kill();
        } catch (_) {}
      }, timeoutMs);
    }

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function summarizeOpenClawGatewayStatus(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const interesting = lines.filter((line) => (
    /^Runtime:/i.test(line)
    || /^RPC probe:/i.test(line)
    || /^Listening:/i.test(line)
    || /^gateway closed/i.test(line)
    || /^Error:/i.test(line)
  ));
  return (interesting[interesting.length - 1] || lines[lines.length - 1] || '').trim();
}

async function getOpenClawGatewayStatus(bin, options = {}) {
  const response = await runCommandCapture(
    bin,
    ['gateway', 'status'],
    {
      cwd: options.cwd,
      env: options.env,
      timeoutMs: Number(options.timeoutMs || 15_000),
    },
    NOOP_OUTPUT,
  );
  const text = `${response.stdout || ''}\n${response.stderr || ''}`.trim();
  return {
    ...response,
    text,
    ready: isOpenClawGatewayReady(text),
  };
}

function spawnDetachedOpenClawGateway(bin, options = {}) {
  const logPath = String(options.logPath || '').trim();
  if (!logPath) {
    throw new Error('spawnDetachedOpenClawGateway requiere logPath.');
  }
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = fs.openSync(logPath, 'a');
  const shell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
  const child = spawn(
    bin,
    ['gateway', '--force', '--verbose', 'run'],
    {
      cwd: options.cwd,
      env: options.env,
      detached: true,
      shell,
      stdio: ['ignore', logFd, logFd],
    },
  );
  child.on('error', () => {});
  child.unref();
  fs.closeSync(logFd);
  return child.pid || 0;
}

async function ensureOpenClawGatewayAvailable(output, options = {}) {
  const bin = String(options.bin || '').trim();
  const cwd = String(options.cwd || '').trim() || process.cwd();
  const env = options.env && typeof options.env === 'object' ? options.env : process.env;
  const config = options.config && typeof options.config === 'object' ? options.config : {};
  const stateDir = String(options.stateDir || '').trim();
  const gateway = getOpenClawGatewayConfig(config);
  const gatewayUrl = buildOpenClawGatewayUrl(config);
  const initialStatus = await getOpenClawGatewayStatus(bin, {
    cwd,
    env,
    timeoutMs: options.statusTimeoutMs,
  });
  if (initialStatus.ready) {
    output.appendLine(`[freejt7-openclaw] Gateway listo en ${gatewayUrl}`);
    return {
      started: false,
      gatewayUrl,
      gateway,
      logPath: '',
      status: initialStatus.text,
    };
  }

  const logPath = path.join(stateDir || cwd, 'logs', 'freejt7-openclaw-gateway-autostart.log');
  const pid = spawnDetachedOpenClawGateway(bin, { cwd, env, logPath });
  output.appendLine(`[freejt7-openclaw] Gateway no listo; autostart en ${gatewayUrl} (pid=${pid || 'n/a'})`);
  output.appendLine(`[freejt7-openclaw] Log gateway: ${logPath}`);

  const startupTimeoutMs = Math.max(5_000, Number(options.startupTimeoutMs || 25_000));
  const pollIntervalMs = Math.max(500, Number(options.pollIntervalMs || 1_250));
  const deadline = Date.now() + startupTimeoutMs;
  let lastStatus = initialStatus.text;
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const probe = await getOpenClawGatewayStatus(bin, {
      cwd,
      env,
      timeoutMs: options.statusTimeoutMs,
    });
    if (probe.text) {
      lastStatus = probe.text;
    }
    if (probe.ready) {
      output.appendLine(`[freejt7-openclaw] Gateway operativo en ${gatewayUrl}`);
      return {
        started: true,
        gatewayUrl,
        gateway,
        logPath,
        status: probe.text,
      };
    }
  }

  throw createOpenClawTaggedError(
    `Free JT7: el gateway OpenClaw no quedo operativo tras el autostart (${gatewayUrl}). ${summarizeOpenClawGatewayStatus(lastStatus) || 'Revisa openclaw gateway status.'}`,
    { isRetryable: true, isConfigurationError: false, isUserActionRequired: false },
  );
}

function createTrackedRunId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "T");
  return `${stamp}-${randomUUID().slice(0, 8)}`;
}

function getSkillsManagerPath(context) {
  return path.join(context.extensionPath, "skills_manager.py");
}

function normalizeResolvedSkills(skills) {
  if (!Array.isArray(skills) || skills.length === 0) {
    return DEFAULT_ROUTER_SKILLS;
  }
  return skills
    .filter((item) => item && item.id)
    .map((item) => ({
      id: String(item.id),
      category: String(item.category || "general"),
      score: Number(item.score || 0),
      gh_path: String(item.gh_path || item.path || `.github/skills/${item.id}/SKILL.md`),
    }));
}

function formatResolvedSkills(skills) {
  return normalizeResolvedSkills(skills).map((item) => item.id).join(", ");
}

async function runSkillsManagerJson(context, output, managerArgs) {
  const managerPath = getSkillsManagerPath(context);
  if (!fs.existsSync(managerPath)) {
    throw new Error(`Free JT7: no se encontro ${managerPath}.`);
  }
  const py = pythonCommand(context.extensionPath);
  const args = [...py.args, managerPath, ...managerArgs];
  const result = await runCommandCapture(py.bin, args, { cwd: context.extensionPath }, output);
  if (result.code !== 0) {
    const detail = String(result.stderr || result.stdout || "error desconocido").trim();
    throw new Error(detail || `skills_manager.py ${managerArgs[0]} fallo con codigo ${result.code}`);
  }
  try {
    return JSON.parse(result.stdout || "null");
  } catch (error) {
    throw new Error(`Free JT7: salida JSON invalida de skills_manager.py ${managerArgs[0]} (${error.message}).`);
  }
}

async function resolveSkillsForGoal(context, output, goal) {
  try {
    const items = await runSkillsManagerJson(context, output, ["skill-resolve", "--query", goal, "--top", "3", "--json"]);
    const normalized = normalizeResolvedSkills(items);
    output.appendLine(`[freejt7-router] skills=${formatResolvedSkills(normalized)}`);
    return normalized;
  } catch (error) {
    output.appendLine(`[freejt7-router] skill-resolve fallback: ${String(error.message || error)}`);
    return DEFAULT_ROUTER_SKILLS;
  }
}

async function startTrackedTask(context, output, runId, goal) {
  const managerPath = getSkillsManagerPath(context);
  if (!fs.existsSync(managerPath)) {
    throw new Error(`Free JT7: no se encontro ${managerPath}.`);
  }
  const py = pythonCommand(context.extensionPath);
  const args = [
    ...py.args,
    managerPath,
    "task-start",
    "--run-id",
    runId,
    "--goal",
    goal,
    "--scope",
    "workspace",
    "--ide",
    "vscode",
    "--profile",
    "default",
  ];
  const result = await runCommand(py.bin, args, { cwd: context.extensionPath }, output);
  if (result.code !== 0) {
    throw new Error("Free JT7: no se pudo abrir la trazabilidad inicial con task-start.");
  }
}

async function closeTrackedTask(context, output, runId, summary) {
  const managerPath = getSkillsManagerPath(context);
  if (!fs.existsSync(managerPath)) {
    throw new Error(`Free JT7: no se encontro ${managerPath}.`);
  }
  const py = pythonCommand(context.extensionPath);
  const args = [
    ...py.args,
    managerPath,
    "task-close",
    "--run-id",
    runId,
    "--summary",
    summary,
  ];
  const result = await runCommand(py.bin, args, { cwd: context.extensionPath }, output);
  return result.code === 0;
}

async function collectMandatoryIntake(baseGoal) {
  const deliverable = await vscode.window.showInputBox({
    prompt: "Aclaracion obligatoria 1/3: ¿cual es el entregable esperado exactamente?",
    value: baseGoal,
    ignoreFocusOut: true,
  });
  if (deliverable === undefined) {
    return null;
  }

  const constraints = await vscode.window.showInputBox({
    prompt: "Aclaracion obligatoria 2/3: indica restricciones, limites o no-goals.",
    placeHolder: "Ej: no tocar X, cambios minimos, sin romper compatibilidad...",
    ignoreFocusOut: true,
  });
  if (constraints === undefined) {
    return null;
  }

  const verification = await vscode.window.showInputBox({
    prompt: "Aclaracion obligatoria 3/3: ¿como debe verificarse el resultado?",
    placeHolder: "Ej: build, pruebas, lint, validacion manual, evidencia requerida...",
    ignoreFocusOut: true,
  });
  if (verification === undefined) {
    return null;
  }

  return {
    deliverable: String(deliverable || baseGoal).trim(),
    constraints: String(constraints || "Sin restricciones adicionales declaradas.").trim(),
    verification: String(verification || "Validacion ligera requerida.").trim(),
  };
}

function buildAuditedRouterGoal(baseGoal, intake, skills) {
  const resolvedSkills = normalizeResolvedSkills(skills);
  return [
    "Solicitud base:",
    String(baseGoal || "").trim(),
    "",
    "Aclaraciones obligatorias previas al plan:",
    `- Entregable esperado: ${intake.deliverable}`,
    `- Restricciones / no-goals: ${intake.constraints}`,
    `- Verificacion esperada: ${intake.verification}`,
    "",
    "Skills prioritarios ya resueltos:",
    ...resolvedSkills.map((item) => `- ${item.id}`),
    "",
    "Politica operativa obligatoria:",
    "- Hacer desglose de micro-tareas antes de ejecutar.",
    "- Mantener checklist y trazabilidad en docs/TASKS.md y copilot-agent/.",
    "- La delegacion a sub-agentes es preferente cuando mejore aislamiento, calidad o velocidad; si no se usa, justificarlo brevemente.",
    "- No declarar exito sin verificacion y cierre trazado.",
  ].join("\n");
}

async function prepareAuditedTask(context, output, baseGoal) {
  const intake = await collectMandatoryIntake(baseGoal);
  if (!intake) {
    return null;
  }
  const preSkillGoal = [
    String(baseGoal || "").trim(),
    `Entregable: ${intake.deliverable}`,
    `Restricciones: ${intake.constraints}`,
    `Verificacion: ${intake.verification}`,
  ].join("\n");
  const selectedSkills = await resolveSkillsForGoal(context, output, preSkillGoal);
  const goal = buildAuditedRouterGoal(baseGoal, intake, selectedSkills);
  const runId = createTrackedRunId();
  await startTrackedTask(context, output, runId, goal);
  output.appendLine(`[freejt7-router] intake-completo run_id=${runId}`);
  return { goal, runId, intake, selectedSkills };
}

function buildAssumedPanelIntake(baseGoal) {
  return {
    deliverable: String(baseGoal || '').trim() || 'Resolver la solicitud del usuario en el panel.',
    constraints: 'Cambios minimos, compatibles hacia atras y sin pedir al usuario que repita contexto ya visible en la sesion.',
    verification: 'Validacion ligera con evidencia breve en la respuesta o en la trazabilidad.',
  };
}

async function preparePanelTask(context, output, taskInput = {}, meta = {}) {
  const goal = String(taskInput.goal || taskInput.prompt || '').trim();
  if (!goal) {
    return taskInput;
  }
  const intake = buildAssumedPanelIntake(goal);
  let selectedSkills = DEFAULT_ROUTER_SKILLS;
  let runId = '';

  try {
    const preSkillGoal = [
      goal,
      `Entregable: ${intake.deliverable}`,
      `Restricciones: ${intake.constraints}`,
      `Verificacion: ${intake.verification}`,
    ].join('\n');
    selectedSkills = await resolveSkillsForGoal(context, output, preSkillGoal);
    const tracedGoal = buildAuditedRouterGoal(goal, intake, selectedSkills);
    runId = createTrackedRunId();
    await startTrackedTask(context, output, runId, tracedGoal);
    output.appendLine(`[freejt7-panel] task preparada run_id=${runId} skills=${formatResolvedSkills(selectedSkills)}`);
  } catch (error) {
    const detail = String(error?.message || error);
    output.appendLine(`[freejt7-panel] prepareTask degradado: ${detail}`);
    // Modo degradado: no bloquear el chat por fallo de trazabilidad/skills.
    runId = '';
    selectedSkills = DEFAULT_ROUTER_SKILLS;
  }

  return {
    ...taskInput,
    runId,
    intake,
    selectedSkills,
    sessionTitle: String(meta.sessionTitle || taskInput.sessionTitle || 'Sesion Free JT7').trim(),
  };
}

function isWorkingPython(bin, prefixArgs = []) {
  try {
    const result = spawnSync(bin, [...prefixArgs, "-c", "import sys"], {
      stdio: "ignore",
      shell: false,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function pythonCommand(extensionPath) {
  const candidates = [
    { bin: path.join(extensionPath, ".venv", "Scripts", "python.exe"), args: [] },
    { bin: path.join(extensionPath, ".venv", "bin", "python"), args: [] },
    { bin: "python3", args: [] },
    { bin: "python", args: [] },
  ];
  if (process.platform === "win32") {
    candidates.push({ bin: "py", args: ["-3"] });
  }
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate.bin) && !fs.existsSync(candidate.bin)) {
      continue;
    }
    if (isWorkingPython(candidate.bin, candidate.args)) {
      return candidate;
    }
  }
  return { bin: "python", args: [] };
}

function getPrimaryWorkspacePath() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return "";
  }
  return folders[0].uri.fsPath;
}

function workspaceHasFreeJt7Signals(workspacePath) {
  if (!workspacePath) {
    return false;
  }
  const markers = [
    path.join(workspacePath, ".github", "free-jt7-instructions.md"),
    path.join(workspacePath, ".github", "free-jt7-policy.yaml"),
    path.join(workspacePath, ".github", "free-jt7-model-routing.json"),
    path.join(workspacePath, "copilot-agent", "tasks.yaml"),
  ];
  return markers.some((marker) => fs.existsSync(marker));
}

function isManagedWorkspace(workspacePath) {
  return workspaceHasFreeJt7Signals(workspacePath);
}

function getGlobalRuntimeRoot(context) {
  return context.globalStorageUri?.fsPath || path.join(context.extensionPath, ".freejt7-runtime");
}

function getOperationalRoot(context) {
  const workspacePath = getPrimaryWorkspacePath();
  if (isManagedWorkspace(workspacePath)) {
    return workspacePath;
  }
  return getGlobalRuntimeRoot(context);
}

function getExtensionById(...ids) {
  for (const id of ids) {
    try {
      const extension = vscode.extensions?.getExtension?.(id);
      if (extension) {
        return extension;
      }
    } catch {
      // ignore extension lookup failures in constrained runtimes
    }
  }
  return undefined;
}

function getChatDiagnostics() {
  const chatApiAvailable = Boolean(vscode.chat?.createChatParticipant);
  const issues = [];
  const optionalIssues = [];

  if (!chatApiAvailable) {
    optionalIssues.push("La API de chat de VS Code no esta disponible en esta sesion (`vscode.chat.createChatParticipant`).");
  }

  return {
    ok: true,
    issues,
    optionalIssues,
    participantAvailable: optionalIssues.length === 0,
    chatApiAvailable,
  };
}

function appendDoctorDiagnostics(output, py) {
  const diagnostics = getChatDiagnostics();
  output.appendLine(`[freejt7] Python: ${[py.bin, ...py.args].join(" ")}`);
  output.appendLine(`[freejt7] Chat API disponible: ${diagnostics.chatApiAvailable ? "si" : "no"}`);
  for (const issue of diagnostics.issues || []) {
    output.appendLine(`[freejt7] chat-diagnostico: ${issue}`);
  }
  for (const issue of diagnostics.optionalIssues || []) {
    output.appendLine(`[freejt7] chat-opcional: ${issue}`);
  }
  return diagnostics;
}

function getInstallIdeLabel(ide) {
  const items = [...INSTALL_IDE_SPECIAL_ITEMS, ...INSTALL_IDE_PICK_ITEMS];
  const match = items.find((item) => item.value === ide);
  return match ? match.label : ide;
}

async function pickInstallIde(defaultIde, options = {}) {
  const includeSpecialItems = Boolean(options.includeSpecialItems);
  const items = [
    ...(includeSpecialItems ? INSTALL_IDE_SPECIAL_ITEMS : []),
    ...INSTALL_IDE_PICK_ITEMS,
  ].map((item) => ({
    ...item,
    description: item.value === defaultIde ? "Configurado actualmente" : "",
  }));

  const selection = await vscode.window.showQuickPick(items, {
    placeHolder: options.placeHolder || "Selecciona el IDE objetivo para la instalación de Free JT7",
    ignoreFocusOut: true,
  });

  return selection ? selection.value : "";
}

async function runManagedInstall(context, output, installOptions) {
  const managerPath = path.join(context.extensionPath, "skills_manager.py");
  if (!fs.existsSync(managerPath)) {
    const message = `Free JT7: no se encontro ${managerPath}.`;
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }

  const py = pythonCommand(context.extensionPath);
  const args = [
    ...py.args,
    managerPath,
    "install",
    installOptions.targetPath,
    "--ide",
    installOptions.ide,
  ];

  if (installOptions.updateUserSettings) {
    args.push("--update-user-settings");
  }
  if (installOptions.userSettingsOnly) {
    args.push("--user-settings-only");
  }
  if (installOptions.force) {
    args.push("--force");
  }

  output.appendLine(installOptions.startMessage);
  output.appendLine(`[freejt7] ${[py.bin, ...args].map((arg) => `"${arg}"`).join(" ")}`);
  output.show(true);

  const result = await runCommand(py.bin, args, { cwd: context.extensionPath }, output);
  const notify = installOptions.notify !== false;
  if (result.code === 0) {
    if (notify && installOptions.successMessage) {
      vscode.window.showInformationMessage(installOptions.successMessage);
    }
    return { ok: true, message: installOptions.successMessage };
  }

  if (notify && installOptions.errorMessage) {
    vscode.window.showErrorMessage(installOptions.errorMessage);
  }
  return { ok: false, message: installOptions.errorMessage };
}

async function installWorkspace(context, output) {
  const workspacePath = getPrimaryWorkspacePath();
  if (!workspacePath) {
    const message = "Free JT7: abre un workspace antes de instalar.";
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }

  const managerPath = path.join(context.extensionPath, "skills_manager.py");
  if (!fs.existsSync(managerPath)) {
    const message = `Free JT7: no se encontro ${managerPath}.`;
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }

  const config = vscode.workspace.getConfiguration("freejt7");
  const ide = config.get("install.ide", "vscode");
  const updateUserSettings = config.get("install.updateUserSettings", true);
  const force = config.get("install.force", false);

  return runManagedInstall(context, output, {
    targetPath: workspacePath,
    ide,
    updateUserSettings,
    force,
    startMessage: `[freejt7] Iniciando instalacion de workspace para ${getInstallIdeLabel(ide)}...`,
    successMessage: `Free JT7: instalacion completada correctamente para ${getInstallIdeLabel(ide)}.`,
    errorMessage: `Free JT7: fallo la instalacion para ${getInstallIdeLabel(ide)}. Revisa el Output 'Free JT7'.`,
  });
}

async function installGlobalVsCode(context, output) {
  const config = vscode.workspace.getConfiguration("freejt7");
  const force = config.get("install.force", false);

  return runManagedInstall(context, output, {
    targetPath: context.extensionPath,
    ide: "vscode",
    updateUserSettings: true,
    userSettingsOnly: true,
    force,
    startMessage: "[freejt7] Aplicando configuracion global de VS Code...",
    successMessage: "Free JT7: configuracion global de VS Code aplicada correctamente.",
    errorMessage: "Free JT7: fallo la configuracion global de VS Code. Revisa el Output 'Free JT7'.",
  });
}

async function installGlobalMultiIde(context, output) {
  const config = vscode.workspace.getConfiguration("freejt7");
  const configuredIde = config.get("install.ide", "auto");
  const ide = await pickInstallIde(configuredIde, {
    includeSpecialItems: true,
    placeHolder: "Selecciona el IDE o alcance global que quieres configurar",
  });

  if (!ide) {
    return { ok: false, message: "Free JT7: instalacion global multi-IDE cancelada." };
  }

  const force = config.get("install.force", false);
  const result = await runManagedInstall(context, output, {
    targetPath: context.extensionPath,
    ide,
    updateUserSettings: true,
    userSettingsOnly: true,
    force,
    startMessage: `[freejt7] Aplicando configuracion global para ${getInstallIdeLabel(ide)}...`,
    successMessage: `Free JT7: configuracion global aplicada para ${getInstallIdeLabel(ide)}.`,
    errorMessage: `Free JT7: fallo la configuracion global para ${getInstallIdeLabel(ide)}. Revisa el Output 'Free JT7'.`,
  });

  if (result.ok) {
    result.message = `${result.message} Usa la instalacion de workspace solo cuando quieras bootstrap explicito del proyecto.`;
  }
  return result;
}

async function ensureGlobalVsCodeSettings(context, output) {
  const config = vscode.workspace.getConfiguration("freejt7");
  if (!config.get("autoRepairGlobalSettings", true)) {
    return;
  }
  const version = getCurrentExtensionVersion(context);
  const syncState = context.globalState?.get?.(GLOBAL_SETTINGS_SYNC_STATE_KEY) || {};
  const targets = getGlobalVsCodeSettingsTargets(context);
  const snapshot = getGlobalVsCodeSettingsSnapshot();
  const repairState = getGlobalVsCodeSettingsRepairState(targets, snapshot);
  const alreadySynced = syncState.version === version && syncState.extensionPath === context.extensionPath;
  if (alreadySynced && !repairState.needsRepair) {
    return;
  }

  if (repairState.needsRepair) {
    output.appendLine(`[freejt7] Drift detectado en settings globales de VS Code: ${repairState.reasons.join(", ")}`);
  }

  const result = await runManagedInstall(context, output, {
    targetPath: context.extensionPath,
    ide: "vscode",
    updateUserSettings: true,
    userSettingsOnly: true,
    force: false,
    notify: false,
    startMessage: `[freejt7] Reparando settings globales de VS Code para ${context.extensionPath}...`,
    successMessage: "",
    errorMessage: "",
  });

  if (result.ok) {
    output.appendLine("[freejt7] Settings globales de VS Code reparados para la extension instalada.");
    await context.globalState?.update?.(GLOBAL_SETTINGS_SYNC_STATE_KEY, {
      version,
      extensionPath: context.extensionPath,
      syncedAt: new Date().toISOString(),
    });
  } else {
    output.appendLine("[freejt7] WARN: no se pudieron reparar los settings globales de VS Code automaticamente.");
  }
}

async function ensureWorkspaceBridge(context, output) {
  const config = vscode.workspace.getConfiguration("freejt7");
  if (!config.get("autoInstallWorkspaceBridge", true)) {
    return;
  }
  const workspacePath = getPrimaryWorkspacePath();
  if (!workspacePath) {
    return;
  }
  if (path.resolve(workspacePath) === path.resolve(context.extensionPath)) {
    return;
  }
  if (!workspaceHasFreeJt7Signals(workspacePath)) {
    output.appendLine(`[freejt7] Workspace no gestionado; no se instala bridge automatico en ${workspacePath}.`);
    return;
  }
  if (!workspaceNeedsBridge(workspacePath)) {
    return;
  }

  const result = await runManagedInstall(context, output, {
    targetPath: workspacePath,
    ide: "vscode",
    updateUserSettings: false,
    force: false,
    notify: false,
    startMessage: `[freejt7] Instalando bridge automatico para el workspace ${workspacePath}...`,
    successMessage: "",
    errorMessage: "",
  });

  if (result.ok) {
    output.appendLine(`[freejt7] Bridge automatico instalado en ${workspacePath}.`);
  } else {
    output.appendLine(`[freejt7] WARN: no se pudo instalar el bridge automatico en ${workspacePath}.`);
  }
}

async function runtimeDoctor(context, output) {
  const nativeDoctor = runNativeAutonomyDoctor({ rootDir: context.extensionPath });
  output.appendLine(formatNativeAutonomyDoctor(nativeDoctor));
  if (!nativeDoctor.ok) {
    const message = "Free JT7: doctor nativo detecto contratos requeridos faltantes.";
    vscode.window.showErrorMessage(message);
    return { ok: false, message, nativeDoctor };
  }

  const managerPath = path.join(context.extensionPath, "skills_manager.py");
  if (!fs.existsSync(managerPath)) {
    const message = `Free JT7: no se encontro ${managerPath}.`;
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }

  const py = pythonCommand(context.extensionPath);
  output.appendLine(`[freejt7] Runtime doctor usando ${[py.bin, ...py.args].join(" ")}`);
  const chatDiagnostics = appendDoctorDiagnostics(output, py);
  output.show(true);

  const first = await runCommand(py.bin, [...py.args, managerPath, "policy-validate"], { cwd: context.extensionPath }, output);
  if (first.code !== 0) {
    const message = "Free JT7: policy-validate fallo. Revisa Output 'Free JT7'.";
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }

  const second = await runCommand(py.bin, [...py.args, managerPath, "ide-detect", "--json"], { cwd: context.extensionPath }, output);
  if (second.code === 0) {
    const message = "Free JT7: runtime validado.";
    vscode.window.showInformationMessage(message);
    return { ok: true, message };
  } else {
    const message = "Free JT7: policy OK, pero ide-detect reporto errores.";
    vscode.window.showWarningMessage(message);
    return { ok: false, message };
  }
}

function formatRouterMarkdown(result) {
  const final = result?.final || {};
  const lines = [
    `**Estado:** ${final.status || "desconocido"}`,
    "",
    final.summary || "Sin resumen disponible.",
  ];
  const changedFiles = Array.isArray(final.changedFiles) ? final.changedFiles.filter(Boolean) : [];
  const verification = Array.isArray(final.verification) ? final.verification.filter(Boolean) : [];
  const residualRisks = Array.isArray(final.residualRisks) ? final.residualRisks.filter(Boolean) : [];
  if (changedFiles.length) {
    lines.push("", "**Archivos:**", ...changedFiles.map((file) => `- \`${file}\``));
  }
  if (verification.length) {
    lines.push("", "**Validacion:**", ...verification.map((item) => `- ${item}`));
  }
  if (residualRisks.length) {
    lines.push("", "**Riesgos residuales:**", ...residualRisks.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}

function getModelsForProvider(provider) {
  return freeModelsCatalog.getModelsForProvider(provider);
}

function getDefaultModel(provider) {
  return freeModelsCatalog.getDefaultModel(provider);
}

function getEffectiveProviderConfig() {
  const config = vscode.workspace.getConfiguration("freejt7");
  const configuredProvider = String(config.get("apiProvider") || DEFAULT_EXTERNAL_PROVIDER).trim();
  const provider = isExternalProvider(configuredProvider) ? configuredProvider : DEFAULT_EXTERNAL_PROVIDER;
  const configuredModel = String(config.get("apiProviderModel") || "").trim();
  return {
    provider,
    model: configuredModel || getDefaultModel(provider) || DEFAULT_EXTERNAL_MODEL,
  };
}

function workspaceNeedsBridge(workspacePath) {
  if (!isManagedWorkspace(workspacePath)) {
    return false;
  }
  const markers = [
    path.join(workspacePath, ".github", "free-jt7-instructions.md"),
    path.join(workspacePath, ".github", "free-jt7-policy.yaml"),
    path.join(workspacePath, ".github", "free-jt7-model-routing.json"),
  ];
  return markers.some((marker) => !fs.existsSync(marker));
}

function getCurrentExtensionVersion(context) {
  return String(context?.extension?.packageJSON?.version || "0.0.0");
}

function normalizeComparablePath(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const normalized = path.isAbsolute(text) ? path.resolve(text) : text;
  return normalized.replace(/\\/g, "/");
}

function getGlobalConfigurationValue(section, key) {
  try {
    return vscode.workspace.getConfiguration(section).inspect?.(key)?.globalValue;
  } catch {
    return undefined;
  }
}

function hasMatchingInstructionEntry(instructions, expectedFile) {
  if (!Array.isArray(instructions)) {
    return false;
  }
  return instructions.some((entry) => (
    entry && typeof entry === "object" && normalizeComparablePath(entry.file) === normalizeComparablePath(expectedFile)
  ));
}

function hasAnyFreeJt7AgentLocation(agentFilesLocations) {
  if (!agentFilesLocations || typeof agentFilesLocations !== "object" || Array.isArray(agentFilesLocations)) {
    return false;
  }
  return Object.entries(agentFilesLocations).some(([candidatePath, enabled]) => {
    const normalized = normalizeComparablePath(candidatePath);
    return Boolean(enabled)
      && normalized.includes("agente-freejt7-extension-funcional")
      && normalized.endsWith("/.github/agents");
  });
}

function getGlobalVsCodeSettingsTargets(context) {
  return {
    instructionFile: path.join(context.extensionPath, ".github", "free-jt7-instructions.md"),
    skillsIndex: path.join(context.extensionPath, ".github", "skills", ".skills_index.json"),
    policyFile: path.join(context.extensionPath, ".github", "free-jt7-policy.yaml"),
    modelsRouting: path.join(context.extensionPath, ".github", "free-jt7-model-routing.json"),
    modelsIde: "vscode",
  };
}

function getGlobalVsCodeSettingsSnapshot() {
  return {
    instructions: getGlobalConfigurationValue("freejt7", "instructions"),
    agentFilesLocations: getGlobalConfigurationValue("chat", "agentFilesLocations"),
    skillsIndex: getGlobalConfigurationValue("freejt7", "skills.index"),
    policyFile: getGlobalConfigurationValue("freejt7", "policy.file"),
    modelsRouting: getGlobalConfigurationValue("freejt7", "models.routing"),
    modelsIde: getGlobalConfigurationValue("freejt7", "models.ide"),
  };
}

function getGlobalVsCodeSettingsRepairState(targets, snapshot) {
  const reasons = [];
  if (!hasMatchingInstructionEntry(snapshot.instructions, targets.instructionFile)) {
    reasons.push("freejt7.instructions");
  }
  if (hasAnyFreeJt7AgentLocation(snapshot.agentFilesLocations)) {
    reasons.push("chat.agentFilesLocations");
  }
  if (normalizeComparablePath(snapshot.skillsIndex) !== normalizeComparablePath(targets.skillsIndex)) {
    reasons.push("freejt7.skills.index");
  }
  if (normalizeComparablePath(snapshot.policyFile) !== normalizeComparablePath(targets.policyFile)) {
    reasons.push("freejt7.policy.file");
  }
  if (normalizeComparablePath(snapshot.modelsRouting) !== normalizeComparablePath(targets.modelsRouting)) {
    reasons.push("freejt7.models.routing");
  }
  if (String(snapshot.modelsIde || "").trim() !== targets.modelsIde) {
    reasons.push("freejt7.models.ide");
  }
  return {
    needsRepair: reasons.length > 0,
    reasons,
  };
}

function buildModelQuickPickItems(provider, currentModel) {
  const defaultModel = getDefaultModel(provider);
  const activeModel = currentModel || defaultModel;
  return getModelsForProvider(provider).map((model) => ({
    label: model.label,
    description: model.value === defaultModel ? "(default)" : "",
    detail: model.value,
    modelValue: model.value,
    picked: model.value === activeModel,
  }));
}

function isStandaloneOwnIdeMode() {
  try {
    const cfg = vscode.workspace.getConfiguration("freejt7");
    return Boolean(cfg.get("app.standaloneMode", false));
  } catch (_) {
    return false;
  }
}

function listSelectableApiProviders() {
  const items = [
    { label: "$(cloud) OpenRouter (default)", value: "openrouter" },
    { label: "$(hubot) HuggingFace", value: "hf" },
    { label: "$(zap) ZAI (ZhipuAI)", value: "zai" },
    { label: "$(globe) CLŌD", value: "clod" },
  ];
  if (!isStandaloneOwnIdeMode()) {
  }
  return items;
}

function formatProviderStatusBarText(provider, model) {
  const shortModel = model && model.length > 34 ? `${model.slice(0, 31)}...` : model;
  return `$(radio-tower) Free JT7: ${provider}${shortModel ? ` | ${shortModel}` : ""}`;
}

function formatProviderStatusBarTooltip(provider, model) {
  return `Free JT7\nProveedor activo: ${provider}\nModelo activo: ${model || "default"}\nClick para cambiar proveedor o modelo.`;
}

function updateProviderStatusBar(providerStatusBar) {
  if (!providerStatusBar) {
    return;
  }
  const { provider, model } = getEffectiveProviderConfig();
  providerStatusBar.text = formatProviderStatusBarText(provider, model);
  providerStatusBar.tooltip = formatProviderStatusBarTooltip(provider, model);
}

function slugifyDesignText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "freejt7-design";
}

function extractJsonObjectFromText(text) {
  const source = String(text || "").trim();
  if (!source) {
    return "";
  }
  if (source.startsWith("{") && source.endsWith("}")) {
    return source;
  }
  const start = source.indexOf("{");
  if (start === -1) {
    return "";
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  return "";
}

async function launchDesignAgent(context, output) {
  const workspacePath = getPrimaryWorkspacePath();
  if (!workspacePath) {
    vscode.window.showErrorMessage("Free JT7: abre un workspace antes de usar el agente de diseño.");
    return null;
  }

  const prompt = await vscode.window.showInputBox({
    prompt: "Objetivo creativo del video",
    placeHolder: "Ej: video de lanzamiento para Free JT7 con look técnico y CTA final",
    ignoreFocusOut: true,
  });
  if (!prompt) {
    return null;
  }

  const sourceMode = await vscode.window.showQuickPick(
    [
      { label: "Sin archivo inicial", value: "none", detail: "Genera storyboard y video sin importar un asset/documento en esta corrida." },
      { label: "Importar archivo en Canva", value: "pick", detail: "Selecciona una imagen, documento o media para usarla dentro del flujo." },
    ],
    {
      placeHolder: "¿Quieres adjuntar un archivo al flujo Canva + Remotion?",
      ignoreFocusOut: true,
    }
  );
  if (!sourceMode) {
    return null;
  }

  let sourceFile = "";
  if (sourceMode.value === "pick") {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: "Usar en el flujo de diseño",
      filters: {
        Media: ["png", "jpg", "jpeg", "webp", "mp3", "wav", "m4a", "aac", "pdf"],
        Todos: ["*"],
      },
    });
    if (!picked || !picked[0]) {
      return null;
    }
    sourceFile = picked[0].fsPath;
  }

  const outputName = await vscode.window.showInputBox({
    prompt: "Nombre base para los artefactos de salida",
    value: slugifyDesignText(prompt),
    ignoreFocusOut: true,
  });
  if (!outputName) {
    return null;
  }

  const { provider, model } = getEffectiveProviderConfig();
  const py = pythonCommand(context.extensionPath);
  const args = [
    ...py.args,
    "-m",
    "tools.design_agent.cli",
    "generate-video",
    "--workspace-root",
    workspacePath,
    "--prompt",
    prompt,
    "--output-name",
    outputName,
    "--provider",
    provider,
    "--interactive-canva-auth",
    "--json",
  ];
  if (model) {
    args.push("--model", model);
  }
  if (sourceFile) {
    args.push("--source-file", sourceFile);
  }

  output.appendLine(`[freejt7-design] prompt=${prompt}`);
  output.appendLine(`[freejt7-design] provider=${provider} model=${model || "default"} source=${sourceFile || "none"}`);
  output.show(true);

  const result = await runCommandCapture(py.bin, args, {
    cwd: context.extensionPath,
    env: { ...process.env, PYTHONUTF8: "1" },
  }, output);

  if (result.code !== 0) {
    const detail = String(result.stderr || result.stdout || "Error desconocido").trim();
    vscode.window.showErrorMessage(`Free JT7: el agente de diseño falló. ${detail}`);
    return null;
  }

  const rawJson = extractJsonObjectFromText(result.stdout) || result.stdout;
  let data;
  try {
    data = JSON.parse(rawJson);
  } catch (error) {
    vscode.window.showErrorMessage(`Free JT7: salida JSON inválida del agente de diseño. ${error.message}`);
    return null;
  }

  if (Array.isArray(data.warnings) && data.warnings.length > 0) {
    for (const warning of data.warnings) {
      output.appendLine(`[freejt7-design] warning: ${warning}`);
    }
  }

  const actions = [];
  if (data.finalVideo || data.rawVideo) {
    actions.push("Abrir video");
  }
  if (data.runDir) {
    actions.push("Abrir carpeta");
  }
  const message = `Free JT7: video generado${data.finalVideo ? ` en ${data.finalVideo}` : ""}`;
  const choice = await vscode.window.showInformationMessage(message, ...actions);
  if (choice === "Abrir video" && (data.finalVideo || data.rawVideo)) {
    await vscode.env.openExternal(vscode.Uri.file(data.finalVideo || data.rawVideo));
  }
  if (choice === "Abrir carpeta" && data.runDir) {
    await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(data.runDir));
  }
  return data;
}

async function routeTaskWithGoal(context, output, goal) {
  const preparedTask = goal && typeof goal === "object" ? goal : null;
  const finalGoal = String(preparedTask?.goal || goal || "").trim();
  const conversationRequest = preparedTask?.conversationRequest || null;
  if (!finalGoal) {
    return null;
  }

  const { provider: effectiveProvider, model: effectiveModel } = getEffectiveProviderConfig();
  output.appendLine(`[freejt7-router] Usando runtime nativo: ${effectiveProvider} / ${effectiveModel}`);
  try {
    const workspacePathForProvider = getPrimaryWorkspacePath() || context.extensionPath;
    return await _callProvider(
      conversationRequest || finalGoal,
      { provider: effectiveProvider, model: effectiveModel },
      context.secrets,
      { workspacePath: workspacePathForProvider },
    );
  } catch (err) {
    output.appendLine(`[freejt7-router] Error con runtime nativo: ${String(err?.message || err)}`);
    throw err;
  }
}

async function routeTaskNative(context, output) {
  const { provider, model } = getEffectiveProviderConfig();
  const goal = await vscode.window.showInputBox({
    prompt: `Objetivo para ejecutar Free JT7 nativo con ${provider}${model ? ` / ${model}` : ""}`,
    placeHolder: "Ej: analiza el bug y ejecútalo con el runtime nativo activo",
    ignoreFocusOut: true,
  });
  if (!goal) {
    return;
  }

  try {
    const preparedTask = await prepareAuditedTask(context, output, goal);
    if (!preparedTask) {
      return;
    }
    const result = await routeTaskWithGoal(context, output, preparedTask);
    if (!result) {
      return;
    }
    vscode.window.showInformationMessage(`Free JT7: ejecución completada (${result.runId}).`);
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    output.appendLine(`[freejt7-router] ERROR ${message}`);
    output.show(true);
    vscode.window.showErrorMessage(`Free JT7: la ejecución falló. ${message}`);
  }
}

function openRuntimeDocs(context) {
  const readmePath = path.join(context.extensionPath, "README.md");
  vscode.workspace.openTextDocument(readmePath).then((doc) => {
    vscode.window.showTextDocument(doc, { preview: false });
  });
}

// helpers for OpenClaw CLI detection and invocation
function looksLikeOpenClawDirectoryName(name) {
  const compact = String(name || '').toLowerCase().replace(/[\s._-]+/g, '');
  return compact.includes('openclaw');
}

function listOpenClawBinCandidates(baseDir) {
  const names = process.platform === 'win32'
    ? ['openclaw.cmd', 'openclaw.exe', 'openclaw.bat', 'openclaw']
    : ['openclaw'];
  const relPaths = [
    ['node_modules', '.bin'],
    ['.bin'],
    ['bin'],
    [],
  ];
  const out = [];
  for (const rel of relPaths) {
    for (const name of names) {
      out.push(path.join(baseDir, ...rel, name));
    }
  }
  return out;
}

function pickFirstExistingPath(paths) {
  for (const candidate of paths) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // ignore unreadable or transient files during discovery
    }
  }
  return '';
}

function findOpenClawBinary(workspacePath) {
  if (workspacePath) {
    const candidateRoots = [workspacePath];

    try {
      const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && looksLikeOpenClawDirectoryName(entry.name)) {
          candidateRoots.push(path.join(workspacePath, entry.name));
        }
      }
    } catch {
      // ignore directory listing issues and keep PATH fallback
    }

    const localBin = pickFirstExistingPath(
      candidateRoots.flatMap((root) => listOpenClawBinCandidates(root))
    );
    if (localBin) {
      return localBin;
    }
  }
  return "openclaw";
}

async function runOpenClaw(args, output) {
  const folders = vscode.workspace.workspaceFolders;
  const workspacePath = folders && folders.length ? folders[0].uri.fsPath : process.cwd();
  const bin = findOpenClawBinary(workspacePath);
  output.appendLine(`[freejt7] invoking ${bin} ${args.join(" ")}`);
  const res = await runCommand(bin, args, { cwd: workspacePath }, output);
  if (res.code !== 0) {
    vscode.window.showErrorMessage(`Free JT7: openclaw CLI failed (code ${res.code}). See output.`);
  }
}

function createOpenClawTaggedError(message, flags = {}) {
  const error = new Error(message);
  Object.assign(error, flags);
  return error;
}

async function runOpenClawAgentTask(context, output, options = {}) {
  const provider = String(options.provider || '').trim();
  if (!provider || !isExternalProvider(provider)) {
    throw new Error('runOpenClawAgentTask requiere un proveedor nativo valido.');
  }

  const workspacePath = String(options.workspacePath || getPrimaryWorkspacePath() || '').trim();
  if (!workspacePath) {
    throw createOpenClawTaggedError(
      'Free JT7: abre un workspace antes de usar modo agent con OpenClaw.',
      { isUserActionRequired: true, isConfigurationError: true, isRetryable: false },
    );
  }

  const model = String(options.model || getDefaultModel(provider) || '').trim();
  const authProfile = String(options.authProfile || 'default').trim() || 'default';
  const runtimeBackend = String(options.runtimeBackend || 'openclaw').trim() || 'openclaw';
  const policyProfile = String(options.policyProfile || 'coding').trim() || 'coding';
  const fallbackProviders = Array.isArray(options.fallbackProviders)
    ? options.fallbackProviders
    : [];
  const executionRoute = String(options.executionRoute || 'openclaw-agent').trim() || 'openclaw-agent';
  const apiKey = await getApiKey(provider, options.secretStorage, { workspacePath });
  if (!apiKey) {
    throw createOpenClawTaggedError(
      `Free JT7: falta la API key de ${provider} para ejecutar el modo agent via OpenClaw.`,
      { isUserActionRequired: true, isConfigurationError: true, isRetryable: false },
    );
  }

  await ensureMcpDependencies(context.extensionPath, output);

  const runtimeRoot = String(options.runtimeRoot || getOperationalRoot(context) || workspacePath).trim();
  const mcpServerEntry = path.join(context.extensionPath, 'servidor mpc free jt7', 'src', 'index.js');
  const ensured = ensureOpenClawRuntimeConfig(runtimeRoot, {
    provider,
    model,
    authProfile,
    policyProfile,
    fallbackModels: fallbackProviders,
    workspacePath,
    mcpCommand: 'node',
    mcpArgs: [mcpServerEntry],
  });
  if (ensured.changed) {
    output.appendLine(`[freejt7-openclaw] Config actualizada en ${ensured.configPath}`);
  }
  const lockCleanup = cleanupOpenClawStaleLocks(runtimeRoot);
  if (lockCleanup.removed.length > 0) {
    output.appendLine(`[freejt7-openclaw] Locks stale limpiados: ${lockCleanup.removed.length}`);
  }

  const env = buildOpenClawEnv(provider, apiKey, {
    ...process.env,
    OPENCLAW_CONFIG_PATH: ensured.configPath,
    OPENCLAW_STATE_DIR: ensured.stateDir,
    OPENCLAW_AUTH_PROFILE: authProfile,
  });
  const sessionId = buildOpenClawTaskSessionId(options);
  const bin = findOpenClawBinary(workspacePath);
  await ensureOpenClawGatewayAvailable(output, {
    bin,
    cwd: workspacePath,
    env,
    config: ensured.config,
    stateDir: ensured.stateDir,
  });
  const args = buildOpenClawAgentArgs({
    sessionId,
    message: String(options.goal || options.prompt || '').trim(),
    thinking: 'medium',
    timeoutSeconds: 600,
  });
  output.appendLine(`[freejt7-openclaw] Ejecutando modo agent provider=${provider} model=${normalizeOpenClawModel(provider, model)}`);
  let response = await runCommandCapture(
    bin,
    args,
    { cwd: workspacePath, env, timeoutMs: 620000 },
    output,
  );
  let rawOutput = `${response.stdout || ''}\n${response.stderr || ''}`.trim();
  let payload = extractJsonTail(response.stdout || rawOutput);
  let summary = summarizeOpenClawPayload(payload, rawOutput);

  if (response.code !== 0 && /session file locked|\.lock|timeout \d+ms/i.test(summary || rawOutput)) {
    const retrySessionId = `${sessionId || 'freejt7'}-${Date.now().toString(36)}`;
    const retryArgs = buildOpenClawAgentArgs({
      sessionId: retrySessionId,
      message: String(options.goal || options.prompt || '').trim(),
      thinking: 'medium',
      timeoutSeconds: 600,
    });
    const retryCleanup = cleanupOpenClawStaleLocks(runtimeRoot, { maxAgeMs: 1_000 });
    if (retryCleanup.removed.length > 0) {
      output.appendLine(`[freejt7-openclaw] Locks limpiados antes de reintento: ${retryCleanup.removed.length}`);
    }
    output.appendLine(`[freejt7-openclaw] Reintento por lock con sesion aislada ${retrySessionId}`);
    response = await runCommandCapture(
      bin,
      retryArgs,
      { cwd: workspacePath, env, timeoutMs: 620000 },
      output,
    );
    rawOutput = `${response.stdout || ''}\n${response.stderr || ''}`.trim();
    payload = extractJsonTail(response.stdout || rawOutput);
    summary = summarizeOpenClawPayload(payload, rawOutput);
  }

  if (response.code !== 0 || isOpenClawFailure({ code: response.code, summary })) {
    const detail = summary || rawOutput || `openclaw exit code ${response.code}`;
    const isAuth = /No API key found|token expired|incorrect|401|403|auth/i.test(detail);
    throw createOpenClawTaggedError(
      `Free JT7 (${provider}/OpenClaw agent): ${detail}`,
      {
        isUserActionRequired: isAuth,
        isConfigurationError: isAuth,
        isRetryable: !isAuth,
      },
    );
  }

  return {
    provider,
    model: model || getDefaultModel(provider) || '',
    executionMode: 'agent',
    executionRoute,
    rawOutput,
    payload,
    routeMeta: {
      runtimeBackend,
      authProfile,
      fallbackProviders,
      executionRoute,
    },
    run: {
      status: 'completed',
      summary,
      provider,
      model: model || getDefaultModel(provider) || '',
    },
    final: {
      status: 'completed',
      summary,
      changedFiles: [],
      verification: [
        `OpenClaw agent local ejecutado con ${provider}/${model || getDefaultModel(provider) || 'default'}.`,
        `MCP activo: free-jt7-local -> ${mcpServerEntry}.`,
        `Auth profile: ${authProfile}.`,
        `Runtime backend: ${runtimeBackend}.`,
      ],
      residualRisks: [],
    },
  };
}

function shouldUseLocalAgentFallback(goal, error, options = {}) {
  if (!canResolveLocalGoal(goal)) {
    return false;
  }
  const message = String(error && error.message ? error.message : error || '');
  if (options.forceForDeterministicGoal) {
    return true;
  }
  return Boolean(
    error?.isUserActionRequired
    || error?.isConfigurationError
    || /ENOENT|not found|no such file|falta la API key|openclaw|gateway|Agent couldn't generate a response|network connection error|timeout|timed out|ECONN|EHOST|socket hang up|HTTP 5\d\d|403 status code/i.test(message)
  );
}

function shouldUseProviderDirectFallback(error) {
  const message = String(error && error.message ? error.message : error || '');
  return Boolean(
    error?.isRetryable
    || error?.isRateLimitError
    || /FailoverError|session file locked|loopback|start the gateway|gateway|EADDRINUSE|EACCES|Agent couldn't generate a response|network connection error|timeout|timed out|ECONN|EHOST|socket hang up|HTTP 429|HTTP 5\d\d|403 status code/i.test(message)
  );
}

function shouldPreferLocalExecution(goal) {
  const text = String(goal || '').toLowerCase();
  if (!canResolveLocalGoal(goal)) {
    return false;
  }
  return /\b(instala|instalar|install)\b.*\bgit\b|\b(directorio siguiente:|el nombre de la car\w*ta|quecrees|mkdir)\b|\b(crea|crear|cree|crees)\b.*\b(carpeta|directorio)\b|\b(revisa|revise|inspecciona|inspeccione|lista|ls|verifica|verifique)\b.*\b(carpeta|directorio|ruta)\b|\blee\b.*\b(package\.json|readme|archivo)\b|\bverifica\b.*\b(build|test|script|archivo)\b/i.test(text);
}

async function runProviderDirectFallbackTask(context, output, options = {}) {
  const workspacePath = String(options.workspacePath || getPrimaryWorkspacePath() || context.extensionPath || process.cwd()).trim();
  const provider = String(options.provider || getEffectiveProviderConfig().provider || '').trim();
  const model = String(options.model || getEffectiveProviderConfig().model || '').trim();
  const authProfile = String(options.authProfile || 'default').trim() || 'default';
  if (!provider || !isExternalProvider(provider)) {
    throw new Error('Fallback directo requiere proveedor nativo valido.');
  }

  const requestPayload = options.conversationRequest || String(options.goal || options.prompt || '').trim();
  const direct = await _callProvider(
    requestPayload,
    { provider, model, authProfile },
    context.secrets,
    { workspacePath, authProfile },
  );
  const summary = String(direct?.run?.summary || direct?.final?.summary || direct?.summary || 'ok').trim() || 'ok';
  const existingVerification = Array.isArray(direct?.final?.verification)
    ? direct.final.verification.filter(Boolean).map((item) => String(item))
    : [];

  return {
    ...direct,
    provider,
    model: model || getDefaultModel(provider) || '',
    executionMode: 'agent',
    executionRoute: 'provider-direct-fallback',
    routeMeta: {
      runtimeBackend: String(options.runtimeBackend || 'auto').trim().toLowerCase() || 'auto',
      fallback: 'provider-direct',
      fallbackReason: String(options.fallbackReason || '').trim(),
    },
    run: {
      ...(direct?.run || {}),
      status: 'completed',
      summary,
      provider,
      model: model || getDefaultModel(provider) || '',
    },
    final: {
      ...(direct?.final || {}),
      status: 'completed',
      summary,
      changedFiles: Array.isArray(direct?.final?.changedFiles) ? direct.final.changedFiles : [],
      verification: [
        ...existingVerification,
        `Fallback directo ${provider}/${model || getDefaultModel(provider) || 'default'} aplicado por indisponibilidad temporal del runtime agente OpenClaw.`,
      ],
      residualRisks: [
        'La ejecucion uso fallback directo del proveedor; capacidades completas de herramientas/agente pueden estar degradadas hasta recuperar OpenClaw.',
      ],
    },
  };
}

async function runFreeJt7LocalAgentTask(context, output, options = {}) {
  const workspacePath = String(options.workspacePath || getPrimaryWorkspacePath() || context.extensionPath || process.cwd()).trim();
  const provider = String(options.provider || getEffectiveProviderConfig().provider || 'local').trim();
  const model = String(options.model || getEffectiveProviderConfig().model || 'freejt7-local-tools').trim();
  output.appendLine(`[freejt7-local-agent] Ejecutando herramientas locales provider=${provider} model=${model}`);
  return runLocalAgentTask(String(options.goal || options.prompt || '').trim(), {
    ...options,
    workspacePath,
    provider,
    model,
  });
}

async function runFreeJt7AcpTask(context, output, options = {}) {
  const runtimeBackend = String(options.runtimeBackend || '').trim().toLowerCase();
  const harness = runtimeBackend.startsWith('acp:')
    ? runtimeBackend.split(':').slice(1).join(':') || 'codex'
    : 'codex';
  const provider = String(options.provider || getEffectiveProviderConfig().provider || '').trim();
  const model = String(options.model || getEffectiveProviderConfig().model || '').trim();
  output.appendLine(`[freejt7-acp] runtime=${runtimeBackend || 'acp'} harness=${harness} provider=${provider || 'auto'} model=${model || 'default'}`);

  if (provider && isExternalProvider(provider)) {
    try {
      return await runOpenClawAgentTask(context, output, {
        ...options,
        provider,
        model,
        runtimeBackend,
        executionRoute: `acp:${harness}`,
      });
    } catch (error) {
      output.appendLine(`[freejt7-acp] Fallback local por fallo ACP/OpenClaw: ${String(error?.message || error)}`);
      if (shouldPreferLocalExecution(options.goal || options.prompt || '')) {
        return runFreeJt7LocalAgentTask(context, output, {
          ...options,
          provider: provider || 'local',
          model: model || `acp-${harness}-local`,
          runtimeBackend: runtimeBackend || `acp:${harness}`,
          fallbackReason: String(error?.message || error),
        });
      }
      if (shouldUseProviderDirectFallback(error)) {
        try {
          return await runProviderDirectFallbackTask(context, output, {
            ...options,
            provider,
            model,
            runtimeBackend: runtimeBackend || `acp:${harness}`,
            fallbackReason: String(error?.message || error),
          });
        } catch (directError) {
          output.appendLine(`[freejt7-acp] Fallback directo provider falló: ${String(directError?.message || directError)}`);
          if (shouldUseLocalAgentFallback(options.goal || options.prompt || '', error, { forceForDeterministicGoal: true })) {
            return runFreeJt7LocalAgentTask(context, output, {
              ...options,
              provider: provider || 'local',
              model: model || `acp-${harness}-local`,
              runtimeBackend: runtimeBackend || `acp:${harness}`,
              fallbackReason: String(directError?.message || directError),
            });
          }
        }
      }
      if (!shouldUseLocalAgentFallback(options.goal || options.prompt || '', error)) {
        throw error;
      }
    }
  }

  const local = await runFreeJt7LocalAgentTask(context, output, {
    ...options,
    provider: provider || 'local',
    model: model || `acp-${harness}-local`,
    runtimeBackend: runtimeBackend || `acp:${harness}`,
    fallbackReason: 'ACP fallback local',
  });
  return {
    ...local,
    executionRoute: `acp:${harness}:local-fallback`,
    routeMeta: {
      runtimeBackend: runtimeBackend || `acp:${harness}`,
      harness,
      fallback: 'local',
    },
  };
}

async function handleChatRequest(context, output, request, chatContext, stream) {
  const command = request.command || "route";
  const activeProviderConfig = getEffectiveProviderConfig();
  const workspacePathForConversation = getPrimaryWorkspacePath() || context.extensionPath;
  const priorMessages = extractChatContextMessages(chatContext);

  if (command === "docs") {
    openRuntimeDocs(context);
    stream.markdown("Abrí la documentación de Free JT7 en el editor.");
    return { metadata: { command } };
  }

  if (command === "doctor") {
    stream.progress("Validando el runtime de Free JT7...");
    const result = await runtimeDoctor(context, output);
    stream.markdown(result?.message || "Runtime validado.");
    return { metadata: { command, ok: Boolean(result?.ok) } };
  }

  if (command === "install") {
    const workspacePath = getPrimaryWorkspacePath();
    stream.progress(workspacePath ? "Instalando Free JT7 en el workspace actual..." : "Aplicando configuracion global multi-IDE...");
    const result = workspacePath ? await installWorkspace(context, output) : await installGlobalMultiIde(context, output);
    stream.markdown(result?.message || "Instalacion finalizada.");
    return { metadata: { command, ok: Boolean(result?.ok) } };
  }

  if (command === "global") {
    stream.progress("Aplicando configuracion global multi-IDE...");
    const result = await installGlobalMultiIde(context, output);
    stream.markdown(result?.message || "Configuracion global finalizada.");
    return { metadata: { command, ok: Boolean(result?.ok) } };
  }

  const prompt = String(request.prompt || "").trim();
  if (!prompt) {
    stream.markdown("Escribe una solicitud para `@freejt7` o usa `/doctor`, `/install` o `/docs`.");
    return { metadata: { command, ok: false } };
  }

  const activeModelLabel = activeProviderConfig.model || "default";
  stream.markdown(
    `Aviso: esta solicitud entra por el chat nativo del IDE. La ejecución de Free JT7 se realiza con ${activeProviderConfig.provider} / ${activeModelLabel}; para una ruta sin chat, usa el comando "Free JT7: Ejecutar tarea con runtime nativo".`
  );

  stream.progress("Recogiendo intake obligatorio de Free JT7...");
  try {
    const preparedTask = await prepareAuditedTask(context, output, prompt);
    if (!preparedTask) {
      stream.markdown("Se canceló el intake obligatorio. Vuelve a lanzar la tarea cuando quieras continuar.");
      return { metadata: { command, ok: false, cancelled: true } };
    }
    preparedTask.conversationRequest = buildConversationRequest({
      prompt: preparedTask.goal,
      history: priorMessages,
      sessionTitle: 'VS Code Chat',
      workspacePath: workspacePathForConversation,
      channel: 'chat-participant',
    });
    stream.progress("Ejecutando el router auditado de Free JT7...");
    const result = await routeTaskWithGoal(context, output, preparedTask);
    stream.markdown(formatRouterMarkdown(result));
    return {
      metadata: {
        command,
        ok: true,
        runId: result?.runId || "",
      },
    };
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    output.appendLine(`[freejt7-chat] ERROR ${message}`);
    stream.markdown(`Free JT7 no pudo completar la tarea.\n\n${message}`);
    return { metadata: { command, ok: false, error: message } };
  }
}

async function ensureMcpDependencies(extensionPath, output) {
  const mcpDir = path.join(extensionPath, "servidor mpc free jt7");
  const mcpCheck = path.join(mcpDir, "node_modules", "@modelcontextprotocol");
  if (!fs.existsSync(mcpCheck)) {
    output.appendLine("[freejt7] ⚠️ Dependencias MCP no encontradas, instalando...");
    try {
      await runCommand("npm", ["install", "--production"], { cwd: mcpDir }, output);
      output.appendLine("[freejt7] ✅ Dependencias MCP instaladas correctamente.");
    } catch (e) {
      output.appendLine(`[freejt7] ❌ Error instalando deps MCP: ${e.message}`);
    }
  }
}

function activate(context) {
  let providerStatusBar;
  const output = vscode.window.createOutputChannel("Free JT7");
  const chatDiagnostics = getChatDiagnostics();
  if (!chatDiagnostics.ok) {
    for (const issue of chatDiagnostics.issues) {
      output.appendLine(`[freejt7] ${issue}`);
    }
  }
  // FIX #4: Check Python disponible
  const pyCmd = pythonCommand(context.extensionPath);
  if (!isWorkingPython(pyCmd.bin, pyCmd.args)) {
    output.appendLine("[freejt7] ⚠️ Python no encontrado en el sistema.");
    vscode.window.showWarningMessage(
      "Free JT7: Python no encontrado. Instale Python 3 y reinicie VS Code.",
      "Descargar Python"
    ).then(action => {
      if (action === "Descargar Python")
        vscode.env.openExternal(vscode.Uri.parse("https://www.python.org/downloads/"));
    });
  }

  // FIX #3: Check OpenClaw disponible
  const wsPath = getPrimaryWorkspacePath();
  const clawBin = findOpenClawBinary(wsPath);
  if (clawBin === "openclaw") {
    const clawCheck = spawnSync("openclaw", ["--version"], { shell: true });
    if (clawCheck.error || clawCheck.status !== 0) {
      output.appendLine("[freejt7] ⚠️ OpenClaw CLI no encontrado en PATH.");
      vscode.window.showWarningMessage(
        "Free JT7: OpenClaw CLI no encontrado. Instálalo con: npm install -g openclaw",
        "Más información"
      ).then(action => {
        if (action === "Más información")
          vscode.env.openExternal(vscode.Uri.parse("https://github.com/openclaw/openclaw#readme"));
      });
    }
  }

  // FIX #2: Verificar/instalar deps MCP en background
  ensureMcpDependencies(context.extensionPath, output).catch(e =>
    output.appendLine(`[freejt7] ensureMcpDependencies error: ${e}`)
  );

  Promise.resolve()
    .then(() => ensureGlobalVsCodeSettings(context, output))
    .then(() => ensureWorkspaceBridge(context, output))
    .catch((error) => {
      output.appendLine(`[freejt7] bootstrap global/workspace error: ${String(error?.message || error)}`);
    });

  // P4 Wire-C: start memory orchestrator + scheduler (non-fatal)
  const operationalRoot = getOperationalRoot(context);
  try {
    getRemoteBridge({ rootDir: operationalRoot }).start();
    const pluginRuntime = getPluginRuntime();
    const integrationDiscovery = pluginRuntime.discoverAndLoadIntegrations({
      directories: [path.join(operationalRoot, 'integrations')],
      allowExperimental: false,
    });
    const _orch = new MemoryOrchestrator({ workspacePath: operationalRoot });
    activeScheduler = createDefaultScheduler({ rootDir: operationalRoot }, _orch);
    activeScheduler.start();
    output.appendLine('[freejt7] Scheduler runtime inicializado.');
    if (integrationDiscovery.loaded.length > 0) {
      output.appendLine(`[freejt7] Capability packs cargados: ${integrationDiscovery.loaded.length}`);
    }
  } catch (_) { /* non-fatal — scheduler must never crash extension startup */ }

  const panelConfig = vscode.workspace.getConfiguration("freejt7");
  const panelEnabled = panelConfig.get("panel.enabled", true);
  if (panelEnabled) {
    try {
      const ownAgentRuntime = createFreeJt7AgentRuntime({
        context,
        output,
        runtimeRoot: operationalRoot,
        getWorkspacePath: () => getPrimaryWorkspacePath(),
        getProviderConfig: () => getEffectiveProviderConfig(),
        runLocalAgentTask: runFreeJt7LocalAgentTask,
        runOpenClawAgentTask,
        runProviderDirectFallbackTask,
        runAcpTask: runFreeJt7AcpTask,
        shouldPreferLocalExecution,
        canResolveLocalGoal,
        buildLocalActions: (goal, taskContext = {}) => deriveLocalActions(goal, taskContext),
        getMcpServers: () => ([
          {
            id: 'free-jt7-local',
            transport: 'stdio',
            enabled: true,
          },
        ]),
        shouldUseProviderDirectFallback,
        shouldUseLocalAgentFallback,
      });

      activeControlPanel = createControlPanel(context, output, {
        workspacePath: operationalRoot,
        workerCount: Number(panelConfig.get("panel.workerPool.size", 3) || 3),
        policyMode: String(panelConfig.get("panel.policy.mode", "mixed") || "mixed"),
        remoteBridge: getRemoteBridge({ rootDir: operationalRoot }),
        agentRuntime: ownAgentRuntime,
        prepareTask: async (taskInput, meta) => preparePanelTask(context, output, taskInput, meta),
        finalizeTaskTrace: async (task, summary) => closeTrackedTask(context, output, task.runId, summary),
        executeAcpTask: async (goal, taskContext = {}) => {
          const workspacePath = getPrimaryWorkspacePath();
          if (!workspacePath) {
            throw new Error("Free JT7: abre un workspace antes de usar backend ACP.");
          }
          return runFreeJt7AcpTask(context, output, {
            goal,
            workspacePath,
            runtimeRoot: operationalRoot,
            provider: String(taskContext?.provider || getEffectiveProviderConfig().provider || '').trim(),
            model: String(taskContext?.model || getEffectiveProviderConfig().model || '').trim(),
            runtimeBackend: String(taskContext?.runtimeBackend || 'acp:codex').trim().toLowerCase(),
            authProfile: String(taskContext?.authProfile || 'default').trim(),
            policyProfile: String(taskContext?.policyProfile || 'coding').trim(),
            fallbackProviders: Array.isArray(taskContext?.fallbackProviders) ? taskContext.fallbackProviders : [],
            sessionId: String(taskContext?.sessionId || '').trim(),
            runId: String(taskContext?.runId || '').trim(),
            secretStorage: context.secrets,
          });
        },
        executeAgentTask: async (goal, taskContext = {}) => {
          return ownAgentRuntime.executeAgentTask(goal, {
            ...taskContext,
            runtimeRoot: operationalRoot,
            secretStorage: context.secrets,
          });
        },
      });
      output.appendLine("[freejt7-panel] Control panel runtime inicializado.");
    } catch (error) {
      output.appendLine(`[freejt7-panel] init error: ${String(error?.message || error)}`);
    }
  }

  const subscriptions = [
    vscode.commands.registerCommand("freejt7.installWorkspace", () => installWorkspace(context, output)),
    vscode.commands.registerCommand("freejt7.installGlobalVsCode", () => installGlobalVsCode(context, output)),
    vscode.commands.registerCommand("freejt7.installGlobalMultiIde", () => installGlobalMultiIde(context, output)),
    vscode.commands.registerCommand("freejt7.runtimeDoctor", () => runtimeDoctor(context, output)),
    vscode.commands.registerCommand("freejt7.openRuntimeDocs", () => openRuntimeDocs(context)),
    vscode.commands.registerCommand("freejt7.routeTaskDirect", () => routeTaskNative(context, output)),
    vscode.commands.registerCommand("freejt7.openControlPanel", () => {
      if (!activeControlPanel) {
        vscode.window.showErrorMessage("Free JT7: el panel esta deshabilitado en freejt7.panel.enabled.");
        return;
      }
      activeControlPanel.openPanel();
    }),
    vscode.commands.registerCommand("freejt7.launchDesignAgent", () => launchDesignAgent(context, output)),

    // new commands exposing OpenClaw CLI
    vscode.commands.registerCommand("freejt7.openClawGatewayStatus", () => runOpenClaw(["gateway", "status"], output)),
    vscode.commands.registerCommand("freejt7.openClawCLI", async () => {
      const argStr = await vscode.window.showInputBox({ prompt: "Args for openclaw", value: "" });
      if (argStr !== undefined) {
        const args = argStr.match(/(?:[^\"\s]|\"[^\"]*\")+/g) || [];
        await runOpenClaw(args, output);
      }
    }),
    // new helper to start gateway if user wants
    vscode.commands.registerCommand("freejt7.openClawStartGateway", () => runOpenClaw(["gateway","--port","18789"], output)),
    // helper for editing config file in user's home
    vscode.commands.registerCommand("freejt7.editOpenClawConfig", async () => {
      const home = process.env.HOME || process.env.USERPROFILE;
      const cfg = path.join(home, ".openclaw", "openclaw.json");
      if (!fs.existsSync(cfg)) {
        vscode.window.showErrorMessage(`Free JT7: no existe el archivo de configuracion ${cfg}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument(cfg);
      vscode.window.showTextDocument(doc, { preview: false });
    }),
    // additional wrappers for common OpenClaw actions
    vscode.commands.registerCommand("freejt7.openClawInstallService", () => runOpenClaw(["onboard","--install-daemon"], output)),
    vscode.commands.registerCommand("freejt7.openClawACP", async () => {
      const argStr = await vscode.window.showInputBox({ prompt: "Args for openclaw acp", value: "" });
      if (argStr !== undefined) {
        const args = ["acp", ... (argStr.match(/(?:[^\"\s]|\"[^\"]*\")+/g) || [])];
        await runOpenClaw(args, output);
      }
    }),
    vscode.commands.registerCommand("freejt7.openClawChannelsLogin", () => runOpenClaw(["channels","login"], output)),
    vscode.commands.registerCommand("freejt7.selectApiProvider", async () => {
      const providers = listSelectableApiProviders();
      const picked = await vscode.window.showQuickPick(providers, { placeHolder: "Selecciona el proveedor de API" });
      if (!picked) return;
      let model = "";
      const currentConfig = getEffectiveProviderConfig();
      const currentModel = currentConfig.provider === picked.value
        ? currentConfig.model
        : (getDefaultModel(picked.value) || "");
      const items = buildModelQuickPickItems(picked.value, currentModel);
      if (items.length > 0) {
        items.push({ label: "✏️ Escribir manualmente...", description: "" });
        const selection = await vscode.window.showQuickPick(items, {
          placeHolder: `Modelo verificado para ${picked.value} (actual: ${currentModel || "ninguno"})`,
        });
        if (!selection) return;
        if (selection.label === "✏️ Escribir manualmente...") {
          model = await vscode.window.showInputBox({
            prompt: `Modelo para ${picked.value}`,
            value: currentModel,
          }) || "";
        } else {
          model = selection.modelValue || "";
        }
      } else {
        model = await vscode.window.showInputBox({
          prompt: `Modelo para ${picked.value} (deja vacío para usar el predeterminado)`,
          value: currentModel,
        }) || getDefaultModel(picked.value) || "";
      }
      const config = vscode.workspace.getConfiguration("freejt7");
      await config.update("apiProvider", picked.value, vscode.ConfigurationTarget.Global);
      await config.update("apiProviderModel", model, vscode.ConfigurationTarget.Global);
      updateProviderStatusBar(providerStatusBar);
      output.appendLine(`[freejt7] Proveedor cambiado a: ${picked.value} ${model ? `(${model})` : ""}`);
      vscode.window.showInformationMessage(`Free JT7: proveedor → ${picked.value}${model ? ` / ${model}` : ""}`);
    }),
    vscode.commands.registerCommand("freejt7.setApiKey", async () => {
      const providers = [
        { label: "OpenRouter", value: "openrouter" },
        { label: "HuggingFace", value: "hf" },
        { label: "ZAI (ZhipuAI)", value: "zai" },
        { label: "CLŌD", value: "clod" },
      ];
      const picked = await vscode.window.showQuickPick(providers, { placeHolder: "¿Para qué proveedor deseas configurar la API key?" });
      if (!picked) return;
      const key = await vscode.window.showInputBox({
        prompt: `API Key para ${picked.label}`,
        password: true,
        ignoreFocusOut: true,
      });
      if (!key) return;
      await context.secrets.store(`freejt7.apiKey.${picked.value}`, key);
      output.appendLine(`[freejt7] API key guardada para: ${picked.value}`);
      vscode.window.showInformationMessage(`Free JT7: API key configurada para ${picked.label}`);
    }),
    vscode.commands.registerCommand("freejt7.selectFreeModel", async () => {
      const config = vscode.workspace.getConfiguration("freejt7");
      const { provider, model: activeModel } = getEffectiveProviderConfig();
      const freeModels = getModelsForProvider(provider);
      if (freeModels.length === 0) {
        vscode.window.showWarningMessage(`No hay modelos gratuitos catalogados para ${provider}.`);
        return;
      }
      const items = buildModelQuickPickItems(provider, activeModel);
      const selection = await vscode.window.showQuickPick(items, { placeHolder: `Selecciona modelo verificado para ${provider}` });
      if (!selection) return;
      await config.update("apiProviderModel", selection.modelValue, vscode.ConfigurationTarget.Global);
      updateProviderStatusBar(providerStatusBar);
      output.appendLine(`[freejt7] Modelo cambiado a: ${selection.modelValue}`);
      vscode.window.showInformationMessage(`Free JT7: modelo → ${selection.modelValue}`);
    }),
    vscode.commands.registerCommand("freejt7.refreshFreeModels", () => {
      freeModelsCatalog = loadFreeModelsCatalog();
      updateProviderStatusBar(providerStatusBar);
      output.appendLine("[freejt7] Catálogo de modelos gratuitos recargado en runtime.");
      vscode.window.showInformationMessage("Free JT7: catálogo de modelos actualizado.");
    }),
    vscode.commands.registerCommand("freejt7.testApiProvider", async () => {
      const { provider, model } = getEffectiveProviderConfig();
      output.appendLine(`[freejt7] Probando conexión: provider=${provider} model=${model || "default"}`);
      output.show(true);
      vscode.window.showInformationMessage(`Free JT7: probando conexión con ${provider}...`);
      try {
        const workspacePathForProvider = getPrimaryWorkspacePath() || context.extensionPath;
        const result = await _callProvider(
          "Responde solo con la palabra ok.",
          { provider, model },
          context.secrets,
          { workspacePath: workspacePathForProvider },
        );
        const summary = String(result?.run?.summary || result?.final?.summary || "ok").slice(0, 150);
        output.appendLine(`[freejt7] Conexión OK con ${provider}: ${summary}`);
        vscode.window.showInformationMessage(`Free JT7: conexion con ${provider} verificada ✓. Respuesta: ${summary.slice(0, 80)}`);
      } catch (err) {
        const msg = String(err?.message || err).slice(0, 300);
        output.appendLine(`[freejt7] Error al probar ${provider}: ${msg}`);
        vscode.window.showErrorMessage(`Free JT7: fallo la conexion con ${provider}. ${msg}`);
      }
    }),
    output,
  ];

  // Status bar del proveedor activo
  providerStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
  providerStatusBar.command = "freejt7.selectApiProvider";
  updateProviderStatusBar(providerStatusBar);
  providerStatusBar.show();
  subscriptions.push(providerStatusBar);

  if (vscode.workspace?.onDidChangeConfiguration) {
    subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("freejt7.apiProvider") || event.affectsConfiguration("freejt7.apiProviderModel")) {
        updateProviderStatusBar(providerStatusBar);
      }
    }));
  }

  const chatParticipantEnabled = panelConfig.get("panel.chatParticipant.enabled", true);
  if (chatParticipantEnabled && vscode.chat?.createChatParticipant) {
    const participant = vscode.chat.createChatParticipant("freejt7.chat", (request, chatContext, stream, token) => (
      handleChatRequest(context, output, request, chatContext, stream, token)
    ));
    subscriptions.push(participant);
  } else if (!chatParticipantEnabled) {
    output.appendLine("[freejt7-panel] chat participant deshabilitado por configuracion.");
  }

  const sidebarProvider = {
    resolveWebviewView(webviewView) {
      webviewView.webview.options = { enableScripts: true, enableCommandUris: true };
      webviewView.webview.html = `
        <!doctype html>
        <html lang="es">
        <body style="margin:0;padding:12px;font-family:Segoe UI,sans-serif;color:var(--vscode-foreground);background:var(--vscode-editor-background);">
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-weight:600;">Free JT7 Panel</div>
            <div style="opacity:.8;">Si el panel principal no se abre automáticamente, usa este acceso directo.</div>
            <a href="command:freejt7.openControlPanel" style="color:var(--vscode-textLink-foreground);text-decoration:none;">Abrir Control Panel</a>
          </div>
        </body>
        </html>
      `;
      void vscode.commands.executeCommand('freejt7.openControlPanel');
    }
  };
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('freejt7.controlPanelView', sidebarProvider)
  );

  context.subscriptions.push(...subscriptions);
}

function deactivate() {
  if (activeScheduler && typeof activeScheduler.stop === 'function') {
    activeScheduler.stop();
    activeScheduler = null;
  }
  if (activeControlPanel && typeof activeControlPanel.dispose === 'function') {
    activeControlPanel.dispose();
    activeControlPanel = null;
  }
  getRemoteBridge().stop();
}

// expose helper for external tests
module.exports = {
  activate,
  deactivate,
  runOpenClaw,
  findOpenClawBinary,
  getGlobalVsCodeSettingsRepairState,
  shouldPreferLocalExecution,
  shouldUseLocalAgentFallback,
  shouldUseProviderDirectFallback,
};
