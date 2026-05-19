'use strict';

function nowMs() { return Date.now(); }

function shouldCooldown(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return Boolean(
    error?.isRateLimitError
    || error?.isRetryable
    || message.includes('429')
    || message.includes('timeout')
    || message.includes('tempor')
  );
}

function normalizeKey(provider = '', model = '') {
  return `${String(provider || '').trim().toLowerCase()}::${String(model || '').trim().toLowerCase()}`;
}

function isOnCooldown(cooldowns, provider, model) {
  const key = normalizeKey(provider, model);
  const until = Number(cooldowns.get(key) || 0);
  return until > nowMs();
}

function applyCooldown(cooldowns, provider, model, ms) {
  const key = normalizeKey(provider, model);
  cooldowns.set(key, nowMs() + Math.max(1000, Number(ms || 45000)));
}

function rankFallbackEntries(entries = [], cooldowns = new Map()) {
  const available = [];
  const cooled = [];
  for (const entry of entries) {
    if (isOnCooldown(cooldowns, entry.provider, entry.model)) cooled.push(entry);
    else available.push(entry);
  }
  return [...available, ...cooled];
}

module.exports = {
  shouldCooldown,
  normalizeKey,
  isOnCooldown,
  applyCooldown,
  rankFallbackEntries,
};
