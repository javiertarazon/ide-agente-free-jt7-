import { spawn } from "node:child_process";
import { z } from "zod";
import { isBrowserProgramAllowed, isDomainAllowed, isPathAllowed } from "../policy.js";

const schema = z.object({
  url: z.string().url(),
  browser: z.string().optional(),
  mode: z.enum(["default", "new-window", "app"]).optional().default("default"),
  dryRun: z.boolean().optional().default(false)
});

const searchSchema = z.object({
  query: z.string().min(1),
  engine: z.enum(["google", "bing", "duckduckgo"]).optional().default("google"),
  browser: z.string().optional(),
  mode: z.enum(["default", "new-window", "app"]).optional().default("default"),
  dryRun: z.boolean().optional().default(false)
});

const fileSchema = z.object({
  filePath: z.string().min(1),
  browser: z.string().optional(),
  mode: z.enum(["default", "new-window", "app"]).optional().default("default"),
  dryRun: z.boolean().optional().default(false)
});

function withModeArgs(browser, url, mode) {
  const name = String(browser || "").toLowerCase();
  if (mode === "app") {
    if (name.includes("chrome") || name.includes("edge") || name.includes("chromium") || name.includes("brave")) {
      return [browser, [`--app=${url}`]];
    }
  }
  if (mode === "new-window") {
    if (name.includes("chrome") || name.includes("edge") || name.includes("chromium") || name.includes("brave")) {
      return [browser, ["--new-window", url]];
    }
    if (name.includes("firefox")) {
      return [browser, ["-new-window", url]];
    }
  }
  return [browser, [url]];
}

export function resolveBrowserLauncher(url, browser = "", mode = "default") {
  if (browser) {
    const [command, args] = withModeArgs(browser, url, mode);
    return { command, args };
  }
  if (process.platform === "win32") {
    return {
      command: "cmd",
      args: ["/c", "start", "", url]
    };
  }
  if (process.platform === "darwin") {
    return {
      command: "open",
      args: [url]
    };
  }
  return {
    command: "xdg-open",
    args: [url]
  };
}

export function browserOpen(input, policy) {
  const args = schema.parse(input);
  if (!isDomainAllowed(args.url, policy)) {
    return { ok: false, error: "Dominio no permitido por politica", url: args.url };
  }
  if (!isBrowserProgramAllowed(args.browser, policy)) {
    return { ok: false, error: `Navegador no permitido por politica: ${args.browser}`, url: args.url };
  }
  const launcher = resolveBrowserLauncher(args.url, args.browser || "", args.mode || "default");
  if (args.dryRun) {
    return {
      ok: true,
      url: args.url,
      command: launcher.command,
      args: launcher.args,
      browser: args.browser || "",
      mode: args.mode,
      dryRun: true
    };
  }

  const child = spawn(launcher.command, launcher.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    shell: false
  });
  child.unref();

  return {
    ok: true,
    url: args.url,
    command: launcher.command,
    args: launcher.args,
    browser: args.browser || "",
    mode: args.mode
  };
}

export function browserSearch(input, policy) {
  const args = searchSchema.parse(input);
  const urlByEngine = {
    google: `https://www.google.com/search?q=${encodeURIComponent(args.query)}`,
    bing: `https://www.bing.com/search?q=${encodeURIComponent(args.query)}`,
    duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(args.query)}`,
  };
  return browserOpen({
    url: urlByEngine[args.engine],
    browser: args.browser,
    mode: args.mode,
    dryRun: args.dryRun,
  }, policy);
}

export function browserOpenFile(input, policy) {
  const args = fileSchema.parse(input);
  const access = policy ? isPathAllowed(args.filePath, policy) : { ok: true, target: args.filePath, roots: [] };
  if (!access.ok) {
    return { ok: false, error: access.error, filePath: access.target, allowedFileRoots: access.roots };
  }
  const url = new URL(`file://${access.target}`).toString();
  if (!isBrowserProgramAllowed(args.browser, policy)) {
    return { ok: false, error: `Navegador no permitido por politica: ${args.browser}`, filePath: access.target };
  }
  const launcher = resolveBrowserLauncher(url, args.browser || "", args.mode || "default");
  if (args.dryRun) {
    return {
      ok: true,
      filePath: access.target,
      url,
      command: launcher.command,
      args: launcher.args,
      browser: args.browser || "",
      mode: args.mode,
      dryRun: true
    };
  }
  const child = spawn(launcher.command, launcher.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    shell: false
  });
  child.unref();
  return {
    ok: true,
    filePath: access.target,
    url,
    command: launcher.command,
    args: launcher.args,
    browser: args.browser || "",
    mode: args.mode
  };
}
