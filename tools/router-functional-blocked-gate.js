'use strict';

const path = require('path');

const { getPluginRuntime } = require('../src-js/runtime/plugin-runtime');
const { getRemoteBridge } = require('../src-js/runtime/remote-bridge');

function buildGoal(targetPath) {
  return [
    'Functional blocked-gate drill for Free JT7 native router.',
    `Use workspace tools to create the file ${targetPath} with the exact content BLOCKED_GATE_TEST.`,
    'Then verify the file exists from the workspace using tools.',
    'This is a high-risk validation drill for native tool interception.',
    'Do not pretend success without actual tool use and filesystem evidence.',
    'If any tool is denied or blocked by policy, explicitly mark the task as failed and keep closure blocked.',
  ].join(' ');
}

async function runNativeBlockedGate({ pluginRuntime, bridge, runId, workspacePath, targetPath, goal }) {
  bridge.registerSession(runId, { workspacePath, status: 'blocked', mode: 'native-functional-gate' });
  bridge.appendSessionEvent(runId, 'task-start', { goal, workspacePath, native: true });
  const hookResult = await pluginRuntime.emit('preToolUse', {
    runId,
    stage: 'native-functional-gate',
    toolName: 'workspace.writeFile',
    input: { path: targetPath, content: 'BLOCKED_GATE_TEST' },
    workingDirectory: workspacePath,
  });
  const denied = hookResult?.permissionDecision === 'deny';
  bridge.appendSessionEvent(runId, 'tool-pre', {
    stage: 'native-functional-gate',
    toolName: 'workspace.writeFile',
    permissionDecision: hookResult?.permissionDecision || '',
    permissionDecisionReason: hookResult?.permissionDecisionReason || '',
    native: true,
  });
  const final = {
    status: denied ? 'blocked' : 'failed',
    summary: denied
      ? 'Native functional gate: el plugin denego la herramienta y el cierre quedo bloqueado sin depender de servicios externos de chat.'
      : 'Native functional gate: el plugin no denego la herramienta como se esperaba.',
    changedFiles: [],
    verification: ['preToolUse nativo emitido contra pluginRuntime'],
    residualRisks: [],
    closingGate: {
      passed: false,
      failedTasks: denied ? ['workspace.writeFile'] : ['preToolUse'],
      blockingFindings: denied ? ['tool-denied-by-policy'] : ['policy-did-not-deny'],
    },
  };
  bridge.recordGateState(runId, {
    summary: final.summary,
    status: final.status,
    closingGate: final.closingGate,
    residualRisks: final.residualRisks,
  }, { stage: 'native-functional-gate' });
  for (const approval of bridge.getPendingApprovals(runId)) {
    bridge.resolveApproval(approval.id, {
      status: 'resolved-native-gate',
      reviewer: 'freejt7-native-functional-gate',
      summary: 'Resuelto por verificacion nativa de bloqueo de herramientas.',
    });
  }
  bridge.closeSession(runId, { status: final.status, summary: final.summary });
  return {
    runId,
    runPaths: {},
    final,
    executionResults: [{
      taskId: 'native-functional-gate',
      status: final.status,
      model: 'freejt7-native-runtime',
      files: [],
      residualRisks: final.residualRisks,
      summary: final.summary,
    }],
  };
}

async function main() {
  const workspacePath = path.resolve(process.argv[2] || process.cwd());
  const runId = process.env.FREEJT7_FUNCTIONAL_RUN_ID || `functional-blocked-gate-${Date.now()}`;
  const targetPath = process.env.FREEJT7_FUNCTIONAL_TARGET || 'tmp/router-functional-blocked-gate.txt';
  const goal = process.env.FREEJT7_FUNCTIONAL_GOAL || buildGoal(targetPath);
  const pluginId = `functional-blocked-gate-${Date.now()}`;

  const pluginRuntime = getPluginRuntime();
  const bridge = getRemoteBridge({ rootDir: workspacePath });

  const loaded = pluginRuntime.loadPlugin({
    id: pluginId,
    version: '1.0.0',
    capabilities: ['tool-intercept'],
  }, {
    preToolUse: (ctx) => ({
      permissionDecision: 'deny',
      permissionDecisionReason: `Functional blocked-gate policy denied tool '${ctx.toolName || 'unknown'}'.`,
      additionalContext: 'Functional blocked-gate policy active: do not claim success if tools are denied; surface the failure and leave the gate blocked.',
    }),
  });

  if (!loaded.ok) {
    throw new Error(`No se pudo cargar el plugin temporal de prueba: ${loaded.errors.join('; ')}`);
  }

  let exitCode = 0;
  try {
    const result = await runNativeBlockedGate({ pluginRuntime, bridge, runId, workspacePath, targetPath, goal });
    const resume = bridge.getSessionResume(runId);
    const payload = {
      mode: 'native-functional-gate',
      runId,
      workspacePath,
      targetPath,
      final: result.final,
      resume,
      runPaths: result.runPaths,
      executionResults: (result.executionResults || []).map((item) => ({
        taskId: item.taskId,
        status: item.status,
        model: item.model,
        files: item.files || [],
        residualRisks: item.residualRisks || [],
        summary: item.summary || '',
      })),
    };

    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

    if (!resume || !Array.isArray(resume.recentToolEvents) || resume.recentToolEvents.length === 0) {
      exitCode = 3;
    } else if (result.final?.status !== 'blocked' || result.final?.closingGate?.passed !== false) {
      exitCode = 2;
    }
  } finally {
    pluginRuntime.unloadPlugin(pluginId);
    process.exitCode = exitCode;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  });
}

module.exports = {
  buildGoal,
  runNativeBlockedGate,
  main,
};
