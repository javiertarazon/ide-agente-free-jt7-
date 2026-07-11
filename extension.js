try {
  module.exports = require("./dist/extension.cjs");
} catch {
  module.exports = require("./src-js/core/extension.runtime.js");
}
