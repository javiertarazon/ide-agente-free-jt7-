const assert = require("assert");

const {
  fetchProviderModels,
  callProvider,
  getApiKey,
} = require("../src-js/core/api-provider-adapter.js");

function selectPreferredModel(models) {
  return (models || []).find((item) => item && item.value === "OpenAI/gpt-oss-20B")
    || (models || []).find((item) => item && item.value === "google/gemma-4-31B-it")
    || (models || []).find((item) => item && typeof item.value === "string" && item.value)
    || null;
}

async function main() {
  const workspacePath = process.cwd();
  const models = await fetchProviderModels("clod", null, { workspacePath });
  assert.ok(Array.isArray(models), "CLŌD debe devolver un arreglo de modelos");
  assert.ok(models.length > 0, "CLŌD debe exponer al menos un modelo");

  const preferred = selectPreferredModel(models);

  assert.ok(preferred && preferred.value, "Debe existir un modelo utilizable para la prueba");

  const apiKey = await getApiKey("clod", null, { workspacePath });
  if (!apiKey) {
    await assert.rejects(
      () => callProvider(
        "Responde solo con OK.",
        { provider: "clod", model: preferred.value },
        null,
        { workspacePath },
      ),
      (error) => {
        assert.equal(error?.isConfigurationError, true, "La ausencia de API key debe marcar error de configuración");
        assert.equal(error?.isUserActionRequired, true, "La ausencia de API key debe requerir acción del usuario");
        assert.equal(error?.isRetryable, false, "La ausencia de API key no debe reintentarse automáticamente");
        assert.match(String(error?.message || ""), /No hay API Key/i);
        return true;
      },
    );
    process.stdout.write(`clod_provider_smoke: ok offline (${preferred.value}; sin CLOD_API_KEY, validado error de configuración)\n`);
    return;
  }

  const result = await callProvider(
    "Responde solo con OK.",
    { provider: "clod", model: preferred.value },
    null,
    { workspacePath },
  );

  assert.ok(result && result.final && typeof result.final.summary === "string", "CLŌD debe devolver un summary string");
  assert.ok(result.final.summary.trim().length > 0, "CLŌD debe devolver contenido no vacío");
  process.stdout.write(`clod_provider_smoke: ok live (${preferred.value})\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.stack || error?.message || error));
    process.exitCode = 1;
  });
}

module.exports = {
  selectPreferredModel,
  main,
};
