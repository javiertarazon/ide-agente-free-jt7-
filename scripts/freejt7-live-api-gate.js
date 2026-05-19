#!/usr/bin/env node
'use strict';

const { callProvider, getFreeModelDefault, getApiKey } = require('../src-js/core/api-provider-adapter');

const PROVIDER_KEY_HINTS = Object.freeze({
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  hf: ['HF_TOKEN', 'HUGGINGFACEHUB_API_TOKEN'],
  zai: ['ZAI_API_KEY', 'GLM_API_KEY'],
  clod: ['CLOD_API_KEY'],
  local: ['FREEJT7_LOCAL_CHAT_COMPLETIONS_URL'],
});

function requestedProviders(env = process.env) {
  const raw = String(env.FREEJT7_LIVE_PROVIDERS || env.FREEJT7_LIVE_PROVIDER || '').trim();
  if (raw) return raw.split(',').map((item) => item.trim()).filter(Boolean);
  return Object.keys(PROVIDER_KEY_HINTS).filter((provider) => PROVIDER_KEY_HINTS[provider].some((key) => env[key]));
}

function buildLivePrompt(provider) {
  return {
    systemPrompt: 'Eres un verificador de humo de Free JT7. Responde de forma breve y estable.',
    messages: [{ role: 'user', content: `Responde exactamente: OK FREEJT7 ${provider}` }],
  };
}

async function runLiveApiGate(options = {}) {
  const env = options.env || process.env;
  const providers = requestedProviders(env);
  const required = String(env.FREEJT7_LIVE_REQUIRED || '').trim() === '1';
  if (!providers.length) {
    return {
      ok: !required,
      skipped: !required,
      status: required ? 'failed' : 'skipped',
      reason: required ? 'No hay proveedores live configurados.' : 'Sin credenciales live; gate omitido de forma segura.',
      providers: [],
      results: [],
    };
  }

  const results = [];
  for (const provider of providers) {
    const model = String(env[`FREEJT7_${provider.toUpperCase()}_LIVE_MODEL`] || getFreeModelDefault(provider) || '').trim();
    const key = await getApiKey(provider, options.secretStorage || null, { workspacePath: options.workspacePath || process.cwd() });
    if (provider !== 'local' && !key) {
      results.push({ provider, model, ok: false, skipped: true, reason: `Falta API key para ${provider}` });
      continue;
    }
    try {
      const response = await callProvider(buildLivePrompt(provider), { provider, model }, options.secretStorage || null, { workspacePath: options.workspacePath || process.cwd() });
      const summary = String(response && response.final && response.final.summary || '').trim();
      results.push({ provider, model, ok: Boolean(summary), skipped: false, summary: summary.slice(0, 240) });
    } catch (error) {
      results.push({ provider, model, ok: false, skipped: false, error: String(error && error.message || error) });
    }
  }
  const actionable = results.filter((item) => !item.skipped);
  const ok = actionable.length > 0 && actionable.every((item) => item.ok);
  return { ok, skipped: actionable.length === 0, status: ok ? 'ok' : 'failed', providers, results };
}

function formatLiveApiGate(result) {
  const lines = [`Free JT7 live API gate: ${result.status}`];
  if (result.reason) lines.push(result.reason);
  for (const item of result.results || []) {
    lines.push(`- ${item.ok ? 'OK' : (item.skipped ? 'SKIP' : 'FAIL')} ${item.provider}${item.model ? `/${item.model}` : ''}${item.reason ? `: ${item.reason}` : ''}${item.error ? `: ${item.error}` : ''}`);
  }
  return lines.join('\n');
}

async function main() {
  const result = await runLiveApiGate();
  console.log(formatLiveApiGate(result));
  process.exitCode = result.ok || result.skipped ? 0 : 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error && error.stack || error && error.message || error));
    process.exitCode = 1;
  });
}

module.exports = {
  PROVIDER_KEY_HINTS,
  requestedProviders,
  buildLivePrompt,
  runLiveApiGate,
  formatLiveApiGate,
};
