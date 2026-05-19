'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');

const { ProviderRouter, streamCompletion } = require('../src-js/core/provider-router');

function createMockRequest(captured) {
  return (options, callback) => {
    captured.options = options;
    const req = new EventEmitter();
    req.write = (body) => {
      captured.body = body;
    };
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 200;
      callback(res);
      process.nextTick(() => {
        res.emit('data', Buffer.from('data: {"choices":[{"delta":{"content":"Ho"}}]}\n\n'));
        res.emit('data', Buffer.from('data: {"choices":[{"delta":{"content":"la"}}]}\n\n'));
        res.emit('data', Buffer.from('data: [DONE]\n\n'));
        res.emit('end');
      });
    };
    return req;
  };
}

async function main() {
  const captured = {};
  const tokens = [];
  let doneResult = null;

  const result = await streamCompletion({
    providerId: 'openrouter',
    modelId: 'openai/gpt-oss-20b:free',
    messages: [{ role: 'user', content: 'di hola' }],
    getApiKey: async () => 'test-key',
    requestImpl: createMockRequest(captured),
    onToken: (token) => tokens.push(token),
    onDone: (done) => {
      doneResult = done;
    },
  });

  assert.deepEqual(tokens, ['Ho', 'la']);
  assert.equal(result.summary, 'Hola');
  assert.equal(doneResult.summary, 'Hola');
  assert.equal(result.raw.executionRoute, 'provider-stream');
  assert.match(captured.options.hostname, /openrouter\.ai/);
  assert.equal(captured.options.headers.Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(captured.body).stream, true);

  const router = new ProviderRouter({ workspacePath: process.cwd() });
  const routed = await router.streamCompletion({
    providerId: 'hf',
    modelId: 'Qwen/Qwen2.5-7B-Instruct-Turbo',
    prompt: 'stream via instancia',
    getApiKey: async () => 'hf-key',
    requestImpl: createMockRequest({}),
  });
  assert.equal(routed.provider, 'hf');
  assert.equal(routed.summary, 'Hola');

  const localCaptured = {};
  const local = await streamCompletion({
    providerId: 'local',
    modelId: 'llama3.1:8b',
    messages: [{ role: 'user', content: 'di hola local' }],
    getApiKey: async () => '',
    requestImpl: createMockRequest(localCaptured),
  });
  assert.equal(local.provider, 'local');
  assert.equal(local.summary, 'Hola');
  assert.equal(localCaptured.options.hostname, '127.0.0.1');
  assert.equal(localCaptured.options.port, '11434');
  assert.equal(localCaptured.options.headers.Authorization, undefined);

  console.log('provider_stream_completion_smoke: OK');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
