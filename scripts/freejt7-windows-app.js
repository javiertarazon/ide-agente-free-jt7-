#!/usr/bin/env node
'use strict';

const path = require('path');
const { runBootstrap } = require('./freejt7-app-bootstrap.js');

function parseArgs(argv) {
  const options = {
    repoRoot: path.resolve(__dirname, '..'),
    appHome: path.join(process.env.USERPROFILE || process.env.HOME || process.cwd(), '.freejt7-app-win'),
    profileName: 'windows',
    ideBin: process.platform === 'win32' ? 'code.cmd' : 'code',
    vsixPath: '',
    workspacePath: '',
    dryRun: true,
    launch: false,
    skipInstall: true,
  };

  for (const raw of argv) {
    const arg = String(raw || '').trim();
    if (!arg) continue;
    if (arg === '--execute') {
      options.dryRun = false;
      options.skipInstall = false;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--launch') {
      options.launch = true;
      continue;
    }
    if (arg === '--install') {
      options.skipInstall = false;
      continue;
    }
    if (arg.startsWith('--repo-root=')) {
      options.repoRoot = path.resolve(arg.split('=').slice(1).join('='));
      continue;
    }
    if (arg.startsWith('--workspace=')) {
      options.workspacePath = path.resolve(arg.split('=').slice(1).join('='));
      continue;
    }
    if (arg.startsWith('--app-home=')) {
      options.appHome = path.resolve(arg.split('=').slice(1).join('='));
      continue;
    }
    if (arg.startsWith('--profile=')) {
      options.profileName = String(arg.split('=').slice(1).join('=') || 'windows').trim() || 'windows';
      continue;
    }
    if (arg.startsWith('--ide-bin=')) {
      options.ideBin = String(arg.split('=').slice(1).join('=')).trim();
      continue;
    }
    if (arg.startsWith('--vsix=')) {
      options.vsixPath = path.resolve(arg.split('=').slice(1).join('='));
      continue;
    }
    throw new Error(`Argumento no soportado: ${arg}`);
  }

  if (!options.workspacePath) {
    options.workspacePath = options.repoRoot;
  }
  return options;
}

function runWindowsApp(inputOptions = {}) {
  const options = { ...parseArgs([]), ...inputOptions };
  process.stdout.write(`[freejt7-app-win] dryRun=${Boolean(options.dryRun)} profile=${options.profileName}\n`);
  return runBootstrap(options);
}

if (require.main === module) {
  try {
    runWindowsApp(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`[freejt7-app-win] ERROR: ${String(error.message || error)}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  runWindowsApp,
};
