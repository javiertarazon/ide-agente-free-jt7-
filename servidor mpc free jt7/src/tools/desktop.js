import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import { isPathAllowed, isProgramAllowed } from "../policy.js";

const schema = z.object({
  program: z.string().min(1),
  args: z.array(z.string()).optional().default([])
});

const pathSchema = z.object({
  targetPath: z.string().min(1),
  dryRun: z.boolean().optional().default(false)
});

export function desktopOpen(input, policy) {
  const args = schema.parse(input);
  if (!isProgramAllowed(args.program, policy)) {
    return { ok: false, error: `Programa no permitido por politica: ${args.program}` };
  }

  const child = spawn(args.program, args.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    shell: false
  });
  child.unref();

  return { ok: true, program: args.program, args: args.args };
}

function resolvePathLauncher(targetPath, reveal = false) {
  const absolutePath = path.resolve(targetPath);
  if (process.platform === "win32") {
    return reveal
      ? { command: "explorer.exe", args: ["/select,", absolutePath] }
      : { command: "explorer.exe", args: [absolutePath] };
  }
  if (process.platform === "darwin") {
    return reveal
      ? { command: "open", args: ["-R", absolutePath] }
      : { command: "open", args: [absolutePath] };
  }
  return reveal
    ? { command: "xdg-open", args: [path.dirname(absolutePath)] }
    : { command: "xdg-open", args: [absolutePath] };
}

function denyIfPathNotAllowed(targetPath, policy) {
  if (!policy) {
    return null;
  }
  const access = isPathAllowed(targetPath, policy);
  return access.ok ? null : {
    ok: false,
    targetPath: access.target,
    error: access.error,
    allowedFileRoots: access.roots
  };
}

export function desktopOpenPath(input, policy) {
  const args = pathSchema.parse(input);
  const absolutePath = path.resolve(args.targetPath);
  const denied = denyIfPathNotAllowed(absolutePath, policy);
  if (denied) {
    return denied;
  }
  if (!fs.existsSync(absolutePath)) {
    return { ok: false, error: "Ruta no existe", targetPath: absolutePath };
  }
  const launcher = resolvePathLauncher(absolutePath, false);
  if (args.dryRun) {
    return { ok: true, targetPath: absolutePath, command: launcher.command, args: launcher.args, dryRun: true };
  }
  const child = spawn(launcher.command, launcher.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    shell: false
  });
  child.unref();
  return { ok: true, targetPath: absolutePath, command: launcher.command, args: launcher.args };
}

export function desktopRevealPath(input, policy) {
  const args = pathSchema.parse(input);
  const absolutePath = path.resolve(args.targetPath);
  const denied = denyIfPathNotAllowed(absolutePath, policy);
  if (denied) {
    return denied;
  }
  if (!fs.existsSync(absolutePath)) {
    return { ok: false, error: "Ruta no existe", targetPath: absolutePath };
  }
  const launcher = resolvePathLauncher(absolutePath, true);
  if (args.dryRun) {
    return { ok: true, targetPath: absolutePath, command: launcher.command, args: launcher.args, dryRun: true, reveal: true };
  }
  const child = spawn(launcher.command, launcher.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    shell: false
  });
  child.unref();
  return { ok: true, targetPath: absolutePath, command: launcher.command, args: launcher.args, reveal: true };
}
