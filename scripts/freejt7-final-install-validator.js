#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function detectInstallRoot(options = {}) {
  const env = options.env || process.env;
  if (options.installRoot) return path.resolve(options.installRoot);
  if (env.FREEJT7_INSTALLED_EXTENSION_DIR) return path.resolve(env.FREEJT7_INSTALLED_EXTENSION_DIR);
  return path.resolve(options.workspaceRoot || process.cwd());
}

function validateFinalInstall(options = {}) {
  const installRoot = detectInstallRoot(options);
  const strict = Boolean(options.strict || String((options.env || process.env).FREEJT7_STRICT_FINAL_INSTALL || '').trim() === '1');
  const checks = [];
  function check(id, label, passed, details = {}) {
    checks.push({ id, label, passed: Boolean(passed), details });
  }
  const manifestPath = path.join(installRoot, 'package.json');
  const bundlePath = path.join(installRoot, 'bundle-entry.js');
  const controlPanelPath = path.join(installRoot, 'src-js/core/control-panel.js');
  const doctorPath = path.join(installRoot, 'scripts/freejt7-native-autonomy-doctor.js');
  check('install.root', 'Raiz de instalacion existe', fs.existsSync(installRoot), { installRoot });
  check('install.manifest', 'Manifest package.json existe', fs.existsSync(manifestPath), { manifestPath });
  let manifest = {};
  if (fs.existsSync(manifestPath)) {
    manifest = readJson(manifestPath);
    check('install.identity', 'Identidad Free JT7 esperada', /freejt7|agente-freejt7/i.test(`${manifest.name || ''} ${manifest.displayName || ''}`), { name: manifest.name, displayName: manifest.displayName });
    check('install.version', 'Version de extension valida', /^\d+\.\d+\.\d+/.test(String(manifest.version || '')), { version: manifest.version });
    check('install.commands', 'Comandos de panel y doctor publicados', ['freejt7.openControlPanel', 'freejt7.runtimeDoctor'].every((command) => (manifest.contributes?.commands || []).some((item) => item.command === command)), {});
  }
  check('install.bundle', 'Bundle de extension presente', fs.existsSync(bundlePath), { bundlePath });
  check('install.panel', 'Panel propio presente', fs.existsSync(controlPanelPath), { controlPanelPath });
  check('install.doctor', 'Doctor nativo presente', fs.existsSync(doctorPath), { doctorPath });
  const failed = checks.filter((item) => !item.passed);
  return {
    ok: failed.length === 0,
    status: failed.length === 0 ? 'ok' : (strict ? 'failed' : 'warning'),
    strict,
    installRoot,
    checks,
    failed,
  };
}

function formatFinalInstallValidation(result) {
  const lines = [`Free JT7 final install validation: ${result.status}`, `Root: ${result.installRoot}`];
  for (const check of result.checks) {
    lines.push(`- ${check.passed ? 'OK' : 'FAIL'} ${check.label}`);
  }
  return lines.join('\n');
}

function main() {
  const result = validateFinalInstall();
  console.log(formatFinalInstallValidation(result));
  process.exitCode = result.ok || !result.strict ? 0 : 1;
}

if (require.main === module) main();

module.exports = {
  detectInstallRoot,
  validateFinalInstall,
  formatFinalInstallValidation,
};
