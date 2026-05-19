'use strict';

const fs = require('fs');
const path = require('path');
const { resolveAgentStateDir } = require('./agent-state-paths');

class AuditBus {
  constructor(opts = {}) {
    this.rootDir = opts.rootDir || process.cwd();
    this.filePath = opts.filePath || path.join(this.rootDir, resolveAgentStateDir(this.rootDir), 'panel-audit.jsonl');
    this.output = opts.output || null;
    this.remoteBridge = opts.remoteBridge || null;
  }

  _ensureParentDir() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  emit(sessionId, type, payload = {}) {
    const event = {
      ts: new Date().toISOString(),
      sessionId: String(sessionId || ''),
      type: String(type || 'event'),
      payload,
    };

    try {
      this._ensureParentDir();
      fs.appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, 'utf8');
    } catch (error) {
      if (this.output) {
        this.output.appendLine(`[freejt7-panel] audit append error: ${String(error.message || error)}`);
      }
    }

    if (this.remoteBridge && typeof this.remoteBridge.appendSessionEvent === 'function' && sessionId) {
      try {
        this.remoteBridge.appendSessionEvent(sessionId, `panel:${event.type}`, payload);
      } catch (_) {
        // ignore remote bridge errors
      }
    }

    if (this.output) {
      this.output.appendLine(`[freejt7-panel] ${event.type} sid=${event.sessionId}`);
    }

    return event;
  }
}

module.exports = {
  AuditBus,
};
