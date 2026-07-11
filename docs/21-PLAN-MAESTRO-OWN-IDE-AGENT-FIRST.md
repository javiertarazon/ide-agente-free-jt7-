# Plan Maestro Own-IDE Agent-First

## Objetivo del producto

`free jt7` debe ser el agente protagonista dentro de `own-ide` y su panel propio.

## Estado oficial al 2026-04-28

- Fase 1: cerrada
- Fase 2: cerrada
- Fase 3: parcial
- Fases 4, 5 y 6: pendientes

El flujo correcto es:

1. El usuario habla con `free jt7`.
2. `free jt7` decide si usar memoria, skills, tools, MCP, ejecución local o backend externo.
3. Los providers externos generan razonamiento o texto solo cuando hace falta.
4. `OpenClaw` funciona como harness opcional de ejecución, no como dueño del control-plane.
5. GitHub Copilot Chat queda solo como compatibilidad heredada.

## Validación final exigida

El producto no se considera corregido hasta que `own-ide` pueda:

- crear carpetas
- editar archivos
- instalar dependencias
- recordar contexto entre turnos
- usar modelos externos sin Copilot
- reiniciar sesión sin perder continuidad
- responder con estilo de agente real y no texto robótico
- usar skills, MCP y tools ya existentes en `.github/` y `copilot-agent/`

## Diagnóstico actual

La UI ya empezó a migrar a un shell panel-first, pero la arquitectura todavía está demasiado repartida entre:

- `control-panel.js`
- `session-engine.js`
- `provider-router.js`
- `extension.runtime.js`
- `openclaw-agent-runtime.js`
- `local-agent-runtime.js`

Problema central:

`free jt7` todavía no tiene un runtime propio lo bastante fuerte como para ser el dueño del flujo. La lógica real sigue demasiado acoplada al triángulo:

`OpenClaw -> provider directo -> fallback local`

## Arquitectura objetivo

### 1. FreeJT7 Agent Runtime

Nueva capa central.

Responsabilidades:

- intake operativo
- continuidad conversacional
- selección de ruta de ejecución
- decisión entre:
  - herramientas locales
  - skills
  - MCP
  - harness OpenClaw
  - provider directo
- normalización de respuestas visibles
- trazabilidad y verificación

No debe depender de Copilot para existir.

### 2. Control Panel como superficie principal

El panel debe ser la UI principal de trabajo:

- sesiones a la izquierda
- timeline/chat al centro
- tareas/eventos/config/estado a la derecha

La UI no debe exponer al usuario la complejidad del routing interno.

### 3. OpenClaw como adapter

`OpenClaw` debe quedar como una ruta de ejecución posible, no como centro del runtime.

Uso correcto:

- ejecutar tareas agente cuando convenga
- servir como harness/tool-runner
- degradarse sin romper identidad ni flujo de `free jt7`

### 4. Providers externos como backends

`OpenRouter`, `HF`, `CLŌD`, `ZAI`, etc.:

- no son el agente
- no deben simular acciones ejecutadas
- solo producen texto/razonamiento cuando `free jt7` lo decide

### 5. Session + Memory

La memoria de sesión debe ser operativa, no solo visual:

- historial
- tarea activa
- contexto resumido
- verificación
- reanudación tras reinicio

### 6. Copilot como compatibilidad heredada

Debe seguir existiendo, pero:

- no debe marcar la arquitectura principal
- no debe forzar rutas del panel
- no debe ser la fuente de verdad del agente

## Plan por fases

## Fase 1 — Runtime propio del agente

Objetivo:
sacar el control-plane del agente de `extension.runtime.js` y centralizarlo en `FreeJT7 Agent Runtime`.

Entregables:

- módulo runtime propio
- contratos estables para:
  - OpenClaw
  - local tools
  - provider direct
  - Copilot legacy
- tests del runtime del agente

Criterios de aceptación:

- el panel ya no depende de callbacks dispersos para comportarse como agente
- la decisión de ruta se concentra en un runtime propio
- el health del runtime del agente es visible y verificable

## Fase 2 — Panel own-ide agent-first

Objetivo:
hacer que la UI propia refleje el runtime propio y no el estado de proveedores/harness.

Entregables:

- timeline más limpio
- respuestas menos robóticas
- separación estricta entre:
  - respuesta visible
  - trazabilidad
  - eventos técnicos

Criterios de aceptación:

- el usuario siente que habla con `free jt7`, no con un router o un modelo

## Fase 3 — Continuidad real

Objetivo:
hacer persistente el estado operativo del agente.

Entregables:

- reanudación de sesión
- continuidad de tarea
- contexto operativo resumido
- restauración tras reinicio

Criterios de aceptación:

- `continua` retoma de verdad
- reiniciar `own-ide` no rompe el hilo de trabajo

## Fase 4 — Skills, MCP y tools nativos

Objetivo:
reintegrar como capacidades del agente todo lo que ya existe en `.github/skills` y `copilot-agent`.

Entregables:

- activation path claro
- resolución de skills desde el runtime del agente
- MCP/tools bajo control del agente

Criterios de aceptación:

- las capacidades no dependen del host Copilot para funcionar

## Fase 5 — Providers y OpenClaw subordinados

Objetivo:
dejar providers y OpenClaw como backends subordinados al runtime del agente.

Entregables:

- prioridades de routing coherentes
- provider directo solo cuando aplica
- OpenClaw solo como harness opcional

Criterios de aceptación:

- no más respuestas que describen acciones no ejecutadas
- no más identidad del proveedor filtrándose al usuario

## Fase 6 — Compatibilidad heredada Copilot

Objetivo:
mantener soporte sin contaminar el diseño principal.

Entregables:

- ruta secundaria estable
- flags/config separados
- menor acoplamiento en runtime y settings

## Secuencia recomendada

1. Fase 1
2. Fase 2
3. Fase 3
4. Fase 4
5. Fase 5
6. Fase 6

## Evidencia de arranque del plan

Auditoría base ejecutada el `2026-04-28`:

- `python3 skills_manager.py policy-validate`
- `python3 skills_manager.py doctor --strict`
- `python3 skills_manager.py rollout-mode`
- `python3 skills_manager.py host-mode status`
- `python3 skills_manager.py ide-detect --json`
- `python3 skills_manager.py task-run --goal "runtime-audit" --commands "Get-ChildItem" "python3 --version"`
- `python3 skills_manager.py task-list --limit 10`
- `python3 skills_manager.py task-checklist --run-id 20260428T131508Z-81891140`

## Estado

Plan guardado y activo.
La ejecución arrancó por la Fase 1 con extracción del `FreeJT7 Agent Runtime`.

## Estado actual por fase

| Fase | Estado real | Evidencia de trazabilidad |
| :--- | :--- | :--- |
| Fase 1 - Runtime propio del agente | Ejecutada | `20260428-phase1a-freejt7-agent-runtime`, `20260428-phase1b-agent-runtime-continuity`, `20260428-phase1c-agent-runtime-route-planning` |
| Fase 2 - Panel own-ide agent-first | Ejecutada | `20260428-phase2-capability-plan-runtime`, `20260428-phase2-runtime-local-dispatch`, hotfixes UI/local asociados y `20260428-phase2-formal-close-control-panel` |
| Fase 3 - Continuidad real | Ejecutada | `20260428-phase3-session-agent-state-continuity`, `20260428-phase3-formal-close-session-continuity` |
| Fase 4 - Skills, MCP y tools nativos | Ejecutada | `20260428-phase4-native-capabilities-runtime` |
| Fase 5 - Providers y OpenClaw subordinados | Ejecutada | `20260428-phase5-provider-backends-subordinated` |
| Fase 6 - Compatibilidad heredada Copilot | Ejecutada | `20260428-phase6-copilot-legacy-isolation` |

## Regla de trazabilidad del plan

Desde este punto, toda ejecucion debe quedar reflejada asi:

1. `docs/TASKS.md` debe listar la fase del plan maestro de forma explicita.
2. `copilot-agent/tasks.yaml` debe registrar el mismo run con el prefijo de fase correcto.
3. `copilot-agent/RESUME.md` debe indicar con claridad la fase vigente y cuales siguen pendientes.
4. Los hotfixes que no cambien de fase deben quedar como soporte de la fase activa, no como sustituto de una fase del plan.
