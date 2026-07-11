# Auditoria de trazabilidad y autonomia Free JT7

Fecha: 2026-04-26

## Alcance

Analisis del estado actual del proyecto Free JT7, trazabilidad de correcciones recientes y brechas frente al objetivo de operar como agente autonomo tipo Codex.

Intake asumido:
- Entregable: informe tecnico con evidencia y plan de remediacion.
- No-goals: no aplicar refactor grande ni cambios de seguridad de alto impacto en esta pasada.
- Validacion: comandos de runtime, smokes del panel, smokes de MCP/documentos, build y smoke de extension instalada.

## Resultado ejecutivo

Free JT7 ya tiene base operativa de agente, no solo wrapper de proveedor:

- Extension VS Code con panel propio, comandos y compatibilidad opcional con Copilot Chat.
- Panel chat-first con sesiones, tareas, historial, eventos y selector de modo `agent` vs `direct`.
- `SessionEngine` con cola persistente, workers, aprobaciones, reintentos, cancelacion, auditoria y verificacion derivada.
- `ProviderRouter` que separa modo agente de modo proveedor directo.
- Router Copilot multi-fase con planner, ejecutores, review, auto-fix, hooks de tools y trazabilidad por corrida.
- Runtime OpenClaw para proveedores externos en modo agente.
- Servidor MCP local con web, scraping, navegador basico, sistema, archivos, documentos/PDF, desktop, media y MT5.

## Correcciones recientes con evidencia

| Correccion | Estado | Evidencia registrada |
| :--- | :--- | :--- |
| Desacoplar panel propio de GitHub Copilot | Completado | `docs/TASKS.md`, `copilot-agent/tasks.yaml`, `copilot-agent/audit-log.jsonl`; verificado con panel smokes, bundle, package, instalacion VSIX e `installed_extension_smoke` |
| Continuidad de sesiones + runtime Copilot/OpenClaw | Completado | `openclaw_runtime_smoke`, `control_panel_ui_smoke`, `panel_execution_mode_smoke`, `build:bundle`, `package:local`, instalacion VSIX e `installed_extension_smoke` |
| Fases 2-4 de agente real | Completado | `mcp_documents_tools_smoke`, `session_engine_verification_smoke`, panel smokes, router/plugin/settings smokes y extension instalada |
| Roadmap hacia agente tipo Codex + primera remediacion MCP | Completado | `docs/14-AUDITORIA-AGENTE-REAL-FREEJT7.md`, herramientas MCP nuevas y smoke dedicado |
| Manejo OpenRouter 429/200 | Completado | `panel_rate_limit_smoke`, `openrouter_http200_smoke` y registros en `audit-log.jsonl` |

## Hallazgos de trazabilidad

- La trazabilidad reciente existe y es util, pero mezcla fuentes: `docs/TASKS.md`, `copilot-agent/tasks.yaml`, `copilot-agent/audit-log.jsonl`, `copilot-agent/RESUME.md` y `copilot-agent/runs/`.
- Hay tareas stale abiertas que deben reconciliarse antes de una release limpia:
  - `20260426-phase-5-agent-ui-browser-desktop`.
  - `20260424-panel-chat-first-tabs-model-persistence`.
  - `20260422-agente-mt5-design`.
  - `20260317-copilot-sdk-router-impl`.
  - `20260419-router-hooks-functional-blocked-gate`.
  - `20260425-openclaw-agent-external`.
- `docs/TASKS.md` tiene entradas duplicadas del router Copilot SDK y una tarea de panel chat-first antigua que parece absorbida por tareas posteriores.
- `docs/STRATEGY_LOG.md` no tiene metricas reales para la linea MT5/quant, aunque el roadmap de MT5 sigue abierto.
- `audit-log.jsonl` es parseable como JSONL, pero usa texto libre; falta enlazar cada verificacion a run id, exit code y artefacto de salida de forma uniforme.
- `RESUME.md` resume poco: no lista bloqueos activos ni siguiente accion recomendada.

## Hallazgos de autonomia

Capacidades presentes:
- Panel propio y activacion `onStartupFinished`.
- Modo `agent` por defecto y modo `direct` para probar proveedores.
- Historial conversacional persistente y contexto local automatico cuando el prompt menciona rutas.
- Multi-provider: OpenRouter, HF, ZAI, CLŌD y Copilot.
- Ruta agente externa via OpenClaw + MCP local.
- Validacion post-tarea visible en `SessionEngine` y panel.
- Smokes para panel, modo de ejecucion, verificacion, MCP/documentos, OpenClaw y extension instalada.

Brechas frente a Codex:
- El modo `direct` no tiene herramientas ni edicion real; solo llama al proveedor y devuelve texto.
- La ruta con herramientas depende de Copilot SDK o de OpenClaw instalado/configurado; no hay runtime propio integrado equivalente a shell + patch + plan + verificacion.
- El contexto automatico local es superficial; no hay indice persistente del repo, AST ni busqueda semantica.
- Algunas verificaciones pueden ser declarativas si las devuelve el modelo; falta enforcement general de ejecutar pruebas antes de cerrar.
- No hay rollback transaccional ni sandbox fuerte.
- El MCP local permite acciones amplias que requieren hardening antes de autonomia total:
  - `jt7_file_write` no restringe root por policy.
  - `jt7_file_read` no limita workspace.
  - `allowedWebDomains` acepta `*`.
  - `systemExec` permite binarios amplios como `python`, `node`, `powershell` y `cmd`.
  - MT5 tiene acciones de trading que deben tener gate explicito.

## Evidencia fresca ejecutada

OK:
- `python3 skills_manager.py policy-validate`
- `python3 skills_manager.py doctor --strict`
- `python3 skills_manager.py rollout-mode`
- `python3 skills_manager.py host-mode status`
- `python3 skills_manager.py ide-detect --json`
- `npm run test:control-panel-ui-smoke`
- `npm run test:panel-execution-mode-smoke`
- `npm run test:session-engine-verification-smoke`
- `npm run test:mcp-documents-tools-smoke`
- `npm run build:bundle`
- `npm run test:installed-extension-smoke`
- Validacion JSONL de `copilot-agent/audit-log.jsonl`

Bloqueo detectado:
- `python3 skills_manager.py task-run --run-id 20260426-runtime-audit-validation --goal "runtime-audit" --commands "Get-ChildItem" "python --version"` quedo bloqueado porque `Get-ChildItem` devolvio exit 127 en Linux. Esto evidencia que la receta obligatoria de la skill sigue siendo PowerShell-first y no totalmente portable.

Correccion aplicada despues de la auditoria:
- `skills_manager.py` ahora normaliza comandos PowerShell comunes hacia POSIX en Linux (`Get-ChildItem`, `Get-Content`, `Get-Location`, `Select-String`) y agrega fallback `python3` cuando `python` no existe.
- `src-js/core/local-agent-runtime.js` agrega una ruta local de agente con herramientas basicas para inventario/verificacion sin depender de Copilot/OpenClaw.
- `src-js/core/extension.runtime.js` usa ese fallback local cuando Copilot/OpenClaw no estan disponibles por configuracion, binario o credenciales.
- Evidencia: `20260426-runtime-audit-validation-fixed2` quedo `succeeded` con `Get-ChildItem` y `python --version`.

## Plan recomendado

1. Reconciliar trazabilidad:
   - Normalizar estados `completado`/`completada`.
   - Cerrar o marcar como absorbidas las tareas stale.
   - Hacer que `RESUME.md` incluya bloqueos activos, ultimo run y siguiente accion.
   - Enlazar verificaciones a `copilot-agent/runs/<run_id>.json`.

2. Hardening de seguridad MCP:
   - Restringir lectura/escritura a workspace o allowlist.
   - Bloquear interpretes con `-c`, `--eval`, `-Command` salvo aprobacion explicita.
   - Convertir MT5 trading en high-risk con aprobacion o flag fuerte.
   - Cambiar `allowedWebDomains: ["*"]` por allowlist configurable.

3. Paridad de autonomia:
   - Crear runtime local propio minimo para shell, patch, lectura, escritura y verificacion cuando no este Copilot/OpenClaw.
   - Mantener OpenClaw/Copilot como motores opcionales, no como unica ruta con herramientas.
   - Agregar E2E del panel en modo `agent` externo con OpenClaw mockeado.

4. Validacion:
   - Agregar smoke para provider directo que garantice estado `partial/unverified` sin evidencia real.
   - Agregar smoke de seguridad MCP para escritura fuera del workspace.
   - Rehacer la receta `runtime-audit` con comandos POSIX/PowerShell segun plataforma.
