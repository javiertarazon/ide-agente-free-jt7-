const assert = require("assert");

const { getGlobalVsCodeSettingsRepairState } = require("../src-js/core/extension.runtime.js");

const expected = {
  instructionFile: "/installed/.github/free-jt7-instructions.md",
  skillsIndex: "/installed/.github/skills/.skills_index.json",
  policyFile: "/installed/.github/free-jt7-policy.yaml",
  modelsRouting: "/installed/.github/free-jt7-model-routing.json",
  modelsIde: "vscode",
};

const staleSnapshot = {
  instructions: [{ file: "/repo/.github/free-jt7-instructions.md" }],
  agentFilesLocations: { "/repo/agente-freejt7-extension-funcional/.github/agents": true },
  skillsIndex: "/repo/.github/skills/.skills_index.json",
  policyFile: "/repo/.github/free-jt7-policy.yaml",
  modelsRouting: "/repo/.github/free-jt7-model-routing.json",
  modelsIde: "vscode",
};

const staleState = getGlobalVsCodeSettingsRepairState(expected, staleSnapshot);
assert.strictEqual(staleState.needsRepair, true, "Debe detectar drift cuando los settings apuntan al checkout fuente");
assert(staleState.reasons.includes("freejt7.instructions"));
assert(staleState.reasons.includes("chat.agentFilesLocations"));
assert(staleState.reasons.includes("freejt7.skills.index"));

const alignedSnapshot = {
  instructions: [{ file: expected.instructionFile }],
  agentFilesLocations: {},
  skillsIndex: expected.skillsIndex,
  policyFile: expected.policyFile,
  modelsRouting: expected.modelsRouting,
  modelsIde: expected.modelsIde,
};

const alignedState = getGlobalVsCodeSettingsRepairState(expected, alignedSnapshot);
assert.strictEqual(alignedState.needsRepair, false, "No debe pedir reparación cuando el estado global ya coincide");

console.log("global-settings-drift-smoke: ok");