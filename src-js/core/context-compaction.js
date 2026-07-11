'use strict';

function compactConversationHistory(history = [], options = {}) {
  const list = Array.isArray(history) ? history.filter(Boolean) : [];
  const maxMessages = Math.max(2, Number(options.maxMessages || 12));
  if (list.length <= maxMessages) {
    return { history: list, meta: { kept: list.length, dropped: 0, preservedPairs: 0 } };
  }

  const tail = list.slice(-maxMessages);
  const preserved = [];

  // Preservar atomicidad básica tool-call -> tool-result cuando aparezca en ventana truncada
  for (let i = 0; i < tail.length; i += 1) {
    const item = tail[i];
    const text = String(item?.content || '').toLowerCase();
    if (text.includes('<function_calls>') || text.includes('function call')) {
      const next = tail[i + 1];
      const nextText = String(next?.content || '').toLowerCase();
      if (!next || (!nextText.includes('function_results') && !nextText.includes('tool result'))) {
        const pair = list.find((entry) => {
          const c = String(entry?.content || '').toLowerCase();
          return c.includes('function_results') || c.includes('tool result');
        });
        if (pair) preserved.push(pair);
      }
    }
  }

  const compacted = [...preserved, ...tail].slice(-maxMessages);
  return {
    history: compacted,
    meta: {
      kept: compacted.length,
      dropped: Math.max(0, list.length - compacted.length),
      preservedPairs: preserved.length,
    },
  };
}

module.exports = { compactConversationHistory };
