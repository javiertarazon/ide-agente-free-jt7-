'use strict';

const fs = require('fs');
const path = require('path');

const SECRET_PATTERNS = [
  /(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/ig,
  /(sk-[a-zA-Z0-9_-]{12,})/g,
];

function redactSecrets(text) {
  let result = String(text || '');
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match, label) => (label && /api|token|secret|password/i.test(label) ? `${label}=<redacted>` : '<redacted>'));
  }
  return result;
}

function tokenize(text) {
  return Array.from(new Set(String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9_]+/)
    .filter((item) => item.length >= 3)
  ));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

class SemanticMemoryStore {
  constructor(options = {}) {
    this.filePath = path.resolve(options.filePath || path.join(process.cwd(), 'copilot-agent', 'semantic-memory.json'));
    this.maxItems = Math.max(1, Number(options.maxItems || 500));
    this.items = [];
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.items = Array.isArray(parsed.items) ? parsed.items : [];
    } catch (_) {
      this.items = [];
    }
  }

  save() {
    ensureDir(path.dirname(this.filePath));
    const payload = { version: 1, updatedAt: new Date().toISOString(), items: this.items.slice(-this.maxItems) };
    fs.writeFileSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  upsert(entry = {}) {
    const id = String(entry.id || `mem-${Date.now()}-${this.items.length + 1}`).trim();
    const text = redactSecrets(entry.text || entry.summary || entry.content || '');
    const item = {
      id,
      text,
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
      source: String(entry.source || 'freejt7').trim(),
      metadata: entry.metadata && typeof entry.metadata === 'object' ? { ...entry.metadata } : {},
      tokens: tokenize(`${text} ${(entry.tags || []).join(' ')}`),
      updatedAt: new Date().toISOString(),
    };
    const index = this.items.findIndex((candidate) => candidate.id === id);
    if (index >= 0) this.items[index] = item;
    else this.items.push(item);
    this.items = this.items.slice(-this.maxItems);
    this.save();
    return item;
  }

  search(query, options = {}) {
    const queryTokens = tokenize(query);
    const limit = Math.max(1, Number(options.limit || 5));
    return this.items
      .map((item) => {
        const overlap = item.tokens.filter((token) => queryTokens.includes(token));
        const tagBoost = (item.tags || []).filter((tag) => queryTokens.includes(String(tag).toLowerCase())).length;
        return { ...item, score: overlap.length + tagBoost, matchedTokens: overlap };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, limit);
  }
}

module.exports = {
  SemanticMemoryStore,
  redactSecrets,
  tokenize,
};
