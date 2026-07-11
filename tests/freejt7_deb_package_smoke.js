'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function latestDeb(distDir) {
  if (!fs.existsSync(distDir)) return '';
  const entries = fs.readdirSync(distDir)
    .filter((name) => /^freejt7-desktop_.*\.deb$/i.test(name))
    .map((name) => path.join(distDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return entries[0] || '';
}

function main() {
  const root = process.cwd();
  const buildScript = path.join(root, 'scripts', 'build-freejt7-desktop-deb.sh');
  assert.ok(fs.existsSync(buildScript), 'Debe existir script de build .deb');

  const deb = latestDeb(path.join(root, 'dist-deb'));
  if (deb) {
    const stats = fs.statSync(deb);
    assert.ok(stats.size > 0, 'El .deb generado no puede estar vacío');
  }

  console.log('freejt7_deb_package_smoke: ok');
}

main();
