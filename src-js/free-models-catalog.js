/**
 * free-models-catalog.js — Catálogo de modelos gratuitos por proveedor
 * Usado por extension.runtime.js para popular el QuickPick de selección de modelo.
 */

const {
  getFreeModelsCatalog,
  getFreeModelDefault,
  getFreeModelDefaults,
} = require("./providers/api-provider-adapter");

const FREE_MODELS = getFreeModelsCatalog();
const DEFAULT_MODELS = getFreeModelDefaults();

/**
 * Devuelve la lista de modelos gratuitos para un proveedor.
 * @param {string} provider - "openrouter" | "hf" | "zai" | "copilot"
 * @returns {Array<{label:string, value:string}>}
 */
function getModelsForProvider(provider) {
  return getFreeModelsCatalog(provider);
}

/**
 * Devuelve el modelo predeterminado para un proveedor.
 * @param {string} provider
 * @returns {string}
 */
function getDefaultModel(provider) {
  return getFreeModelDefault(provider);
}

module.exports = { getModelsForProvider, getDefaultModel, FREE_MODELS, DEFAULT_MODELS };
