'use strict';

const assert = require('assert');

const {
  pickLinuxX64Asset,
  inferVersionFromAsset,
} = require('../scripts/freejt7-own-ide-bootstrap.js');

function main() {
  const fakeRelease = {
    tag_name: '1.99.33120',
    assets: [
      { name: 'something-else.zip', browser_download_url: 'https://example.invalid/else.zip' },
      { name: 'VSCodium-linux-x64-1.99.33120.tar.gz', browser_download_url: 'https://example.invalid/codium.tgz' },
      { name: 'VSCodium-linux-x64-1.99.33120.AppImage', browser_download_url: 'https://example.invalid/codium.appimage' },
    ],
  };

  const selected = pickLinuxX64Asset(fakeRelease);
  assert.ok(selected, 'Debe seleccionar un asset Linux x64');
  assert.equal(selected.name, 'VSCodium-linux-x64-1.99.33120.tar.gz');
  assert.equal(inferVersionFromAsset(selected.name, fakeRelease.tag_name), '1.99.33120');
  assert.equal(inferVersionFromAsset('VSCodium-linux-x64-rolling.AppImage', 'v1.1.1'), 'rolling');
  assert.equal(inferVersionFromAsset('invalid-file', 'v1.2.3'), '1.2.3');

  console.log('freejt7_own_ide_bootstrap_smoke: ok');
}

main();
