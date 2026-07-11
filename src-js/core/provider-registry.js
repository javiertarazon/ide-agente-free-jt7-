'use strict';

const {
  getFreeModelsCatalog,
  getFreeModelDefault,
} = require('./api-provider-adapter');

const PROVIDERS = Object.freeze({
  openrouter: Object.freeze({
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    directSupport: true,
    streamSupport: true,
    defaultModel: 'openai/gpt-oss-20b:free',
  }),
  hf: Object.freeze({
    id: 'hf',
    label: 'Hugging Face',
    kind: 'openai-compatible',
    directSupport: true,
    streamSupport: true,
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct-Turbo',
  }),
  zai: Object.freeze({
    id: 'zai',
    label: 'ZAI',
    kind: 'openai-compatible',
    directSupport: true,
    streamSupport: true,
    defaultModel: 'glm-4.5-flash',
  }),
  clod: Object.freeze({
    id: 'clod',
    label: 'CLOD',
    kind: 'openai-compatible',
    directSupport: true,
    streamSupport: true,
    defaultModel: 'OpenAI/gpt-oss-20B',
  }),
  copilot: Object.freeze({
    id: 'copilot',
    label: 'GitHub Copilot',
    kind: 'hosted-agent',
    directSupport: false,
    streamSupport: false,
    defaultModel: '',
  }),
});

const FREEJT7_AGENT_FACADE = Object.freeze({
  providerId: 'freejt7-agent',
  modelId: 'freejt7-runtime',
  label: 'Free JT7',
  kind: 'agent-runtime',
});

function normalizeProviderId(value) {
  const providerId = String(value || '').trim().toLowerCase();
  if (providerId === 'huggingface' || providerId === 'hugging-face') return 'hf';
  if (providerId === 'zhipu' || providerId === 'zhipuai') return 'zai';
  return providerId || 'openrouter';
}

function cloneProvider(provider) {
  return provider ? { ...provider } : null;
}

function getAgentFacade() {
  return { ...FREEJT7_AGENT_FACADE };
}

function getProvider(providerId) {
  return cloneProvider(PROVIDERS[normalizeProviderId(providerId)]);
}

function requireProvider(providerId) {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Free JT7: proveedor no registrado: ${providerId || 'desconocido'}`);
  }
  return provider;
}

function listProviders(options = {}) {
  const includeCopilot = Boolean(options.includeCopilot);
  return Object.values(PROVIDERS)
    .filter((provider) => includeCopilot || provider.id !== 'copilot')
    .map(cloneProvider);
}

function isExternalProvider(providerId) {
  const id = normalizeProviderId(providerId);
  return Boolean(PROVIDERS[id] && id !== 'copilot');
}

function listProviderModels(providerId) {
  const id = normalizeProviderId(providerId);
  return getFreeModelsCatalog(id) || [];
}

function getDefaultModel(providerId) {
  const id = normalizeProviderId(providerId);
  const fromCatalog = getFreeModelDefault(id);
  return fromCatalog || PROVIDERS[id]?.defaultModel || '';
}

function resolveProviderModel(providerId, modelId) {
  const provider = requireProvider(providerId);
  const model = String(modelId || '').trim() || getDefaultModel(provider.id);
  return {
    providerId: provider.id,
    modelId: model,
    provider,
  };
}

function supportsStreaming(providerId) {
  return Boolean(PROVIDERS[normalizeProviderId(providerId)]?.streamSupport);
}

module.exports = {
  getAgentFacade,
  normalizeProviderId,
  getProvider,
  requireProvider,
  listProviders,
  isExternalProvider,
  listProviderModels,
  getDefaultModel,
  resolveProviderModel,
  supportsStreaming,
};
