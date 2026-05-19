'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const http = require('http');
const https = require('https');

const { callProvider, getApiKey } = require('../src-js/core/api-provider-adapter');

const originalHttpRequest = http.request;
const originalHttpsRequest = https.request;
const originalEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  FREEJT7_LOCAL_API_KEY: process.env.FREEJT7_LOCAL_API_KEY,
  FREEJT7_LOCAL_CHAT_COMPLETIONS_URL: process.env.FREEJT7_LOCAL_CHAT_COMPLETIONS_URL,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === 'string') process.env[key] = value;
    else delete process.env[key];
  }
}

function installMockRequests(calls) {
  const handler = (options, callback) => {
    const req = new EventEmitter();
    let rawBody = '';
    req.write = (chunk) => { rawBody += String(chunk || ''); };
    req.destroy = (error) => process.nextTick(() => req.emit('error', error));
    req.end = () => {
      const body = rawBody ? JSON.parse(rawBody) : {};
      calls.push({ options, body });
      const res = new EventEmitter();
      res.statusCode = 200;
      callback(res);
      process.nextTick(() => {
        const payload = options.hostname === 'api.anthropic.com'
          ? { content: [{ type: 'text', text: 'ok anthropic' }] }
          : { choices: [{ message: { content: `ok ${options.hostname}` } }] };
        res.emit('data', Buffer.from(JSON.stringify(payload), 'utf8'));
        res.emit('end');
      });
    };
    return req;
  };
  http.request = handler;
  https.request = handler;
}

async function main() {
  const calls = [];
  installMockRequests(calls);
  process.env.OPENAI_API_KEY = 'openai-key';
  process.env.ANTHROPIC_API_KEY = 'anthropic-key';
  process.env.DEEPSEEK_API_KEY = 'deepseek-key';
  process.env.GEMINI_API_KEY = 'gemini-key';
  delete process.env.FREEJT7_LOCAL_API_KEY;
  process.env.FREEJT7_LOCAL_CHAT_COMPLETIONS_URL = 'http://127.0.0.1:11434/v1/chat/completions';

  try {
    assert.equal(await getApiKey('openai'), 'openai-key');
    assert.equal(await getApiKey('anthropic'), 'anthropic-key');
    assert.equal(await getApiKey('deepseek'), 'deepseek-key');
    assert.equal(await getApiKey('gemini'), 'gemini-key');
    assert.equal(await getApiKey('local'), null, 'local debe aceptar ejecucion sin API key');

    const openai = await callProvider('di ok', { provider: 'openai', model: 'gpt-4o-mini' }, null, { workspacePath: process.cwd() });
    const anthropic = await callProvider({
      systemPrompt: 'responde corto',
      messages: [{ role: 'user', content: 'di ok' }],
    }, { provider: 'anthropic', model: 'claude-3-5-haiku-latest' }, null, { workspacePath: process.cwd() });
    const deepseek = await callProvider('di ok', { provider: 'deepseek', model: 'deepseek-chat' }, null, { workspacePath: process.cwd() });
    const gemini = await callProvider('di ok', { provider: 'gemini', model: 'gemini-2.5-flash' }, null, { workspacePath: process.cwd() });
    const local = await callProvider('di ok', { provider: 'local', model: 'llama3.1:8b' }, null, { workspacePath: process.cwd() });

    assert.match(openai.final.summary, /ok api\.openai\.com/);
    assert.match(anthropic.final.summary, /ok anthropic/);
    assert.match(deepseek.final.summary, /ok api\.deepseek\.com/);
    assert.match(gemini.final.summary, /ok generativelanguage\.googleapis\.com/);
    assert.match(local.final.summary, /ok 127\.0\.0\.1/);

    const byHost = Object.fromEntries(calls.map((call) => [call.options.hostname, call]));
    assert.equal(byHost['api.openai.com'].options.headers.Authorization, 'Bearer openai-key');
    assert.equal(byHost['api.deepseek.com'].options.headers.Authorization, 'Bearer deepseek-key');
    assert.equal(byHost['generativelanguage.googleapis.com'].options.headers.Authorization, 'Bearer gemini-key');
    assert.equal(byHost['api.anthropic.com'].options.headers['x-api-key'], 'anthropic-key');
    assert.equal(byHost['api.anthropic.com'].options.headers['anthropic-version'], '2023-06-01');
    assert.equal(byHost['api.anthropic.com'].options.headers.Authorization, undefined);
    assert.equal(byHost['127.0.0.1'].options.port, '11434');
    assert.equal(byHost['127.0.0.1'].options.headers.Authorization, undefined);
    assert.equal(byHost['api.anthropic.com'].body.system, 'responde corto');
    assert.equal(byHost['api.anthropic.com'].body.messages[0].role, 'user');
    assert.equal(byHost['api.openai.com'].body.model, 'gpt-4o-mini');
    assert.equal(byHost['api.deepseek.com'].body.model, 'deepseek-chat');
    assert.equal(byHost['generativelanguage.googleapis.com'].body.model, 'gemini-2.5-flash');
    assert.equal(byHost['127.0.0.1'].body.model, 'llama3.1:8b');

    console.log('provider_multi_api_compat_smoke: OK');
  } finally {
    http.request = originalHttpRequest;
    https.request = originalHttpsRequest;
    restoreEnv();
  }
}

main().catch((error) => {
  http.request = originalHttpRequest;
  https.request = originalHttpsRequest;
  restoreEnv();
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
