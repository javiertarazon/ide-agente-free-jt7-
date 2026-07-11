import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const POLICY_PATH = path.resolve(process.cwd(), "config", "policy.json");

export function loadPolicy() {
  const raw = fs.readFileSync(POLICY_PATH, "utf8");
  return JSON.parse(raw);
}

export function isDomainAllowed(urlValue, policy) {
  const rules = policy.allowedWebDomains || [];
  if (rules.includes("*") && policy.allowWildcardWebDomains === true) return true;
  try {
    const hostname = new URL(urlValue).hostname.toLowerCase();
    return rules.some((d) => hostname === d.toLowerCase() || hostname.endsWith(`.${d.toLowerCase()}`));
  } catch {
    return false;
  }
}

export function isProgramAllowed(program, policy) {
  const allowed = (policy.allowedDesktopPrograms || []).map((x) => x.toLowerCase());
  return allowed.includes(String(program || "").toLowerCase());
}

export function isBrowserProgramAllowed(program, policy) {
  const allowed = (policy.allowedBrowserPrograms || []).map((x) => x.toLowerCase());
  if (!program) {
    return true;
  }
  return allowed.includes(String(program || "").toLowerCase());
}

export function isCommandAllowed(command, policy) {
  const allowed = (policy.allowedCommands || []).map((x) => x.toLowerCase());
  return allowed.includes(String(command || "").toLowerCase());
}

function resolvePolicyPath(candidate) {
  const value = String(candidate || "").trim();
  if (!value) return "";
  const expanded = value.startsWith("~") ? path.join(os.homedir(), value.slice(1)) : value;
  return path.resolve(process.cwd(), expanded);
}

export function getAllowedFileRoots(policy) {
  const configured = Array.isArray(policy.allowedFileRoots) ? policy.allowedFileRoots : [];
  const roots = [
    process.env.FREEJT7_WORKSPACE_ROOT,
    process.env.WORKSPACE_ROOT,
    ...configured
  ]
    .map(resolvePolicyPath)
    .filter(Boolean);
  return [...new Set(roots)];
}

export function isPathAllowed(targetPath, policy) {
  const target = path.resolve(String(targetPath || ""));
  const roots = getAllowedFileRoots(policy);
  if (roots.length === 0) {
    return { ok: false, target, roots, error: "No hay allowedFileRoots configurado para acceso a archivos" };
  }
  const allowed = roots.some((root) => {
    const rel = path.relative(root, target);
    return rel === "" || (rel && !rel.startsWith("..") && !path.isAbsolute(rel));
  });
  return {
    ok: allowed,
    target,
    roots,
    error: allowed ? "" : `Ruta fuera de allowedFileRoots: ${target}`,
  };
}

export function isCommandInvocationAllowed(command, args, policy) {
  if (!isCommandAllowed(command, policy)) {
    return { ok: false, error: `Comando no permitido por politica: ${command}` };
  }
  const name = path.basename(String(command || "")).toLowerCase();
  const argv = Array.isArray(args) ? args.map((item) => String(item || "")) : [];
  const interpreterNames = new Set((policy.interpreterCommands || ["python", "python3", "node", "powershell", "pwsh", "cmd"]).map((item) => String(item).toLowerCase()));
  const blockedFlags = new Set((policy.blockedInterpreterFlags || ["-c", "-e", "--eval", "-command", "/c"]).map((item) => String(item).toLowerCase()));
  if (interpreterNames.has(name)) {
    const hasBlockedFlag = argv.some((item) => blockedFlags.has(item.toLowerCase()));
    if (hasBlockedFlag && policy.allowInterpreterEval !== true) {
      return {
        ok: false,
        error: `Uso de interprete bloqueado sin aprobacion explicita: ${name} ${argv.join(" ")}`,
      };
    }
  }
  return { ok: true, error: "" };
}

export function isApproved(params) {
  return Boolean(params && (params.approved === true || params.allowHighRisk === true));
}

export function clampTimeout(value, policy) {
  const max = Number(policy.maxCommandTimeoutMs || 30000);
  const requested = Number(value || max);
  if (Number.isNaN(requested) || requested <= 0) return max;
  return Math.min(requested, max);
}
