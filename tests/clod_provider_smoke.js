const assert = require("assert");

const {
  fetchProviderModels,
  callProvider,
} = require("../src-js/core/api-provider-adapter.js");

async function main() {
  const workspacePath = process.cwd();
  const models = await fetchProviderModels("clod", null, { workspacePath });
  assert.ok(Array.isArray(models), "CLŌD debe devolver un arreglo de modelos");
  assert.ok(models.length > 0, "CLŌD debe exponer al menos un modelo");

  const preferred =
    models.find((item) => item && item.value === "OpenAI/gpt-oss-20B")
    || models.find((item) => item && item.value === "google/gemma-4-31B-it")
    || models.find((item) => item && typeof item.value === "string" && item.value)
    || null;

  assert.ok(preferred && preferred.value, "Debe existir un modelo utilizable para la prueba");

  const result = await callProvider(
    "Responde solo con OK.",
    { provider: "clod", model: preferred.value },
    null,
    { workspacePath },
  );

  assert.ok(result && result.final && typeof result.final.summary === "string", "CLŌD debe devolver un summary string");
  assert.ok(result.final.summary.trim().length > 0, "CLŌD debe devolver contenido no vacío");
  process.stdout.write(`clod_provider_smoke: ok (${preferred.value})\n`);
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
