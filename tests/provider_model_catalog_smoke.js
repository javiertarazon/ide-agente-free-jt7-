const assert = require("assert");

const extensionManifest = require("../package.json");
const { listProviders } = require("../src-js/core/provider-registry");
const {
  getFreeModelsCatalog,
  getFreeModelDefault,
} = require("../src-js/core/api-provider-adapter.js");

function main() {
  const property = extensionManifest?.contributes?.configuration?.properties?.["freejt7.apiProviderModel"];
  assert.ok(property, "Debe existir la configuración freejt7.apiProviderModel");
  assert.ok(Array.isArray(property.enum), "freejt7.apiProviderModel debe exponer enum para la UI de Settings");
  assert.ok(property.enum.length > 0, "freejt7.apiProviderModel debe listar modelos utilizables");

  const enumValues = new Set(property.enum.map((value) => String(value || "").trim()).filter(Boolean));
  const staticCatalog = getFreeModelsCatalog();
  const providers = ["openrouter", "hf", "zai", "clod"];

  for (const provider of providers) {
    const models = Array.isArray(staticCatalog[provider]) ? staticCatalog[provider] : [];
    assert.ok(models.length > 0, `El catálogo base de ${provider} debe tener modelos`);
    for (const model of models) {
      assert.ok(enumValues.has(model.value), `Falta ${model.value} en freejt7.apiProviderModel.enum`);
    }
    const defaultModel = getFreeModelDefault(provider);
    assert.ok(enumValues.has(defaultModel), `El default de ${provider} debe estar en el enum`);
  }

  assert.ok(
    /cat[aá]logo base/i.test(String(property.description || "")),
    "La descripción debe dejar claro que el enum es un catálogo base",
  );
  assert.ok(
    listProviders().every((provider) => provider.id !== "freejt7-agent"),
    "El facade interno de Free JT7 no debe filtrarse al catálogo visible de providers/modelos",
  );

  process.stdout.write("provider_model_catalog_smoke: ok\n");
}

try {
  main();
} catch (error) {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
}
