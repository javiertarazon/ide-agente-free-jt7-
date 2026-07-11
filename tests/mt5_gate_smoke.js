const assert = require("assert");

async function main() {
  const { createMt5Tools } = await import("../servidor mpc free jt7/src/tools/mt5.js");
  const calls = [];
  const tools = createMt5Tools(
    { mt5TradingApprovalToken: "token-smoke" },
    {
      executePythonMT5: async (method, params) => {
        calls.push({ method, params });
        return { success: true, method, params };
      },
    }
  );

  const blocked = await tools.jt7_mt5_open_order.run({
    symbol: "EURUSD",
    order_type: "BUY",
    volume: 0.01,
  });
  assert.equal(blocked.success, false);
  assert.equal(blocked.requiresApproval, true);
  assert.equal(calls.length, 0, "No debe ejecutar Python sin aprobacion");

  const approvedByFlag = await tools.jt7_mt5_close_order.run({
    ticket: 123,
    approved: true,
  });
  assert.equal(approvedByFlag.success, true);
  assert.equal(approvedByFlag.method, "close_order");

  const approvedByToken = await tools.jt7_mt5_modify_order.run({
    ticket: 123,
    sl: 1.1,
    approvalToken: "token-smoke",
  });
  assert.equal(approvedByToken.success, true);
  assert.equal(approvedByToken.method, "modify_order");

  const readOnly = await tools.jt7_mt5_positions.run({});
  assert.equal(readOnly.success, true);
  assert.equal(readOnly.method, "get_positions");
  assert.equal(calls.map((call) => call.method).join(","), "close_order,modify_order,get_positions");

  console.log("mt5_gate_smoke: ok");
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
