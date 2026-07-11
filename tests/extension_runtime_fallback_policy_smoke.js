'use strict';

const assert = require('assert');

const {
  shouldPreferLocalExecution,
  shouldUseLocalAgentFallback,
  shouldUseProviderDirectFallback,
} = require('../src-js/core/extension.runtime.js');

async function main() {
  const gatewayError = new Error('Free JT7 (openrouter/OpenClaw agent): Bind: loopback). Start the gateway and retry.');
  assert.equal(
    shouldUseProviderDirectFallback(gatewayError),
    true,
    'fallos operativos del gateway deben intentar provider directo',
  );

  const agentResponseError = new Error('Free JT7 (openrouter/OpenClaw agent): Agent couldn\'t generate a response. Please try again.');
  assert.equal(
    shouldUseProviderDirectFallback(agentResponseError),
    true,
    'fallos genericos del agente deben intentar provider directo antes de caer a local',
  );
  assert.equal(
    shouldUseLocalAgentFallback('porque no estas usando el agente', agentResponseError),
    false,
    'preguntas conversacionales no deben caer a local por un fallo generico del agente',
  );

  const installError = new Error('LLM request failed: network connection error.');
  assert.equal(
    shouldUseLocalAgentFallback('instala git', installError),
    true,
    'acciones deterministas resolubles localmente pueden degradar a runtime local',
  );

  const configError = new Error('falta la API key del proveedor');
  configError.isConfigurationError = true;
  assert.equal(
    shouldUseLocalAgentFallback('continua', configError),
    false,
    'solicitudes vagas no deben caer a local solo por un error de configuracion',
  );
  assert.equal(
    shouldUseLocalAgentFallback('lee package.json y verifica scripts', configError),
    true,
    'lecturas/verificaciones concretas si pueden resolverse localmente ante error de configuracion',
  );
  assert.equal(
    shouldPreferLocalExecution('quieo quecrees una carpeta en el directorio siguiente: /tmp/demo el nombre de la carperta sera prueba 3'),
    true,
    'crear carpeta explicita debe priorizar herramientas locales sobre provider directo',
  );
  assert.equal(
    shouldPreferLocalExecution('porque no estas usando el agente'),
    false,
    'preguntas conversacionales no deben priorizar local execution',
  );

  console.log('extension_runtime_fallback_policy_smoke: OK');
}

main().catch((error) => {
  console.error('extension_runtime_fallback_policy_smoke: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
