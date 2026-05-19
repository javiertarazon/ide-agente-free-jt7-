'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { searchInSessionFiles } = require('../src-js/core/agent-search');

function main() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-search-'));
  const stateDir = path.join(ws, 'freejt7-agent');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'RESUME.md'), 'failover proveedor activo\n', 'utf8');
  fs.writeFileSync(path.join(stateDir, 'tasks.yaml'), '- titulo: memoria semantica\n', 'utf8');

  const hits = searchInSessionFiles('failover proveedor', { workspacePath: ws, topK: 2 });
  assert.ok(hits.length >= 1);
  assert.ok(hits[0].file.includes('RESUME.md'));
  console.log('agent_search_smoke: OK');
}

main();
