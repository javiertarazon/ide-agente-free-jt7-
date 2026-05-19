'use strict';

function normalizeSkillId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  return String(value.id || value.name || '').trim().toLowerCase();
}

function detectProfile(goal = '') {
  const text = String(goal || '').toLowerCase();
  if (/\b(test|lint|build|verifica|verificacion|diagnost|doctor)\b/.test(text)) return 'verification';
  if (/\b(pdf|document|doc|informe|resumen|archivo)\b/.test(text)) return 'documents';
  if (/\b(web|http|url|navega|browser|internet)\b/.test(text)) return 'web';
  if (/\b(codigo|code|refactor|funcion|bug|script|archivo)\b/.test(text)) return 'coding';
  return 'general';
}

function activateCapabilities(goal, selectedSkills = []) {
  const profile = detectProfile(goal);
  const skillIds = selectedSkills.map(normalizeSkillId).filter(Boolean);
  const profileRules = {
    verification: ['debug', 'forensics', 'verify', 'audit', 'test'],
    documents: ['document', 'pdf', 'triage', 'report'],
    web: ['web', 'browser', 'search', 'research'],
    coding: ['code', 'refactor', 'debug', 'runtime', 'agent'],
    general: [],
  };
  const hints = profileRules[profile] || [];
  const activatedSkills = hints.length
    ? skillIds.filter((id) => hints.some((hint) => id.includes(hint)))
    : skillIds.slice(0, 5);

  return {
    profile,
    activatedSkills: activatedSkills.length ? activatedSkills : skillIds.slice(0, Math.min(3, skillIds.length)),
    activationMode: 'selective',
  };
}

module.exports = { activateCapabilities, detectProfile };
