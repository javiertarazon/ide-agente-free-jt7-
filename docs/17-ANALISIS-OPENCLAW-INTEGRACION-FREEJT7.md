# Analisis OpenClaw para Integracion en Free JT7

Fecha: 2026-04-27

## Objetivo
Guardar un analisis reutilizable de `openclaw/openclaw` para identificar funciones/metodos que nos sirven para evolucionar Free JT7 en:
- interfaz propia profesional
- agente autonomo real
- soporte multi-proveedor robusto

## Estado de clonacion (evidencia)
- Ruta: `/home/javier28/Público/REPOSOTORIOS OPCIONALES/open claw`
- Repo valido: `git rev-parse --is-inside-work-tree => true`
- HEAD auditado: `d2786fb969` (2026-04-27)

## Capacidades relevantes detectadas en OpenClaw
Evidencia principal:
- `README.md`
- `docs/tools/index.md`
- `docs/tools/subagents.md`
- `docs/concepts/session.md`
- `docs/concepts/session-tool.md`
- `docs/concepts/model-failover.md`
- `docs/concepts/agent-runtimes.md`
- `docs/concepts/memory.md`
- `docs/gateway/configuration.md`
- `docs/web/control-ui.md`
- `docs/web/tui.md`

### 1) Runtime de agente y orquestacion
- Herramientas nativas amplias con perfiles/grupos (`tools.profile`, `tools.allow`, `tools.deny`).
- Herramientas de sesion: `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `sessions_yield`, `subagents`, `session_status`.
- Subagentes aislados, modo `fork` para heredar contexto y flujo de entrega al chat origen.

### 2) Modelos/proveedores y resiliencia
- Cadena de fallback por modelo (`primary` + `fallbacks`).
- Rotacion de auth profiles y cooldown por errores/rate-limit.
- Persistencia de override por sesion sin corromper estado global.

### 3) Seguridad/operacion
- Politicas finas de ejecucion (`exec`, `elevated`, aprobaciones, sandbox por sesion/agente).
- Auditoria de seguridad operativa (`openclaw security audit`).
- Gateway local/remoto con auth modes y superficie HTTP/WS controlada.

### 4) Interfaz y control-plane
- Control UI web con acciones de config/schema y estado runtime.
- TUI rica para operacion en caliente.
- API Gateway para chat/sesiones/eventos/health/config.

### 5) Memoria y automatizacion
- Memoria estructurada (`MEMORY.md`, diarios, `memory_search`, `memory_get`).
- Automatizacion por cron/heartbeat y background tasks.

### 6) Integracion con agentes externos
- ACP para Claude Code, Codex ACP, Gemini CLI, OpenCode, etc.
- Seleccion de runtime por sesion/agente (`pi`, `codex`, `claude-cli`, `acp`).

## Comparacion con estado actual de Free JT7
Evidencia local auditada:
- `src-js/core/openclaw-agent-runtime.js`
- `src-js/core/provider-router.js`
- `src-js/core/session-engine.js`
- `src-js/core/local-agent-runtime.js`
- `src-js/core/extension.runtime.js`
- `servidor mpc free jt7/src/index.js`

### Ya tenemos (base util)
- Panel propio con sesiones/tareas y modo `agent`/`direct`.
- Router multi-provider basico.
- Integracion OpenClaw minima por CLI (`openclaw agent --json`) y generacion de `openclaw.json`.
- MCP local con tools de documentos/browser/sistema/desktop/mt5.
- Fallback local de agente para no depender 100% de OpenClaw/Copilot.

### Brechas clave (no usado o incompleto)
- Sin uso real de `sessions_*` y `subagents` de OpenClaw en el panel.
- Sin failover robusto de auth profiles + modelo por sesion.
- Sin control-plane de gateway (estado, config schema lookup, patch seguro) dentro de la UI propia.
- Sin politica de aprobaciones equivalente a `exec approvals`/`elevated` con granularidad completa.
- Sin capa de memoria integrada con herramientas de busqueda semantica de sesion.
- Sin ACP operativo para ejecutar Free JT7 con harness externos (Claude/Codex/OpenCode) desde un mismo flujo.

## Funciones/metodos OpenClaw recomendados para adopcion

## Alta prioridad (impacto inmediato)
- `sessions_spawn`, `subagents`, `sessions_yield`:
  habilitan delegacion real, paralelismo y continuidad.
- `session_status`, `sessions_history`:
  mejoran observabilidad y continuidad en la interfaz.
- Politica de modelos:
  `primary + fallbacks` + cooldown + rotacion de auth profile.
- `tools.profile` + `tools.allow/deny` + `elevated`:
  control de riesgo por modo operativo.

## Prioridad media
- `gateway config.schema.lookup` + `config.patch`:
  editar config de forma segura desde panel.
- `cron` + `heartbeat`:
  automatizacion confiable (mantenimiento, revisiones, reporte).
- Memoria:
  `memory_search`/`memory_get` + persistencia de recuerdos operativos.

## Prioridad estrategica
- ACP (`runtime: "acp"`):
  usar Claude Code/Codex/OpenCode como backends especializados bajo un mismo front.
- Runtime selection por agente/sesion:
  separar ejecucion segun tarea (costo/calidad/latencia).

## Plan propuesto para Free JT7 (fases)

### Fase 1 - Session tools y subagentes (MVP autonomo)
1. Integrar en `SessionEngine` una ruta para `sessions_spawn`/`subagents`.
2. Exponer en panel acciones: spawn, listar, steer, cancelar, continuar.
3. Persistir relacion `taskId -> runId/sessionKey` para retomar.
Resultado esperado: autonomia real multi-turno con delegacion.

### Fase 2 - Resiliencia de modelo/proveedor
1. Extender config del panel para `model.primary` + `model.fallbacks`.
2. Agregar politica de retry/cooldown por proveedor/modelo.
3. Registrar en auditoria local la ruta efectiva usada.
Resultado esperado: menos caidas por 429/errores de proveedor.

### Fase 3 - Policy engine y aprobaciones
1. Alinear `PolicyEngine` con perfiles tipo `coding/messaging/minimal`.
2. Implementar aprobaciones de `exec` y modo elevado por tarea/sesion.
3. Añadir vista de riesgo por tarea en panel.
Resultado esperado: ejecucion potente pero controlada.

### Fase 4 - Control-plane en interfaz propia
1. Leer estado de gateway (`health/status`) desde UI.
2. Agregar editor seguro de config (lookup schema + patch).
3. Exponer reinicio controlado y diagnosticos de entorno.
Resultado esperado: operacion profesional desde una sola interfaz.

### Fase 5 - ACP e interoperabilidad avanzada
1. Crear adaptador ACP en Free JT7 para invocar runtimes externos.
2. Permitir seleccionar backend por tarea (`openclaw`, `local`, `acp:<harness>`).
3. Unificar trazabilidad y verificacion post-run entre backends.
Resultado esperado: Free JT7 como orquestador profesional tipo Codex/Claude Code.

## Criterios de aceptacion sugeridos
- 80%+ de tareas complejas resueltas en modo agente sin fallback manual.
- 0 bloqueos recurrentes por rate-limit sin fallback aplicado.
- Delegacion a subagentes visible y controlable desde el panel.
- Evidencia de verificacion por tarea guardada en auditoria.
- Cambio de backend (local/openclaw/acp) sin romper continuidad de sesion.

