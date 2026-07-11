/**
 * memory-orchestrator.js — Free JT7 Runtime Memory Orchestrator (P1, Fase 1)
 *
 * Inspirado en Claurst `auto_dream.rs` + `session_memory.rs`.
 * Resuelve Brecha 2: memoria como módulo runtime con auto-consolidación,
 * en lugar de convención documental en docs/MEMORY.md.
 *
 * Responsabilidades separadas:
 *   1. Consolidación de memoria (MEMORY.md, TASKS.md)
 *   2. Extracción de ejemplos desde runs/ al dataset
 *   3. Notificación al scheduler para entrenamiento por lotes
 *
 * @module memory-orchestrator
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { resolveAgentStateDir } = require('../core/agent-state-paths');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Configuración — rutas relativas a la raíz del workspace
// ---------------------------------------------------------------------------
const DEFAULT_ROOT_DIR = path.resolve(__dirname, '..', '..');
const DEFAULT_AGENT_STATE_DIR = resolveAgentStateDir(DEFAULT_ROOT_DIR);

const DEFAULTS = {
  rootDir:        DEFAULT_ROOT_DIR,
  memoryFile:     'docs/MEMORY.md',
  tasksFile:      'docs/TASKS.md',
  runsDir:        `${DEFAULT_AGENT_STATE_DIR}/runs`,
  datasetFile:    '.agent-learning/dataset.jsonl',
  stateFile:      `${DEFAULT_AGENT_STATE_DIR}/orchestrator-state.json`,
  // Umbrales de auto-consolidación
  maxRunsSinceConsolidate:  5,       // nuevos runs desde la última consolidación
  maxHoursSinceConsolidate: 12,      // horas máximas entre consolidaciones
  maxExamplesPerRun:        10,      // ejemplos extraídos por run-file
};

// ---------------------------------------------------------------------------
// Helpers de I/O (seguros, sin lanzar)
// ---------------------------------------------------------------------------
function readText(filepath) {
  try { return fs.readFileSync(filepath, 'utf8'); }
  catch { return null; }
}

function writeText(filepath, content) {
  try {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, content, 'utf8');
    return true;
  } catch { return false; }
}

function readJson(filepath) {
  try { return JSON.parse(fs.readFileSync(filepath, 'utf8')); }
  catch { return null; }
}

function writeJson(filepath, data) {
  try {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch { return false; }
}

function nowIso() { return new Date().toISOString(); }

// ---------------------------------------------------------------------------
// Clase MemoryOrchestrator
// ---------------------------------------------------------------------------
class MemoryOrchestrator {
  /**
   * @param {object} [opts] - Sobreescribir cualquier valor de DEFAULTS
   */
  constructor(opts = {}) {
    this.cfg = { ...DEFAULTS, ...opts };
    this._log = [];        // bitácora de sesión
    this._state = null;    // cargado en _loadState()
  }

  // ── Estado persistente ───────────────────────────────────────────────────

  _statePath() {
    return path.join(this.cfg.rootDir, this.cfg.stateFile);
  }

  _loadState() {
    const def = {
      lastConsolidateAt: null,
      runCountSinceLast: 0,
      totalConsolidations: 0,
      totalExamplesExtracted: 0,
    };
    this._state = readJson(this._statePath()) || def;
    return this._state;
  }

  _saveState() {
    return writeJson(this._statePath(), this._state);
  }

  // ── Logging interno ──────────────────────────────────────────────────────

  _info(msg) {
    const entry = { ts: nowIso(), level: 'info', msg };
    this._log.push(entry);
    if (process.env.NODE_ENV !== 'test') {
      process.stdout.write(`[memory-orchestrator] ${entry.ts} ${msg}\n`);
    }
  }

  _warn(msg) {
    const entry = { ts: nowIso(), level: 'warn', msg };
    this._log.push(entry);
    if (process.env.NODE_ENV !== 'test') {
      process.stderr.write(`[memory-orchestrator] WARN ${entry.ts} ${msg}\n`);
    }
  }

  // ── Extracción de runs → dataset ─────────────────────────────────────────

  /**
   * Escanea copilot-agent/runs/ y extrae ejemplos válidos al dataset.jsonl.
   * Solo procesa archivos .json (no .events.jsonl) que NO hayan sido procesados.
   *
   * @returns {{ extracted: number, skipped: number, files: string[] }}
   */
  extractExamples() {
    this._loadState();
    const runsDir = path.join(this.cfg.rootDir, this.cfg.runsDir);
    if (!fs.existsSync(runsDir)) {
      this._warn(`runsDir no encontrado: ${runsDir}`);
      return { extracted: 0, skipped: 0, files: [] };
    }

    const scriptPath = path.join(this.cfg.rootDir, 'tools', 'agent_autolearn', 'collect_from_runs.py');
    if (!fs.existsSync(scriptPath)) {
      this._warn(`collect_from_runs.py no encontrado: ${scriptPath}`);
      return { extracted: 0, skipped: 0, files: [] };
    }

    const args = [
      scriptPath,
      '--runs-dir', runsDir,
      '--dataset', path.join(this.cfg.rootDir, this.cfg.datasetFile),
      '--state', path.join(this.cfg.rootDir, '.agent-learning', 'logs', 'processed_runs.json'),
      '--evaluations', path.join(this.cfg.rootDir, '.agent-learning', 'logs', 'evaluations.jsonl'),
      '--regression-packs', path.join(this.cfg.rootDir, '.agent-learning', 'regression-packs'),
      '--routing-hints', path.join(this.cfg.rootDir, '.agent-learning', 'routing_hints.json'),
      '--json',
    ];
    const pythonCandidates = process.platform === 'win32'
      ? [['py', ['-3', ...args]], ['python', args]]
      : [['python3', args], ['python', args]];

    let result = null;
    let lastError = '';
    for (const [candidate, candidateArgs] of pythonCandidates) {
      const proc = spawnSync(candidate, candidateArgs, {
        cwd: this.cfg.rootDir,
        encoding: 'utf8',
        env: process.env,
      });
      if (proc.error) {
        lastError = proc.error.message;
        continue;
      }
      if (proc.status !== 0) {
        lastError = (proc.stderr || proc.stdout || `exit=${proc.status}`).trim();
        continue;
      }
      try {
        result = JSON.parse((proc.stdout || '').trim());
        break;
      } catch (error) {
        lastError = error.message;
      }
    }

    if (!result) {
      this._warn(`extractExamples: no se pudo ejecutar pipeline evaluado (${lastError || 'sin detalle'})`);
      return { extracted: 0, skipped: 0, files: [] };
    }

    this._state.totalExamplesExtracted += Number(result.accepted || 0);
    this._state.runCountSinceLast += Number(result.processed || 0);
    this._saveState();

    this._info(`extractExamples: ${result.accepted || 0} aceptados de ${result.evaluated || 0} runs evaluados`);
    return {
      extracted: Number(result.accepted || 0),
      skipped: Math.max(0, Number(result.evaluated || 0) - Number(result.accepted || 0)),
      files: [`${result.processed || 0} runs via evaluator`],
      evaluated: Number(result.evaluated || 0),
      regressionPacks: Number(result.packs || 0),
    };
  }

  // ── Consolidación de memoria ─────────────────────────────────────────────

  /**
   * Lee MEMORY.md y TASKS.md, genera un snapshot consolidado y lo añade
   * al dataset como ejemplos de tipo "memory-snapshot".
   * No modifica los archivos fuente — solo consolida hacia el dataset.
   *
   * @returns {{ ok: boolean, snapshot: object|null }}
   */
  consolidate() {
    this._loadState();
    const memPath   = path.join(this.cfg.rootDir, this.cfg.memoryFile);
    const tasksPath = path.join(this.cfg.rootDir, this.cfg.tasksFile);
    const dsPath    = path.join(this.cfg.rootDir, this.cfg.datasetFile);

    const memContent   = readText(memPath);
    const tasksContent = readText(tasksPath);

    if (!memContent && !tasksContent) {
      this._warn('consolidate: MEMORY.md y TASKS.md no encontrados o vacíos');
      return { ok: false, snapshot: null };
    }

    const snapshot = {
      type:    'memory-snapshot',
      ts:      nowIso(),
      memory:  memContent  ? memContent.slice(0, 8000)  : '',
      tasks:   tasksContent ? tasksContent.slice(0, 4000) : '',
      stats: {
        memoryChars:  memContent  ? memContent.length  : 0,
        tasksChars:   tasksContent ? tasksContent.length : 0,
      },
    };

    const line = JSON.stringify(snapshot) + '\n';
    try {
      fs.mkdirSync(path.dirname(dsPath), { recursive: true });
      fs.appendFileSync(dsPath, line, 'utf8');
    } catch (err) {
      this._warn(`consolidate: error escribiendo snapshot: ${err.message}`);
      return { ok: false, snapshot: null };
    }

    // Actualizar estado
    this._state.lastConsolidateAt   = nowIso();
    this._state.runCountSinceLast   = 0;
    this._state.totalConsolidations++;
    this._saveState();

    this._info(`consolidate: snapshot guardado (memory=${snapshot.stats.memoryChars}c, tasks=${snapshot.stats.tasksChars}c)`);
    return { ok: true, snapshot };
  }

  // ── Evaluación de umbrales ───────────────────────────────────────────────

  /**
   * Determina si se debe disparar una auto-consolidación según los umbrales
   * configurados de tiempo transcurrido y runs acumulados.
   *
   * @returns {{ shouldRun: boolean, reason: string[] }}
   */
  checkThresholds() {
    this._loadState();
    const reasons = [];

    // 1. Runs acumulados
    if (this._state.runCountSinceLast >= this.cfg.maxRunsSinceConsolidate) {
      reasons.push(`runs acumulados (${this._state.runCountSinceLast} >= ${this.cfg.maxRunsSinceConsolidate})`);
    }

    // 2. Tiempo transcurrido
    if (this._state.lastConsolidateAt) {
      const elapsedHours = (Date.now() - new Date(this._state.lastConsolidateAt).getTime()) / 3_600_000;
      if (elapsedHours >= this.cfg.maxHoursSinceConsolidate) {
        reasons.push(`tiempo transcurrido (${elapsedHours.toFixed(1)}h >= ${this.cfg.maxHoursSinceConsolidate}h)`);
      }
    } else {
      // Primera vez — siempre consolidar
      reasons.push('primera consolidación');
    }

    return { shouldRun: reasons.length > 0, reason: reasons };
  }

  // ── Auto-consolidación ───────────────────────────────────────────────────

  /**
   * Punto de entrada principal. Extrae ejemplos de runs y, si los umbrales
   * lo indican, ejecuta la consolidación de memoria.
   *
   * @returns {object} Resumen de la operación
   */
  run() {
    this._info('run: iniciando ciclo de orquestación');

    const extractResult = this.extractExamples();

    const { shouldRun, reason } = this.checkThresholds();
    let consolidateResult = null;

    if (shouldRun) {
      this._info(`run: consolidación disparada por: ${reason.join(', ')}`);
      consolidateResult = this.consolidate();
    } else {
      this._info('run: umbrales no alcanzados, consolidación omitida');
    }

    const summary = {
      ts:          nowIso(),
      extract:     extractResult,
      consolidate: consolidateResult,
      state:       { ...this._state },
    };

    this._info(`run: ciclo completo — ${JSON.stringify(summary.extract)}`);
    return summary;
  }

  // ── Programación automática ──────────────────────────────────────────────

  /**
   * Registra el orquestador para ejecutarse automáticamente cada `intervalMs`.
   * Retorna una función de cancelación (clearInterval-style).
   *
   * @param {number} [intervalMs=3600000] - Intervalo en ms (default 1 hora)
   * @returns {function} stopFn — llama para detener el ciclo
   */
  scheduleAutoConsolidation(intervalMs = 3_600_000) {
    this._info(`scheduleAutoConsolidation: cada ${intervalMs / 60_000} min`);
    const timer = setInterval(() => {
      try { this.run(); }
      catch (err) { this._warn(`ciclo automático falló: ${err.message}`); }
    }, intervalMs);

    // No bloquear el proceso Node.js
    if (timer.unref) timer.unref();

    return () => {
      clearInterval(timer);
      this._info('scheduleAutoConsolidation: detenido');
    };
  }

  // ── Diagnóstico ──────────────────────────────────────────────────────────

  /**
   * Retorna estado completo + bitácora de sesión.
   * @returns {object}
   */
  getStatus() {
    this._loadState();
    return {
      state:  this._state,
      log:    this._log.slice(-50),  // últimas 50 entradas
      cfg:    this.cfg,
    };
  }

  /**
   * Resumen de línea para diagnóstico rápido.
   * @returns {string}
   */
  summary() {
    this._loadState();
    const { lastConsolidateAt, runCountSinceLast, totalConsolidations, totalExamplesExtracted } = this._state;
    const last = lastConsolidateAt
      ? `${Math.round((Date.now() - new Date(lastConsolidateAt).getTime()) / 60_000)} min atrás`
      : 'nunca';
    return [
      `MemoryOrchestrator:`,
      `  última consolidación: ${last}`,
      `  runs desde última:    ${runCountSinceLast}/${this.cfg.maxRunsSinceConsolidate}`,
      `  consolidaciones:      ${totalConsolidations}`,
      `  ejemplos extraídos:   ${totalExamplesExtracted}`,
    ].join('\n');
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = { MemoryOrchestrator, DEFAULTS };
