/**
 * agent-scheduler.js — Free JT7 Agent Scheduler (P3, Fase 1)
 *
 * Inspirado en `cron_scheduler.rs` de Claurst.
 * Resuelve Brecha 3: no hay scheduler integrado en el runtime loop.
 *
 * Características:
 *   - Jobs registrables con intervalos en milisegundos (sin dependencia de cron OS)
 *   - Estado persistido en copilot-agent/scheduler-state.json
 *   - Integración automática con MemoryOrchestrator
 *   - Cross-platform (solo setInterval, sin cron)
 *   - unref() en todos los timers para no bloquear el proceso
 *
 * Uso básico:
 *   const { AgentScheduler } = require('./agent-scheduler');
 *   const scheduler = new AgentScheduler();
 *   scheduler.addJob('mi-job', 60_000, async () => { ... });
 *   scheduler.start();
 *
 * @module agent-scheduler
 */

'use strict';

const fs            = require('fs');
const path          = require('path');
const { spawn }     = require('child_process');
const http          = require('http');
const https         = require('https');

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
const DEFAULTS = {
  rootDir:     path.resolve(__dirname, '..', '..'),
  stateFile:   'copilot-agent/scheduler-state.json',
  // Intervalos predeterminados (ms)
  intervals: {
    memoriaConsolidar:   60 * 60 * 1000,   // 1 h
    datasetExtraer:      30 * 60 * 1000,   // 30 min
    doctorNocturno:    8 * 60 * 60 * 1000, // 8 h
    gatewayStatus:      15 * 60 * 1000,    // 15 min
    revisarPendientes:  20 * 60 * 1000,    // 20 min
    nightlyTrain:      24 * 60 * 60 * 1000, // 24 h
  },
};

// ---------------------------------------------------------------------------
// Clase AgentScheduler
// ---------------------------------------------------------------------------
class AgentScheduler {
  /**
   * @param {object} opts — overrides sobre DEFAULTS
   */
  constructor(opts = {}) {
    this.cfg = {
      ...DEFAULTS,
      ...opts,
      intervals: { ...DEFAULTS.intervals, ...(opts.intervals || {}) },
    };

    /** @type {Map<string, {intervalMs: number, fn: Function, timer: NodeJS.Timeout|null, lastRun: string|null, runCount: number, errors: number}>} */
    this._jobs = new Map();

    this._running  = false;
    this._log      = [];
    this._stateAbs = path.join(this.cfg.rootDir, this.cfg.stateFile);

    this._loadState();
  }

  // ── Persistencia ────────────────────────────────────────────────────────

  _loadState() {
    try {
      if (fs.existsSync(this._stateAbs)) {
        const raw = fs.readFileSync(this._stateAbs, 'utf8');
        const saved = JSON.parse(raw);
        this._savedState = saved; // para restaurar runCount/lastRun por job
      }
    } catch { /* primer arranque */ }
    this._savedState = this._savedState || {};
  }

  _saveState() {
    const state = {};
    for (const [name, job] of this._jobs) {
      state[name] = { lastRun: job.lastRun, runCount: job.runCount, errors: job.errors };
    }
    state._savedAt = new Date().toISOString();
    try {
      const dir = path.dirname(this._stateAbs);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._stateAbs, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      this._warn(`_saveState: ${err.message}`);
    }
  }

  // ── Logging ──────────────────────────────────────────────────────────────

  _info(msg) {
    const entry = { ts: new Date().toISOString(), level: 'info', msg };
    this._log.push(entry);
    if (process.env.NODE_ENV !== 'test') {
      process.stdout.write(`[agent-scheduler] ${entry.ts} ${msg}\n`);
    }
  }

  _warn(msg) {
    const entry = { ts: new Date().toISOString(), level: 'warn', msg };
    this._log.push(entry);
    if (process.env.NODE_ENV !== 'test') {
      process.stderr.write(`[agent-scheduler] WARN ${entry.ts} ${msg}\n`);
    }
  }

  // ── Gestión de jobs ──────────────────────────────────────────────────────

  /**
   * Agrega un job al scheduler.
   * Si el scheduler ya está en marcha, el job se inicia de inmediato.
   *
   * @param {string}   name
   * @param {number}   intervalMs
   * @param {Function} fn  - async () => void
   * @returns {boolean} true si se agregó, false si ya existía
   */
  addJob(name, intervalMs, fn) {
    if (this._jobs.has(name)) {
      this._warn(`addJob: '${name}' ya existe — se omite`);
      return false;
    }

    // Restaurar estadísticas persistidas si existen
    const saved = (this._savedState || {})[name] || {};

    this._jobs.set(name, {
      intervalMs,
      fn,
      timer:    null,
      lastRun:  saved.lastRun  || null,
      runCount: saved.runCount || 0,
      errors:   saved.errors   || 0,
    });
    this._info(`addJob: '${name}' cada ${Math.round(intervalMs / 1000)}s`);

    if (this._running) this._startJobTimer(name);
    return true;
  }

  /**
   * Elimina un job y detiene su timer.
   * @param {string} name
   */
  removeJob(name) {
    const job = this._jobs.get(name);
    if (!job) return false;
    if (job.timer) clearInterval(job.timer);
    this._jobs.delete(name);
    this._info(`removeJob: '${name}' eliminado`);
    return true;
  }

  _startJobTimer(name) {
    const job = this._jobs.get(name);
    if (!job || job.timer) return;

    job.timer = setInterval(async () => {
      await this._runJob(name);
    }, job.intervalMs);

    // No bloquear el proceso si solo quedan timers
    if (job.timer.unref) job.timer.unref();
  }

  async _runJob(name) {
    const job = this._jobs.get(name);
    if (!job) return;
    this._info(`runJob: '${name}' iniciando`);
    try {
      await job.fn();
      job.lastRun = new Date().toISOString();
      job.runCount++;
      this._info(`runJob: '${name}' completado (#${job.runCount})`);
    } catch (err) {
      job.errors++;
      this._warn(`runJob: '${name}' error — ${err.message}`);
    }
    this._saveState();
  }

  // ── Ciclo de vida ────────────────────────────────────────────────────────

  /**
   * Inicia todos los jobs registrados.
   */
  start() {
    if (this._running) {
      this._warn('start(): ya en ejecución');
      return;
    }
    this._running = true;
    for (const name of this._jobs.keys()) {
      this._startJobTimer(name);
    }
    this._info(`start(): ${this._jobs.size} jobs activos`);
  }

  /**
   * Detiene todos los timers (sin eliminar los jobs).
   */
  stop() {
    for (const [, job] of this._jobs) {
      if (job.timer) { clearInterval(job.timer); job.timer = null; }
    }
    this._running = false;
    this._saveState();
    this._info('stop(): scheduler detenido');
  }

  /**
   * Ejecuta un job de inmediato (fuera de su ciclo regular).
   * @param {string} name
   */
  async runNow(name) {
    if (!this._jobs.has(name)) {
      this._warn(`runNow: '${name}' no existe`);
      return;
    }
    await this._runJob(name);
  }

  // ── Diagnóstico ──────────────────────────────────────────────────────────

  getStatus() {
    const jobs = [];
    for (const [name, job] of this._jobs) {
      jobs.push({
        name,
        intervalMs: job.intervalMs,
        lastRun:    job.lastRun,
        runCount:   job.runCount,
        errors:     job.errors,
        active:     !!job.timer,
      });
    }
    return {
      running:    this._running,
      totalJobs:  this._jobs.size,
      jobs,
      recentLog:  this._log.slice(-30),
    };
  }

  summary() {
    const s = this.getStatus();
    const active = s.jobs.filter(j => j.active).length;
    return [
      `AgentScheduler:`,
      `  estado:    ${s.running ? 'corriendo' : 'detenido'}`,
      `  jobs:      ${s.totalJobs} (${active} activos)`,
      s.jobs.map(j =>
        `  • ${j.name.padEnd(22)} cada ${Math.round(j.intervalMs / 60000)}min  ` +
        `runs=${j.runCount}  err=${j.errors}  último=${j.lastRun || 'nunca'}`
      ).join('\n'),
    ].join('\n');
  }
}

// ---------------------------------------------------------------------------
// Factory: scheduler con jobs predeterminados enlazados a MemoryOrchestrator
// ---------------------------------------------------------------------------

/**
 * Crea un AgentScheduler con jobs predefinidos.
 * Acepta un `MemoryOrchestrator` opcional para wiring automático.
 *
 * @param {object} [opts]
 * @param {object} [orchestrator] - instancia de MemoryOrchestrator (opcional)
 * @returns {AgentScheduler}
 */
function createDefaultScheduler(opts = {}, orchestrator = null) {
  const scheduler = new AgentScheduler(opts);

  // Job: consolidar memoria (enlaza al orquestador si se provee)
  scheduler.addJob(
    'memoriaConsolidar',
    (opts.intervals || DEFAULTS.intervals).memoriaConsolidar,
    async () => {
      if (orchestrator && typeof orchestrator.run === 'function') {
        await orchestrator.run();
      }
    }
  );

  // Job: extraer dataset (enlaza al orquestador si se provee)
  scheduler.addJob(
    'datasetExtraer',
    (opts.intervals || DEFAULTS.intervals).datasetExtraer,
    async () => {
      if (orchestrator && typeof orchestrator.extractExamples === 'function') {
        await orchestrator.extractExamples();
      }
    }
  );

  // Job: doctor nocturno — ejecuta skills_manager.py doctor --strict
  scheduler.addJob(
    'doctorNocturno',
    (opts.intervals || DEFAULTS.intervals).doctorNocturno,
    async () => {
      const rootDir   = scheduler.cfg.rootDir;
      const statePath = path.join(rootDir, 'copilot-agent', 'scheduler-state.json');
      const python    = process.platform === 'win32' ? 'python' : 'python3';
      const script    = path.join(rootDir, 'skills_manager.py');

      await new Promise((resolve) => {
        const proc = spawn(python, [script, 'doctor', '--strict'], {
          cwd: rootDir,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let out = '';
        let err = '';
        proc.stdout.on('data', d => { out += d.toString(); });
        proc.stderr.on('data', d => { err += d.toString(); });
        proc.on('close', (code) => {
          const result = {
            job: 'doctorNocturno',
            ts: new Date().toISOString(),
            exitCode: code,
            status: code === 0 ? 'OK' : 'FAIL',
            summary: out.trim().split('\n').slice(-5).join(' | '),
          };
          // Persistir resultado en scheduler-state
          try {
            const existing = fs.existsSync(statePath)
              ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
              : {};
            existing.doctorNocturno = result;
            fs.mkdirSync(path.dirname(statePath), { recursive: true });
            fs.writeFileSync(statePath, JSON.stringify(existing, null, 2), 'utf8');
          } catch (_) {}
          if (code !== 0) {
            scheduler._warn(`doctorNocturno: exitCode=${code} | ${err.trim().slice(0, 120)}`);
          } else {
            scheduler._info(`doctorNocturno: ${result.status} | ${result.summary.slice(0, 100)}`);
          }
          resolve();
        });
      });
    }
  );

  // Job: gateway status — ping HTTP al servidor MCP local
  scheduler.addJob(
    'gatewayStatus',
    (opts.intervals || DEFAULTS.intervals).gatewayStatus,
    async () => {
      const rootDir   = scheduler.cfg.rootDir;
      const statePath = path.join(rootDir, 'copilot-agent', 'scheduler-state.json');

      // Leer puerto desde .vscode/mcp.json si existe, o usar default 3000
      let port = 3000;
      let healthPath = '/health';
      const mcpJsonPath = path.join(rootDir, '.vscode', 'mcp.json');
      if (fs.existsSync(mcpJsonPath)) {
        try {
          const mcpCfg = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
          const servers = mcpCfg.servers || mcpCfg.inputs || {};
          const firstServer = Object.values(servers)[0] || {};
          if (firstServer.port) port = firstServer.port;
        } catch (_) {}
      }
      // Leer también desde .openclaw/config.json
      const oclawCfg = path.join(rootDir, '.openclaw', 'config.json');
      if (fs.existsSync(oclawCfg)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(oclawCfg, 'utf8'));
          if (cfg.mcp && cfg.mcp.default_port) port = cfg.mcp.default_port;
          if (cfg.mcp && cfg.mcp.health_path) healthPath = cfg.mcp.health_path;
        } catch (_) {}
      }

      const consecutiveFailsKey = '_gatewayFails';
      let consecutiveFails = 0;
      const statePath2 = statePath;
      if (fs.existsSync(statePath2)) {
        try {
          const st = JSON.parse(fs.readFileSync(statePath2, 'utf8'));
          consecutiveFails = st[consecutiveFailsKey] || 0;
        } catch (_) {}
      }

      const result = await new Promise((resolve) => {
        const t0 = Date.now();
        const proto = port === 443 ? https : http;
        const req = proto.get(`http://127.0.0.1:${port}${healthPath}`, { timeout: 3000 }, (res) => {
          const latencyMs = Date.now() - t0;
          resolve({ ok: true, statusCode: res.statusCode, latencyMs });
        });
        req.on('error', () => resolve({ ok: false }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, reason: 'timeout' }); });
      });

      consecutiveFails = result.ok ? 0 : consecutiveFails + 1;

      // Persistir
      try {
        const existing = fs.existsSync(statePath)
          ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
          : {};
        existing.gatewayStatus = { ...result, ts: new Date().toISOString(), port };
        existing[consecutiveFailsKey] = consecutiveFails;
        fs.mkdirSync(path.dirname(statePath), { recursive: true });
        fs.writeFileSync(statePath, JSON.stringify(existing, null, 2), 'utf8');
      } catch (_) {}

      if (!result.ok) {
        scheduler._warn(`gatewayStatus: MCP no responde en :${port} (fallos consecutivos: ${consecutiveFails})`);
        if (consecutiveFails >= 3) {
          // Escribir alerta en audit-log
          const auditPath = path.join(rootDir, 'copilot-agent', 'audit-log.jsonl');
          try {
            const entry = JSON.stringify({
              ts: new Date().toISOString(),
              level: 'ALERT',
              job: 'gatewayStatus',
              msg: `MCP gateway no responde — ${consecutiveFails} fallos consecutivos`,
              port,
            });
            fs.appendFileSync(auditPath, entry + '\n', 'utf8');
          } catch (_) {}
        }
      } else {
        scheduler._info(`gatewayStatus: OK :${port} — ${result.latencyMs}ms (HTTP ${result.statusCode})`);
      }
    }
  );

  // Job: revisar pendientes — lee tasks.yaml y loguea resumen
  scheduler.addJob(
    'revisarPendientes',
    (opts.intervals || DEFAULTS.intervals).revisarPendientes,
    async () => {
      const rootDir     = scheduler.cfg.rootDir;
      const tasksPath   = path.join(rootDir, 'copilot-agent', 'tasks.yaml');
      const statePath   = path.join(rootDir, 'copilot-agent', 'scheduler-state.json');

      if (!fs.existsSync(tasksPath)) {
        scheduler._info('revisarPendientes: tasks.yaml no encontrado — nada que revisar');
        return;
      }

      const raw = fs.readFileSync(tasksPath, 'utf8');

      // Parseo ligero sin dependencia yaml: buscar líneas con status
      const pending    = (raw.match(/status:\s*pending/gi)    || []).length;
      const inProgress = (raw.match(/status:\s*in.?progress/gi) || []).length;
      const done       = (raw.match(/status:\s*done/gi)       || []).length;
      const failed     = (raw.match(/status:\s*fail/gi)       || []).length;

      const summary = `pending=${pending} in_progress=${inProgress} done=${done} failed=${failed}`;
      scheduler._info(`revisarPendientes: ${summary}`);

      // Persistir resumen
      try {
        const existing = fs.existsSync(statePath)
          ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
          : {};
        existing.revisarPendientes = {
          ts: new Date().toISOString(),
          pending,
          inProgress,
          done,
          failed,
        };
        fs.mkdirSync(path.dirname(statePath), { recursive: true });
        fs.writeFileSync(statePath, JSON.stringify(existing, null, 2), 'utf8');
      } catch (_) {}

      if (pending + inProgress > 0) {
        scheduler._warn(`revisarPendientes: hay ${pending + inProgress} tareas activas — revisa copilot-agent/tasks.yaml`);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // nightlyTrain — entrenamiento LoRA nocturno (cada 24 h)
  // ---------------------------------------------------------------------------
  scheduler.addJob(
    'nightlyTrain',
    scheduler.cfg.intervals.nightlyTrain ?? DEFAULTS.intervals.nightlyTrain,
    async () => {
      const logDir  = path.join(scheduler.cfg.rootDir, '.agent-learning', 'logs');
      const logFile = path.join(logDir, 'nightly_train.log');
      const cfgFile = path.join(scheduler.cfg.rootDir, 'tools', 'agent_autolearn', 'config.json');
      fs.mkdirSync(logDir, { recursive: true });
      scheduler._info('nightlyTrain: iniciando entrenamiento LoRA...');
      await new Promise((resolve) => {
        const proc = spawn(
          'python3',
          ['tools/agent_autolearn/auto_trainer.py', '--config', cfgFile],
          { cwd: scheduler.cfg.rootDir, stdio: ['ignore', 'pipe', 'pipe'] }
        );
        const log = fs.createWriteStream(logFile, { flags: 'a' });
        log.write(`\n--- nightlyTrain ${new Date().toISOString()} ---\n`);
        proc.stdout.pipe(log);
        proc.stderr.pipe(log);
        proc.on('close', (code) => {
          if (code !== 0) {
            scheduler._warn(`nightlyTrain: proceso terminó con código ${code} — revisa ${logFile}`);
          } else {
            scheduler._info('nightlyTrain: entrenamiento completado OK');
          }
          log.end();
          try {
            const statePath = path.join(scheduler.cfg.rootDir, scheduler.cfg.stateFile);
            const existing  = fs.existsSync(statePath)
              ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
              : {};
            existing.nightlyTrain = { ts: new Date().toISOString(), exitCode: code };
            fs.mkdirSync(path.dirname(statePath), { recursive: true });
            fs.writeFileSync(statePath, JSON.stringify(existing, null, 2), 'utf8');
          } catch (_) {}
          resolve();
        });
      });
    }
  );

  return scheduler;
}

module.exports = { AgentScheduler, DEFAULTS, createDefaultScheduler };
