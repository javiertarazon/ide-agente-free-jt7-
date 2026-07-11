/**
 * plugin-runtime.js — Free JT7 Plugin Runtime (P2, Fase 2)
 *
 * Inspirado en el crate `plugins` de Claurst.
 * Resuelve Brecha 4: soporte de plugins a nivel de runtime con hooks y
 * capacidades declaradas, no solo a nivel CLI.
 *
 * Ciclo de vida de un plugin:
 *   loadPlugin(manifest) → registerHook(event, fn) → emit(event, ctx) → teardown()
 *
 * Hooks disponibles:
 *   preToolUse   — antes de ejecutar una herramienta
 *   postToolUse  — después de ejecutar una herramienta
 *   onRouteStart — cuando el router inicia una ruta
 *   onRouteEnd   — cuando el router finaliza una ruta
 *   onError      — al ocurrir un error en el ciclo de agente
 *
 * @module plugin-runtime
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Capacidades declarables en el manifest de un plugin
// ---------------------------------------------------------------------------
const VALID_CAPABILITIES = new Set([
  'tool-intercept',    // puede interceptar herramientas (preToolUse/postToolUse)
  'route-intercept',   // puede interceptar rutas (onRouteStart/onRouteEnd)
  'error-handler',     // puede manejar errores del agente
  'memory-reader',     // lectura de memoria
  'memory-writer',     // escritura de memoria (capacidad elevada)
  'scheduler-jobs',    // puede registrar jobs en el scheduler
]);

const PLUGIN_RUNTIME_API_VERSION = '1.0.0';
const INTEGRATION_MANIFEST_FILENAME = 'freejt7.integration.json';
const VALID_INTEGRATION_TIERS = new Set(['trusted', 'experimental']);
const VALID_IMPORTABLE_CAPABILITIES = new Set([
  'commands',
  'tools',
  'policies',
  'docs',
  'prompts',
  'evaluators',
  'plugin',
]);

// Hooks y las capacidades mínimas que requieren
const HOOK_CAPABILITY_MAP = {
  preToolUse:   'tool-intercept',
  postToolUse:  'tool-intercept',
  onRouteStart: 'route-intercept',
  onRouteEnd:   'route-intercept',
  onError:      'error-handler',
};

// Hooks que pueden modificar el contexto (vs. solo observar)
const MUTATING_HOOKS = new Set(['preToolUse', 'postToolUse']);

// ---------------------------------------------------------------------------
// Validación de manifest
// ---------------------------------------------------------------------------

/**
 * Valida la estructura mínima de un manifest de plugin.
 * @param {object} manifest
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['manifest debe ser un objeto'] };
  }

  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('manifest.id: string requerido');
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('manifest.version: string requerido (semver)');
  }

  if (!Array.isArray(manifest.capabilities)) {
    errors.push('manifest.capabilities: array requerido');
  } else {
    const invalid = manifest.capabilities.filter(c => !VALID_CAPABILITIES.has(c));
    if (invalid.length > 0) {
      errors.push(`capacidades no válidas: ${invalid.join(', ')}`);
    }
  }

  if (manifest.hooks && !Array.isArray(manifest.hooks)) {
    errors.push('manifest.hooks: debe ser array si se declara');
  }

  return { ok: errors.length === 0, errors };
}

function _major(version) {
  const match = String(version || '').trim().match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function _isRuntimeCompatible(range) {
  if (!range) return true;
  const runtimeMajor = _major(PLUGIN_RUNTIME_API_VERSION);
  const requested = String(range).trim();
  if (/^\d+\.x$/.test(requested)) {
    return _major(requested) === runtimeMajor;
  }
  return _major(requested) === runtimeMajor;
}

function _walkForManifestFiles(rootDir) {
  const manifests = [];
  if (!rootDir || !fs.existsSync(rootDir)) return manifests;
  const stack = [path.resolve(rootDir)];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === INTEGRATION_MANIFEST_FILENAME) {
        manifests.push(fullPath);
      }
    }
  }
  manifests.sort();
  return manifests;
}

function _resolvePathWithinRoot(rootDir, relativePath) {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`ruta fuera del root del capability pack: ${relativePath}`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`ruta declarada no existe: ${relativePath}`);
  }
  return resolved;
}

function _normalizeCapabilityEntries(capabilityName, entries, rootDir, errors) {
  if (!Array.isArray(entries)) {
    errors.push(`capabilities.${capabilityName}: debe ser array`);
    return [];
  }
  return entries.map((entry, index) => {
    if (typeof entry === 'string') {
      return {
        id: `${capabilityName}-${index + 1}`,
        path: _resolvePathWithinRoot(rootDir, entry),
      };
    }
    if (!entry || typeof entry !== 'object') {
      errors.push(`capabilities.${capabilityName}[${index}]: descriptor inválido`);
      return null;
    }
    const normalized = { ...entry, id: entry.id || `${capabilityName}-${index + 1}` };
    if (normalized.path) {
      normalized.path = _resolvePathWithinRoot(rootDir, normalized.path);
    }
    return normalized;
  }).filter(Boolean);
}

function validateIntegrationManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['integration manifest debe ser un objeto'] };
  }
  if (manifest.manifestVersion !== 1) {
    errors.push('manifestVersion: se soporta solo la version 1');
  }
  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('id: string requerido');
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('version: string requerido');
  }
  if (!manifest.tier || !VALID_INTEGRATION_TIERS.has(manifest.tier)) {
    errors.push(`tier: debe ser uno de ${Array.from(VALID_INTEGRATION_TIERS).join(', ')}`);
  }
  if (!_isRuntimeCompatible(manifest.compatibility && manifest.compatibility.pluginRuntimeApi)) {
    errors.push(`compatibility.pluginRuntimeApi incompatible con runtime ${PLUGIN_RUNTIME_API_VERSION}`);
  }
  if (!manifest.capabilities || typeof manifest.capabilities !== 'object') {
    errors.push('capabilities: objeto requerido');
  } else {
    for (const capabilityName of Object.keys(manifest.capabilities)) {
      if (!VALID_IMPORTABLE_CAPABILITIES.has(capabilityName)) {
        errors.push(`capability importable no valida: ${capabilityName}`);
      }
    }
    if (manifest.capabilities.plugin && typeof manifest.capabilities.plugin !== 'object') {
      errors.push('capabilities.plugin: debe ser objeto');
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Clase PluginRuntime
// ---------------------------------------------------------------------------
class PluginRuntime {
  constructor() {
    /** @type {Map<string, {manifest: object, enabled: boolean}>} */
    this._registry = new Map();

    /** @type {Map<string, Array<{pluginId: string, fn: Function}>>} */
    this._hooks = new Map([
      ['preToolUse',   []],
      ['postToolUse',  []],
      ['onRouteStart', []],
      ['onRouteEnd',   []],
      ['onError',      []],
    ]);

    /** @type {Map<string, object>} */
    this._integrations = new Map();

    this._log = [];
  }

  // ── Logging ──────────────────────────────────────────────────────────────

  _info(msg) {
    const entry = { ts: new Date().toISOString(), level: 'info', msg };
    this._log.push(entry);
    if (process.env.NODE_ENV !== 'test') {
      process.stdout.write(`[plugin-runtime] ${entry.ts} ${msg}\n`);
    }
  }

  _warn(msg) {
    const entry = { ts: new Date().toISOString(), level: 'warn', msg };
    this._log.push(entry);
    if (process.env.NODE_ENV !== 'test') {
      process.stderr.write(`[plugin-runtime] WARN ${entry.ts} ${msg}\n`);
    }
  }

  // ── Registro de plugins ──────────────────────────────────────────────────

  /**
   * Carga y registra un plugin desde su manifest.
   * El manifest puede incluir un objeto `init` con funciones de hook listas
   * para registrar automáticamente.
   *
   * @param {object} manifest
   * @param {object} [handlers]  - { hookName: fn, ... } para registrar inline
   * @returns {{ ok: boolean, errors: string[] }}
   */
  loadPlugin(manifest, handlers = {}) {
    const { ok, errors } = validateManifest(manifest);
    if (!ok) {
      this._warn(`loadPlugin(${manifest?.id}): manifest inválido — ${errors.join('; ')}`);
      return { ok: false, errors };
    }

    if (this._registry.has(manifest.id)) {
      const warning = `plugin '${manifest.id}' ya registrado — se omite`;
      this._warn(warning);
      return { ok: false, errors: [warning] };
    }

    this._registry.set(manifest.id, { manifest, enabled: true });
    this._info(`loadPlugin: '${manifest.id}' v${manifest.version} cargado (caps: ${manifest.capabilities.join(', ')})`);

    // Registrar handlers inline si se proporcionan
    for (const [hookName, fn] of Object.entries(handlers)) {
      if (typeof fn === 'function') {
        this.registerHook(manifest.id, hookName, fn);
      }
    }

    return { ok: true, errors: [] };
  }

  loadIntegrationManifest(manifestPath, options = {}) {
    const allowExperimental = Boolean(options.allowExperimental);
    const resolvedManifestPath = path.resolve(manifestPath);
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(resolvedManifestPath, 'utf8'));
    } catch (error) {
      return { ok: false, errors: [`manifest no legible: ${error.message}`] };
    }

    const validated = validateIntegrationManifest(manifest);
    if (!validated.ok) {
      this._warn(`loadIntegrationManifest(${resolvedManifestPath}): inválido — ${validated.errors.join('; ')}`);
      return validated;
    }
    if (manifest.tier === 'experimental' && !allowExperimental) {
      return { ok: false, errors: ['integration experimental bloqueada por politica'] };
    }
    if (this._integrations.has(manifest.id)) {
      return { ok: true, errors: [], duplicate: true, integration: this._integrations.get(manifest.id) };
    }

    const rootDir = path.dirname(resolvedManifestPath);
    const capabilityIndex = {};
    const errors = [];
    const capabilities = manifest.capabilities || {};

    for (const capabilityName of ['commands', 'tools', 'policies', 'docs', 'prompts', 'evaluators']) {
      capabilityIndex[capabilityName] = capabilities[capabilityName]
        ? _normalizeCapabilityEntries(capabilityName, capabilities[capabilityName], rootDir, errors)
        : [];
    }

    let pluginLoaded = false;
    if (capabilities.plugin) {
      try {
        const pluginEntry = _resolvePathWithinRoot(rootDir, capabilities.plugin.entry);
        const pluginModule = require(pluginEntry);
        let handlers = {};
        if (typeof pluginModule.activate === 'function') {
          handlers = pluginModule.activate({ manifest, rootDir, runtime: this }) || {};
        } else if (pluginModule.hooks && typeof pluginModule.hooks === 'object') {
          handlers = pluginModule.hooks;
        } else if (typeof pluginModule === 'function') {
          handlers = pluginModule({ manifest, rootDir, runtime: this }) || {};
        }
        const pluginManifest = {
          id: manifest.id,
          version: manifest.version,
          capabilities: Array.isArray(capabilities.plugin.capabilities)
            ? capabilities.plugin.capabilities
            : ((pluginModule.manifest && pluginModule.manifest.capabilities) || []),
        };
        const loadResult = this.loadPlugin(pluginManifest, handlers);
        if (!loadResult.ok) {
          errors.push(...loadResult.errors);
        } else {
          pluginLoaded = true;
          capabilityIndex.plugin = {
            entry: pluginEntry,
            capabilities: pluginManifest.capabilities,
          };
        }
      } catch (error) {
        errors.push(`capabilities.plugin: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const record = {
      id: manifest.id,
      manifestPath: resolvedManifestPath,
      rootDir,
      tier: manifest.tier,
      version: manifest.version,
      pluginLoaded,
      compatibility: manifest.compatibility || {},
      capabilityIndex,
    };
    this._integrations.set(manifest.id, record);
    this._info(`loadIntegrationManifest: '${manifest.id}' (${manifest.tier}) cargado desde ${resolvedManifestPath}`);
    return { ok: true, errors: [], integration: record };
  }

  discoverAndLoadIntegrations(options = {}) {
    const directories = Array.isArray(options.directories) ? options.directories : [];
    const allowExperimental = Boolean(options.allowExperimental);
    const discovered = [];
    const loaded = [];
    const errors = [];

    for (const directory of directories) {
      for (const manifestPath of _walkForManifestFiles(directory)) {
        discovered.push(manifestPath);
        const result = this.loadIntegrationManifest(manifestPath, { allowExperimental });
        if (result.ok) {
          if (!result.duplicate) loaded.push(manifestPath);
        } else {
          errors.push({ manifestPath, errors: result.errors });
        }
      }
    }

    if (loaded.length > 0) {
      this._info(`discoverAndLoadIntegrations: ${loaded.length} capability packs cargados`);
    }
    return { discovered, loaded, errors };
  }

  getCapabilityIndex() {
    const aggregate = {
      commands: [],
      tools: [],
      policies: [],
      docs: [],
      prompts: [],
      evaluators: [],
      plugin: [],
    };
    for (const integration of this._integrations.values()) {
      for (const [key, value] of Object.entries(integration.capabilityIndex || {})) {
        if (!(key in aggregate)) continue;
        if (Array.isArray(value)) {
          aggregate[key].push(...value.map((item) => ({ ...item, integrationId: integration.id, tier: integration.tier })));
        } else if (value) {
          aggregate[key].push({ ...value, integrationId: integration.id, tier: integration.tier });
        }
      }
    }
    return aggregate;
  }

  /**
   * Elimina un plugin y desregistra todos sus hooks.
   * @param {string} pluginId
   * @returns {boolean}
   */
  unloadPlugin(pluginId) {
    if (!this._registry.has(pluginId)) return false;

    // Eliminar todos los hooks del plugin
    for (const [hookName, list] of this._hooks) {
      const filtered = list.filter(h => h.pluginId !== pluginId);
      this._hooks.set(hookName, filtered);
    }

    this._registry.delete(pluginId);
    this._info(`unloadPlugin: '${pluginId}' eliminado`);
    return true;
  }

  /**
   * Habilita o deshabilita un plugin sin eliminarlo.
   * @param {string} pluginId
   * @param {boolean} enabled
   */
  setEnabled(pluginId, enabled) {
    const entry = this._registry.get(pluginId);
    if (!entry) return false;
    entry.enabled = enabled;
    this._info(`setEnabled: '${pluginId}' → ${enabled}`);
    return true;
  }

  // ── Registro de hooks ────────────────────────────────────────────────────

  /**
   * Registra una función handler para un hook específico.
   * Verifica que el plugin tenga la capacidad requerida.
   *
   * @param {string}   pluginId
   * @param {string}   hookName  - uno de preToolUse|postToolUse|onRouteStart|onRouteEnd|onError
   * @param {Function} fn
   * @returns {{ ok: boolean, error: string|null }}
   */
  registerHook(pluginId, hookName, fn) {
    const entry = this._registry.get(pluginId);
    if (!entry) {
      return { ok: false, error: `plugin '${pluginId}' no registrado` };
    }

    if (!this._hooks.has(hookName)) {
      return { ok: false, error: `hook desconocido: '${hookName}'` };
    }

    // Verificar capacidad requerida
    const requiredCap = HOOK_CAPABILITY_MAP[hookName];
    if (requiredCap && !entry.manifest.capabilities.includes(requiredCap)) {
      return {
        ok:    false,
        error: `plugin '${pluginId}' no tiene capacidad '${requiredCap}' para hook '${hookName}'`,
      };
    }

    this._hooks.get(hookName).push({ pluginId, fn });
    this._info(`registerHook: '${pluginId}' → ${hookName}`);
    return { ok: true, error: null };
  }

  // ── Emisión de eventos ───────────────────────────────────────────────────

  /**
   * Emite un evento a todos los handlers registrados para ese hook.
   *
   * Para hooks mutantes (preToolUse, postToolUse), cada handler puede retornar
   * un objeto que se mezcla con el contexto para el siguiente handler.
   *
   * @param {string} hookName
   * @param {object} ctx      - Contexto del evento
   * @returns {Promise<object>} ctx (posiblemente mutado)
   */
  async emit(hookName, ctx = {}) {
    const handlers = this._hooks.get(hookName);
    if (!handlers || handlers.length === 0) return ctx;

    const isMutating = MUTATING_HOOKS.has(hookName);
    let current = ctx;

    for (const { pluginId, fn } of handlers) {
      const plugin = this._registry.get(pluginId);
      if (!plugin || !plugin.enabled) continue;

      try {
        const result = await fn(current);
        if (isMutating && result && typeof result === 'object') {
          current = { ...current, ...result };
        }
      } catch (err) {
        this._warn(`emit('${hookName}') en '${pluginId}': ${err.message}`);
        // Continuar con otros handlers aunque uno falle
      }
    }

    return current;
  }

  /**
   * Versión síncrona de emit para hooks que no requieren async.
   * No soporta hooks mutantes (solo observación).
   *
   * @param {string} hookName
   * @param {object} ctx
   */
  emitSync(hookName, ctx = {}) {
    const handlers = this._hooks.get(hookName);
    if (!handlers || handlers.length === 0) return;

    for (const { pluginId, fn } of handlers) {
      const plugin = this._registry.get(pluginId);
      if (!plugin || !plugin.enabled) continue;
      try { fn(ctx); }
      catch (err) { this._warn(`emitSync('${hookName}') en '${pluginId}': ${err.message}`); }
    }
  }

  // ── Diagnóstico ──────────────────────────────────────────────────────────

  /**
   * @returns {object} Estado completo del runtime
   */
  getStatus() {
    const plugins = [];
    for (const [id, { manifest, enabled }] of this._registry) {
      const hooks = [];
      for (const [hookName, list] of this._hooks) {
        if (list.some(h => h.pluginId === id)) hooks.push(hookName);
      }
      plugins.push({ id, version: manifest.version, enabled, capabilities: manifest.capabilities, hooks });
    }

    const hookCounts = {};
    for (const [name, list] of this._hooks) {
      hookCounts[name] = list.filter(h => {
        const p = this._registry.get(h.pluginId);
        return p && p.enabled;
      }).length;
    }

    return {
      totalPlugins:   this._registry.size,
      totalIntegrations: this._integrations.size,
      plugins,
      integrations: Array.from(this._integrations.values()).map((item) => ({
        id: item.id,
        manifestPath: item.manifestPath,
        tier: item.tier,
        version: item.version,
        pluginLoaded: item.pluginLoaded,
        capabilities: Object.fromEntries(Object.entries(item.capabilityIndex || {}).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.length : (value ? 1 : 0),
        ])),
      })),
      capabilityIndex: this.getCapabilityIndex(),
      hookCounts,
      recentLog:      this._log.slice(-30),
    };
  }

  summary() {
    const { totalPlugins, totalIntegrations, hookCounts } = this.getStatus();
    const lines = [
      `PluginRuntime:`,
      `  plugins cargados: ${totalPlugins}`,
      `  integrations:     ${totalIntegrations}`,
      `  hooks activos:    ${Object.entries(hookCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`,
    ];
    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Instancia singleton de módulo (lazy)
// ---------------------------------------------------------------------------
let _instance = null;
function getPluginRuntime() {
  if (!_instance) _instance = new PluginRuntime();
  return _instance;
}

module.exports = {
  PluginRuntime,
  validateManifest,
  validateIntegrationManifest,
  VALID_CAPABILITIES,
  INTEGRATION_MANIFEST_FILENAME,
  PLUGIN_RUNTIME_API_VERSION,
  getPluginRuntime,
};
