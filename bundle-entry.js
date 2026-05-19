const extension = require("./src-js/core/extension.runtime.js");
const nativeRouter = require("./src-js/core/native-router-core.js");

module.exports = {
  activate: extension.activate,
  deactivate: extension.deactivate,
  runOpenClaw: extension.runOpenClaw,
  nativeRouter,
};
