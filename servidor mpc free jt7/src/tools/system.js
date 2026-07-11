import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { clampTimeout, isCommandInvocationAllowed, isPathAllowed } from "../policy.js";

const execSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional().default([]),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  approved: z.boolean().optional().default(false)
});

const readSchema = z.object({
  filePath: z.string().min(1),
  maxBytes: z.number().int().positive().optional().default(50000)
});

const writeSchema = z.object({
  filePath: z.string().min(1),
  content: z.string(),
  overwrite: z.boolean().optional().default(false)
});

export async function systemExec(input, policy) {
  const args = execSchema.parse(input);
  const commandPolicy = isCommandInvocationAllowed(args.command, args.args, {
    ...policy,
    allowInterpreterEval: args.approved === true || policy.allowInterpreterEval === true,
  });
  if (!commandPolicy.ok) {
    return { ok: false, error: commandPolicy.error };
  }

  const timeoutMs = clampTimeout(args.timeoutMs, policy);
  const cwdPolicy = isPathAllowed(args.cwd || process.cwd(), policy);
  if (!cwdPolicy.ok) {
    return { ok: false, error: cwdPolicy.error, cwd: cwdPolicy.target, allowedRoots: cwdPolicy.roots };
  }

  return await new Promise((resolve) => {
    const child = spawn(args.command, args.args, {
      cwd: cwdPolicy.target,
      shell: false,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: `Timeout de ${timeoutMs}ms`, stdout, stderr });
    }, timeoutMs);

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout: stdout.slice(0, 20000), stderr: stderr.slice(0, 20000) });
    });
  });
}

export function fileRead(input, policy) {
  const args = readSchema.parse(input);
  const pathPolicy = isPathAllowed(args.filePath, policy);
  if (!pathPolicy.ok) {
    return { ok: false, error: pathPolicy.error, filePath: pathPolicy.target, allowedRoots: pathPolicy.roots };
  }
  const content = fs.readFileSync(pathPolicy.target, "utf8");
  return {
    ok: true,
    filePath: pathPolicy.target,
    content: content.slice(0, args.maxBytes),
    truncated: content.length > args.maxBytes
  };
}

export function fileWrite(input, policy) {
  const args = writeSchema.parse(input);
  const target = path.resolve(args.filePath);
  const pathPolicy = isPathAllowed(target, policy);
  if (!pathPolicy.ok) {
    return { ok: false, error: pathPolicy.error, filePath: pathPolicy.target, allowedRoots: pathPolicy.roots };
  }
  const exists = fs.existsSync(target);
  if (exists && !args.overwrite) {
    return { ok: false, error: "Archivo ya existe. Usa overwrite=true para reemplazar." };
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, args.content, "utf8");
  return { ok: true, filePath: target };
}
