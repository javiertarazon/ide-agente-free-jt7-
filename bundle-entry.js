const extension = require("./src-js/core/extension.runtime.js");
const router = require("./src-js/core/copilot_router.runtime.js");

module.exports = {
  activate: extension.activate,
  deactivate: extension.deactivate,
  runOpenClaw: extension.runOpenClaw,
  runCopilotRouter: router.runCopilotRouter,
  resolveCopilotCliPath: router.resolveCopilotCliPath,
  resolveCopilotCliCommand: router.resolveCopilotCliCommand,
  mergeRouterConfig: router.mergeRouterConfig,
  main: router.main,
};
