'use strict';

const fs = require('fs');
const path = require('path');

const { listProviders, supportsStreaming } = require('./provider-registry');
const { getProviderConfig } = require('./provider-config');
const { assessAutonomyMaturity } = require('./autonomy-maturity-assessor');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function rel(rootDir, filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function exists(rootDir, relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function findSkillFiles(skillsRoot) {
  if (!fs.existsSync(skillsRoot)) return [];
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsRoot, entry.name, 'SKILL.md'))
    .filter((filePath) => fs.existsSync(filePath))
    .sort();
}

function collectMcpToolNames(indexSource) {
  const names = new Set();
  for (const match of indexSource.matchAll(/\b(jt7_[a-z0-9_]+)\b/g)) {
    names.add(match[1]);
  }
  return Array.from(names).sort();
}

function addCheck(checks, id, label, passed, details = {}, severity = 'required') {
  checks.push({ id, label, passed: Boolean(passed), severity, details });
}

function sectionStatus(checks) {
  const required = checks.filter((check) => check.severity !== 'warning');
  return required.every((check) => check.passed) ? 'ok' : 'failed';
}

function makeSection(id, label, checks, details = {}) {
  return {
    id,
    label,
    status: sectionStatus(checks),
    checks,
    details,
  };
}

function checkProviderMatrix(rootDir) {
  const checks = [];
  const providers = listProviders();
  const providerIds = providers.map((provider) => provider.id);
  const requiredProviders = ['openrouter', 'hf', 'zai', 'clod', 'openai', 'anthropic', 'deepseek', 'gemini', 'local'];
  for (const providerId of requiredProviders) {
    addCheck(checks, `provider.${providerId}`, `Proveedor registrado: ${providerId}`, providerIds.includes(providerId), { providerId });
  }
  for (const providerId of ['openrouter', 'hf', 'zai', 'clod', 'openai', 'deepseek', 'gemini', 'local']) {
    addCheck(checks, `provider.${providerId}.stream`, `Streaming directo habilitado: ${providerId}`, supportsStreaming(providerId), { providerId });
  }
  const localConfig = getProviderConfig('local');
  addCheck(checks, 'provider.local.no-key', 'Modelos locales no requieren API key obligatoria', localConfig.requiresApiKey === false, { endpoint: localConfig.chatCompletionsUrl });
  const manifest = readJson(path.join(rootDir, 'package.json'));
  const providerEnum = manifest.contributes?.configuration?.properties?.['freejt7.apiProvider']?.enum || [];
  addCheck(checks, 'settings.providers.visible', 'Settings expone todos los providers directos', requiredProviders.every((id) => providerEnum.includes(id)), { providerEnum });
  addCheck(checks, 'settings.providers.no-legacy-chat-provider', 'Settings no expone proveedores legacy de chat como provider nativo', !providerEnum.includes('copilot') && !providerIds.includes('copilot'), { providerEnum, providerIds });
  return makeSection('providers', 'Proveedores de modelos y modelos locales', checks, { providerIds });
}

function checkMcpAndMt5(rootDir) {
  const checks = [];
  const mcpIndexPath = path.join(rootDir, 'servidor mpc free jt7/src/index.js');
  const mcpPackagePath = path.join(rootDir, 'servidor mpc free jt7/package.json');
  const mcpIndex = exists(rootDir, 'servidor mpc free jt7/src/index.js') ? readText(mcpIndexPath) : '';
  const mt5ToolSource = exists(rootDir, 'servidor mpc free jt7/src/tools/mt5.js') ? readText(path.join(rootDir, 'servidor mpc free jt7/src/tools/mt5.js')) : '';
  const combinedToolSource = `${mcpIndex}\n${mt5ToolSource}`;
  const toolNames = collectMcpToolNames(combinedToolSource);
  const requiredTools = [
    'jt7_ping',
    'jt7_web_fetch',
    'jt7_browser_open',
    'jt7_document_read',
    'jt7_path_search',
    'jt7_system_exec',
    'jt7_file_write',
    'jt7_desktop_open_path',
    'jt7_mt5_connect',
    'jt7_mt5_login',
    'jt7_mt5_account_info',
    'jt7_mt5_open_order',
    'jt7_mt5_close_order',
  ];

  addCheck(checks, 'mcp.package', 'Servidor MCP local tiene package.json', fs.existsSync(mcpPackagePath), { path: rel(rootDir, mcpPackagePath) });
  addCheck(checks, 'mcp.index', 'Servidor MCP local tiene entrypoint', Boolean(mcpIndex), { path: rel(rootDir, mcpIndexPath) });
  addCheck(checks, 'mcp.selftest', 'Servidor MCP incluye self-test offline', exists(rootDir, 'servidor mpc free jt7/src/selftest.js'), { path: 'servidor mpc free jt7/src/selftest.js' });
  addCheck(checks, 'mcp.policy', 'Servidor MCP carga politica de permisos', mcpIndex.includes('loadPolicy') && exists(rootDir, 'servidor mpc free jt7/src/policy.js'), { path: 'servidor mpc free jt7/src/policy.js' });
  addCheck(checks, 'mcp.toolset', 'Servidor MCP registra tools nativas y de escritorio', requiredTools.every((tool) => combinedToolSource.includes(tool)), { requiredTools, detectedCount: toolNames.length });
  addCheck(checks, 'mt5.bridge', 'Agente MT5 tiene bridge Python', exists(rootDir, 'tools/mt5_bridge.py'), { path: 'tools/mt5_bridge.py' });
  addCheck(checks, 'mt5.mcp-tools', 'Agente MT5 esta integrado como tools MCP', mcpIndex.includes('createMt5Tools') && exists(rootDir, 'servidor mpc free jt7/src/tools/mt5.js'), { path: 'servidor mpc free jt7/src/tools/mt5.js' });
  addCheck(checks, 'mt5.servers', 'Servidores MT5 dedicados estan presentes', exists(rootDir, 'mcp-servers/mt5/mt5_server.py') && exists(rootDir, 'mcp-servers/agente_mt5/agente_mt5_server.py'), { paths: ['mcp-servers/mt5/mt5_server.py', 'mcp-servers/agente_mt5/agente_mt5_server.py'] });
  addCheck(checks, 'mt5.docs', 'Documentacion MT5 esta presente', exists(rootDir, 'docs/MT5-INTEGRATION-CHECKLIST.md') && exists(rootDir, 'docs/SUMMARY-MT5-INTEGRATION.md'), { paths: ['docs/MT5-INTEGRATION-CHECKLIST.md', 'docs/SUMMARY-MT5-INTEGRATION.md'] });
  addCheck(checks, 'mt5.smoke', 'Smoke MT5 offline existe', exists(rootDir, 'tests/mt5_gate_smoke.js'), { path: 'tests/mt5_gate_smoke.js' });

  return makeSection('mcpMt5', 'MCP, herramientas nativas y agente MT5', checks, { toolNames });
}

function checkSkillsAndSubagents(rootDir) {
  const checks = [];
  const skillsRoot = path.join(rootDir, '.github/skills');
  const skillFiles = findSkillFiles(skillsRoot);
  const indexPath = path.join(skillsRoot, '.skills_index.json');
  const activePath = path.join(skillsRoot, '.active_skills.json');
  const agentsRoot = path.join(rootDir, '.github/agents');
  const agentFiles = fs.existsSync(agentsRoot)
    ? fs.readdirSync(agentsRoot).filter((name) => name.endsWith('.agent.md')).sort()
    : [];

  addCheck(checks, 'skills.index', 'Skills tienen indice local', fs.existsSync(indexPath), { path: rel(rootDir, indexPath) });
  addCheck(checks, 'skills.active', 'Skills tienen seleccion activa', fs.existsSync(activePath), { path: rel(rootDir, activePath) });
  addCheck(checks, 'skills.count', 'Repositorio incluye biblioteca de skills', skillFiles.length >= 25, { detectedCount: skillFiles.length });
  addCheck(checks, 'agents.manifests', 'Subagentes declarados en .github/agents', agentFiles.includes('free-jt7.agent.md') && agentFiles.length >= 2, { agentFiles });
  addCheck(checks, 'subagents.ui', 'UI expone spawn de subagentes', readText(path.join(rootDir, 'src-js/core/control-panel.js')).includes('spawnSubagent'), { path: 'src-js/core/control-panel.js' });
  addCheck(checks, 'subagents.smoke', 'Smoke de subagentes existe', exists(rootDir, 'tests/session_engine_subagent_tools_smoke.js'), { path: 'tests/session_engine_subagent_tools_smoke.js' });

  return makeSection('skillsSubagents', 'Skills y subagentes', checks, {
    skillCount: skillFiles.length,
    agentFiles,
  });
}

function checkAutolearn(rootDir) {
  const checks = [];
  const requiredFiles = [
    'tools/agent_autolearn/README.md',
    'tools/agent_autolearn/config.json',
    'tools/agent_autolearn/collector.py',
    'tools/agent_autolearn/evaluator.py',
    'tools/agent_autolearn/collect_from_runs.py',
    'tools/agent_autolearn/validate_and_collect.py',
    'tools/agent_autolearn/auto_trainer.py',
    'tools/agent_autolearn/regression_packs.py',
    'tools/agent_autolearn/nightly_train.sh',
    'tools/agent_autolearn/nightly_train.ps1',
  ];
  addCheck(checks, 'autolearn.files', 'Autoaprendizaje tiene colector/evaluador/trainer', requiredFiles.every((file) => exists(rootDir, file)), { requiredFiles });
  addCheck(checks, 'autolearn.tests', 'Autoaprendizaje tiene pruebas Python', exists(rootDir, 'tests/test_autolearn_evaluator.py'), { path: 'tests/test_autolearn_evaluator.py' });
  const evaluator = readText(path.join(rootDir, 'tools/agent_autolearn/evaluator.py'));
  addCheck(checks, 'autolearn.quality-gate', 'Evaluador etiqueta quality gates y validadores', evaluator.includes('quality_gate_passed') && evaluator.includes('validator_passed'), { path: 'tools/agent_autolearn/evaluator.py' });
  return makeSection('autolearn', 'Agente de autoaprendizaje', checks);
}

function checkOwnIdePackaging(rootDir) {
  const checks = [];
  const manifest = readJson(path.join(rootDir, 'package.json'));
  const scripts = manifest.scripts || {};
  const requiredScripts = ['build:bundle', 'app:standalone', 'app:own-ide', 'package:deb', 'install:deb', 'package:rpm', 'install:rpm', 'package:win', 'package:local', 'test:offline', 'test:live'];
  const requiredFiles = [
    'scripts/freejt7-app-bootstrap.js',
    'scripts/freejt7-own-ide-bootstrap.js',
    'scripts/build-freejt7-desktop-deb.sh',
    'scripts/install-freejt7-desktop-deb.sh',
    'scripts/build-freejt7-desktop-rpm.sh',
    'scripts/install-freejt7-desktop-rpm.sh',
    'scripts/freejt7-windows-package.js',
    'scripts/freejt7-windows-app.js',
    'scripts/run-freejt7-app.sh',
    'scripts/run-freejt7-app.ps1',
  ];
  addCheck(checks, 'packaging.scripts', 'Scripts npm cubren build, instalacion, own-IDE y live/offline', requiredScripts.every((script) => scripts[script]), { requiredScripts });
  addCheck(checks, 'packaging.files', 'Scripts de instalacion/empaquetado existen', requiredFiles.every((file) => exists(rootDir, file)), { requiredFiles });
  addCheck(checks, 'packaging.smokes', 'Smokes de app/deb/rpm/win existen', ['tests/freejt7_app_bootstrap_smoke.js', 'tests/freejt7_own_ide_bootstrap_smoke.js', 'tests/freejt7_deb_package_smoke.js', 'tests/freejt7_rpm_package_smoke.js', 'tests/package_win_smoke.js'].every((file) => exists(rootDir, file)), {});
  addCheck(checks, 'packaging.docs', 'Documentacion de app/own-IDE existe', ['README.md', 'docs/16-FREEJT7-APP-STANDALONE-PLAN.md', 'docs/21-PLAN-MAESTRO-OWN-IDE-AGENT-FIRST.md'].every((file) => exists(rootDir, file)), {});
  addCheck(checks, 'packaging.deb-artifact-layout', 'Layout de paquete deb esta versionado para smoke offline', exists(rootDir, 'dist-deb/freejt7-desktop_4.2.11-1_amd64/opt/freejt7-desktop/package.json'), { path: 'dist-deb/freejt7-desktop_4.2.11-1_amd64/opt/freejt7-desktop/package.json' });
  addCheck(checks, 'packaging.rpm-artifact-layout', 'Layout de paquete rpm esta versionado para smoke offline', exists(rootDir, 'dist-rpm/rpmbuild/SOURCES/freejt7-root/opt/freejt7-desktop/package.json'), { path: 'dist-rpm/rpmbuild/SOURCES/freejt7-root/opt/freejt7-desktop/package.json' });
  return makeSection('ownIdePackaging', 'Empaquetado e instalacion own-IDE', checks);
}

function checkNativeUiAndModes(rootDir) {
  const checks = [];
  const manifest = readJson(path.join(rootDir, 'package.json'));
  const contributes = manifest.contributes || {};
  const controlPanel = readText(path.join(rootDir, 'src-js/core/control-panel.js'));
  const appBootstrap = readText(path.join(rootDir, 'scripts/freejt7-app-bootstrap.js'));
  const policyConfig = contributes.configuration?.properties?.['freejt7.panel.policy.mode'] || {};
  const commands = (contributes.commands || []).map((item) => item.command);
  const viewContainers = contributes.viewsContainers?.activitybar || [];
  const views = contributes.views?.['freejt7-panel'] || [];

  addCheck(checks, 'ui.activitybar', 'UI nativa registra contenedor Activity Bar', viewContainers.some((item) => item.id === 'freejt7-panel'), { viewContainers });
  addCheck(checks, 'ui.webview', 'UI nativa registra Webview propio', views.some((item) => item.id === 'freejt7.controlPanelView' && item.type === 'webview'), { views });
  addCheck(checks, 'ui.commands', 'Comandos nativos exponen panel, doctor y provider setup', ['freejt7.openControlPanel', 'freejt7.runtimeDoctor', 'freejt7.selectApiProvider', 'freejt7.setApiKey'].every((command) => commands.includes(command)), { commands });
  addCheck(checks, 'ui.policy-modes', 'Configuracion incluye modos assisted/mixed/autonomous', ['assisted', 'mixed', 'autonomous'].every((mode) => (policyConfig.enum || []).includes(mode)), { enum: policyConfig.enum || [] });
  addCheck(checks, 'ui.own-ide-autonomous', 'Standalone/own-IDE fuerza modo agente autonomo tipo Trae', controlPanel.includes("standaloneMode ? 'autonomous'") && appBootstrap.includes("settings['freejt7.panel.policy.mode'] = 'autonomous'"), {});
  addCheck(checks, 'ui.direct-disabled-standalone', 'Standalone desactiva modo directo tipo panel nativo', controlPanel.includes("const directModeAllowed = ${standaloneMode ? 'false' : 'true'}") && controlPanel.includes('directOptionAttributes'), {});
  addCheck(checks, 'ui.chat-first', 'Panel presenta chat principal del agente', controlPanel.includes('Chat principal con Free JT7') && controlPanel.includes('acquireVsCodeApi()'), {});
  addCheck(checks, 'ui.smoke', 'Smoke UI nativo existe', exists(rootDir, 'tests/control_panel_ui_smoke.js'), { path: 'tests/control_panel_ui_smoke.js' });
  return makeSection('nativeUiModes', 'UI nativa, privilegios y modos tipo Trae/Codex', checks);
}

function checkRuntimeOwnership(rootDir) {
  const checks = [];
  const runtime = readText(path.join(rootDir, 'src-js/core/freejt7-agent-runtime.js'));
  const localRuntime = readText(path.join(rootDir, 'src-js/core/local-agent-runtime.js'));
  const sessionEngine = readText(path.join(rootDir, 'src-js/core/session-engine.js'));
  addCheck(checks, 'runtime.agent-first', 'Runtime propio Free JT7 existe y decide capacidades', runtime.includes('capabilityPlan') && runtime.includes('dispatch'), { path: 'src-js/core/freejt7-agent-runtime.js' });
  addCheck(checks, 'runtime.local-tools', 'Runtime local preserva MCP/skills/tools en evidencia', localRuntime.includes('capabilityPlan') && localRuntime.includes('technicalSummary'), { path: 'src-js/core/local-agent-runtime.js' });
  addCheck(checks, 'runtime.sessions', 'Session engine conserva controles y subagentes', sessionEngine.includes('subagent') && sessionEngine.includes('verification'), { path: 'src-js/core/session-engine.js' });
  addCheck(checks, 'runtime.acp', 'ACP adapter local existe', exists(rootDir, 'src-js/core/acp-adapter.js') && exists(rootDir, 'tests/acp_adapter_smoke.js'), { paths: ['src-js/core/acp-adapter.js', 'tests/acp_adapter_smoke.js'] });
  addCheck(checks, 'runtime.policy', 'Policy engine existe para privilegios/autonomia', exists(rootDir, 'src-js/core/policy-engine.js') && exists(rootDir, 'tests/policy_engine_profiles_smoke.js'), { paths: ['src-js/core/policy-engine.js', 'tests/policy_engine_profiles_smoke.js'] });
  return makeSection('runtimeOwnership', 'Runtime agente, privilegios y ownership nativo', checks);
}



function checkProductHardening(rootDir) {
  const checks = [];
  const manifest = readJson(path.join(rootDir, 'package.json'));
  const scripts = manifest.scripts || {};
  const sandbox = readText(path.join(rootDir, 'src-js/core/task-sandbox.js'));
  const subagents = readText(path.join(rootDir, 'src-js/core/subagent-orchestrator.js'));
  const controlPanel = readText(path.join(rootDir, 'src-js/core/control-panel.js'));
  addCheck(checks, 'hardening.process-isolation', 'Sandbox ejecuta procesos aislados sin shell, con timeout y entorno saneado', sandbox.includes('runProcess') && sandbox.includes('shell: false') && sandbox.includes('sanitizeEnv') && sandbox.includes('processTimeoutMs'), { path: 'src-js/core/task-sandbox.js' });
  addCheck(checks, 'hardening.subagent-process', 'Subagentes pueden usar worker de proceso aislado con evidencia', subagents.includes('sandbox.runProcess') && subagents.includes('processIsolation'), { path: 'src-js/core/subagent-orchestrator.js' });
  addCheck(checks, 'hardening.visual-review', 'UI muestra plan visual, diff, review y rollback', controlPanel.includes('Plan visual · diff · review · rollback') && controlPanel.includes('diff-preview') && controlPanel.includes('appendWorkflowReview'), { path: 'src-js/core/control-panel.js' });
  addCheck(checks, 'hardening.live-api-gate', 'Gate live opt-in de APIs reales existe sin romper offline', exists(rootDir, 'scripts/freejt7-live-api-gate.js') && exists(rootDir, 'tests/live_api_contract_smoke.js') && scripts['doctor:live-api'], { paths: ['scripts/freejt7-live-api-gate.js', 'tests/live_api_contract_smoke.js'] });
  addCheck(checks, 'hardening.final-install-gate', 'Validador de instalacion final own-IDE existe', exists(rootDir, 'scripts/freejt7-final-install-validator.js') && exists(rootDir, 'tests/final_install_validation_smoke.js') && scripts['doctor:final-install'], { paths: ['scripts/freejt7-final-install-validator.js', 'tests/final_install_validation_smoke.js'] });
  return makeSection('productHardening', 'Hardening avanzado de producto', checks);
}

function checkAutonomyMaturity(rootDir) {
  const assessment = assessAutonomyMaturity({ rootDir });
  const checks = assessment.dimensions.map((dimension) => ({
    id: `maturity.${dimension.id}`,
    label: `${dimension.label}: ${dimension.status} (${dimension.score}/${dimension.targetScore})`,
    passed: dimension.closed,
    severity: 'warning',
    details: {
      score: dimension.score,
      targetScore: dimension.targetScore,
      readyPresent: dimension.readyPresent,
      missingReadyEvidence: dimension.missingReadyEvidence,
      nextStep: dimension.nextStep,
    },
  }));
  return makeSection('autonomyMaturity', 'Gate de cierre de brechas autonomia Codex/Trae', checks, assessment);
}

function runNativeAutonomyDoctor(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..', '..'));
  const sections = [
    checkProviderMatrix(rootDir),
    checkRuntimeOwnership(rootDir),
    checkMcpAndMt5(rootDir),
    checkSkillsAndSubagents(rootDir),
    checkAutolearn(rootDir),
    checkNativeUiAndModes(rootDir),
    checkOwnIdePackaging(rootDir),
    checkProductHardening(rootDir),
    checkAutonomyMaturity(rootDir),
  ];
  const failedRequired = sections.flatMap((section) => section.checks
    .filter((check) => check.severity !== 'warning' && !check.passed)
    .map((check) => ({ section: section.id, check: check.id, label: check.label, details: check.details })));
  const warnings = sections.flatMap((section) => section.checks
    .filter((check) => check.severity === 'warning' && !check.passed)
    .map((check) => ({ section: section.id, check: check.id, label: check.label, details: check.details })));
  return {
    ok: failedRequired.length === 0,
    status: failedRequired.length === 0 ? 'ok' : 'failed',
    rootDir,
    generatedAt: new Date().toISOString(),
    sections,
    failedRequired,
    warnings,
    summary: {
      sections: sections.length,
      checks: sections.reduce((total, section) => total + section.checks.length, 0),
      failedRequired: failedRequired.length,
      warnings: warnings.length,
    },
  };
}

function formatNativeAutonomyDoctor(result) {
  const lines = [
    `Free JT7 native autonomy doctor: ${result.status}`,
    `Root: ${result.rootDir}`,
    `Checks: ${result.summary.checks}, failed: ${result.summary.failedRequired}, warnings: ${result.summary.warnings}`,
  ];
  for (const section of result.sections) {
    lines.push(`- ${section.status === 'ok' ? 'OK' : 'FAIL'} ${section.label}`);
    for (const check of section.checks.filter((item) => !item.passed)) {
      lines.push(`  - ${check.severity === 'warning' ? 'WARN' : 'FAIL'} ${check.label}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  runNativeAutonomyDoctor,
  formatNativeAutonomyDoctor,
  collectMcpToolNames,
  findSkillFiles,
  checkAutonomyMaturity,
};
