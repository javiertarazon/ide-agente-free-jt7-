'use strict';

const PANEL_PROVIDER_SELECTIONS_KEY = 'freejt7.panel.providerSelections';
const PANEL_EXECUTION_MODE_KEY = 'freejt7.panel.executionMode';
const PANEL_RUNTIME_BACKEND_KEY = 'freejt7.panel.runtimeBackend';
const PANEL_POLICY_PROFILE_KEY = 'freejt7.panel.policyProfile';
const PANEL_AUTH_PROFILE_KEY = 'freejt7.panel.authProfile';
const PANEL_FALLBACKS_KEY = 'freejt7.panel.fallbackProviders';
const PANEL_ACTIVE_SESSION_KEY = 'freejt7.panel.activeSessionId';
const PANEL_ACTIVE_PROVIDER_KEY = 'freejt7.panel.provider';

function ensurePanelSeedSession(engine, preferredSessionId = '') {
  const state = engine && typeof engine.getState === 'function' ? engine.getState() : { sessions: {} };
  const sessions = state && state.sessions && typeof state.sessions === 'object'
    ? Object.values(state.sessions)
    : [];
  if (preferredSessionId && sessions.some((session) => session && session.sessionId === preferredSessionId)) {
    return preferredSessionId;
  }
  if (sessions.length) {
    const sorted = sessions
      .filter((session) => session && session.sessionId)
      .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0));
    return sorted[0] ? sorted[0].sessionId : '';
  }
  if (!engine || typeof engine.createSession !== 'function') {
    return '';
  }
  const session = engine.createSession({ title: 'Sesion inicial Free JT7' });
  return String(session && session.sessionId || '').trim();
}

module.exports = {
  PANEL_PROVIDER_SELECTIONS_KEY,
  PANEL_EXECUTION_MODE_KEY,
  PANEL_RUNTIME_BACKEND_KEY,
  PANEL_POLICY_PROFILE_KEY,
  PANEL_AUTH_PROFILE_KEY,
  PANEL_FALLBACKS_KEY,
  PANEL_ACTIVE_SESSION_KEY,
  PANEL_ACTIVE_PROVIDER_KEY,
  ensurePanelSeedSession,
};