'use strict';

function estimateComplexity(goal = '') {
  const text = String(goal || '').toLowerCase();
  let score = 0;
  if (text.length > 160) score += 1;
  if (/\b(paralelo|subagente|sub-agente|orquesta|orquesta|multi|swarm)\b/.test(text)) score += 2;
  if (/\b(refactor|arquitectura|integral|completo|end-to-end|e2e)\b/.test(text)) score += 1;
  if (/\b(test|build|package|deploy|mcp|provider|policy)\b/.test(text)) score += 1;
  return score;
}

function buildSwarmPlan(goal, options = {}) {
  const complexity = estimateComplexity(goal);
  const enabled = complexity >= Math.max(2, Number(options.threshold || 3));
  const defaultRoles = [
    { id: 'planner', owner: 'plan', channel: 'swarm.plan' },
    { id: 'executor', owner: 'implementation', channel: 'swarm.exec' },
    { id: 'verifier', owner: 'verification', channel: 'swarm.verify' },
  ];
  return {
    enabled,
    complexity,
    mode: enabled ? 'multi-agent' : 'single-agent',
    roles: enabled ? defaultRoles : [],
    ownershipModel: enabled ? 'disjoint-write-scopes' : 'single-owner',
    channels: enabled ? defaultRoles.map((r) => r.channel) : [],
  };
}

module.exports = { buildSwarmPlan, estimateComplexity };
