const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { SessionEngine } = require("../src-js/core/session-engine.js");
const { PolicyEngine } = require("../src-js/core/policy-engine.js");
const { AuditBus } = require("../src-js/core/audit-bus.js");

async function waitForTask(engine, taskId, expectedType, timeoutMs = 5000) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      engine.removeListener("task", onTask);
      reject(new Error(`timeout esperando ${expectedType}`));
    }, timeoutMs);
    function onTask(event) {
      if (event?.type === expectedType && event?.task?.taskId === taskId) {
        clearTimeout(timer);
        engine.removeListener("task", onTask);
        resolve(event.task);
      }
    }
    engine.on("task", onTask);
  });
}

async function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "freejt7-session-verify-"));
  const engine = new SessionEngine({
    rootDir,
    workerCount: 1,
    policyEngine: new PolicyEngine({ mode: "autonomous" }),
    auditBus: new AuditBus({ rootDir }),
    providerRouter: {
      async execute(task) {
        if (task.goal.includes("directo")) {
          return {
            provider: "openrouter",
            model: "demo",
            summary: "resultado directo",
            executionMode: "direct",
            raw: { final: { summary: "resultado directo", verification: [] } }
          };
        }
        return {
          provider: "copilot",
          model: "freejt7-agent",
          summary: "resultado agente",
          executionMode: "agent",
          raw: {
            executionRoute: "copilot-router",
            final: {
              summary: "resultado agente",
              verification: ["node smoke.js", "npm test"],
              changedFiles: ["src/index.js"]
            }
          }
        };
      }
    }
  });

  engine.start();
  const session = engine.createSession({ title: "verificacion" });
  const task1 = engine.enqueueTask(session.sessionId, { goal: "haz una tarea de agente", provider: "copilot", executionMode: "agent" });
  const completed1 = await waitForTask(engine, task1.taskId, "task.completed");
  assert.equal(completed1.verification.status, "verified");
  assert.equal(completed1.verification.evidence.length, 2);
  assert.equal(completed1.verification.changedFiles[0], "src/index.js");

  const task2 = engine.enqueueTask(session.sessionId, { goal: "haz una tarea en modo directo", provider: "openrouter", executionMode: "direct" });
  const completed2 = await waitForTask(engine, task2.taskId, "task.completed");
  assert.equal(completed2.verification.status, "unverified");
  assert.equal(completed2.verification.warnings.some((item) => /modo proveedor directo/i.test(item)), true);

  engine.stop();
  console.log("session_engine_verification_smoke: ok");
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
