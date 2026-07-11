'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  findOpenClawBinary,
} = require('../src-js/core/extension.runtime.js');

const BIN_NAME = process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw';

function createFakeBinary(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = process.platform === 'win32'
    ? '@echo off\r\necho openclaw\r\n'
    : '#!/usr/bin/env sh\necho openclaw\n';
  fs.writeFileSync(filePath, content, 'utf8');
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
}

function testResolvesLocalBinaryInOpenClawFolderWithSpaces() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'free jt7 openclaw ws-'));
  const localBin = path.join(workspace, 'open claw local', 'bin', BIN_NAME);
  createFakeBinary(localBin);

  const resolved = findOpenClawBinary(workspace);
  assert.strictEqual(
    resolved,
    localBin,
    'debe resolver binario local dentro de carpeta "open claw" con espacios y ruta no rígida',
  );
}

function testResolvesWorkspaceNodeModulesBinary() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'free jt7 openclaw root-'));
  const localBin = path.join(workspace, 'node_modules', '.bin', BIN_NAME);
  createFakeBinary(localBin);

  const resolved = findOpenClawBinary(workspace);
  assert.strictEqual(
    resolved,
    localBin,
    'debe resolver binario local en node_modules/.bin del workspace',
  );
}

function testFallsBackToPathBinary() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'free jt7 openclaw fallback-'));
  const resolved = findOpenClawBinary(workspace);
  assert.strictEqual(resolved, 'openclaw', 'sin binario local debe mantener fallback a PATH');
}

function main() {
  testResolvesLocalBinaryInOpenClawFolderWithSpaces();
  testResolvesWorkspaceNodeModulesBinary();
  testFallsBackToPathBinary();
  console.log('openclaw_binary_resolution_smoke: OK');
}

try {
  main();
} catch (error) {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
}
