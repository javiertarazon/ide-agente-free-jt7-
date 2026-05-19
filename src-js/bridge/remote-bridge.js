'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveAgentStateDir } = require('../core/agent-state-paths');
const { createHash, randomUUID } = require('crypto');
const { EventEmitter } = require('events');

const DEFAULTS = {
  rootDir: path.resolve(__dirname, '..', '..'),
  stateFile: `${resolveAgentStateDir(path.resolve(__dirname, '..', '..'))}/remote-bridge-state.json`,
  pollInterval: 5000,
  maxEventsPerSession: 80,
  maxResolvedApprovals: 100,
  maxReviewHistoryPerSession: 12,
};

function normalizeProjectRoot(projectRoot) {
  const raw = String(projectRoot || '').trim();
  if (!raw) {
    return '';
  }
  const resolved = path.resolve(raw);
  try {
    if (fs.realpathSync.native) {
      return fs.realpathSync.native(resolved);
    }
    return fs.realpathSync(resolved);
  } catch (_) {
    return resolved;
  }
}

function hashIdentity(parts) {
  return createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 16);
}

function buildSystemIdentity(metadata = {}) {
  const hostId = String(metadata.hostId || os.hostname() || '').trim();
  const platform = String(metadata.platform || process.platform || '').trim();
  const projectRoot = String(metadata.projectRoot || metadata.workspacePath || '').trim();
  const canonicalProjectRoot = normalizeProjectRoot(projectRoot);
  return {
    hostId,
    platform,
    projectRoot,
    canonicalProjectRoot,
    projectId: canonicalProjectRoot ? hashIdentity([canonicalProjectRoot]) : '',
    hostFingerprint: hashIdentity([hostId, platform]),
  };
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== '' && item != null)
  );
}

function compareSystemIdentity(sessionIdentity = {}, currentMetadata = {}) {
  const currentIdentity = buildSystemIdentity({
    projectRoot: currentMetadata.projectRoot || currentMetadata.workspacePath || sessionIdentity.canonicalProjectRoot || sessionIdentity.projectRoot || '',
    hostId: currentMetadata.hostId || os.hostname(),
    platform: currentMetadata.platform || process.platform,
  });
  const mismatches = [];
  if (sessionIdentity.projectId && currentIdentity.projectId && sessionIdentity.projectId !== currentIdentity.projectId) {
    mismatches.push('project');
  }
  if (sessionIdentity.hostFingerprint && currentIdentity.hostFingerprint && sessionIdentity.hostFingerprint !== currentIdentity.hostFingerprint) {
    mismatches.push('host');
  }
  return {
    current: currentIdentity,
    stale: mismatches.length > 0,
    sameProject: !mismatches.includes('project'),
    sameHost: !mismatches.includes('host'),
    mismatches,
  };
}

class RemoteBridge extends EventEmitter {
  constructor(opts = {}) {
    super();
    this._cfg = {
      ...DEFAULTS,
      ...opts,
    };
    this._timer = null;
    this._running = false;
    this._state = {
      sessions: {},
      queue: [],
      approvals: [],
      updatedAt: new Date().toISOString(),
    };
    this._loadState();
  }

  configure(opts = {}) {
    const nextRootDir = opts.rootDir ? path.resolve(opts.rootDir) : this._cfg.rootDir;
    const nextStateFile = opts.stateFile || this._cfg.stateFile;
    const requiresReload = nextRootDir !== this._cfg.rootDir || nextStateFile !== this._cfg.stateFile;
    this._cfg = {
      ...this._cfg,
      ...opts,
      rootDir: nextRootDir,
      stateFile: nextStateFile,
    };
    if (requiresReload) {
      this._loadState();
    }
    return this;
  }

  _statePath() {
    return path.join(this._cfg.rootDir, this._cfg.stateFile);
  }

  _loadState() {
    const statePath = this._statePath();
    try {
      if (fs.existsSync(statePath)) {
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        this._state = {
          sessions: raw && typeof raw.sessions === 'object' ? raw.sessions : {},
          queue: Array.isArray(raw?.queue) ? raw.queue : [],
          approvals: Array.isArray(raw?.approvals) ? raw.approvals : [],
          updatedAt: raw?.updatedAt || new Date().toISOString(),
        };
        return;
      }
    } catch (_) {
    }
    this._state = {
      sessions: {},
      queue: [],
      approvals: [],
      updatedAt: new Date().toISOString(),
    };
  }

  _saveState() {
    this._state.updatedAt = new Date().toISOString();
    const statePath = this._statePath();
    try {
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, `${JSON.stringify(this._state, null, 2)}\n`, 'utf8');
    } catch (_) {
    }
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._timer = setInterval(() => this._poll(), this._cfg.pollInterval);
    if (this._timer.unref) {
      this._timer.unref();
    }
    this._saveState();
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._saveState();
  }

  registerSession(sessionId, metadata = {}) {
    const key = String(sessionId || '').trim();
    if (!key) {
      throw new Error('RemoteBridge.registerSession requiere sessionId');
    }
    const existing = this._state.sessions[key] || {
      sessionId: key,
      createdAt: new Date().toISOString(),
      events: [],
      reviewHistory: [],
    };
    const systemIdentity = compactObject(buildSystemIdentity(metadata));
    const next = {
      ...existing,
      sessionId: key,
      metadata: {
        ...(existing.metadata || {}),
        ...(existing.systemIdentity || {}),
        ...systemIdentity,
        ...(metadata || {}),
      },
      systemIdentity: {
        ...(existing.systemIdentity || {}),
        ...systemIdentity,
      },
      lastSeenAt: new Date().toISOString(),
      status: metadata.status || existing.status || 'active',
    };
    this._state.sessions[key] = next;
    this._saveState();
    return next;
  }

  closeSession(sessionId, patch = {}) {
    const key = String(sessionId || '').trim();
    if (!key || !this._state.sessions[key]) {
      return null;
    }
    const current = this._state.sessions[key];
    const next = {
      ...current,
      ...patch,
      status: patch.status || current.status || 'closed',
      closedAt: patch.closedAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    this._state.sessions[key] = next;
    this._saveState();
    return next;
  }

  appendSessionEvent(sessionId, type, payload = {}) {
    const session = this.registerSession(sessionId);
    const event = {
      id: randomUUID(),
      type: String(type || 'event'),
      createdAt: new Date().toISOString(),
      payload,
    };
    const events = Array.isArray(session.events) ? session.events.slice() : [];
    events.push(event);
    session.events = events.slice(-this._cfg.maxEventsPerSession);
    session.lastSeenAt = new Date().toISOString();
    this._state.sessions[String(sessionId)] = session;
    this._saveState();
    this.emit('event', { sessionId, event });
    return event;
  }

  updateSessionState(sessionId, patch = {}) {
    const key = String(sessionId || '').trim();
    if (!key) {
      return null;
    }
    const session = this.registerSession(key, patch.metadata || {});
    const next = {
      ...session,
      ...patch,
      metadata: {
        ...(session.metadata || {}),
        ...(patch.metadata || {}),
      },
      lastSeenAt: new Date().toISOString(),
    };
    this._state.sessions[key] = next;
    this._saveState();
    return next;
  }

  markResumePointer(sessionId, pointer = {}) {
    const key = String(sessionId || '').trim();
    if (!key) {
      return null;
    }
    const session = this.registerSession(key);
    const nextPointer = {
      ...(session.resumePointer || {}),
      ...(pointer || {}),
      updatedAt: new Date().toISOString(),
    };
    session.resumePointer = nextPointer;
    session.lastSeenAt = nextPointer.updatedAt;
    this._state.sessions[key] = session;
    this._saveState();
    return nextPointer;
  }

  recordGateState(sessionId, gateState = {}, options = {}) {
    const key = String(sessionId || '').trim();
    if (!key) {
      return null;
    }
    const session = this.registerSession(key);
    const history = Array.isArray(session.reviewHistory) ? session.reviewHistory.slice() : [];
    const entry = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      stage: options.stage || 'review',
      passIndex: Number(options.passIndex || 0),
      summary: String(gateState.summary || '').trim(),
      status: String(gateState.status || '').trim() || 'unknown',
      findings: Array.isArray(gateState.findings) ? gateState.findings : [],
      closingGate: gateState.closingGate || null,
      fixesApplied: Array.isArray(gateState.fixesApplied) ? gateState.fixesApplied : [],
      residualRisks: Array.isArray(gateState.residualRisks) ? gateState.residualRisks : [],
    };
    history.push(entry);
    session.reviewHistory = history.slice(-this._cfg.maxReviewHistoryPerSession);
    session.latestGate = entry;
    session.resumePointer = {
      ...(session.resumePointer || {}),
      stage: options.pointerStage || (options.stage === 'autofix' ? 'autofix' : 'review'),
      passIndex: entry.passIndex,
      gateStatus: entry.status,
      blockingFindings: Array.isArray(entry.closingGate?.blockingFindings) ? entry.closingGate.blockingFindings : [],
      updatedAt: entry.createdAt,
    };
    session.lastSeenAt = entry.createdAt;
    this._state.sessions[key] = session;
    this._saveState();
    this.emit('gate-state', { sessionId: key, entry });
    return entry;
  }

  getSessionResume(sessionId, currentMetadata = {}) {
    const key = String(sessionId || '').trim();
    if (!key) {
      return null;
    }
    const session = this._state.sessions[key];
    if (!session) {
      return null;
    }
    const identityStatus = compareSystemIdentity(session.systemIdentity || {}, currentMetadata || {});
    return {
      sessionId: session.sessionId,
      status: session.status || 'active',
      metadata: session.metadata || {},
      systemIdentity: session.systemIdentity || {},
      identityStatus,
      resumePointer: session.resumePointer || null,
      latestGate: session.latestGate || null,
      reviewHistory: Array.isArray(session.reviewHistory) ? session.reviewHistory : [],
      lastToolEvent: session.lastToolEvent || null,
      recentToolEvents: Array.isArray(session.events)
        ? session.events.filter((event) => String(event?.type || '').startsWith('tool-')).slice(-6)
        : [],
      eventCount: Array.isArray(session.events) ? session.events.length : 0,
      pendingApprovals: this.getPendingApprovals(key),
      lastSeenAt: session.lastSeenAt || session.createdAt,
    };
  }

  enqueue(cmd) {
    const entry = {
      id: randomUUID(),
      status: 'queued',
      enqueuedAt: new Date().toISOString(),
      ...cmd,
    };
    this._state.queue.push(entry);
    this._saveState();
    this.emit('command', entry);
    return entry;
  }

  acknowledgeCommand(commandId, result = {}) {
    const index = this._state.queue.findIndex((item) => item.id === commandId);
    if (index === -1) {
      return null;
    }
    const current = this._state.queue[index];
    const next = {
      ...current,
      ...result,
      status: result.status || 'completed',
      acknowledgedAt: new Date().toISOString(),
    };
    this._state.queue.splice(index, 1);
    this._saveState();
    this.emit('command-ack', next);
    return next;
  }

  createApprovalTicket(sessionId, ticket = {}) {
    const session = this.registerSession(sessionId);
    const entry = {
      id: randomUUID(),
      sessionId,
      kind: ticket.kind || 'review',
      summary: ticket.summary || '',
      metadata: {
        ...(ticket.metadata || {}),
        resumePointer: ticket.metadata?.resumePointer || session.resumePointer || null,
        latestGate: ticket.metadata?.latestGate || session.latestGate || null,
        projectRoot: ticket.metadata?.projectRoot || session.systemIdentity?.projectRoot || session.metadata?.workspacePath || '',
        canonicalProjectRoot: ticket.metadata?.canonicalProjectRoot || session.systemIdentity?.canonicalProjectRoot || '',
        projectId: ticket.metadata?.projectId || session.systemIdentity?.projectId || '',
        hostId: ticket.metadata?.hostId || session.systemIdentity?.hostId || '',
        hostFingerprint: ticket.metadata?.hostFingerprint || session.systemIdentity?.hostFingerprint || '',
      },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this._state.approvals.push(entry);
    this._saveState();
    this.emit('approval-requested', entry);
    return entry;
  }

  getPendingApprovals(sessionId = '') {
    return this._state.approvals.filter((item) => {
      if (item.status !== 'pending') return false;
      if (!sessionId) return true;
      return item.sessionId === sessionId;
    });
  }

  async submitReview(ticket, result) {
    const ticketId = typeof ticket === 'string' ? ticket : ticket?.id;
    const resolved = this.resolveApproval(ticketId, result || {});
    if (resolved) {
      this.emit('review', { ticket: resolved, result, submittedAt: new Date().toISOString() });
    }
    return resolved;
  }

  resolveApproval(ticketId, result = {}) {
    const index = this._state.approvals.findIndex((item) => item.id === ticketId);
    if (index === -1) {
      return null;
    }
    const current = this._state.approvals[index];
    const next = {
      ...current,
      result,
      status: result.status || 'resolved',
      reviewer: result.reviewer || current.reviewer || '',
      resolvedAt: new Date().toISOString(),
    };
    this._state.approvals[index] = next;
    const resolved = this._state.approvals.filter((item) => item.status !== 'pending');
    if (resolved.length > this._cfg.maxResolvedApprovals) {
      const pending = this._state.approvals.filter((item) => item.status === 'pending');
      this._state.approvals = [
        ...pending,
        ...resolved.slice(-this._cfg.maxResolvedApprovals),
      ];
    }
    this._saveState();
    return next;
  }

  getSnapshot() {
    const sessions = Object.values(this._state.sessions);
    return {
      running: this._running,
      queueSize: this._state.queue.length,
      sessions: sessions.map((session) => ({
        identity: session.systemIdentity || {},
        sessionId: session.sessionId,
        status: session.status || 'active',
        lastSeenAt: session.lastSeenAt || session.createdAt,
        pendingApprovals: this.getPendingApprovals(session.sessionId).length,
        eventCount: Array.isArray(session.events) ? session.events.length : 0,
        gateStatus: session.latestGate?.status || '',
        resumable: Boolean(session.resumePointer && String(session.status || '').toLowerCase() !== 'completed'),
        staleForCurrentHost: compareSystemIdentity(session.systemIdentity || {}, {}).stale,
      })),
      pendingApprovals: this.getPendingApprovals().length,
      resumableSessions: sessions.filter((session) => session.resumePointer && String(session.status || '').toLowerCase() !== 'completed').length,
      staleSessions: sessions.filter((session) => compareSystemIdentity(session.systemIdentity || {}, {}).stale).length,
      updatedAt: this._state.updatedAt,
    };
  }

  _poll() {
    const next = this._state.queue.find((item) => item.status === 'queued');
    if (!next) {
      return;
    }
    next.status = 'processing';
    next.dispatchedAt = new Date().toISOString();
    this._saveState();
    this.emit('process', next);
  }
}

let _instance = null;
function getRemoteBridge(opts) {
  if (!_instance) {
    _instance = new RemoteBridge(opts);
  } else if (opts && Object.keys(opts).length > 0) {
    _instance.configure(opts);
  }
  return _instance;
}

module.exports = { DEFAULTS, RemoteBridge, getRemoteBridge, normalizeProjectRoot, buildSystemIdentity, compareSystemIdentity };
