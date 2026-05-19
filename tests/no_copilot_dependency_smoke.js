'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['package.json', 'bundle-entry.js', 'src-js', 'scripts', 'tools'];
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'dist-deb', 'dist-rpm', 'temp_install_test']);
const FORBIDDEN = [
  ['@github', '/', 'copilot-sdk'].join(''),
  ['copilot', '_router'].join(''),
  ['github', '.', 'copilot'].join(''),
  ['COPILOT', '_GITHUB_TOKEN'].join(''),
  ['vscode', '.', 'lm'].join(''),
];

function walk(target, files = []) {
  const full = path.join(ROOT, target);
  if (!fs.existsSync(full)) return files;
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    if (EXCLUDED_DIRS.has(path.basename(full))) return files;
    for (const entry of fs.readdirSync(full)) {
      walk(path.join(target, entry), files);
    }
    return files;
  }
  if (/\.(js|cjs|mjs|json|py|ps1|sh|md)$/i.test(full)) {
    files.push(full);
  }
  return files;
}

function main() {
  const offenders = [];
  for (const file of SCAN_DIRS.flatMap((item) => walk(item))) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (rel === 'tests/no_copilot_dependency_smoke.js') continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const term of FORBIDDEN) {
      if (text.includes(term)) offenders.push(`${rel}: contiene ${term}`);
    }
  }
  assert.deepEqual(offenders, [], `No debe existir dependencia funcional legacy:\n${offenders.join('\n')}`);
  process.stdout.write('no_copilot_dependency_smoke: ok\n');
}

if (require.main === module) main();

module.exports = { main };
