const assert = require("assert");

const {
  resolveLegacyCopilotSelection,
  buildRunSkeleton,
} = require("../src-js/core/copilot_router.runtime.js");

function createMockVscode(values = {}) {
  return {
    workspace: {
      getConfiguration(section) {
        assert.equal(section, "freejt7");
        return {
          get(key, fallback) {
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback;
          },
        };
      },
    },
  };
}

function createRoutingConfig() {
  return {
    routePath: "/tmp/free-jt7-model-routing.json",
    plannerModel: "gpt-5.4",
    executorCheapModel: "claude-haiku-4.5",
    executorContextModel: "gemini-3-flash",
    executorFallbackModel: "gpt-5.4",
    reviewEnabled: true,
    reviewModel: "gpt-5.4",
    reviewMaxFindings: 12,
    reviewMinChangedFiles: 2,
    autoFixEnabled: true,
    autoFixMaxPasses: 1,
    experimentalCodeModel: "",
  };
}

function testDefaultCopilotLegacyRouteIgnoresPrimaryProvider() {
  const selection = resolveLegacyCopilotSelection({
    vscode: createMockVscode({
      apiProvider: "openrouter",
      apiProviderModel: "meta-llama/llama-3.3-70b-instruct:free",
    }),
  });

  assert.equal(selection.selectedProvider, "copilot");
  assert.equal(selection.selectedProviderModel, "");
  assert.equal(selection.source, "default-copilot");
  assert.equal(selection.ignoredPrimaryProvider, true);
  assert.equal(selection.primaryProviderObserved, "openrouter");
  assert.equal(selection.isolatedFromPrimaryProvider, true);
}

function testLegacyConfigCanOptIntoExternalDelegationWithoutUsingPrimaryProvider() {
  const selection = resolveLegacyCopilotSelection({
    vscode: createMockVscode({
      apiProvider: "hf",
      apiProviderModel: "Qwen/Qwen2.5-7B-Instruct-Turbo",
      "copilotRouter.allowExternalProviderDelegation": true,
      "copilotRouter.legacyProvider": "zai",
      "copilotRouter.legacyModel": "glm-4.5-flash",
    }),
  });

  assert.equal(selection.selectedProvider, "zai");
  assert.equal(selection.selectedProviderModel, "glm-4.5-flash");
  assert.equal(selection.source, "legacy-router-config");
  assert.equal(selection.primaryProviderObserved, "hf");
  assert.equal(selection.ignoredPrimaryProvider, false);
}

function testExplicitOverrideWinsWithoutReadingPrimaryProviderModel() {
  const selection = resolveLegacyCopilotSelection({
    providerOverride: "openrouter",
    modelOverride: "",
    vscode: createMockVscode({
      apiProvider: "clod",
      apiProviderModel: "moonshotai/Kimi-K2.5",
    }),
  });

  assert.equal(selection.selectedProvider, "openrouter");
  assert.equal(selection.source, "provider-override");
  assert.notEqual(selection.selectedProviderModel, "moonshotai/Kimi-K2.5");
  assert.equal(selection.isolatedFromPrimaryProvider, true);
}

function testRunSkeletonMarksLegacySecondaryCompatibility() {
  const selection = resolveLegacyCopilotSelection({
    vscode: createMockVscode({
      apiProvider: "openrouter",
      apiProviderModel: "meta-llama/llama-3.3-70b-instruct:free",
    }),
  });

  const run = buildRunSkeleton(
    "run-legacy",
    "corrige el bug",
    "/tmp/project",
    createRoutingConfig(),
    { authMode: "copilot-cli", apiEnvVar: "" },
    [],
    {
      provider: "copilot",
      model: "gpt-5.4",
      authMode: "copilot-cli",
      reason: "copilot legacy secondary route",
      selectedProvider: "copilot",
      selectedModel: "gpt-5.4",
      compatibilityMode: selection.compatibilityMode,
      legacyRouteIsolated: selection.isolatedFromPrimaryProvider,
      legacyProviderSource: selection.source,
      ignoredPrimaryProvider: selection.ignoredPrimaryProvider,
      primaryProviderObserved: selection.primaryProviderObserved,
      primaryModelObserved: selection.primaryModelObserved,
      legacyConfigEnabled: selection.legacyConfigEnabled,
      legacyConfigProvider: selection.legacyConfigProvider,
      legacyConfigModel: selection.legacyConfigModel,
    },
  );

  assert.equal(run.model_resolution.compatibility_mode, "copilot-legacy-secondary");
  assert.equal(run.model_resolution.legacy_route_isolated, true);
  assert.equal(run.model_resolution.legacy_provider_source, "default-copilot");
  assert.equal(run.model_resolution.ignored_primary_provider, true);
  assert.equal(run.model_resolution.config_namespace, "freejt7.copilotRouter.*");
  assert.equal(run.execution_route.legacy_secondary, true);
  assert.equal(run.execution_route.primary_provider_observed, "openrouter");
}

function main() {
  testDefaultCopilotLegacyRouteIgnoresPrimaryProvider();
  testLegacyConfigCanOptIntoExternalDelegationWithoutUsingPrimaryProvider();
  testExplicitOverrideWinsWithoutReadingPrimaryProviderModel();
  testRunSkeletonMarksLegacySecondaryCompatibility();
  process.stdout.write("copilot_router_legacy_isolation_smoke: ok\n");
}

main();
