const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

async function main() {
  const { fileWrite } = await import("../servidor mpc free jt7/src/tools/system.js");

  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "freejt7-workspace-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "freejt7-outside-"));
  const policy = { allowedFileRoots: [workspaceRoot] };

  const insideFile = path.join(workspaceRoot, "ok.txt");
  const inside = fileWrite({ filePath: insideFile, content: "ok\n" }, policy);
  assert.equal(inside.ok, true);
  assert.equal(fs.readFileSync(insideFile, "utf8"), "ok\n");

  const outsideFile = path.join(outsideRoot, "blocked.txt");
  const outside = fileWrite({ filePath: outsideFile, content: "blocked\n" }, policy);
  assert.equal(outside.ok, false);
  assert.match(outside.error, /fuera de allowedFileRoots|No hay allowedFileRoots/);
  assert.equal(fs.existsSync(outsideFile), false, "No debe escribir fuera del workspace permitido");

  console.log("mcp_security_smoke: ok");
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
