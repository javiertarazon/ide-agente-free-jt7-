'use strict';

const { requireProvider, resolveProviderModel } = require('./provider-registry');

const PROVIDER_CONFIGS = Object.freeze({
  openrouter: Object.freeze({
    chatCompletionsUrl: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    defaultHeaders: Object.freeze({
      'HTTP-Referer': 'vscode-freejt7-extension',
      'X-Title': 'Free JT7 Agent',
    }),
  }),
  hf: Object.freeze({
    chatCompletionsUrl: 'https://router.huggingface.co/together/v1/chat/completions',
    apiKeyEnv: 'HUGGINGFACE_API_KEY',
    defaultHeaders: Object.freeze({}),
  }),
  zai: Object.freeze({
    chatCompletionsUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    apiKeyEnv: 'ZAI_API_KEY',
    defaultHeaders: Object.freeze({}),
  }),
  clod: Object.freeze({
    chatCompletionsUrl: 'https://api.clod.io/v1/chat/completions',
    apiKeyEnv: 'CLOD_API_KEY',
    defaultHeaders: Object.freeze({}),
  }),
});

function getProviderConfig(providerId) {
  const provider = requireProvider(providerId);
  const config = PROVIDER_CONFIGS[provider.id];
  if (!config) {
    throw new Error(`Free JT7: el proveedor ${provider.id} no soporta llamadas directas`);
  }
  return {
    provider,
    chatCompletionsUrl: config.chatCompletionsUrl,
    apiKeyEnv: config.apiKeyEnv,
    defaultHeaders: { ...config.defaultHeaders },
  };
}

function normalizeMessages(messages, fallbackPrompt = '') {
  if (Array.isArray(messages)) {
    const normalized = messages
      .map((entry) => ({
        role: String(entry?.role || '').trim().toLowerCase(),
        content: String(entry?.content || entry?.text || '').trim(),
      }))
      .filter((entry) => ['system', 'user', 'assistant'].includes(entry.role) && entry.content);
    if (normalized.length > 0) return normalized;
  }
  const prompt = String(fallbackPrompt || '').trim();
  return prompt ? [{ role: 'user', content: prompt }] : [];
}

function buildChatCompletionPayload({ providerId, modelId, messages, prompt, stream = false, maxTokens } = {}) {
  const resolved = resolveProviderModel(providerId, modelId);
  const payload = {
    model: resolved.modelId,
    messages: normalizeMessages(messages, prompt),
    stream: Boolean(stream),
  };
  const outputTokens = Number(maxTokens || 0);
  if (outputTokens > 0) {
    payload.max_tokens = outputTokens;
  }
  return payload;
}

function buildProviderHeaders(providerId, apiKey, extraHeaders = {}) {
  const config = getProviderConfig(providerId);
  return {
    ...config.defaultHeaders,
    ...extraHeaders,
    Authorization: `Bearer ${String(apiKey || '').trim()}`,
    'Content-Type': 'application/json',
  };
}

module.exports = {
  getProviderConfig,
  normalizeMessages,
  buildChatCompletionPayload,
  buildProviderHeaders,
};
