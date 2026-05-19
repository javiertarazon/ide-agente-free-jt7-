'use strict';

const assert = require('assert');
const { shouldCooldown, applyCooldown, isOnCooldown, rankFallbackEntries } = require('../src-js/core/provider-core');

function main() {
  assert.ok(shouldCooldown({ isRateLimitError: true }));
  assert.ok(shouldCooldown(new Error('HTTP 429')));

  const cooldowns = new Map();
  applyCooldown(cooldowns, 'openrouter', 'gpt', 2000);
  assert.ok(isOnCooldown(cooldowns, 'openrouter', 'gpt'));

  const ranked = rankFallbackEntries([
    { provider: 'openrouter', model: 'gpt' },
    { provider: 'hf', model: 'mixtral' },
  ], cooldowns);
  assert.strictEqual(ranked[0].provider, 'hf');
  console.log('provider_core_smoke: OK');
}

main();
