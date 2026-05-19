const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function readPackage(rootDir) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
}

function getInstalledExtensionDir({ rootDir = path.join(__dirname, ".."), homeDir = os.homedir() } = {}) {
  const pkg = readPackage(rootDir);
  const extensionsRoot = path.join(homeDir, ".vscode", "extensions");
  if (!fs.existsSync(extensionsRoot)) return "";
  const prefix = `${pkg.publisher}.${pkg.name}-`;
  const entries = fs.readdirSync(extensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => path.join(extensionsRoot, entry.name))
    .sort();
  return entries[entries.length - 1] || "";
}

function resolveExtensionUnderTest({ rootDir = path.join(__dirname, ".."), homeDir = os.homedir(), strict = process.env.FREEJT7_STRICT_INSTALLED_SMOKE === "1" } = {}) {
  const installed = getInstalledExtensionDir({ rootDir, homeDir });
  if (installed) return { extensionDir: installed, mode: "installed" };
  if (strict) {
    assert.fail("Debe existir una extension Free JT7 instalada");
  }
  return { extensionDir: rootDir, mode: "workspace" };
}

function resolveListedExtensions({ extensionDir, mode, spawnSyncImpl = spawnSync } = {}) {
  const codeResult = spawnSyncImpl("code", ["--list-extensions", "--show-versions"], { encoding: "utf8" });
  const listed = String(codeResult.stdout || "");
  if (mode === "workspace" || (codeResult.error && !listed) || codeResult.status !== 0) {
    const pkg = readPackage(extensionDir);
    return `${pkg.publisher}.${pkg.name}@${pkg.version}`;
  }
  return listed;
}

function verifyExtensionArtifacts({ rootDir = path.join(__dirname, ".."), homeDir = os.homedir(), spawnSyncImpl = spawnSync } = {}) {
  const { extensionDir, mode } = resolveExtensionUnderTest({ rootDir, homeDir });
  const expectedPkg = readPackage(rootDir);

  const listed = resolveListedExtensions({ extensionDir, mode, spawnSyncImpl });
  const expectedIdentity = `${expectedPkg.publisher}.${expectedPkg.name}@${expectedPkg.version}`;
  assert.ok(listed.includes(expectedIdentity), `La extension debe reportar ${expectedIdentity}`);

  const bundlePath = path.join(extensionDir, "dist", "extension.cjs");
  const mcpIndexPath = path.join(extensionDir, "servidor mpc free jt7", "src", "index.js");
  assert.ok(fs.existsSync(bundlePath), "La extension debe contener dist/extension.cjs");
  assert.ok(fs.existsSync(mcpIndexPath), "La extension debe contener el servidor MCP");

  const bundle = fs.readFileSync(bundlePath, "utf8");
  const mcpIndex = fs.readFileSync(mcpIndexPath, "utf8");

  for (const marker of ["jt7_browser_open", "jt7_browser_search", "jt7_browser_open_file", "jt7_document_read", "jt7_path_search", "jt7_pdf_extract_text", "jt7_desktop_open_path", "jt7_desktop_reveal_path"]) {
    assert.ok(mcpIndex.includes(marker), `La extension debe incluir ${marker}`);
  }
  assert.ok(bundle.includes("freejt7-panel"), "El bundle debe mantener el runtime del panel");
  assert.ok(bundle.includes("verify:"), "El bundle debe exponer estado de verificacion de tareas");
  assert.ok(bundle.includes("data-quick-prompt"), "El panel debe incluir acciones rapidas de agente");
  assert.ok(!bundle.includes('value="copilot"'), "El panel no debe depender de proveedores legacy de chat");

  return { mode, extensionDir, expectedIdentity };
}

function main(options = {}) {
  const result = verifyExtensionArtifacts(options);
  console.log(`installed_extension_smoke: ok (${result.mode})`);
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(String(error?.stack || error?.message || error));
    process.exitCode = 1;
  }
}

module.exports = {
  readPackage,
  getInstalledExtensionDir,
  resolveExtensionUnderTest,
  resolveListedExtensions,
  verifyExtensionArtifacts,
  main,
};
