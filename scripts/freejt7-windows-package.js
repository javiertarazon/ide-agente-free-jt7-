#!/usr/bin/env node
'use strict';

const path = require('path');
const cp = require('child_process');

function parseArgs(argv) {
  const options = {
    repoRoot: path.resolve(__dirname, '..'),
    dryRun: true,
    local: true,
  };
  for (const raw of argv) {
    const arg = String(raw || '').trim();
    if (!arg) continue;
    if (arg === '--execute') {
      options.dryRun = false;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--remote') {
      options.local = false;
      continue;
    }
    if (arg.startsWith('--repo-root=')) {
      options.repoRoot = path.resolve(arg.split('=').slice(1).join('='));
      continue;
    }
    throw new Error(`Argumento no soportado: ${arg}`);
  }
  return options;
}

function buildPackageCommand(options = {}) {
  const scriptName = options.local === false ? 'package' : 'package:local';
  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', scriptName],
    cwd: options.repoRoot || path.resolve(__dirname, '..'),
  };
}

function runWindowsPackage(inputOptions = {}) {
  const options = { dryRun: true, local: true, ...inputOptions };
  const command = buildPackageCommand(options);
  process.stdout.write(`[freejt7-package-win] cwd=${command.cwd}\n`);
  process.stdout.write(`[freejt7-package-win] command=${command.command} ${command.args.join(' ')}\n`);
  if (options.dryRun) {
    process.stdout.write('[freejt7-package-win] DRY-RUN: no se ejecuta empaquetado.\n');
    return { ...command, dryRun: true };
  }
  const result = cp.spawnSync(command.command, command.args, {
    cwd: command.cwd,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Empaquetado Windows fallido (${result.status})`);
  }
  return { ...command, dryRun: false };
}

if (require.main === module) {
  try {
    runWindowsPackage(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`[freejt7-package-win] ERROR: ${String(error.message || error)}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  buildPackageCommand,
  runWindowsPackage,
};
