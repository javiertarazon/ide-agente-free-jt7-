'use strict';

const fs = require('fs');
const path = require('path');

const LEGACY_DIR = 'copilot-agent';
const MODERN_DIR = 'freejt7-agent';

function resolveAgentStateDir(rootDir) {
  const envOverride = String(process.env.FREEJT7_STATE_DIR || '').trim();
  if (envOverride) {
    return envOverride;
  }

  const modernAbs = path.join(rootDir, MODERN_DIR);
  const legacyAbs = path.join(rootDir, LEGACY_DIR);

  if (fs.existsSync(modernAbs)) {
    return MODERN_DIR;
  }
  if (fs.existsSync(legacyAbs)) {
    return LEGACY_DIR;
  }
  return MODERN_DIR;
}

module.exports = { resolveAgentStateDir, LEGACY_DIR, MODERN_DIR };
