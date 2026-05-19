'use strict';

const fs = require('fs');
const path = require('path');

const DIMENSIONS = Object.freeze([
  {
    id: 'sandboxing',
    label: 'Sandboxing por tarea',
    targetScore: 90,
    weight: 0.25,
    readyEvidence: [
      'src-js/core/task-sandbox.js',
      'tests/task_sandbox_smoke.js',
    ],
    partialEvidence: [
      'src-js/core/policy-engine.js',
      'src-js/core/native-router-core.js',
      'tests/policy_engine_profiles_smoke.js',
    ],
    nextStep: 'Implementar sandbox por tarea con allowlist de rutas/comandos, bloqueo de red por defecto y permisos por MCP server.',
  },
  {
    id: 'parallelSubagents',
    label: 'Paralelismo real de subagentes',
    targetScore: 90,
    weight: 0.25,
    readyEvidence: [
      'src-js/core/subagent-orchestrator.js',
      'tests/subagent_parallel_orchestrator_smoke.js',
    ],
    partialEvidence: [
      'tests/session_engine_subagent_tools_smoke.js',
      '.github/agents/free-jt7.agent.md',
      'src-js/core/session-engine.js',
    ],
    nextStep: 'Agregar orquestador de subagentes paralelos con contexto/modelo/worktree aislado y estado visible en el panel.',
  },
  {
    id: 'semanticMemory',
    label: 'Memoria semantica persistente',
    targetScore: 90,
    weight: 0.25,
    readyEvidence: [
      'src-js/memory/semantic-memory-store.js',
      'tests/semantic_memory_store_smoke.js',
    ],
    partialEvidence: [
      'src-js/core/session-engine.js',
      'tools/agent_autolearn/evaluator.py',
      'copilot-agent/RESUME.md',
    ],
    nextStep: 'Crear memoria semantica local con indexado, consulta por relevancia, redaccion de secretos y politica de retencion.',
  },
  {
    id: 'reviewRollbackUx',
    label: 'UX de revision, rollback y evidencias',
    targetScore: 90,
    weight: 0.25,
    readyEvidence: [
      'src-js/core/review-rollback.js',
      'tests/review_rollback_smoke.js',
    ],
    partialEvidence: [
      'src-js/core/control-panel.js',
      'tests/session_engine_verification_smoke.js',
      'tests/control_panel_ui_smoke.js',
    ],
    nextStep: 'Agregar plan editable, diff/preview, rollback por subtarea y timeline de evidencias en el panel.',
  },
]);

function exists(rootDir, relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function scoreDimension(rootDir, dimension) {
  const readyPresent = dimension.readyEvidence.filter((item) => exists(rootDir, item));
  const partialPresent = dimension.partialEvidence.filter((item) => exists(rootDir, item));
  const readyRatio = dimension.readyEvidence.length ? readyPresent.length / dimension.readyEvidence.length : 0;
  const partialRatio = dimension.partialEvidence.length ? partialPresent.length / dimension.partialEvidence.length : 0;
  const score = Math.round((readyRatio * 60) + (partialRatio * 30));
  const closed = score >= dimension.targetScore;
  const status = closed ? 'closed' : (score >= 45 ? 'partial' : 'open');
  return {
    id: dimension.id,
    label: dimension.label,
    score,
    targetScore: dimension.targetScore,
    weight: dimension.weight,
    status,
    closed,
    readyEvidence: dimension.readyEvidence,
    readyPresent,
    partialEvidence: dimension.partialEvidence,
    partialPresent,
    missingReadyEvidence: dimension.readyEvidence.filter((item) => !readyPresent.includes(item)),
    missingPartialEvidence: dimension.partialEvidence.filter((item) => !partialPresent.includes(item)),
    nextStep: dimension.nextStep,
  };
}

function assessAutonomyMaturity(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..', '..'));
  const dimensions = DIMENSIONS.map((dimension) => scoreDimension(rootDir, dimension));
  const weightedScore = Math.round(dimensions.reduce((total, item) => total + (item.score * item.weight), 0));
  const openGaps = dimensions.filter((item) => !item.closed);
  return {
    rootDir,
    generatedAt: new Date().toISOString(),
    score: weightedScore,
    targetScore: 90,
    status: openGaps.length === 0 ? 'closed' : 'partial',
    closed: openGaps.length === 0,
    dimensions,
    openGaps: openGaps.map((item) => ({
      id: item.id,
      label: item.label,
      score: item.score,
      targetScore: item.targetScore,
      missingReadyEvidence: item.missingReadyEvidence,
      nextStep: item.nextStep,
    })),
    summary: openGaps.length === 0
      ? 'Las brechas principales de autonomia estan cerradas con evidencia local.'
      : `Brecha aun abierta: ${openGaps.length} dimension(es) no alcanzan evidencia de cierre; la cuantificacion no equivale a cierre.`,
  };
}

module.exports = {
  DIMENSIONS,
  assessAutonomyMaturity,
};
