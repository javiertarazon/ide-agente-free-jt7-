const assert = require("assert");

const {
  shouldRunReviewStage,
  normalizeReviewResult,
  finalizeRouterOutcome,
  shouldAttemptAutoFix,
  createSessionHooks,
  createNativeToolPolicy,
} = require("../src-js/core/copilot_router.runtime.js");
const {
  allocatePromptBudget,
  compactPrompt,
} = require("../src-js/core/context-budget.js");
const { RemoteBridge, normalizeProjectRoot } = require("../src-js/bridge/remote-bridge.js");
const { PluginRuntime } = require("../src-js/plugins/plugin-runtime.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

function testShouldSkipLowRiskSingleFileReview() {
  const plan = {
    tasks: [
      { id: "task-1", risk: "low" },
    ],
  };
  const results = [
    {
      taskId: "task-1",
      status: "completed",
      files: ["src-js/core/example.js"],
      residualRisks: [],
    },
  ];
  const routing = {
    reviewEnabled: true,
    reviewMinChangedFiles: 2,
  };

  assert.equal(shouldRunReviewStage(plan, results, routing), false);
}

function testShouldTriggerReviewForHighRiskOrFailures() {
  const failedResults = [
    { taskId: "task-1", status: "failed", files: [], residualRisks: [] },
  ];
  const highRiskPlan = {
    tasks: [
      { id: "task-1", risk: "high" },
    ],
  };
  const routing = {
    reviewEnabled: true,
    reviewMinChangedFiles: 2,
  };

  assert.equal(shouldRunReviewStage(highRiskPlan, [], routing), true);
  assert.equal(shouldRunReviewStage({ tasks: [] }, failedResults, routing), true);
}

function testNormalizeReviewBlocksCriticalFindings() {
  const review = normalizeReviewResult({
    summary: "Se detecto un hallazgo bloqueante.",
    findings: [
      {
        id: "finding-1",
        severity: "critical",
        title: "Uso inseguro",
        detail: "Hay un riesgo de seguridad abierto.",
        taskId: "task-1",
      },
    ],
  }, {
    tasks: [{ id: "task-1", risk: "high" }],
  }, [{ taskId: "task-1", status: "completed", residualRisks: [] }], {
    reviewMaxFindings: 10,
  });

  assert.equal(review.closingGate.passed, false);
  assert.equal(review.findings.length, 1);
  assert.equal(review.findings[0].severity, "critical");
}

function testFinalizeOutcomeUsesReviewGate() {
  const final = finalizeRouterOutcome({
    status: "completed",
    summary: "Synthesis ok.",
    completedTasks: ["task-1"],
    changedFiles: ["src-js/core/example.js"],
    verification: ["node smoke.js"],
    residualRisks: [],
  }, [
    {
      taskId: "task-1",
      status: "completed",
      files: ["src-js/core/example.js"],
      verification: ["node smoke.js"],
      residualRisks: [],
    },
  ], {
    enabled: true,
    findings: [
      {
        id: "finding-1",
        severity: "high",
        title: "Pendiente",
        detail: "Falta corregir un hallazgo alto.",
      },
    ],
    fixesApplied: [],
    residualRisks: ["Falta corregir un hallazgo alto."],
    closingGate: {
      passed: false,
      reason: "Hay hallazgos altos abiertos.",
      blockingFindings: ["finding-1"],
      failedTasks: [],
    },
  });

  assert.equal(final.status, "blocked");
  assert.equal(final.closingGate.passed, false);
  assert.equal(final.findings.length, 1);
}

function testShouldAttemptAutoFixWhenGateBlocked() {
  const reviewStage = {
    findings: [
      { id: 'finding-1', severity: 'high', title: 'Pendiente', detail: 'Debe corregirse.' },
    ],
    fixesApplied: [],
    closingGate: {
      passed: false,
      blockingFindings: ['finding-1'],
      failedTasks: [],
    },
  };
  assert.equal(shouldAttemptAutoFix(reviewStage, { autoFixEnabled: true, autoFixMaxPasses: 1 }, 0), true);
  assert.equal(shouldAttemptAutoFix(reviewStage, { autoFixEnabled: true, autoFixMaxPasses: 1 }, 1), false);
}

function testContextBudgetServiceSharesBudgets() {
  const allocation = allocatePromptBudget('gpt-5.4', { goal: 0.2, results: 0.8 });
  assert.equal(typeof allocation.availableChars, 'number');
  assert.equal(allocation.sections.goal > 0, true);
  const compacted = compactPrompt('x'.repeat(30000), { model: 'glm-4.5-flash', factor: 0.2, label: 'test' });
  assert.equal(compacted.promptCharsBudget > 0, true);
  assert.equal(compacted.text.length <= compacted.promptCharsBudget + 128, true);
}

function testRemoteBridgePersistsResumeGateState() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-bridge-smoke-'));
  const bridge = new RemoteBridge({ rootDir, stateFile: 'bridge-state.json' });
  bridge.registerSession('run-1', { workspacePath: '/tmp/project', hostId: 'host-a', platform: 'linux' });
  bridge.recordGateState('run-1', {
    status: 'blocked',
    summary: 'Hay findings abiertos.',
    findings: [{ id: 'finding-1', severity: 'high', title: 'Pendiente', detail: 'Falta fix.' }],
    closingGate: { passed: false, blockingFindings: ['finding-1'], failedTasks: [] },
  }, { stage: 'review', passIndex: 0, pointerStage: 'review' });
  bridge.markResumePointer('run-1', { stage: 'autofix', passIndex: 1, lastTaskId: 'review-fix-1' });

  const reloaded = new RemoteBridge({ rootDir, stateFile: 'bridge-state.json' });
  const resume = reloaded.getSessionResume('run-1');
  assert.equal(resume.resumePointer.stage, 'autofix');
  assert.equal(resume.latestGate.status, 'blocked');
  assert.equal(resume.reviewHistory.length, 1);
  assert.equal(Boolean(resume.systemIdentity.projectId), true);
}

function testRemoteBridgeDetectsStaleHostIdentity() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-bridge-identity-'));
  const projectRoot = normalizeProjectRoot(rootDir);
  const bridge = new RemoteBridge({ rootDir, stateFile: 'bridge-state.json' });
  bridge.registerSession('run-identity', {
    workspacePath: projectRoot,
    projectRoot,
    hostId: 'host-a',
    platform: 'linux',
  });

  const sameHost = bridge.getSessionResume('run-identity', {
    projectRoot,
    hostId: 'host-a',
    platform: 'linux',
  });
  assert.equal(sameHost.identityStatus.stale, false);
  assert.equal(sameHost.identityStatus.sameProject, true);
  assert.equal(sameHost.identityStatus.sameHost, true);

  const otherHost = bridge.getSessionResume('run-identity', {
    projectRoot,
    hostId: 'host-b',
    platform: 'linux',
  });
  assert.equal(otherHost.identityStatus.stale, true);
  assert.equal(otherHost.identityStatus.mismatches.includes('host'), true);
}

function testNativeToolPolicyBlocksDestructiveShell() {
  const result = createNativeToolPolicy({
    toolName: 'shell',
    toolArgs: { command: 'rm -rf /tmp/freejt7-test' },
  }, { autoApproveSafeTools: true });
  assert.equal(result.permissionDecision, 'deny');
  assert.equal(/destructive shell command/i.test(result.permissionDecisionReason), true);
}

async function testSessionHooksPersistToolTrace() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-hooks-smoke-'));
  const bridge = new RemoteBridge({ rootDir, stateFile: 'bridge-state.json' });
  const pluginRuntime = new PluginRuntime();
  pluginRuntime.loadPlugin({
    id: 'hook-test',
    version: '1.0.0',
    capabilities: ['tool-intercept'],
  }, {
    preToolUse: () => ({ additionalContext: 'hook-pre', suppressOutput: true }),
    postToolUse: () => ({ modifiedResult: { content: 'rewritten by hook' } }),
  });

  const hooks = createSessionHooks({
    pluginRuntime,
    bridge,
    runId: 'run-hooks',
    stage: 'executor:test',
    workingDirectory: '/tmp/project',
    output: null,
    config: { autoApproveSafeTools: true },
  });

  const pre = await hooks.onPreToolUse({
    toolName: 'shell',
    toolArgs: { command: 'echo hola' },
    timestamp: Date.now(),
    cwd: '/tmp/project',
  }, { sessionId: 'session-1' });
  assert.equal(pre.permissionDecision, 'allow');
  assert.equal(pre.additionalContext, 'hook-pre');
  assert.equal(pre.suppressOutput, true);

  const post = await hooks.onPostToolUse({
    toolName: 'shell',
    toolArgs: { command: 'echo hola' },
    toolResult: { content: 'original' },
    timestamp: Date.now(),
    cwd: '/tmp/project',
  }, { sessionId: 'session-1' });
  assert.equal(post.modifiedResult.content, 'rewritten by hook');

  const resume = bridge.getSessionResume('run-hooks');
  assert.equal(resume.lastToolEvent.phase, 'post');
  assert.equal(resume.recentToolEvents.length, 2);
  assert.equal(resume.eventCount >= 2, true);
}

async function main() {
  testShouldSkipLowRiskSingleFileReview();
  testShouldTriggerReviewForHighRiskOrFailures();
  testNormalizeReviewBlocksCriticalFindings();
  testFinalizeOutcomeUsesReviewGate();
  testShouldAttemptAutoFixWhenGateBlocked();
  testContextBudgetServiceSharesBudgets();
  testRemoteBridgePersistsResumeGateState();
  testRemoteBridgeDetectsStaleHostIdentity();
  testNativeToolPolicyBlocksDestructiveShell();
  await testSessionHooksPersistToolTrace();
  console.log("router_review_stage_smoke: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});