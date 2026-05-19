'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function makeLineDiff(beforeText, afterText) {
  const before = String(beforeText || '').split(/\r?\n/);
  const after = String(afterText || '').split(/\r?\n/);
  const max = Math.max(before.length, after.length);
  const changes = [];
  for (let index = 0; index < max; index += 1) {
    if (before[index] !== after[index]) {
      changes.push({ line: index + 1, before: before[index] ?? null, after: after[index] ?? null });
    }
  }
  return changes;
}

function createReviewRollback(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
  const snapshotRoot = path.resolve(options.snapshotRoot || path.join(workspaceRoot, '.freejt7', 'review-snapshots'));
  ensureDir(snapshotRoot);

  function resolveWorkspacePath(relativePath) {
    const fullPath = path.resolve(workspaceRoot, relativePath);
    const rel = path.relative(workspaceRoot, fullPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Review rollback: ruta fuera del workspace: ${relativePath}`);
    }
    return fullPath;
  }

  function createSnapshot(files = [], metadata = {}) {
    const id = metadata.id || `snapshot-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const entries = files.map((file) => {
      const fullPath = resolveWorkspacePath(file);
      return { file, existed: fs.existsSync(fullPath), content: readIfExists(fullPath) };
    });
    const snapshot = { id, createdAt: new Date().toISOString(), workspaceRoot, metadata, entries };
    fs.writeFileSync(path.join(snapshotRoot, `${id}.json`), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    return snapshot;
  }

  function preview(snapshot) {
    return snapshot.entries.map((entry) => {
      const current = readIfExists(resolveWorkspacePath(entry.file));
      return {
        file: entry.file,
        existed: entry.existed,
        currentExists: current !== null,
        changed: current !== entry.content,
        diff: makeLineDiff(entry.content || '', current || ''),
      };
    });
  }

  function rollback(snapshot) {
    const changes = [];
    for (const entry of snapshot.entries) {
      const fullPath = resolveWorkspacePath(entry.file);
      if (entry.existed) {
        ensureDir(path.dirname(fullPath));
        fs.writeFileSync(fullPath, entry.content || '', 'utf8');
        changes.push({ file: entry.file, action: 'restored' });
      } else if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { force: true });
        changes.push({ file: entry.file, action: 'removed' });
      } else {
        changes.push({ file: entry.file, action: 'unchanged-missing' });
      }
    }
    return { status: 'rolled-back', snapshotId: snapshot.id, changes };
  }

  return { workspaceRoot, snapshotRoot, createSnapshot, preview, rollback };
}

module.exports = {
  createReviewRollback,
  makeLineDiff,
};
