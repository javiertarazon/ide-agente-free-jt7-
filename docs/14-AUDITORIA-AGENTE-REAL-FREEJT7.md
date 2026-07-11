# Auditoria Free JT7 hacia agente real

Fecha: 2026-04-26

## Resumen ejecutivo

Free JT7 ya no esta en estado "solo wrapper de proveedor". El repositorio tiene base real de agente:

- Panel propio chat-first con `SessionEngine`, cola, persistencia y aprobaciones.
- `ProviderRouter` con separacion `agent` vs `direct`.
- Router principal con review stage, auto-fix, hooks de tools, remote bridge y trazabilidad por corrida.
- Ruta `agent` para Copilot y ruta `agent` para proveedores externos via OpenClaw + MCP local.
- Servidor MCP local con web, sistema, escritorio y MT5.

La brecha principal no estaba en la UI sino en el alcance operativo de tools. El agente ya podia orquestar, pero todavia estaba corto en lectura de documentos/rutas/PDF y en apertura util del navegador fuera del fetch/scrape.

## Matriz de capacidades

| Capacidad objetivo | Estado actual | Evidencia | Brecha principal |
| :--- | :--- | :--- | :--- |
| Interfaz propia tipo agente | Parcialmente cumplida | `src-js/core/control-panel.js`, `tests/control_panel_ui_smoke.js` | Seguir refinando UX y estados operativos |
| Orquestacion de sesiones/tareas | Cumplida | `src-js/core/session-engine.js`, `src-js/core/provider-router.js` | Afinar colas y continuidad multi-fase |
| Modo agente vs modo LLM directo | Cumplida | `tests/panel_execution_mode_smoke.js` | Mantenerlo visible y trazable |
| Review y auto-correccion | Cumplida | `src-js/core/copilot_router.runtime.js`, `tests/router_review_stage_smoke.js` | Aumentar pruebas end-to-end con cambios reales |
| Multi-provider | Cumplida | Copilot/OpenRouter/HF/ZAI/CLŌD | Validar mas flujos reales por proveedor |
| MCP local | Cumplida | `servidor mpc free jt7/src/index.js` | Expandir herramientas de trabajo general |
| Navegador | Parcialmente cumplida | `jt7_web_fetch`, `jt7_scrape_text`, nuevo `jt7_browser_open` | Falta control fino de navegacion/interaccion |
| Archivos y directorios | Mejorada en esta fase | `jt7_file_read`, `jt7_file_write`, nuevos `jt7_path_stat`, `jt7_dir_list` | Faltan operaciones mas ricas sobre lotes y binarios |
| PDF/documentos | Mejorada en esta fase | nuevo `jt7_pdf_extract_text` | Falta parser mas profundo para PDFs complejos |
| Abrir apps locales | Cumplida de forma basica | `jt7_desktop_open` | Faltan acciones posteriores sobre ventanas/apps generales |
| Validacion real VSIX | Cumplida en esta fase | empaquetado + `code --install-extension --force` | Sumar pruebas funcionales desde VS Code abierto |

## Fase ejecutada hoy

Se reforzo el servidor MCP local con:

- `jt7_browser_open`
- `jt7_path_stat`
- `jt7_dir_list`
- `jt7_pdf_extract_text`

Tambien se agrego smoke test dedicado:

- `tests/mcp_documents_tools_smoke.js`

## Roadmap propuesto

### Fase 1
- Completar capa base de tools generalistas del agente.
- Hecho en esta iteracion para navegador basico + rutas + directorios + PDF.

### Fase 2
- Subir control operativo de navegador y documentos:
  - navegacion mas guiada
  - lectura de mas formatos
  - operaciones de seleccion/busqueda sobre documentos

Estado actual:
- Implementada en esta iteracion con `jt7_document_read` y `jt7_path_search`.
- Free JT7 ya puede leer texto/JSON/HTML/CSV/PDF y buscar por nombre o contenido dentro de rutas locales.

### Fase 3
- Fortalecer autonomia ejecutiva:
  - politicas mas finas
  - verificacion post-tarea
  - remediacion automatica de fallos repetibles

Estado actual:
- `PolicyEngine` ahora clasifica mejor tareas de instalacion/publicacion/browser/desktop/MCP/credenciales/trading.
- `SessionEngine` guarda `task.verification`, emite auditoria `task.verified` y deja visible si una tarea quedo `verified`, `partial` o `unverified`.

### Fase 4
- Endurecer experiencia instalada:
  - smokes de VSIX instalada
  - mas pruebas desde host real de VS Code
  - telemetria/auditoria operacional mas clara

Estado actual:
- Se agrego `tests/installed_extension_smoke.js`.
- La VSIX fue empaquetada, reinstalada y validada contra la extension instalada real en `~/.vscode/extensions`.
- El panel ahora muestra el estado de verificacion por tarea.

## Nota honesta

Recrear "todo Codex" de forma literal no es un cambio unico sino un programa de fases. Lo correcto tecnicamente es cerrar la paridad por capacidades, empezando por las que convierten al sistema en un agente real usable. Esta iteracion movio justo esa base.

## Resultado de la iteracion Fases 2-4

Se completaron de forma pragmatica estas piezas:

- Busqueda operativa sobre workspace/rutas.
- Lectura normalizada de documentos comunes.
- Clasificacion de riesgo mas expresiva.
- Evidencia de verificacion por tarea en runtime y panel.
- Smoke sobre extension instalada, no solo sobre el checkout local.
