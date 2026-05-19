'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  detectInstallRoot,
  validateFinalInstall,
  formatFinalInstallValidation,
} = require('../scripts/freejt7-final-install-validator');

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-install-'));
  fs.mkdirSync(path.join(root, 'src-js/core'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'agente-freejt7-extension-funcional',
    displayName: 'Free JT7',
    version: '4.2.11',
    contributes: { commands: [{ command: 'freejt7.openControlPanel' }, { command: 'freejt7.runtimeDoctor' }] },
  }));
  fs.writeFileSync(path.join(root, 'bundle-entry.js'), 'module.exports = {};');
  fs.writeFileSync(path.join(root, 'src-js/core/control-panel.js'), '');
  fs.writeFileSync(path.join(root, 'scripts/freejt7-native-autonomy-doctor.js'), '');

  assert.equal(detectInstallRoot({ env: { FREEJT7_INSTALLED_EXTENSION_DIR: root } }), root);
  const ok = validateFinalInstall({ installRoot: root, strict: true });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.ok, true);
  assert.match(formatFinalInstallValidation(ok), /final install validation: ok/);

  fs.rmSync(path.join(root, 'bundle-entry.js'));
  const failed = validateFinalInstall({ installRoot: root, strict: true });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.ok, false);
  assert.ok(failed.failed.some((item) => item.id === 'install.bundle'));
  process.stdout.write('final_install_validation_smoke: ok\n');
}

if (require.main === module) main();
module.exports = { main };
