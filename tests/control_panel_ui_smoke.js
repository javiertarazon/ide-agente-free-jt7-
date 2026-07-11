const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { createPanelHtml } = require("../src-js/core/control-panel.js");

function testPanelHtmlIncludesProfessionalLayoutAndActions() {
  const html = createPanelHtml({}, "Free JT7", {
    modelsByProvider: {
      openrouter: [{ label: "Model A", value: "model-a" }],
      hf: ["hf-model"],
      zai: ["zai-model"],
      clod: ["clod-model"],
    },
    defaultModelByProvider: {
      openrouter: "model-a",
      hf: "hf-model",
      zai: "zai-model",
      clod: "clod-model",
    },
  });

  assert.ok(html.includes("Chat principal de Free JT7"), "Debe renderizar un encabezado claramente chat-first");
  assert.ok(html.includes("id=\"sessions\""), "Debe incluir columna de sesiones");
  assert.ok(html.includes("id=\"chatHistory\""), "Debe incluir historial principal de chat");
  assert.ok(html.includes("appendFormattedMessageText"), "Debe renderizar mensajes de asistente con tratamiento de chat");
  assert.ok(html.includes("message-paragraph"), "Debe incluir estilos de parrafo para respuestas del chat");
  assert.ok(html.includes("message-list-item"), "Debe incluir estilos de lista para respuestas estructuradas");
  assert.ok(html.includes("id=\"tasks\""), "Debe incluir columna de tareas");
  assert.ok(html.includes("id=\"events\""), "Debe incluir columna de eventos");
  assert.ok(html.includes("data-tab=\"tasks\">Tareas</button>"), "Debe priorizar tareas como pestaña del inspector");
  assert.ok(html.includes("tab-btn active\" data-tab=\"tasks\""), "La pestaña de tareas debe abrir activa por defecto");
  assert.ok(html.includes("id=\"executionMode\""), "Debe incluir selector de modo de ejecucion");
  assert.ok(html.includes("id=\"runtimeBackend\""), "Debe incluir selector de backend runtime");
  assert.ok(html.includes("id=\"policyProfile\""), "Debe incluir selector de policy profile");
  assert.ok(html.includes("id=\"authProfile\""), "Debe incluir selector de auth profile");
  assert.ok(html.includes("id=\"fallbackProviders\""), "Debe incluir entrada de fallback providers");
  assert.ok(html.includes("value=\"direct\">modelo directo"), "En modo normal debe permitir modo directo");
  assert.ok(html.includes("id=\"activeMode\""), "Debe mostrar el modo activo en el encabezado");
  assert.ok(html.includes("id=\"activeRuntime\""), "Debe separar runtime/profile del chip de modelo");
  assert.ok(html.includes("id=\"sessionSort\""), "Debe incluir selector de orden de sesiones");
  assert.ok(html.includes("id=\"statRunning\""), "Debe incluir metricas de estado");
  assert.ok(html.includes("id=\"statSlo\""), "Debe incluir metrica SLO visible");
  assert.ok(html.includes("id=\"statRiskHigh\""), "Debe incluir metrica de riesgo alto visible");
  assert.ok(html.includes("data-tab=\"settings\""), "Debe incluir pestaña de configuracion en el inspector");
  assert.ok(html.includes("data-tab=\"status\""), "Debe incluir pestaña de estado/onboarding/SLO");
  assert.ok(html.includes("id=\"operationalStatus\""), "Debe incluir contenedor de estado operativo");
  assert.ok(html.includes("value=\"clod\""), "Debe incluir proveedor CLŌD en el panel");
  assert.ok(!html.includes("value=\"copilot\""), "El panel propio no debe ofrecer Copilot como proveedor");
  assert.ok(html.includes("data-action=\"approve\""), "Debe incluir acciones para aprobacion");
  assert.ok(html.includes("data-action=\"continue\""), "Debe incluir acción para continuar una tarea previa");
  assert.ok(html.includes("id=\"spawnSubagent\""), "Debe incluir accion para spawn de subagente");
  assert.ok(html.includes("id=\"sessionYield\""), "Debe incluir accion yield de sesion");
  assert.ok(html.includes("id=\"sessionResume\""), "Debe incluir accion resume de sesion");
  assert.ok(html.includes("id=\"controlHealth\""), "Debe incluir control health de gateway");
  assert.ok(html.includes("id=\"controlSchema\""), "Debe incluir config.schema.lookup en UI");
  assert.ok(html.includes("id=\"controlPatch\""), "Debe incluir config.patch en UI");
  assert.ok(html.includes("id=\"controlRestart\""), "Debe incluir restart runtime en UI");
  assert.ok(html.includes("verify:"), "Debe incluir estado de verificacion visible en tareas");
  assert.ok(html.includes("resultado:"), "Debe mostrar resultados en español dentro del inspector de tareas");
  assert.ok(html.includes("ruta: "), "Debe resumir la ruta efectiva de cada tarea sin exponer demasiada telemetria cruda");
  assert.ok(html.includes("modelo: "), "Debe mostrar el modelo efectivo por tarea");
  assert.ok(html.includes("acquireVsCodeApi()"), "Debe mantener integracion con VS Code webview API");
  assert.ok(html.includes("const catalogPayload = '"), "Debe inyectar el catalogo como payload serializado");
  assert.ok(html.includes("decodeBase64JsonPayload"), "Debe decodificar el catalogo de forma robusta en cliente");
  assert.ok(html.includes("normalizeProviderValue"), "Debe normalizar proveedor en cliente para evitar estados invalidos");
  assert.ok(html.includes("getEffectiveRoute"), "Debe calcular ruta/backend efectivo en cliente");
  assert.ok(html.includes("renderOperationalStatus"), "Debe renderizar onboarding y SLO operativo");
  assert.ok(html.includes("const preferredDefaultTab = 'tasks';"), "Debe persistir tareas como tab por defecto cuando no hay estado previo");
  assert.ok(html.includes("Chat principal con Free JT7"), "Debe presentar el composer como chat principal del agente");
  assert.ok(!html.includes("Consola de agente multi-provider"), "La superficie principal no debe venderse como consola multi-provider");
  assert.ok(!html.includes("router real de Free JT7"), "La vista principal no debe centrarse en el router interno");
  const controlPanelSource = fs.readFileSync(path.join(__dirname, "../src-js/core/control-panel.js"), "utf8");
  const panelHtmlSource = fs.readFileSync(path.join(__dirname, "../src-js/core/panel-html.js"), "utf8");
  assert.ok(controlPanelSource.includes("operationalStatus: await getOperationalStatusSnapshot"), "Debe enviar estado operativo desde backend del panel");
  assert.ok(controlPanelSource.includes("standaloneMode ? 'autonomous'"), "En standalone/own-ide debe forzar policy autonoma");
  assert.ok(controlPanelSource.includes("function getSloSnapshot"), "Debe calcular SLO basico desde tareas locales");
  assert.ok(panelHtmlSource.includes("capabilityPlan"), "Debe poder reflejar el plan de capacidades del runtime propio en la UI");
  assert.ok(panelHtmlSource.includes("plan: "), "Debe mostrar resumen del plan operativo/capacidades en las tarjetas de tarea");
  assert.ok(html.includes("$('modelCustom').addEventListener('input'"), "Debe sincronizar modelo manual en tiempo real");
  assert.ok(html.includes("$('provider').onchange"), "Debe mantener controlador de cambio de proveedor");
  assert.ok(html.includes("setCustomModelVisibility(false);"), "Debe limpiar modelo manual al cambiar proveedor");
  assert.ok(html.includes("$('enqueueTask').onclick = () =>"), "Debe mantener envío de tareas desde chat");
  assert.ok(html.includes("persistProviderSelection();"), "Debe persistir selección antes de acciones sensibles del panel");

  const standaloneHtml = createPanelHtml({}, "Free JT7", {
    modelsByProvider: {
      openrouter: [{ label: "Model A", value: "model-a" }],
    },
    defaultModelByProvider: {
      openrouter: "model-a",
    },
  }, {
    standaloneMode: true,
  });
  assert.ok(standaloneHtml.includes("const directModeAllowed = false;"), "En standalone debe desactivar modo directo en cliente");
  assert.ok(standaloneHtml.includes("value=\"direct\" disabled"), "En standalone el selector directo debe quedar deshabilitado");
  assert.ok(standaloneHtml.includes("panel fuerza modo agente"), "En standalone debe mostrar hint de modo agente");
}

function main() {
  testPanelHtmlIncludesProfessionalLayoutAndActions();
  process.stdout.write("control_panel_ui_smoke: ok\n");
}

try {
  main();
} catch (error) {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
}
