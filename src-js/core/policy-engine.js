'use strict';

const TOOL_PATTERNS = Object.freeze({
  exec: ['bash', 'shell', 'terminal', 'cmd', 'powershell', 'script', 'exec', 'comando'],
  write_file: ['write file', 'editar', 'patch', 'apply patch', 'modifica', 'cambia archivo', 'refactor'],
  network: ['http', 'api', 'url', 'download', 'fetch', 'curl'],
  browser: ['browser', 'navegador', 'abrir sitio', 'open url'],
  desktop: ['desktop', 'escritorio', 'open app', 'aplicacion'],
  mcp: ['mcp', 'tool server', 'servidor mcp'],
  subagent: ['subagente', 'subagent', 'delegar', 'spawn'],
  install: ['install', 'npm install', 'apt', 'pip install', 'instalar'],
  publish: ['publish', 'release', 'deploy', 'produccion', 'production'],
  config_patch: ['config patch', 'editar config', 'settings', 'openclaw.json'],
  payment: ['payment', 'pago', 'factura', 'tarjeta', 'bank'],
  trade: ['trade', 'orden', 'compra', 'venta', 'broker'],
});

const TOOL_PROFILES = Object.freeze({
  coding: Object.freeze({
    allow: ['network', 'browser', 'subagent', 'mcp', 'write_file'],
    ask: ['exec', 'install', 'config_patch'],
    deny: ['payment'],
  }),
  messaging: Object.freeze({
    allow: ['network', 'browser'],
    ask: ['config_patch'],
    deny: ['exec', 'write_file', 'mcp', 'subagent', 'install', 'publish', 'payment', 'trade'],
  }),
  minimal: Object.freeze({
    allow: [],
    ask: [],
    deny: ['exec', 'write_file', 'network', 'browser', 'desktop', 'mcp', 'subagent', 'install', 'publish', 'config_patch', 'payment', 'trade'],
  }),
});

class PolicyEngine {
  constructor(opts = {}) {
    this.mode = String(opts.mode || 'mixed').toLowerCase();
    this.defaultProfile = String(opts.defaultProfile || opts.profile || 'coding').toLowerCase();
    this.highRiskKeywords = [
      'rm -rf',
      'git reset --hard',
      'format disk',
      'delete all',
      'drop database',
      'shutdown',
      'revoke',
      'wipe',
    ];
    this.mediumRiskKeywords = [
      'install',
      'uninstall',
      'publish',
      'release',
      'browser',
      'open url',
      'open app',
      'desktop',
      'write file',
      'overwrite',
      'apply patch',
      'mcp',
      'token',
      'credential',
      'trade',
      'order',
      'payment',
    ];
  }

  resolveProfile(task = {}) {
    const requested = String(task.policyProfile || task.profile || '').toLowerCase().trim();
    if (requested && TOOL_PROFILES[requested]) {
      return requested;
    }
    return TOOL_PROFILES[this.defaultProfile] ? this.defaultProfile : 'coding';
  }

  detectRequestedTools(task = {}) {
    const goal = String(task.goal || task.prompt || '').toLowerCase();
    const found = new Set();
    for (const [tool, patterns] of Object.entries(TOOL_PATTERNS)) {
      if (patterns.some((pattern) => goal.includes(pattern))) {
        found.add(tool);
      }
    }

    if (task.runtimeBackend && String(task.runtimeBackend).toLowerCase().startsWith('acp:')) {
      found.add('mcp');
      found.add('subagent');
    }
    return Array.from(found);
  }

  evaluateToolRules(profile, requestedTools = []) {
    const rules = TOOL_PROFILES[profile] || TOOL_PROFILES.coding;
    const decisions = {};
    const deniedTools = [];
    const askTools = [];
    const allowTools = [];

    for (const tool of requestedTools) {
      if (rules.deny.includes(tool)) {
        decisions[tool] = 'deny';
        deniedTools.push(tool);
        continue;
      }
      if (rules.ask.includes(tool)) {
        decisions[tool] = 'ask';
        askTools.push(tool);
        continue;
      }
      if (rules.allow.includes(tool)) {
        decisions[tool] = 'allow';
        allowTools.push(tool);
        continue;
      }
      // Regla por defecto: herramientas desconocidas requieren aprobación.
      decisions[tool] = 'ask';
      askTools.push(tool);
    }

    return { decisions, deniedTools, askTools, allowTools };
  }

  classifyRisk(task = {}) {
    const explicit = String(task.risk || '').toLowerCase();
    if (explicit === 'low' || explicit === 'medium' || explicit === 'high') {
      return explicit;
    }

    const goal = String(task.goal || task.prompt || '').toLowerCase();
    if (this.highRiskKeywords.some((keyword) => goal.includes(keyword))) {
      return 'high';
    }

    const executionMode = String(task.executionMode || '').toLowerCase();
    const provider = String(task.provider || '').toLowerCase();
    if (goal.includes('deploy') || goal.includes('migration') || goal.includes('production')) {
      return 'medium';
    }

    if (this.mediumRiskKeywords.some((keyword) => goal.includes(keyword))) {
      return 'medium';
    }

    if (executionMode === 'agent' && provider && provider !== 'copilot') {
      return 'medium';
    }

    if (task.intake && typeof task.intake === 'object') {
      const expectedDeliverable = String(task.intake.expectedDeliverable || task.intake.deliverable || '').toLowerCase();
      if (expectedDeliverable.includes('instal') || expectedDeliverable.includes('vsix') || expectedDeliverable.includes('mcp')) {
        return 'medium';
      }
    }

    if (Array.isArray(task.selectedSkills) && task.selectedSkills.some((item) => {
      const id = String(item?.id || item || '').toLowerCase();
      return id.includes('risk') || id.includes('autonomous') || id.includes('agent');
    })) {
      return 'medium';
    }

    return 'low';
  }

  evaluate(task = {}) {
    const risk = this.classifyRisk(task);
    const profile = this.resolveProfile(task);
    const requestedTools = this.detectRequestedTools(task);
    const {
      decisions: toolDecisions,
      deniedTools,
      askTools,
      allowTools,
    } = this.evaluateToolRules(profile, requestedTools);
    const reasons = [];
    const goal = String(task.goal || task.prompt || '').toLowerCase();
    const executionMode = String(task.executionMode || '').toLowerCase();
    const elevated = Boolean(
      task.elevated
      || askTools.includes('exec')
      || requestedTools.includes('publish')
      || requestedTools.includes('install')
    );

    if (this.highRiskKeywords.some((keyword) => goal.includes(keyword))) {
      reasons.push('goal-high-risk-keyword');
    }
    if (this.mediumRiskKeywords.some((keyword) => goal.includes(keyword))) {
      reasons.push('goal-medium-risk-keyword');
    }
    if (executionMode === 'agent') {
      reasons.push('agent-mode');
    }
    if (deniedTools.length > 0) {
      reasons.push('tool-deny');
    }
    if (askTools.length > 0) {
      reasons.push('tool-ask');
    }
    if (elevated) {
      reasons.push('elevated-operation');
    }

    if (this.mode === 'autonomous') {
      return {
        risk,
        profile,
        requestedTools,
        toolDecisions,
        deniedTools,
        askTools,
        allowTools,
        elevated,
        requiresExecApproval: askTools.includes('exec') || elevated,
        requiresApproval: false,
        reasons,
      };
    }

    if (this.mode === 'assisted') {
      return {
        risk,
        profile,
        requestedTools,
        toolDecisions,
        deniedTools,
        askTools,
        allowTools,
        elevated,
        requiresExecApproval: askTools.includes('exec') || elevated,
        requiresApproval: true,
        reasons,
      };
    }

    const approvalCriticalTools = new Set(['exec', 'install', 'publish', 'config_patch', 'payment', 'trade']);
    const requiresApproval = risk === 'high'
      || elevated
      || askTools.some((tool) => approvalCriticalTools.has(tool));
    return {
      risk,
      profile,
      requestedTools,
      toolDecisions,
      deniedTools,
      askTools,
      allowTools,
      elevated,
      requiresExecApproval: askTools.includes('exec') || elevated,
      requiresApproval,
      reasons,
    };
  }
}

module.exports = {
  PolicyEngine,
};
