#!/usr/bin/env node
'use strict';

const { runNativeAutonomyDoctor, formatNativeAutonomyDoctor } = require('../src-js/core/native-autonomy-doctor');

const json = process.argv.includes('--json');
const result = runNativeAutonomyDoctor({ rootDir: process.cwd() });
if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`${formatNativeAutonomyDoctor(result)}\n`);
}
process.exitCode = result.ok ? 0 : 1;
