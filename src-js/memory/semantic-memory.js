'use strict';

const fs = require('fs');
const path = require('path');
const { resolveAgentStateDir } = require('../core/agent-state-paths');

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü\s]/gi, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function scoreOverlap(queryTokens, itemTokens) {
  if (!queryTokens.length || !itemTokens.length) return 0;
  const set = new Set(itemTokens);
  let hits = 0;
  for (const t of queryTokens) if (set.has(t)) hits += 1;
  return hits / Math.max(1, queryTokens.length);
}

function memoryPath(workspacePath) {
  const root = path.resolve(workspacePath || process.cwd());
  return path.join(root, resolveAgentStateDir(root), 'semantic-memory.jsonl');
}

function appendSemanticMemory(entry, options = {}) {
  const file = memoryPath(options.workspacePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = {
    ts: new Date().toISOString(),
    text: String(entry?.text || '').trim(),
    tags: Array.isArray(entry?.tags) ? entry.tags : [],
    source: String(entry?.source || 'runtime').trim(),
  };
  if (!payload.text) return false;
  fs.appendFileSync(file, `${JSON.stringify(payload)}\n`, 'utf8');
  return true;
}

function loadSemanticMemory(options = {}) {
  const file = memoryPath(options.workspacePath);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const items = [];
  for (const line of lines) {
    try { items.push(JSON.parse(line)); } catch (_) {}
  }
  return items;
}

function retrieveSemanticMemory(query, options = {}) {
  const topK = Math.max(1, Number(options.topK || 3));
  const qTokens = tokenize(query);
  const items = loadSemanticMemory(options)
    .map((item) => ({ item, score: scoreOverlap(qTokens, tokenize(item.text)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((entry) => entry.item);
  return items;
}

module.exports = { appendSemanticMemory, retrieveSemanticMemory, loadSemanticMemory, memoryPath };
