# Plan Integral OpenCode + OpenClaw para Free JT7

Fecha: 2026-04-27

## Objetivo
Unificar en un solo roadmap los dos analisis ya realizados:
- OpenCode (`/home/javier28/Público/REPOSOTORIOS OPCIONALES/opencode`)
- OpenClaw (`/home/javier28/Público/REPOSOTORIOS OPCIONALES/open claw`)

Meta: llevar Free JT7 a un agente profesional con:
- interfaz propia robusta
- autonomia con herramientas reales y control de riesgo
- multi-provider resiliente
- capacidad de interoperar con runtimes externos

## Sintesis de aportes por repositorio

### Aporte principal de OpenCode (base de plataforma)
- Capa de providers/modelos muy flexible (catalogo dinamico, opciones por proveedor, `baseURL`, headers, variantes).
- Arquitectura clara de runtime + server + web/desktop + ACP.
- Sistema de permisos por tool/agent (`allow/ask/deny`) y guardas operativas.
- Integracion MCP bien estructurada (local/remoto, OAuth, enable/disable).

### Aporte principal de OpenClaw (operacion de agente real)
- Herramientas de sesion maduras: `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `sessions_yield`, `subagents`, `session_status`.
- Delegacion real de subagentes con aislamiento, continuidad y entrega de resultados.
- Politica de resiliencia de modelos/auth profiles (fallbacks, cooldown, rotacion por error/rate limit).
- Control-plane operativo: gateway status/health/config patch/schema.
- ACP como runtime interoperable con harness externos (Claude/Codex/OpenCode).

## Arquitectura objetivo de Free JT7 (fusion)

### Capa 1: Provider Core (inspirada en OpenCode)
- Fuente unica de verdad de `providerID/modelID`.
- Catalogo dinamico por proveedor.
- Config avanzada por proveedor/modelo y defaults por contexto.

### Capa 2: Agent Runtime (inspirada en OpenClaw)
- `SessionEngine` con herramientas de sesion y subagentes.
- Cola de ejecucion + estados + verificacion por tarea.
- Modo agente real por defecto y fallback local seguro.

### Capa 3: Policy & Safety (fusion OpenCode/OpenClaw)
- Matriz de permisos por tool, por agente y por riesgo.
- Aprobaciones de `exec`/elevated.
- Perfilado operativo (`coding`, `messaging`, `minimal`).

### Capa 4: Control UI + Gateway
- Panel como front principal (chat + sesiones + tareas + riesgos + estado).
- Control-plane embebido (health/status/config schema lookup + patch seguro).
- Observabilidad operativa y trazabilidad por run.

### Capa 5: Interoperabilidad de runtimes
- Backends por tarea: `local`, `openclaw`, `acp:<harness>`.
- Seleccion de runtime por objetivo, costo, latencia y capacidad.

## Roadmap integral por fases

## Fase 1 - Session tools y subagentes (MVP de autonomia)
1. Integrar `sessions_spawn`/`subagents`/`sessions_yield` en `SessionEngine`.
2. Exponer controles en panel: spawn, steer, cancelar, retomar.
3. Persistir `taskId -> sessionId/runId` y continuidad visual.
Entregable: delegacion real en paralelo visible desde UI.

## Fase 2 - Resiliencia multi-provider
1. Adoptar contrato `primary + fallbacks` por sesion.
2. Agregar cooldown/retry y rotacion de auth profiles.
3. Registrar ruta efectiva y fallback aplicado en auditoria.
Entregable: menor tasa de fallos finales por 429/errores transitorios.

## Fase 3 - Policy engine profesional
1. Unificar permisos por tool con reglas `allow/ask/deny`.
2. Implementar `elevated` + aprobaciones de `exec`.
3. Añadir score de riesgo por tarea en panel.
Entregable: autonomia con limites y aprobaciones controladas.

## Fase 4 - Control-plane integrado
1. Exponer `health/status` de runtime/gateway en panel.
2. Config editor seguro (`config.schema.lookup` + `config.patch`).
3. Añadir acciones operativas (restart/diagnostico) con guardas.
Entregable: operacion diaria completa desde interfaz propia.

## Fase 5 - ACP e interoperabilidad
1. Adaptador ACP para harness externos.
2. Seleccion de backend por tarea: `local/openclaw/acp:<agent>`.
3. Unificar trazabilidad/verificacion cross-runtime.
Entregable: Free JT7 como orquestador multi-runtime.

## Fase 6 - Hardening y calidad de servicio
1. Smokes E2E por ruta (direct/agent/subagent/acp).
2. Pruebas de regresion de panel y extension instalada.
3. Presupuestos de latencia y estabilidad por ruta.
Entregable: release candidate con SLO operativo medible.

## Quick wins (proxima iteracion recomendada)
1. Ejecutar Fase 1 completa (subagentes + session tools en panel).
2. Añadir `session_status` y `sessions_history` al flujo de continuidad.
3. Introducir fallback basico `primary + fallback` con telemetria de ruta.

## Riesgos y mitigacion
- Riesgo: complejidad del runtime al mezclar rutas.
  Mitigacion: feature flags por fase + smokes dirigidos.
- Riesgo: regresiones UI por nuevos estados de sesion.
  Mitigacion: snapshot/smoke de panel por estado.
- Riesgo: costo/token por subagentes sin control.
  Mitigacion: limites por depth, timeout y modelo de subagente.
- Riesgo: superficies peligrosas en `exec`.
  Mitigacion: perfiles + aprobaciones + denylist por defecto.

## Criterios de aceptacion integral
- 80%+ de tareas complejas resueltas en modo agente con evidencia de verificacion.
- Subagentes operativos desde UI con continuidad y control de ciclo de vida.
- Fallback multi-provider funcional sin loops de error.
- Policy engine aplicando aprobaciones en tareas de riesgo alto.
- Cambio de runtime (`local/openclaw/acp`) sin romper historial de sesion.

