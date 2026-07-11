'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const https = require('https');

const { callProvider } = require('../src-js/core/api-provider-adapter');

const originalRequest = https.request;
const originalApiKey = process.env.OPENROUTER_API_KEY;

function installMockResponse(statusCode, body) {
  https.request = (options, callback) => {
    const req = new EventEmitter();
    req.write = () => {};
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = statusCode;
      callback(res);
      process.nextTick(() => {
        res.emit('data', Buffer.from(JSON.stringify(body), 'utf8'));
        res.emit('end');
      });
    };
    req.destroy = (error) => {
      process.nextTick(() => req.emit('error', error));
    };
    return req;
  };
}

async function main() {
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  installMockResponse(200, {
    error: {},
    choices: [
      {
        message: {
          content: [
            { type: 'text', text: 'respuesta valida desde payload ambiguo' },
          ],
        },
      },
    ],
  });

  try {
    const result = await callProvider(
      'probar openrouter http 200 ambiguo',
      { provider: 'openrouter', model: 'google/gemma-4-31b-it:free' },
      null,
      { workspacePath: process.cwd() },
    );

    assert.match(
      result.final.summary,
      /respuesta valida desde payload ambiguo/i,
      'una respuesta 200 con contenido valido no debe convertirse en error',
    );

    console.log('openrouter_http200_smoke: OK');
  } finally {
    https.request = originalRequest;
    if (typeof originalApiKey === 'string') {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  }
}

main().catch((error) => {
  https.request = originalRequest;
  if (typeof originalApiKey === 'string') {
    process.env.OPENROUTER_API_KEY = originalApiKey;
  } else {
    delete process.env.OPENROUTER_API_KEY;
  }
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});