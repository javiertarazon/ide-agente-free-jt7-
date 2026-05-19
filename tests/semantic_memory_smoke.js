'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { appendSemanticMemory, retrieveSemanticMemory } = require('../src-js/memory/semantic-memory');

function main() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-sem-memory-'));
  appendSemanticMemory({ text: 'Implementar failover de proveedor con backoff', source: 'smoke' }, { workspacePath: ws });
  appendSemanticMemory({ text: 'Agregar memoria semantica para continuidad de chat', source: 'smoke' }, { workspacePath: ws });
  const out = retrieveSemanticMemory('necesito failover de proveedor', { workspacePath: ws, topK: 2 });
  assert.ok(out.length >= 1);
  assert.ok(String(out[0].text).toLowerCase().includes('failover'));
  console.log('semantic_memory_smoke: OK');
}

main();
