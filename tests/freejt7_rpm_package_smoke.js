'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function latestRpm(distDir) {
  if (!fs.existsSync(distDir)) return '';
  const entries = fs.readdirSync(distDir)
    .filter((name) => /^freejt7-desktop_.*\.rpm$/i.test(name))
    .map((name) => path.join(distDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return entries[0] || '';
}

function main() {
  const root = process.cwd();
  const buildScript = path.join(root, 'scripts', 'build-freejt7-desktop-rpm.sh');
  const installScript = path.join(root, 'scripts', 'install-freejt7-desktop-rpm.sh');
  const toolchainScript = path.join(root, 'scripts', 'ensure-rpm-toolchain.sh');

  assert.ok(fs.existsSync(buildScript), 'Debe existir script de build .rpm');
  assert.ok(fs.existsSync(installScript), 'Debe existir script de install .rpm');
  assert.ok(fs.existsSync(toolchainScript), 'Debe existir helper de toolchain rpm');

  const rpm = latestRpm(path.join(root, 'dist-rpm'));
  if (rpm) {
    const stats = fs.statSync(rpm);
    assert.ok(stats.size > 0, 'El .rpm generado no puede estar vacío');
  }

  console.log('freejt7_rpm_package_smoke: ok');
}

main();
