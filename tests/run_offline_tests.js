const { spawnSync } = require('child_process');
const path = require('path');

function collectTestScripts(packageJson) {
  const excluded = new Set(['test:offline', 'test:live']);
  return Object.keys(packageJson.scripts || {})
    .filter((name) => name.startsWith('test:') && !excluded.has(name));
}

function buildRunnerEnv({ liveMode = false, baseEnv = process.env } = {}) {
  if (!liveMode) return baseEnv;
  return {
    ...baseEnv,
    FREEJT7_STRICT_INSTALLED_SMOKE: baseEnv.FREEJT7_STRICT_INSTALLED_SMOKE || '1',
  };
}

function runScripts({ scripts, liveMode = false, spawnSyncImpl = spawnSync, baseEnv = process.env } = {}) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const env = buildRunnerEnv({ liveMode, baseEnv });

  for (const script of scripts || []) {
    console.log(`## npm run ${script}`);
    const result = spawnSyncImpl(
      npmCommand,
      ['run', '--silent', script],
      { stdio: 'inherit', env },
    );
    if (result.error) {
      throw result.error;
    }
    if (result.signal) {
      return 128;
    }
    if (result.status) {
      return result.status;
    }
  }
  return 0;
}

function main(argv = process.argv.slice(2), deps = {}) {
  const packageJson = deps.packageJson || require(path.join('..', 'package.json'));
  const liveMode = argv.includes('--live');
  const scripts = collectTestScripts(packageJson);
  return runScripts({
    scripts,
    liveMode,
    spawnSyncImpl: deps.spawnSyncImpl || spawnSync,
    baseEnv: deps.baseEnv || process.env,
  });
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(String(error?.stack || error?.message || error));
    process.exitCode = 1;
  }
}

module.exports = {
  collectTestScripts,
  buildRunnerEnv,
  runScripts,
  main,
};
