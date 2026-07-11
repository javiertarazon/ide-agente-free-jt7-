const fs = require("fs");
const path = require("path");

function ensureJsonRpcCompat(rootDir) {
  const pkgPath = path.join(rootDir, "node_modules", "vscode-jsonrpc", "package.json");
  if (!fs.existsSync(pkgPath)) {
    return;
  }

  const shimPath = path.join(rootDir, "node_modules", "vscode-jsonrpc", "node.js");
  if (!fs.existsSync(shimPath)) {
    fs.writeFileSync(
      shimPath,
      "export * from './lib/node/main.js';\n",
      "utf8",
    );
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const exportsField = typeof pkg.exports === "object" && pkg.exports !== null ? pkg.exports : {};
  let changed = false;
  if (!exportsField["./node"]) {
    exportsField["./node"] = "./node.js";
    changed = true;
  }
  if (!exportsField["./node.js"]) {
    exportsField["./node.js"] = "./node.js";
    changed = true;
  }
  if (changed) {
    pkg.exports = exportsField;
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  }
}

ensureJsonRpcCompat(process.cwd());
