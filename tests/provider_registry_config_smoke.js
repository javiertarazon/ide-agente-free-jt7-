'use strict';

const assert = require('assert');

const {
  getDefaultModel,
  getAgentFacade,
  getProvider,
  listProviderModels,
  listProviders,
  normalizeProviderId,
  resolveProviderModel,
  supportsStreaming,
} = require('../src-js/core/provider-registry');
const {
  buildChatCompletionPayload,
  buildProviderHeaders,
  getProviderConfig,
} = require('../src-js/core/provider-config');

function main() {
  assert.equal(normalizeProviderId('huggingface'), 'hf');
  assert.equal(normalizeProviderId('ZHIPUAI'), 'zai');
  assert.equal(normalizeProviderId('claude'), 'anthropic');
  assert.equal(normalizeProviderId('ollama'), 'local');

  const providers = listProviders();
  assert.ok(providers.some((provider) => provider.id === 'openrouter'), 'debe listar OpenRouter');
  for (const id of ['openai', 'anthropic', 'deepseek', 'gemini', 'local']) {
    assert.ok(providers.some((provider) => provider.id === id), `debe listar ${id}`);
  }
  assert.ok(providers.every((provider) => provider.id !== 'copilot'), 'El provider legacy de chat no debe salir en providers directos por defecto');

  const openrouter = getProvider('openrouter');
  assert.equal(openrouter.directSupport, true);
  assert.equal(openrouter.streamSupport, true);
  assert.equal(supportsStreaming('clod'), true);
  assert.equal(supportsStreaming('anthropic'), false);
  assert.equal(supportsStreaming('local'), true);

  assert.ok(listProviderModels('openrouter').length > 0, 'OpenRouter debe tener catalogo base');
  assert.equal(getDefaultModel('zai'), 'glm-4.5-flash');
  assert.equal(getDefaultModel('openai'), 'gpt-4o-mini');
  assert.equal(getDefaultModel('anthropic'), 'claude-3-5-haiku-latest');
  assert.equal(getDefaultModel('deepseek'), 'deepseek-chat');
  assert.equal(getDefaultModel('gemini'), 'gemini-2.5-flash');
  assert.equal(getDefaultModel('local'), 'llama3.1:8b');
  assert.deepStrictEqual(getAgentFacade(), {
    providerId: 'freejt7-agent',
    modelId: 'freejt7-runtime',
    label: 'Free JT7',
    kind: 'agent-runtime',
  });

  const resolved = resolveProviderModel('hf', '');
  assert.equal(resolved.modelId, 'Qwen/Qwen2.5-7B-Instruct-Turbo');

  const config = getProviderConfig('openrouter');
  assert.match(config.chatCompletionsUrl, /openrouter\.ai\/api\/v1\/chat\/completions/);
  assert.equal(config.apiKeyEnv, 'OPENROUTER_API_KEY');

  const payload = buildChatCompletionPayload({
    providerId: 'openrouter',
    messages: [{ role: 'user', content: 'hola' }],
    stream: true,
    maxTokens: 123,
  });
  assert.equal(payload.model, 'openai/gpt-oss-20b:free');
  assert.equal(payload.stream, true);
  assert.equal(payload.max_tokens, 123);

  const headers = buildProviderHeaders('openrouter', 'key-test');
  assert.equal(headers.Authorization, 'Bearer key-test');
  assert.equal(headers['X-Title'], 'Free JT7 Agent');

  const anthropicConfig = getProviderConfig('anthropic');
  assert.match(anthropicConfig.chatCompletionsUrl, /api\.anthropic\.com\/v1\/messages/);
  assert.equal(anthropicConfig.apiKeyEnv, 'ANTHROPIC_API_KEY');
  const anthropicHeaders = buildProviderHeaders('anthropic', 'anthropic-key');
  assert.equal(anthropicHeaders['x-api-key'], 'anthropic-key');
  assert.equal(anthropicHeaders['anthropic-version'], '2023-06-01');
  assert.equal(anthropicHeaders.Authorization, undefined);

  const localConfig = getProviderConfig('local');
  assert.equal(localConfig.requiresApiKey, false);
  assert.match(localConfig.chatCompletionsUrl, /127\.0\.0\.1:11434\/v1\/chat\/completions/);
  const localHeaders = buildProviderHeaders('local', '');
  assert.equal(localHeaders.Authorization, undefined);

  console.log('provider_registry_config_smoke: OK');
}

main();
