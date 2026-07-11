"use strict";
/**
 * context-integration.js
 * Bridge module wiring ContextHierarchy + LazyMemoryLoader into the router lifecycle.
 *
 * Exports exactly: { setupContextInRouter, recordStepWithCompression, finalizeContextSystem }
 * Already imported at line 4 of copilot_router.runtime.js — no router changes required.
 */

const fs   = require("fs");
const path = require("path");
const { ContextHierarchy }  = require("./context-hierarchy.js");
const { LazyMemoryLoader }  = require("./lazy-loader.js");
const tierConfig             = require("./memory-tiers.json");
const { MemoryOrchestrator } = require('./memory-orchestrator');

// ---------------------------------------------------------------------------
// Internal utilities — re-implemented because the router does NOT export them
// Signatures must match router exactly (lines 17 / 38 / 43).
// ---------------------------------------------------------------------------

function nowIso() {
  return new Date().toISOString();
}

function appendLine(filePath, line) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${line}\n`, "utf8");
  } catch (_) {
    // Non-fatal — events file write failure must not crash the run
  }
}

/**
 * @param {*}      value
 * @param {number} maxLength - default 12000, matches router signature
 */
function sanitizeText(value, maxLength = 12000) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...[truncated]` : text;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * setupContextInRouter — called once at the start of runCopilotRouter.
 *
 * @param {object} options - same options object passed to runCopilotRouter
 * @returns {object} contextSystem handle used by the other two exports
 */
function setupContextInRouter(options) {
  const workspacePath = path.resolve(
    (options && options.workspacePath) ? options.workspacePath : process.cwd()
  );

  const hierarchy = new ContextHierarchy(tierConfig);
  const loader    = new LazyMemoryLoader({ workspacePath, ...tierConfig });

  return {
    hierarchy,
    loader,
    workspacePath,
    runId:     `run-${Date.now()}`,
    startedAt: nowIso(),
  };
}

/**
 * recordStepWithCompression — drop-in replacement for the router's internal
 * recordStep(), adding hierarchical compression on top.
 *
 * @param {object} contextSystem - handle returned by setupContextInRouter
 * @param {object} run           - run object (mutated: run.steps.push)
 * @param {string} eventPath     - path to the .events.jsonl file
 * @param {object} step          - step descriptor (same shape as old recordStep)
 */
function recordStepWithCompression(contextSystem, run, eventPath, step) {
  // 1. Replicate original recordStep: push to run.steps
  run.steps.push(step);

  // 2. Replicate original recordStep: append to JSONL events file
  appendLine(eventPath, JSON.stringify({
    ts:                nowIso(),
    step_id:           step.step_id,
    action:            step.action,
    command:           step.command || "",
    result:            sanitizeText(step.result || ""),
    exit_code:         step.exit_code  ?? 0,
    retry_index:       step.retry_index ?? 0,
    evidence_ref:      "",
    redaction_applied: false,
  }));

  // 3. Push to hierarchy for compression
  if (!contextSystem || !contextSystem.hierarchy) return;

  contextSystem.hierarchy.pushHotMemory({
    type:    "tool-result",
    content: step.result || "",
    metadata: {
      step_id:    step.step_id,
      action:     step.action,
      exit_code:  step.exit_code  ?? 0,
      risk_level: step.risk_level,
      ts:         nowIso(),
    },
  });

  // 4. Auto-compact when hot tier is near saturation
  if (contextSystem.hierarchy.shouldCompact()) {
    contextSystem.hierarchy.performCompaction();
  }
}

/**
 * finalizeContextSystem — called in the router's finally block to persist
 * compressed memory to cold storage.
 *
 * @param {object} contextSystem  - handle returned by setupContextInRouter
 * @param {string} workspacePath  - workspace root (may differ from setup-time value)
 */
async function finalizeContextSystem(contextSystem, workspacePath) {
  if (!contextSystem) return;
  try {
    const exported = contextSystem.hierarchy.export();
    await contextSystem.loader.archiveColdMemory(exported);
    const _orch = new MemoryOrchestrator({
      workspacePath: (contextSystem && contextSystem.workspacePath) || workspacePath || process.cwd()
    });
    _orch.run().catch(() => {}); // non-blocking, non-fatal
  } catch (_) {
    // Non-fatal — finalization failure must not crash the router's finally block
  }
}

// ---------------------------------------------------------------------------

module.exports = {
  setupContextInRouter,
  recordStepWithCompression,
  finalizeContextSystem,
};
