const assert = require("assert");

const { runWithRouterRunLock } = require("../src-js/core/copilot_router.runtime.js");

async function testCoreRouterLockBlocksConcurrentRuns() {
  assert.equal(typeof runWithRouterRunLock, "function", "runWithRouterRunLock debe exportarse desde el router core");

  let releaseFirstRun;
  const firstRun = runWithRouterRunLock(async () => new Promise((resolve) => {
    releaseFirstRun = resolve;
  }));

  await Promise.resolve();

  await assert.rejects(
    () => runWithRouterRunLock(async () => "second-run"),
    /ya hay una ejecucion activa del router Copilot/i,
  );

  releaseFirstRun("first-run");
  const firstResult = await firstRun;
  assert.equal(firstResult, "first-run");

  const thirdResult = await runWithRouterRunLock(async () => "third-run");
  assert.equal(thirdResult, "third-run");
}

async function main() {
  await testCoreRouterLockBlocksConcurrentRuns();
  process.stdout.write("router_core_concurrency_smoke: ok\n");
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});