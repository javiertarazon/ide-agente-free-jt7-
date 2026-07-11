'use strict';

let vscode;
try {
  vscode = require('vscode');
} catch (_) {
  vscode = null;
}

const freeModelsCatalog = require('../free-models-catalog');

const PANEL_DEFAULT_PROVIDER = 'openrouter';

function normalizePanelProviderValue(provider) {
  const value = String(provider || '').trim().toLowerCase();
  if (!value || value === 'copilot') return PANEL_DEFAULT_PROVIDER;
  if (value === 'huggingface' || value === 'hugging-face') return 'hf';
  if (value === 'zhipu' || value === 'zhipuai') return 'zai';
  if (value === 'openrouter' || value === 'hf' || value === 'zai' || value === 'clod') return value;
  return PANEL_DEFAULT_PROVIDER;
}

function normalizePanelExecutionModeValue(executionMode, options = {}) {
  if (options.standaloneMode) return 'agent';
  return String(executionMode || '').trim().toLowerCase() === 'direct' ? 'direct' : 'agent';
}

function normalizePanelRuntimeBackendValue(runtimeBackend) {
  const value = String(runtimeBackend || '').trim().toLowerCase();
  if (!value) return 'auto';
  if (value === 'auto' || value === 'openclaw' || value === 'local') return value;
  if (value.startsWith('acp:')) return value;
  return 'auto';
}

function normalizePanelPolicyProfileValue(policyProfile) {
  const value = String(policyProfile || '').trim().toLowerCase();
  if (value === 'messaging' || value === 'minimal') return value;
  return 'coding';
}

function normalizePanelCatalogModels(rawModels) {
  if (!Array.isArray(rawModels)) {
    return [];
  }
  return rawModels
    .map((model) => {
      if (typeof model === 'string') {
        return { label: model, value: model };
      }
      if (!model || typeof model !== 'object') {
        return null;
      }
      const value = String(model.value || model.id || model.name || '').trim();
      if (!value) {
        return null;
      }
      return {
        label: String(model.label || model.name || value),
        value,
      };
    })
    .filter(Boolean);
}

function isKnownPanelModel(provider, model, catalog) {
  const providerId = normalizePanelProviderValue(provider);
  const modelId = String(model || '').trim();
  if (!modelId) return false;
  const providerCatalog = catalog && catalog.modelsByProvider ? catalog.modelsByProvider[providerId] : [];
  return normalizePanelCatalogModels(providerCatalog).some((entry) => entry.value === modelId);
}

function sanitizePanelProviderConfig(config = {}, options = {}) {
  const standaloneMode = Boolean(options.standaloneMode);
  const catalog = options.catalog || getPanelCatalogSnapshot();
  const provider = normalizePanelProviderValue(config.provider);
  const executionMode = normalizePanelExecutionModeValue(config.executionMode, { standaloneMode });
  let runtimeBackend = normalizePanelRuntimeBackendValue(config.runtimeBackend);
  if (standaloneMode && runtimeBackend === 'local') {
    runtimeBackend = 'auto';
  }

  let model = String(config.model || '').trim();
  const defaultModel = String(
    (catalog.defaultModelByProvider && catalog.defaultModelByProvider[provider])
      || freeModelsCatalog.getDefaultModel(provider)
      || '',
  ).trim();
  if (!model) {
    model = defaultModel;
  }
  if (standaloneMode && executionMode === 'agent' && model && !isKnownPanelModel(provider, model, catalog)) {
    model = defaultModel;
  }

  return {
    provider,
    model,
    executionMode,
    runtimeBackend,
    policyProfile: normalizePanelPolicyProfileValue(config.policyProfile),
    authProfile: String(config.authProfile || 'default').trim() || 'default',
    fallbackProviders: Array.isArray(config.fallbackProviders)
      ? config.fallbackProviders
      : String(config.fallbackProviders || '').trim(),
  };
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 24; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

function getPanelCatalogSnapshot() {
  const providers = ['openrouter', 'hf', 'zai', 'clod'];
  const modelsByProvider = {};
  const defaultModelByProvider = {};

  for (const provider of providers) {
    try {
      modelsByProvider[provider] = Array.isArray(freeModelsCatalog.getModelsForProvider(provider))
        ? freeModelsCatalog.getModelsForProvider(provider)
        : [];
      defaultModelByProvider[provider] = String(freeModelsCatalog.getDefaultModel(provider) || '');
    } catch (_) {
      modelsByProvider[provider] = [];
      defaultModelByProvider[provider] = '';
    }
  }

  return { modelsByProvider, defaultModelByProvider };
}

function isStandaloneAppMode() {
  const envStandalone = String(process.env.FREEJT7_APP_MODE || '').trim() === '1';
  if (!vscode?.workspace?.getConfiguration) {
    return envStandalone;
  }
  try {
    const configured = Boolean(vscode.workspace.getConfiguration('freejt7').get('app.standaloneMode', false));
    return envStandalone || configured;
  } catch (_) {
    return envStandalone;
  }
}

function encodeWebviewJsonPayload(value) {
  try {
    return Buffer.from(JSON.stringify(value || {}), 'utf8').toString('base64');
  } catch (_) {
    return Buffer.from('{}', 'utf8').toString('base64');
  }
}

module.exports = {
  normalizePanelProviderValue,
  normalizePanelExecutionModeValue,
  normalizePanelRuntimeBackendValue,
  normalizePanelPolicyProfileValue,
  normalizePanelCatalogModels,
  isKnownPanelModel,
  sanitizePanelProviderConfig,
  getNonce,
  getPanelCatalogSnapshot,
  isStandaloneAppMode,
  encodeWebviewJsonPayload,
  PANEL_DEFAULT_PROVIDER,
};