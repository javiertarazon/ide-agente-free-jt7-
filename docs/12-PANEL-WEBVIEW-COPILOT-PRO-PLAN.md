# Plan de Implementacion - Panel Webview Free JT7 + Copilot Pro + Proveedores Externos

Fecha: 2026-04-22
Estado: aprobado para ejecucion

## Decisiones cerradas por producto

1. Framework de componentes en Webview: SI.
2. Worker pool inicial: 3 workers.
3. Persistencia: completa con auditoria.
4. Feature flag para apagar chat participant: SI.
5. Copilot Pro en simultaneo desde la primera fase: SI.

## Objetivo

Mover Free JT7 a un panel Webview propio dentro de VS Code para desacoplar la UX del host de Copilot Chat, manteniendo en paralelo:
- proveedor externo (openrouter, hf, zai)
- proveedor GitHub Copilot Pro

El control de sesiones, colas, retries, aprobaciones y auditoria se ejecuta en el runtime de la extension.

## Restriccion explicita

No tocar logica de MT5 ni trading en esta iniciativa.

## Arquitectura objetivo

### 1) UI Layer (Webview App)
- Framework: React + Zustand + Event Bus de mensajes.
- Vistas: sesiones, cola, tareas en stream, aprobaciones, auditoria, proveedores, salud runtime.
- Reconexion: handshake con sessionId y replay incremental.

### 2) Extension Host Controller
- Canal unico de mensajes Webview <-> Extension (command/event).
- Validacion de schema por comando.
- Control de ciclo de vida del panel y multiplexado de sesiones.

### 3) Session Engine
- Estado por sesion: queued, running, waiting_approval, retrying, completed, failed, canceled.
- Cola persistente con prioridad y politicas de retry.
- Cancelacion cooperativa por token.

### 4) Policy Engine (autonomia mixta)
- Low: auto ejecutar.
- Medium: auto ejecutar con auditoria reforzada.
- High: requiere aprobacion en panel.

### 5) Provider Router
- Estrategia de provider por tarea: external o copilot.
- Failover configurable y circuit breaker por provider.
- Seleccion por perfil de costo/riesgo/latencia.

### 6) Audit + Observability
- Persistencia en copilot-agent/runs + remote-bridge-state.
- Eventos estructurados por sesion.
- Metricas: latencia p50/p95, error rate, retry rate, bloqueos por policy, tiempo en cola.

## Worker pool inicial (3 workers)

Worker-1 (External-Fast)
- Default para tareas low/medium de texto general.
- Modelos externos economicos y rapidos.

Worker-2 (Copilot-Pro)
- Tareas de mayor complejidad de codigo y refactor.
- Enrutado a provider copilot con cuenta Pro.

Worker-3 (Control-Retry-HighRisk)
- Gestion de retries, tareas elevadas y reintentos post-aprobacion.
- Ejecuta solo cuando policy lo permite.

## Feature flags

- freejt7.panel.enabled = true
- freejt7.panel.workerPool.size = 3
- freejt7.panel.chatParticipant.enabled = false (opcion configurable)
- freejt7.panel.provider.copilot.enabled = true
- freejt7.panel.provider.external.enabled = true
- freejt7.panel.policy.mode = mixed

## Seguridad y gobernanza

1. Secretos solo en context.secrets.
2. Redaccion de payloads sensibles en auditoria.
3. Lista de acciones peligrosas bloqueadas por default.
4. Aprobacion obligatoria para high risk.
5. Trazabilidad completa de actor, decision, resultado y evidencia.

## Plan por fases

### Fase 0 - Contratos y base tecnica
- Definir schemas command/event.
- Definir estados de sesion y cola.
- Definir API interna SessionEngine.

Salida:
- ADR de arquitectura
- catalogo de eventos
- matriz de riesgos

### Fase 1 - Webview shell + Session Engine minimo
- Crear panel React Webview.
- Conectar start/stop/cancel/retry.
- Cola persistente basica y stream.

Salida:
- panel funcional en VS Code
- una sesion end-to-end con persistencia

### Fase 2 - Policy engine mixto
- Clasificacion de riesgo por tarea.
- UI de aprobaciones y resolucion.

Salida:
- low/medium automatico
- high con aprobacion

### Fase 3 - Provider router simultaneo
- Integrar external + copilot en paralelo.
- Selector por tarea y perfil.
- Health checks por provider.

Salida:
- rutas duales activas
- fallback controlado

### Fase 4 - Hardening
- Reconexion robusta, replay incremental.
- Retry con jitter y circuit breaker.
- Metricas y panel de salud.

Salida:
- operacion estable en sesiones largas

### Fase 5 - Migracion de UX y desacople chat
- Activar panel como interfaz principal.
- Dejar chat participant opcional por feature flag.

Salida:
- operacion primaria sin dependencia de host Copilot Chat

## Delegacion de tareas a subagentes

1. Explore - Mapa de integracion
- Input: src-js/core, src-js/runtime, package.json
- Output: inventario de puntos de acople + riesgos de ruptura
- DoD: tabla dependencias por modulo

2. openclaw - Policy engine y seguridad
- Input: flujo autonomia mixta
- Output: especificacion de reglas y aprobaciones
- DoD: reglas ejecutables por riesgo

3. free-jt7 - Session engine + cola persistente
- Input: contratos de estado y eventos
- Output: diseno tecnico de cola/workers/retries/cancel
- DoD: estados cerrados y transiciones validas

4. openclaw - Observabilidad y auditoria
- Input: eventos runtime
- Output: esquema de logs/metricas/retencion/redaccion
- DoD: trazabilidad extremo a extremo

5. free-jt7 - Provider router simultaneo
- Input: provider external + copilot
- Output: interfaz unificada y estrategia de enrutado
- DoD: fallback determinista y health checks

## Criterios de aceptacion

1. El panel ejecuta sesiones sin usar chat participant como canal principal.
2. Provider external y provider copilot funcionan en simultaneo.
3. Worker pool de 3 workers opera con cola persistente.
4. Policy mixed: high risk no ejecuta sin aprobacion.
5. Auditoria permite reconstruir cualquier ejecucion.
6. Feature flag permite activar/desactivar chat participant.

## Riesgos y mitigaciones

Riesgo: complejidad de estado en sesiones largas.
Mitigacion: maquina de estados explicita + snapshots + replay.

Riesgo: desalineacion entre adapters external y copilot.
Mitigacion: contrato unico ProviderAdapter y tests de conformidad.

Riesgo: ruido en auditoria.
Mitigacion: eventos estructurados con niveles y redaccion.

## Implementacion sugerida en archivos

- package.json (nuevos commands + settings panel)
- src-js/core/extension.runtime.js (registro de panel y feature flags)
- src-js/core/provider-router.js (nuevo)
- src-js/core/session-engine.js (nuevo)
- src-js/core/policy-engine.js (nuevo)
- src-js/core/audit-bus.js (nuevo)
- src-js/webview/panel/* (nuevo frontend webview)

## Verificacion

- Smoke E2E: crear sesion, encolar 3 tareas, resolver 1 high-risk, completar run.
- Resiliencia: recargar ventana VS Code durante ejecucion y recuperar estado.
- Proveedores: 1 tarea por external y 1 tarea por copilot en misma sesion.
- Auditoria: validar evidencia en copilot-agent/runs y remote-bridge-state.
