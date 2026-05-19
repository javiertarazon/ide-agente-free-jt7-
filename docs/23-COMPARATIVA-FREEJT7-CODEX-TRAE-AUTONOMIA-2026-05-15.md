# Comparativa de autonomía: Free JT7 vs Codex vs Trae/SOLO

Fecha de corte: 2026-05-15.

## 1. Alcance y fuentes

Esta comparativa mide qué tan cerca está Free JT7 de comportarse como un agente autónomo completo, funcional y real con sus proveedores de modelos. Se comparan ocho dimensiones pedidas por el usuario: flujo de trabajo, desglose de solicitudes, subagentes, memoria persistente, herramientas/skills, servidores MCP, privilegios/capacidades y proveedores de modelos.

Fuentes verificadas:

- Evidencia local Free JT7: `src-js/core/freejt7-agent-runtime.js`, `src-js/core/session-engine.js`, `src-js/core/provider-registry.js`, `src-js/core/native-autonomy-doctor.js`, `src-js/core/control-panel.js`, `tools/agent_autolearn/`, `servidor mpc free jt7/`, `mcp-servers/`, `package.json` y pruebas offline.
- Doctor local ejecutado: `npm run doctor:native -- --json` el 2026-05-15, resultado `ok`, 7 secciones, 58 checks requeridos, 0 fallos y 0 warnings.
- Codex, fuente oficial OpenAI: Codex puede leer, editar y ejecutar código, y Codex Cloud puede trabajar en segundo plano/paralelo en entornos propios; el acceso a internet durante la fase agente está bloqueado por defecto y puede habilitarse por entorno; la documentación oficial lista AGENTS.md, MCP, Skills y Subagents como capacidades de configuración. Véase:
  - https://developers.openai.com/codex/cloud
  - https://developers.openai.com/codex/cloud/internet-access
  - https://developers.openai.com/learn/docs-mcp
- Trae/SOLO, fuente oficial Trae: SOLO orquesta browser, terminal, editor y herramientas; planifica, ejecuta y entrega; desglosa tareas; coordina subagentes especializados; soporta ejecución paralela; y ofrece app/IDE propios. Véase:
  - https://www.trae.ai/solo
  - https://www.trae.ai/solo-web
  - https://www.trae.ai/download

## 2. Resumen ejecutivo

Free JT7 ya está cerca de un agente autónomo real en **arquitectura local/IDE propia**: tiene panel nativo, runtime que decide rutas, proveedores múltiples, modelos locales, MCP, skills, subagentes, memoria de sesión, autoaprendizaje y pruebas offline. La brecha principal no es de “concepto”, sino de **madurez operacional**: ejecución paralela robusta estilo Codex/Trae, memoria persistente semántica de largo plazo, aislamiento/sandbox reproducible por tarea, observabilidad/evals continuos y conectores externos listos para producción.

Puntuación estimada con evidencia local y fuentes oficiales:

| Plataforma | Autonomía funcional estimada | Lectura corta |
|---|---:|---|
| Codex | 90/100 | Referencia fuerte: agente de código con entornos aislados, ejecución, PRs, MCP, skills, subagents, seguridad y tareas paralelas/cloud. |
| Trae/SOLO | 88/100 | Referencia fuerte: IDE/standalone centrado en agente, desgloses, subagentes, herramientas visuales, terminal/browser/editor y ejecución paralela. |
| Free JT7 | 76/100 | Muy avanzado como agente local own-IDE, pero aún por debajo en sandboxing, paralelismo real, memoria semántica, UX de revisión y validación live continua. |

Conclusión: Free JT7 está aproximadamente al **80-85% del patrón funcional** de un agente autónomo completo para uso local/desarrollo, y al **70-75% de la madurez operativa** de productos como Codex/Trae cuando se exige ejecución paralela, sandboxes por tarea, conectores cloud y telemetría/evals de producción.

## 3. Matriz comparativa por dimensión

Escala: 0 = ausente, 1 = básico, 2 = usable, 3 = sólido, 4 = cercano a producto completo, 5 = referencia madura.

| Dimensión | Free JT7 | Codex | Trae/SOLO | Evidencia y brecha Free JT7 |
|---|---:|---:|---:|---|
| Flujo de trabajo agente end-to-end | 4 | 5 | 5 | Free JT7 tiene panel, sesiones, runtime agent-first, provider router, doctor y offline suite. Le falta consolidar ejecución paralela visible y checkpoints/review tipo producto. |
| Desglose de solicitudes y planificación | 3 | 5 | 5 | Free JT7 infiere capacidades, acciones locales, MCP/tools y rutas; no siempre genera plan estructurado editable antes de ejecutar como Trae/SOLO. |
| Subagentes | 3 | 5 | 5 | Free JT7 tiene manifests y `spawnSubagent` desde UI/session engine. Falta aislamiento por subagente, contexto/modelo propio por subagente y coordinación paralela estable. |
| Memoria persistente | 3 | 4 | 4 | Free JT7 conserva historial de sesión, resume, audit logs y autolearn. Falta memoria semántica consultable/relevante por tarea y política clara de retención/redacción. |
| Herramientas y skills | 4 | 5 | 5 | Free JT7 tiene biblioteca grande de skills, policy profiles, tools locales y gate nativo. Falta marketplace/UX de activación y eval sistemático por skill. |
| Servidores MCP | 4 | 5 | 4 | Free JT7 incluye servidor MCP local, documentos/browser/desktop/MT5 y smokes. Falta gestión visual de múltiples servidores, permisos por servidor y transportes remotos maduros. |
| Privilegios/capacidades/sandbox | 3 | 5 | 4 | Free JT7 soporta perfiles `coding/messaging/minimal`, approvals y tool gate, pero no tiene sandbox por tarea comparable a Codex Cloud ni aislamiento fuerte tipo producto. |
| Proveedores de modelos | 4 | 4 | 4 | Free JT7 soporta OpenRouter/HF/ZAI/CLŌD/OpenAI/Anthropic/DeepSeek/Gemini/local. Falta routing dinámico por coste/calidad, benchmarking y health checks live por proveedor. |
| Instalación / own IDE | 4 | 4 | 5 | Free JT7 tiene app standalone/own-IDE, .deb/.rpm/win smoke y panel propio. Falta polish de distribución, auto-update y onboarding masivo. |
| Verificación y cierre | 4 | 5 | 4 | Free JT7 tiene `doctor:native`, `test:offline`, smokes y audit logs. Falta evaluación continua con métricas históricas, replay de tareas y dashboards de regresión. |

Promedio ponderado Free JT7: **3.6/5 = 72/100 base**, ajustado a **76/100** por amplitud real de providers, MCP, package y pruebas offline.

## 4. Flujo de trabajo comparado

### Free JT7

Flujo actual:

1. El usuario trabaja desde panel propio, chat participant opcional o scripts standalone.
2. El panel recoge proveedor, modelo, runtime backend, policy profile, fallback providers y skills.
3. `freejt7-agent-runtime` normaliza la solicitud, preserva contexto conversacional, evalúa goal local/determinístico y construye un `capabilityPlan` con skills, MCP servers, tools nativas y backend objetivo.
4. El runtime decide entre `local-agent`, `openclaw-agent`, `acp:*` o `provider-runtime`, con fallback a provider-direct/local cuando procede.
5. `session-engine` persiste sesión, cola, historial, estados, aprobaciones y subagentes.
6. `native-autonomy-doctor` valida providers, runtime, MCP/MT5, skills/subagentes, autolearn, UI y empaquetado.

Fortaleza: el control-plane ya es propio y provider-independent.

Brecha: la planificación todavía está más distribuida entre UI/runtime/local actions que presentada como plan editable y verificable antes de ejecutar.

### Codex

Flujo de referencia:

1. El usuario delega una tarea desde web/IDE/GitHub.
2. Codex crea o usa un entorno configurado, lee/edita/ejecuta código y puede trabajar en segundo plano y paralelo.
3. Usa reglas, AGENTS.md, MCP, skills y subagents según configuración.
4. Produce cambios, logs, resultados de pruebas y PR/diff revisable.
5. Internet está controlado por entorno y bloqueado por defecto durante la fase agente, con allowlists si se habilita.

Ventaja sobre Free JT7: sandbox/entorno por tarea, PR workflow y paralelismo cloud están más cerrados.

### Trae/SOLO

Flujo de referencia:

1. El usuario define una necesidad en IDE/SOLO.
2. SOLO desglosa automáticamente tareas, selecciona herramientas, planifica y ejecuta.
3. Orquesta browser, terminal, editor, documentación, integraciones y Figma.
4. Coordina subagentes especializados y puede ejecutar múltiples agentes/tareas en paralelo con modelo/contexto propio.
5. El usuario revisa resultados en una experiencia visual integrada.

Ventaja sobre Free JT7: UX agente-first, workspace visual unificado, paralelismo y coordinación de subagentes mejor posicionados como producto.

## 5. Evaluación específica pedida por el usuario

### 5.1 Desglose de solicitudes

- Free JT7: ya infiere operaciones locales (`filesystem.mkdir/read/write`, `shell.verify`, `system.install`, `git`) y selecciona MCP/tools por objetivo. Suficiente para tareas prácticas, pero debe convertirlo en un plan visible antes de ejecutar.
- Codex: patrón más maduro para tareas de ingeniería con diffs/test logs/PRs.
- Trae/SOLO: fuerte en convertir ideas en docs/TODO/planes visibles.

Estado Free JT7: **usable pero no completamente producto**.

### 5.2 Subagentes

- Free JT7: tiene `.github/agents`, `spawnSubagent` en panel, smokes de subagentes y session engine. Buen punto de partida.
- Codex: documenta Subagents como capacidad propia de configuración.
- Trae/SOLO: posiciona subagentes especializados y ejecución paralela como parte central.

Estado Free JT7: **funcional básico-sólido**, falta aislamiento y paralelismo real por subagente.

### 5.3 Memoria persistente

- Free JT7: usa `copilot-agent/RESUME.md`, `audit-log.jsonl`, `tasks.yaml`, `panel-state`, `session-engine` y `tools/agent_autolearn`. También reconstruye historial de chat desde tareas.
- Codex: usa configuración, contexto de repo y patrones de skills/AGENTS; la persistencia depende del producto/entorno.
- Trae/SOLO: presenta workspace unificado y continuidad entre dispositivos; afirma que los archivos/contexto permanecen en un workspace.

Estado Free JT7: **buena persistencia operativa**, falta memoria semántica indexada y redacción/retención más formal.

### 5.4 Herramientas y skills

- Free JT7: detectados 966 `SKILL.md`, índice/active skills, policy engine y herramientas locales/MCP.
- Codex: soporta AGENTS.md, MCP, Skills y Subagents en su sistema de configuración.
- Trae/SOLO: integra terminal, editor, browser, conectores, Figma y skills/reglas según documentación pública.

Estado Free JT7: **muy cercano en cobertura**, menos maduro en UX y evaluación automática de skills.

### 5.5 MCP servidores

- Free JT7: servidor MCP local propio, tools de documentos/browser/desktop/MT5 y servidores MT5 dedicados. El doctor lo valida offline.
- Codex: MCP es configuración oficial, y OpenAI publica Docs MCP; Codex puede conectarse a servidores MCP desde CLI/IDE.
- Trae/SOLO: documentación pública posiciona MCP y herramientas como parte de su arquitectura agente.

Estado Free JT7: **cercano**, necesita administración visual/seguridad por servidor y transporte remoto robusto.

### 5.6 Privilegios y capacidades

- Free JT7: perfiles `coding/messaging/minimal`, approvals, estados `waiting_approval`, tool gate, bloqueo destructivo y doctor. El entorno de esta tarea permite privilegios altos, pero el producto aún requiere endurecer límites.
- Codex: referencia fuerte de sandbox por tarea, red/desbloqueo por entorno, logs y revisión.
- Trae/SOLO: afirma sandbox/multicapa en material público reciente y UX de revisión visual.

Estado Free JT7: **capaz pero con riesgo**, requiere sandbox por tarea, allowlists y permisos declarativos por tool/MCP.

### 5.7 Proveedores de modelos

- Free JT7: matriz nativa con `openrouter`, `hf`, `zai`, `clod`, `openai`, `anthropic`, `deepseek`, `gemini` y `local`, incluyendo local sin API key obligatoria.
- Codex: más cerrado en modelo/plataforma, pero optimizado y maduro para coding agent.
- Trae/SOLO: ofrece modelos integrados y selección por tarea, pero menos transparente desde el repo local.

Estado Free JT7: **muy competitivo en flexibilidad**, falta medición real de calidad/coste/latencia por proveedor.

## 6. Brechas prioritarias para llegar a “agente autónomo completo”

Prioridad 1 — Plan y ejecución paralela:
- Crear un `TaskPlan` persistido con microtareas, dependencias, riesgos, tools previstas y criterios de éxito.
- Permitir ejecución paralela controlada de subagentes con workspace aislado por subtask.
- Mostrar progreso por subagente en panel.

Prioridad 2 — Sandbox y privilegios:
- Definir sandbox por tarea: directorio temporal, allowlist de rutas, allowlist de comandos, bloqueo de red por defecto y permisos por MCP server.
- Separar perfiles: `minimal`, `coding`, `system`, `trading/mt5`, `browser`.
- Registrar aprobación humana para acciones destructivas o externas.

Prioridad 3 — Memoria persistente semántica:
- Indexar `RESUME`, `audit-log`, `panel-state`, runs y docs en memoria consultable por embeddings/local vector store.
- Redactar secretos antes de persistir salidas.
- Añadir política de retención y compaction.

Prioridad 4 — Evaluación continua:
- Convertir tareas reales exitosas en regression packs.
- Medir por proveedor: éxito, latencia, coste estimado, errores, rate limits y calidad.
- Añadir dashboard local del doctor con histórico.

Prioridad 5 — UX tipo producto:
- Plan editable antes de ejecutar.
- Diff/preview/rollback por subtarea.
- Vista visual de subagentes, MCP servers activos, permisos y evidencias.

## 7. Dictamen final

Free JT7 ya no es solo una extensión dependiente de un chat externo: por la evidencia local, se comporta como un **agente nativo en fase avanzada** con runtime propio, providers múltiples, modelo local, tools, MCP, skills, subagentes, memoria operativa y pruebas offline. En comparación con Codex y Trae/SOLO, está **cerca funcionalmente**, pero todavía no alcanza la madurez de producto de un agente autónomo completo por cinco carencias: paralelismo real de subagentes, sandbox por tarea, memoria semántica de largo plazo, conectores externos/productivos y UX de review/rollback.

Lectura pragmática:

- Para tareas locales controladas, mantenimiento de repo, pruebas, documentación, panel y providers: **Free JT7 está listo para operar como agente autónomo práctico**.
- Para autonomía completa estilo Codex/Trae en producción, múltiples tareas paralelas, seguridad fuerte y continuidad cloud/multi-dispositivo: **Free JT7 necesita 3-5 iteraciones de hardening**.


## 8. Estado de cierre de la brecha cuantificada

La puntuación **76/100 no significaba que la brecha estuviera cerrada**. Para evitar alucinaciones de estado, se agregó un gate verificable en el doctor nativo y posteriormente se implementaron los cuatro bloques de evidencia requeridos:

- Script de evaluación: `src-js/core/autonomy-maturity-assessor.js`.
- Smoke de gate: `tests/autonomy_maturity_assessor_smoke.js`.
- Integración: sección `autonomyMaturity` de `node scripts/freejt7-native-autonomy-doctor.js --json`.

Resultado local actual del gate tras el cierre técnico:

| Brecha crítica | Estado | Evidencia de cierre |
|---|---|---|
| Sandboxing por tarea | Cerrada con evidencia mínima | `src-js/core/task-sandbox.js` + `tests/task_sandbox_smoke.js` |
| Paralelismo real de subagentes | Cerrada con evidencia mínima | `src-js/core/subagent-orchestrator.js` + `tests/subagent_parallel_orchestrator_smoke.js` |
| Memoria semántica persistente | Cerrada con evidencia mínima | `src-js/memory/semantic-memory-store.js` + `tests/semantic_memory_store_smoke.js` |
| UX de revisión/rollback | Cerrada con evidencia mínima | `src-js/core/review-rollback.js` + `tests/review_rollback_smoke.js` |

Por tanto, la respuesta correcta actual es: **sí, la brecha técnica del gate quedó cerrada con evidencia local mínima y pruebas offline**. Sigue siendo recomendable endurecer estas capacidades hasta nivel producto, pero el doctor ya no debe reportarlas como abiertas.
