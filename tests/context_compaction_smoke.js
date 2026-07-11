'use strict';

const assert = require('assert');
const { compactConversationHistory } = require('../src-js/core/context-compaction');

function main() {
  const history = [];
  for (let i = 0; i < 20; i += 1) {
    history.push({ role: i % 2 ? 'assistant' : 'user', content: `turno ${i}` });
  }
  history[15] = { role: 'assistant', content: '<function_calls> leer archivo' };
  history[16] = { role: 'assistant', content: 'sin result inmediato' };
  history[4] = { role: 'assistant', content: 'function_results: ok' };

  const out = compactConversationHistory(history, { maxMessages: 12 });
  assert.ok(out.history.length <= 12);
  assert.ok(out.meta.dropped > 0);
  assert.ok(out.meta.preservedPairs >= 0);

  console.log('context_compaction_smoke: OK');
}

main();
