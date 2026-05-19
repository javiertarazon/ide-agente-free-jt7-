'use strict';

const fs = require('fs');
const path = require('path');
const { resolveAgentStateDir } = require('./agent-state-paths');

function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9áéíóúñü\s]/gi, ' ').split(/\s+/).filter((t) => t.length >= 3);
}

function score(queryTokens, text) {
  const hay = new Set(tokenize(text));
  if (!queryTokens.length || !hay.size) return 0;
  let hits = 0;
  for (const t of queryTokens) if (hay.has(t)) hits += 1;
  return hits / queryTokens.length;
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return ''; }
}

function searchInSessionFiles(query, options = {}) {
  const workspacePath = path.resolve(options.workspacePath || process.cwd());
  const baseDir = path.join(workspacePath, resolveAgentStateDir(workspacePath));
  const candidates = ['RESUME.md', 'tasks.yaml', 'audit-log.jsonl']
    .map((name) => path.join(baseDir, name))
    .filter((f) => fs.existsSync(f));
  const q = tokenize(query);
  const hits = [];
  for (const file of candidates) {
    const content = readText(file);
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const s = score(q, line);
      if (s > 0) {
        hits.push({ file: path.relative(workspacePath, file), line: i + 1, text: line.trim(), score: s });
      }
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, Math.max(1, Number(options.topK || 3)));
}

module.exports = { searchInSessionFiles };
