'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { SemanticMemoryStore, redactSecrets, tokenize } = require('../src-js/memory/semantic-memory-store');

function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-memory-'));
  const storePath = path.join(dir, 'memory.json');
  const store = new SemanticMemoryStore({ filePath: storePath, maxItems: 10 });
  store.upsert({ id: 'one', text: 'Agente MT5 conectado con MCP y memoria persistente. API_KEY=supersecret', tags: ['mt5', 'mcp'] });
  store.upsert({ id: 'two', text: 'Proveedor local Ollama listo para pruebas offline.', tags: ['local'] });

  assert.ok(fs.existsSync(storePath));
  assert.ok(!fs.readFileSync(storePath, 'utf8').includes('supersecret'), 'Debe redactar secretos');
  assert.deepEqual(tokenize('Memoria memoria MCP!').sort(), ['mcp', 'memoria']);
  assert.match(redactSecrets('token=abc123'), /<redacted>/);
  const hits = store.search('mt5 mcp agente', { limit: 2 });
  assert.equal(hits[0].id, 'one');
  assert.ok(hits[0].score >= 2);

  const reloaded = new SemanticMemoryStore({ filePath: storePath });
  assert.equal(reloaded.search('ollama local')[0].id, 'two');
  process.stdout.write('semantic_memory_store_smoke: ok\n');
}

if (require.main === module) main();
module.exports = { main };
