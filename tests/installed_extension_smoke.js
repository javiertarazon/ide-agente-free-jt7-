const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function getInstalledExtensionDir() {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  const extensionsRoot = path.join(os.homedir(), ".vscode", "extensions");
  const prefix = `${pkg.publisher}.${pkg.name}-`;
  const entries = fs.readdirSync(extensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => path.join(extensionsRoot, entry.name))
    .sort();
  return entries[entries.length - 1] || "";
}

function main() {
  const installed = getInstalledExtensionDir();
  assert.ok(installed, "Debe existir una extension Free JT7 instalada");

  const codeResult = spawnSync("code", ["--list-extensions", "--show-versions"], { encoding: "utf8" });
  let listed = String(codeResult.stdout || "");
  if ((codeResult.error && !listed) || codeResult.status !== 0) {
    const installedPkgPath = path.join(installed, "package.json");
    const installedPkg = JSON.parse(fs.readFileSync(installedPkgPath, "utf8"));
    listed = `${installedPkg.publisher}.${installedPkg.name}@${installedPkg.version}`;
  }
  assert.ok(/javiertarazon\.agente-freejt7-extension-funcional@4\.2\.11/.test(listed), "La extension instalada debe reportar la version esperada");

  const bundlePath = path.join(installed, "dist", "extension.cjs");
  const mcpIndexPath = path.join(installed, "servidor mpc free jt7", "src", "index.js");
  assert.ok(fs.existsSync(bundlePath), "La extension instalada debe contener dist/extension.cjs");
  assert.ok(fs.existsSync(mcpIndexPath), "La extension instalada debe contener el servidor MCP");

  const bundle = fs.readFileSync(bundlePath, "utf8");
  const mcpIndex = fs.readFileSync(mcpIndexPath, "utf8");

  for (const marker of ["jt7_browser_open", "jt7_browser_search", "jt7_browser_open_file", "jt7_document_read", "jt7_path_search", "jt7_pdf_extract_text", "jt7_desktop_open_path", "jt7_desktop_reveal_path"]) {
    assert.ok(mcpIndex.includes(marker), `La extension instalada debe incluir ${marker}`);
  }
  assert.ok(bundle.includes("freejt7-panel"), "El bundle instalado debe mantener el runtime del panel");
  assert.ok(bundle.includes("verify:"), "El bundle instalado debe exponer estado de verificacion de tareas");
  assert.ok(bundle.includes("data-quick-prompt"), "El panel instalado debe incluir acciones rapidas de agente");
  assert.ok(!bundle.includes('value="copilot"'), "El panel instalado no debe depender del proveedor Copilot");

  console.log("installed_extension_smoke: ok");
}

try {
  main();
} catch (error) {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
}
