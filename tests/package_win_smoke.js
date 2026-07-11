const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const { buildPackageCommand, runWindowsPackage } = require("../scripts/freejt7-windows-package.js");
const { runWindowsApp } = require("../scripts/freejt7-windows-app.js");

function main() {
  const repoRoot = process.cwd();
  const pkg = require("../package.json");
  assert.equal(pkg.scripts["package:win"], "node scripts/freejt7-windows-package.js --dry-run");
  assert.equal(pkg.scripts["app:standalone:win"], "node scripts/freejt7-windows-app.js --dry-run");

  const packageCommand = buildPackageCommand({ repoRoot, local: true });
  assert.deepEqual(packageCommand.args, ["run", "package:local"]);

  const packageResult = runWindowsPackage({ repoRoot, dryRun: true, local: true });
  assert.equal(packageResult.dryRun, true);
  assert.equal(packageResult.cwd, repoRoot);

  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "freejt7-win-app-"));
  const fakeVsix = path.join(tempBase, "fake-freejt7.vsix");
  fs.writeFileSync(fakeVsix, "vsix\n", "utf8");
  const appResult = runWindowsApp({
    repoRoot,
    workspacePath: repoRoot,
    appHome: tempBase,
    profileName: "win-smoke",
    ideBin: "C:\\FreeJT7\\Code.exe",
    vsixPath: fakeVsix,
    skipInstall: false,
    launch: true,
    dryRun: true,
  });
  assert.equal(appResult.ideBin, "C:\\FreeJT7\\Code.exe");
  assert.ok(appResult.installArgs.includes("--install-extension"));
  assert.ok(appResult.launchArgs.includes("--new-window"));

  const npmPackageWin = cp.spawnSync("npm", ["run", "package:win"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(npmPackageWin.status, 0, npmPackageWin.stderr || npmPackageWin.stdout);
  assert.match(npmPackageWin.stdout, /DRY-RUN/);

  console.log("package_win_smoke: ok");
}

main();
