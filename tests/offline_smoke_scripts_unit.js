const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  collectTestScripts,
  buildRunnerEnv,
  runScripts,
} = require('./run_offline_tests.js');
const { selectPreferredModel } = require('./clod_provider_smoke.js');
const {
  getInstalledExtensionDir,
  resolveExtensionUnderTest,
  resolveListedExtensions,
} = require('./installed_extension_smoke.js');
const {
  buildGoal,
  runNativeBlockedGate,
} = require('../tools/router-functional-blocked-gate.js');
const { PluginRuntime } = require('../src-js/plugins/plugin-runtime.js');
const { RemoteBridge } = require('../src-js/bridge/remote-bridge.js');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-offline-scripts-unit-'));
}

async function testOfflineRunnerUnit() {
  const scripts = collectTestScripts({
    scripts: {
      'test:offline': 'node tests/run_offline_tests.js',
      'test:live': 'node tests/run_offline_tests.js --live',
      'test:alpha': 'node alpha.js',
      lint: 'node lint.js',
      'test:beta': 'node beta.js',
    },
  });
  assert.deepEqual(scripts, ['test:alpha', 'test:beta']);

  const liveEnv = buildRunnerEnv({ liveMode: true, baseEnv: { PATH: '/bin' } });
  assert.equal(liveEnv.FREEJT7_STRICT_INSTALLED_SMOKE, '1');

  const calls = [];
  const exitCode = runScripts({
    scripts: ['test:alpha', 'test:beta'],
    baseEnv: { PATH: '/bin' },
    spawnSyncImpl: (cmd, args, options) => {
      calls.push({ cmd, args, options });
      return { status: calls.length === 2 ? 7 : 0 };
    },
  });
  assert.equal(exitCode, 7);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, ['run', '--silent', 'test:alpha']);
}

function testClodModelSelectionUnit() {
  assert.equal(selectPreferredModel([{ value: 'other' }, { value: 'OpenAI/gpt-oss-20B' }]).value, 'OpenAI/gpt-oss-20B');
  assert.equal(selectPreferredModel([{ value: 'google/gemma-4-31B-it' }, { value: 'other' }]).value, 'google/gemma-4-31B-it');
  assert.equal(selectPreferredModel([{ value: '' }, null, { value: 'fallback-model' }]).value, 'fallback-model');
  assert.equal(selectPreferredModel([]), null);
}

function testInstalledExtensionResolutionUnit() {
  const rootDir = path.join(__dirname, '..');
  const homeDir = makeTempDir();

  const workspace = resolveExtensionUnderTest({ rootDir, homeDir, strict: false });
  assert.equal(workspace.mode, 'workspace');
  assert.equal(workspace.extensionDir, rootDir);
  assert.throws(() => resolveExtensionUnderTest({ rootDir, homeDir, strict: true }), /Debe existir una extension/);

  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const extensionsRoot = path.join(homeDir, '.vscode', 'extensions');
  const installedDir = path.join(extensionsRoot, `${pkg.publisher}.${pkg.name}-${pkg.version}`);
  fs.mkdirSync(installedDir, { recursive: true });
  assert.equal(getInstalledExtensionDir({ rootDir, homeDir }), installedDir);
  assert.equal(resolveExtensionUnderTest({ rootDir, homeDir, strict: true }).mode, 'installed');

  fs.writeFileSync(path.join(installedDir, 'package.json'), JSON.stringify(pkg), 'utf8');
  const listed = resolveListedExtensions({
    extensionDir: installedDir,
    mode: 'installed',
    spawnSyncImpl: () => ({ status: 1, error: new Error('code no disponible'), stdout: '' }),
  });
  assert.equal(listed, `${pkg.publisher}.${pkg.name}@${pkg.version}`);
}

async function testRouterFunctionalGateUnit() {
  assert.ok(buildGoal('tmp/unit.txt').includes('tmp/unit.txt'));
  const rootDir = makeTempDir();
  const pluginRuntime = new PluginRuntime();
  const bridge = new RemoteBridge({ rootDir, stateFile: 'remote-bridge-state.json' });
  const loaded = pluginRuntime.loadPlugin({
    id: 'unit-blocked-gate',
    version: '1.0.0',
    capabilities: ['tool-intercept'],
  }, {
    preToolUse: (ctx) => ({
      permissionDecision: 'deny',
      permissionDecisionReason: `denied ${ctx.toolName}`,
    }),
  });
  assert.equal(loaded.ok, true);

  const result = await runNativeBlockedGate({
    pluginRuntime,
    bridge,
    runId: 'unit-run',
    workspacePath: rootDir,
    targetPath: 'tmp/unit-blocked-gate.txt',
    goal: 'unit goal',
  });
  const resume = bridge.getSessionResume('unit-run');
  assert.equal(result.final.status, 'blocked');
  assert.equal(result.final.closingGate.passed, false);
  assert.equal(result.final.changedFiles.length, 0);
  assert.equal(fs.existsSync(path.join(rootDir, 'tmp', 'unit-blocked-gate.txt')), false);
  assert.ok(resume.recentToolEvents.some((event) => event.type === 'tool-pre'));
}

async function main() {
  await testOfflineRunnerUnit();
  testClodModelSelectionUnit();
  testInstalledExtensionResolutionUnit();
  await testRouterFunctionalGateUnit();
  console.log('offline_smoke_scripts_unit: ok');
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
