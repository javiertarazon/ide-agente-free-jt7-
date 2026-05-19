# Roadmap de Ejecucion Autonoma

## Reglas de uso
- Este archivo es la fuente de verdad de progreso.
- Toda tarea compleja se divide en micro-tareas.
- Cada item debe cambiar de `[ ]` a `[x]` al completarse.
- Si una tarea falla, agregar sub-item de remediacion y reintento.

## Publicacion remota own-ide agent-first (2026-04-28)
- [x] Objetivo principal: publicar en el remoto nuevo el estado actual de Free JT7 con runtime own-ide agent-first, incluyendo codigo, documentacion y artefactos generados
  - [x] Intake obligatorio resuelto con el usuario: entregable = commits logicos; alcance = incluir artefactos generados; validacion = remoto actualizado + documentacion final resumida
  - [x] Resolver skills aplicables: `using-superpowers`, `make-repo-contribution`, `verification-before-completion`
  - [x] Revisar guias de contribucion y estado Git actual
  - [x] Resumir documentacion final de las ultimas modificaciones en README/CHANGELOG
  - [x] Agrupar cambios en commits logicos y preparar remoto destino
  - [x] Empujar rama publicada al repositorio remoto indicado
  - [x] Cerrar trazabilidad y actualizar `copilot-agent/RESUME.md`
  - [x] Excluir solo binarios bloqueados por GitHub (>100 MB) y dejar constancia operativa

## Alineacion con el plan maestro
- [x] Fase 1 - Runtime propio del agente
  - [x] `20260428-phase1a-freejt7-agent-runtime`
  - [x] `20260428-phase1b-agent-runtime-continuity`
  - [x] `20260428-phase1c-agent-runtime-route-planning`
- [x] Fase 2 - Panel own-ide agent-first
  - [x] `20260428-phase2-capability-plan-runtime`
  - [x] `20260428-phase2-runtime-local-dispatch`
  - [x] Hotfixes de soporte UI/local: chat-first, fallback local, create-directory incompleto
  - [x] `20260428-phase2-formal-close-control-panel`
- [x] Fase 3 - Continuidad real
  - [x] `20260428-phase3-session-agent-state-continuity`
  - [x] `20260428-phase3-formal-close-session-continuity`
- [x] Cierre formal integrado en `20260428-phase256-parallel-integration`
- [x] Fase 4 - Skills, MCP y tools nativos
  - [x] `20260428-phase256-parallel-integration`
  - [x] `20260428-phase4-native-capabilities-runtime`
- [x] Fase 5 - Providers y OpenClaw subordinados
  - [x] `20260428-phase256-parallel-integration`
  - [x] `20260428-phase5-provider-backends-subordinated`
- [x] Fase 6 - Compatibilidad heredada Copilot
  - [x] `20260428-phase6-copilot-legacy-isolation`
  - [x] Coordinacion paralela mantenida desde `20260428-phase256-parallel-integration` sin bloquear el cierre dedicado

## Regla de lectura
- Las entradas siguientes pueden incluir subfases y hotfixes.
- La referencia oficial de avance por fase es la seccion "Alineacion con el plan maestro".

## Fases 2-6 cierre formal paralelo e integracion central (2026-04-28)
- [x] Objetivo principal: cerrar formalmente las Fases 2, 3, 4, 5 y 6 del plan maestro con workers paralelos por ownership y una integracion central en `own-ide`
  - [x] Abrir run trazable `20260428-phase256-parallel-integration`
  - [x] Fase 2: cerrar panel own-ide agent-first y flujo operativo principal
  - [x] Fase 3: cerrar continuidad real y reanudacion de sesiones
  - [x] Fase 4: runtime propio despacha skills, MCP y tools nativos con ownership explicito
  - [x] Fase 5: providers externos y OpenClaw quedan subordinados al runtime propio como backends
  - [x] Fase 6: compatibilidad Copilot queda aislada como ruta heredada secundaria
  - [x] Integrar cambios en `extension.runtime`, `session-engine` y `control-panel`
  - [x] Verificar smokes runtime/panel/proveedor, build, package, `app:own-ide:setup` e `installed_extension_smoke`

## Fase 6 formal aislamiento Copilot legacy (2026-04-28)
- [x] Objetivo principal: cerrar formalmente la Fase 6 aislando `Copilot` como compatibilidad heredada secundaria dentro de `src-js/core/copilot_router.runtime.js`, sin contaminar el flujo principal own-ide agent-first
  - [x] Intake obligatorio resuelto por contexto del usuario: entregable = cierre tecnico + pruebas dedicadas + trazabilidad; restricciones = ownership exclusivo del router legacy y sin invadir archivos de otros workers; validacion esperada = smokes del router y verificacion ligera del bundle si no rompe ownership
  - [x] Resolver skills aplicables: sin skill local especializada obligatoria para este frente puntual
  - [x] Decision de delegacion: no delegar porque el usuario acoto ownership a `copilot_router.runtime.js` y hay ediciones concurrentes fuera de esa frontera
  - [x] Separar configuracion/flags de compatibilidad Copilot del `apiProvider` principal
  - [x] Hacer explicita la ruta legacy secundaria en metadata y flujo del router
  - [x] Agregar pruebas dedicadas para fijar el aislamiento legacy
  - [x] Verificar `router_core_concurrency_smoke`, `router_review_stage_smoke`, nuevo smoke dedicado y `build:bundle`

## Fase 4 cierre formal runtime propio para skills, MCP y tools nativos (2026-04-28)
- [x] Objetivo principal: cerrar formalmente la Fase 4 dentro del ownership del runtime propio para que Free JT7 deje trazado y bajo su control el activation path y dispatch de skills, snapshot MCP y tools nativos del panel own-ide
  - [x] Intake obligatorio resuelto por continuidad: entregable = runtime propio duenio de seleccion/despacho de skills/MCP/tools nativos para tareas del panel; restricciones = cambios minimos compatibles sin tocar ownership de providers/OpenClaw/Copilot fuera del scope; validacion = smokes runtime/local/MCP/tools tocados + evidencia de `capabilityPlan`/`dispatch`
  - [x] Resolver skills aplicables: sin skill local especializada adicional para este frente puntual de runtime/tests
  - [x] Decision de delegacion: no delegar por ownership explicito concentrado en `freejt7-agent-runtime`, `local-agent-runtime` y sus smokes asociados
  - [x] Auditar estado actual de `capabilityPlan`, selected skills, snapshot MCP y despacho local bajo el runtime propio
  - [x] Implementar trazabilidad nativa del runtime para activation path y dispatch independiente del provider
  - [x] Ajustar smokes de runtime/local/MCP/subagentes para fijar evidencia del cierre de Fase 4
  - [x] Ejecutar verificacion focalizada y cerrar trazabilidad/documentacion de fase

## Fase 5 formal providers y OpenClaw subordinados (2026-04-28)
- [x] Objetivo principal: subordinar providers externos y OpenClaw al runtime propio de Free JT7, reduciendo filtraciones de control-plane y dejando trazabilidad de backend subordinado
  - [x] Intake obligatorio asumido: entregable = cierre exacto de Fase 5 + cobertura smoke de backend subordinado; restricciones/no-goals = cambios minimos y compatibles dentro del ownership asignado, sin revertir trabajo concurrente ni mezclar Fase 6; validacion = smokes de router/runtime/provider-registry bajo ownership
  - [x] Resolver skills aplicables: sin skill local especializada aplicable a este frente runtime/router puntual
  - [x] Decision de delegacion: no delegar por ownership concentrado en `provider-router`, `freejt7-agent-runtime`, `openclaw-agent-runtime`, `provider-registry` y sus smokes
  - [x] Registrar run `20260428-phase5-provider-backends-subordinated` en trazabilidad local
  - [x] Hacer que el runtime propio publique ownership explicito del control-plane y trate OpenClaw/provider directo como backends subordinados
  - [x] Reducir exposicion visible del proveedor/backend en `provider-router` conservando metadata tecnica para diagnostico
  - [x] Cubrir ruta agente con smokes de provider/OpenClaw subordinados
  - [x] Ejecutar verificacion focalizada y cerrar formalmente la Fase 5
  - [x] Ejecutar verificacion focalizada y cerrar trazabilidad/documentacion de fase

## Fase 3 inicial continuidad de sesion persistida en agent state (2026-04-28)
- [x] Objetivo principal: reforzar `continua` y la reanudacion del trabajo con un estado de sesion persistido del agente, en vez de depender solo del historial crudo
  - [x] Persistir `agentState` por sesion en `session-engine`
  - [x] Pasar `sessionAgentState` al runtime propio al ejecutar tareas
  - [x] Enriquecer prompts breves de continuidad (`continua`, `retoma`, etc.) con contexto persistido del agente
  - [x] Verificar `freejt7_agent_runtime_smoke`, `session_engine_context_smoke`, `build:bundle`, `package:local`, `app:own-ide:setup`, `installed_extension_smoke`

## Fase 2 cierre formal panel own-ide agent-first (2026-04-28)
- [x] Objetivo principal: declarar cerrada la Fase 2 dejando el panel como superficie principal chat-first de Free JT7, con tareas/eventos/configuracion en inspector lateral y menor tono de dashboard/router
  - [x] Intake obligatorio asumido por continuidad: entregable = cierre de Fase 2 por codigo + smokes + trazabilidad local; restricciones/no-goals = cambios minimos compatibles dentro de `control-panel.js` y smokes bajo ownership sin reescribir workers ajenos; validacion = smokes del panel + sintaxis webview + `build:bundle`
  - [x] Resolver skills aplicables: sin skill local especializada obligatoria para este frente puntual de webview/panel
  - [x] Decision de delegacion: no delegar porque el usuario acoto ownership a `control-panel.js` y tres smokes, y habia ediciones concurrentes fuera de esa frontera
  - [x] Auditar el shell actual para detectar restos visibles de lenguaje/control-plane tipo dashboard
  - [x] Ajustar `src-js/core/control-panel.js` para priorizar chat principal, pestaña lateral de tareas por defecto y copy agent-first
  - [x] Reducir la carga de telemetria cruda en las tarjetas de tarea, manteniendo trazabilidad y ruta efectiva en el inspector
  - [x] Actualizar `tests/control_panel_ui_smoke.js` para fijar el contrato de Fase 2 cerrada
  - [x] Verificar `control_panel_ui_smoke`, `control_panel_state_regression_smoke`, `panel_execution_mode_smoke`, `control_panel_script_syntax_smoke` y `build:bundle`
  - [x] Cerrar trazabilidad local y marcar oficialmente la Fase 2 como completada

## Fase 3 cierre formal continuidad real de sesion (2026-04-28)
- [x] Objetivo principal: cerrar la Fase 3 demostrando continuidad real aunque el estado previo no este perfecto y aunque haya reinicio con tareas interrumpidas
  - [x] Reconstruir `agentState` desde tareas persistidas cuando falte o quede legado/incompleto
  - [x] Actualizar `agentState` al recuperar tareas interrumpidas por reinicio para que `continua` retome el estado correcto
  - [x] Verificar reanudacion de sesion (`yield/resume`) y continuidad tras reinicio con smokes bajo ownership
  - [x] Cerrar trazabilidad y marcar Fase 3 como completada si la evidencia queda verde

## Fase 2 siguiente despacho real de acciones locales desde el runtime propio (2026-04-28)
- [x] Objetivo principal: mover la preparacion real de acciones locales al `FreeJT7 Agent Runtime`, para que el runtime no solo planifique sino que despache `actions` explicitas hacia el fallback local
  - [x] Exponer derivacion reusable de acciones locales desde `local-agent-runtime`
  - [x] Hacer que `freejt7-agent-runtime` prepare `actions` explicitas y las pase a `runLocalAgentTask`
  - [x] Reflejar el ownership del despacho dentro de `capabilityPlan`
  - [x] Verificar `freejt7_agent_runtime_smoke`, `session_engine_context_smoke`, `provider_router_failover_smoke`, `control_panel_ui_smoke`, `build:bundle`, `package:local`, `app:own-ide:setup`, `installed_extension_smoke`

## Hotfix aclaracion operativa para "crea la carpeta" incompleto (2026-04-28)
- [x] Objetivo principal: evitar que el fallback local responda con auditoria generica cuando el usuario pide crear una carpeta sin dar ruta o nombre suficientes
  - [x] Detectar intent incompleto de create-directory en `local-agent-runtime`
  - [x] Responder con peticion concreta del dato faltante en estilo agente, no con "auditoria basica"
  - [x] Agregar smoke de regresion para `crea la carpeta`
  - [x] Verificar `local_agent_runtime_smoke`, `build:bundle`, `package:local`, `app:own-ide:setup`, `installed_extension_smoke`
  - [x] Vinculacion al plan maestro: soporte operativo de la Fase 2, no sustituto de Fase 4/5/6

## Fase 2 inicial plan de capacidades y MCP dentro del runtime propio (2026-04-28)
- [x] Objetivo principal: mover la seleccion de capacidades al `FreeJT7 Agent Runtime`, para que skills, tools locales y disponibilidad MCP formen parte del plan operativo de cada tarea y no de inferencias dispersas del panel/router
  - [x] Hacer que el runtime propio construya `capabilityPlan` dentro de `planTaskExecution()`
  - [x] Incluir `toolMode`, operaciones locales inferidas, skills seleccionadas y snapshot MCP en el plan
  - [x] Persistir `capabilityPlan` dentro de `routePlan/executionPlan`
  - [x] Hacer visible el plan de capacidades en las tarjetas de tarea del panel
  - [x] Verificar `freejt7_agent_runtime_smoke`, `provider_router_failover_smoke`, `session_engine_context_smoke`, `control_panel_ui_smoke`, `build:bundle`, `package:local`, `app:own-ide:setup`, `installed_extension_smoke`

## Fase 1C planificacion operativa por tarea dentro del runtime propio (2026-04-28)
- [x] Objetivo principal: mover la decision operativa por tarea al `FreeJT7 Agent Runtime`, para que el agente elija de forma centralizada local/OpenClaw/ACP/provider directo y deje un plan persistido por tarea en el panel
  - [x] Hacer que el runtime propio exponga `planTaskExecution()` con ownership de la ruta primaria y fallbacks
  - [x] Priorizar ejecucion local inmediata para objetivos deterministas resolubles sin pasar por OpenClaw
  - [x] Hacer que `provider-router` preserve `executionPlan` al envolver respuestas del runtime agente
  - [x] Persistir `routePlan` en `session-engine` al encolar tareas para que el panel pueda reflejar la ruta prevista antes del resultado final
  - [x] Hacer que el panel use `routePlan` como fallback de visualizacion cuando aun no hay intentos exitosos
  - [x] Verificar `freejt7_agent_runtime_smoke`, `provider_router_failover_smoke`, `session_engine_context_smoke`, `build:bundle`, `package:local`, `app:own-ide:setup`, `installed_extension_smoke`

## Fase 1B continuidad y contexto dentro del runtime propio (2026-04-28)
- [x] Objetivo principal: mover continuidad conversacional y armado de contexto al `FreeJT7 Agent Runtime`, reduciendo la dependencia del router general para la ruta agente del panel
  - [x] Hacer que el runtime propio construya `conversationRequest` y `serializedGoal`
  - [x] Hacer que `provider-router` delegue agent routes al runtime propio cuando exista
  - [x] Reusar el contexto serializado también para la rama Copilot heredada cuando aplique
  - [x] Añadir cobertura de smoke para continuidad del runtime propio
  - [x] Verificar `freejt7_agent_runtime_smoke`, `provider_router_failover_smoke`, `session_engine_context_smoke`, `build:bundle`, `package:local`, `app:own-ide:setup`, `installed_extension_smoke`

## Fase 1A runtime propio del agente Free JT7 (2026-04-28)
- [x] Objetivo principal: extraer un `FreeJT7 Agent Runtime` propio y conectarlo al panel para que la orquestacion del modo agente deje de vivir dispersa entre callbacks de `extension.runtime`
  - [x] Crear modulo `freejt7-agent-runtime.js` con ownership explicito del flujo agente
  - [x] Integrarlo con `extension.runtime`, `control-panel` y `provider-router`
  - [x] Agregar smoke dedicada del runtime propio
  - [x] Guardar plan maestro en MD dedicado para continuidad de la refactorizacion
  - [x] Verificar `freejt7_agent_runtime_smoke`, `provider_router_failover_smoke`, `control_panel_ui_smoke`, `build:bundle`, `package:local`, `app:own-ide:setup`, `installed_extension_smoke`

## Auditoria de rumbo y plan maestro own-ide agent-first (2026-04-28)
- [x] Objetivo principal: reencauzar Free JT7 para que `own-ide` y el panel propio sean la experiencia principal agent-first, con OpenClaw como harness opcional y providers externos como backends, no como dueños del flujo
  - [x] Intake resuelto con el usuario: entregable = plan maestro de correccion de arquitectura y producto; restricciones = compatibilidad heredada con Copilot solo como modo secundario; validacion = crear carpetas, editar archivos, instalar dependencias, continuidad entre turnos, modelos externos sin Copilot, reinicio con memoria y respuesta estilo agente real
  - [x] Resolver skills aplicables: `agent-orchestration`, `free-jt7-global-runtime-audit`, `verification-before-completion`
  - [x] Decision de delegacion: no delegar en esta fase porque primero necesito fijar arquitectura objetivo, backlog y criterios de aceptacion sobre evidencia fresca del runtime
  - [x] Ejecutar auditoria base fresca del runtime/panel siguiendo el checklist de Free JT7
  - [x] Contrastar arquitectura actual contra objetivo agent-first definido por el usuario
  - [x] Definir backlog por frentes: control-plane agente, UI own-ide, session/memory, tools/MCP, providers/harness y compatibilidad heredada Copilot
  - [x] Entregar plan maestro por fases con criterios de aceptacion y secuencia recomendada de implementacion

## Hotfix ejecucion local real para acciones operativas del agente (2026-04-28)
- [x] Objetivo principal: hacer que el modo agente degradado ejecute de verdad acciones locales deterministas como crear carpetas e inspeccionar rutas, y que responda con resultado verificado en lugar de texto robotico o alucinaciones del provider directo
  - [x] Intake obligatorio asumido por continuidad: entregable = fallback local mas parecido al comportamiento de un agente ejecutor; restricciones = cambios minimos compatibles, sin abrir operaciones destructivas; validacion = smokes runtime/fallback + build/package/setup own-ide
  - [x] Resolver skills aplicables: sin skill local especializada adicional para este frente runtime
  - [x] Decision de delegacion: no delegar porque el ownership estaba concentrado entre `local-agent-runtime.js`, `extension.runtime.js` y smokes del mismo flujo
  - [x] Implementar acciones locales de `mkdir` e inspeccion de rutas/directorios, incluyendo rutas absolutas explicitas del usuario
  - [x] Priorizar fallback local sobre provider directo cuando la solicitud es claramente ejecutable de forma local
  - [x] Simplificar la respuesta visible para acciones resueltas (`carpeta creada`, `git ya estaba instalado`, etc.)
  - [x] Agregar regresiones de smoke para crear carpeta e inspeccionar directorio
  - [x] Recompilar, reempaquetar, reinstalar `own-ide` y cerrar trazabilidad

## Hotfix bytes nulos en argumento CLI del agente OpenClaw (2026-04-28)
- [x] Objetivo principal: corregir el fallo donde el modo agente revienta antes de ejecutar por pasar `--message` con bytes nulos al proceso `openclaw agent`
  - [x] Intake obligatorio asumido por continuidad: entregable = saneamiento del payload conversacional/CLI para que el agente vuelva a invocarse; restricciones = cambio minimo y compatible; validacion = smokes chat-context/OpenClaw/runtime + build/package/setup own-ide
  - [x] Resolver skills aplicables: sin skill local especializada adicional para este bug de serializacion/CLI
  - [x] Decision de delegacion: no delegar porque el ownership estaba concentrado entre `chat-context.js`, `openclaw-agent-runtime.js` y smokes del mismo contrato
  - [x] Reproducir la nueva causa real desde la evidencia del panel (`args[12]` con null bytes)
  - [x] Sanear serializacion conversacional para eliminar `\0` en system prompt, historial y solicitud actual
  - [x] Sanear `buildOpenClawAgentArgs()` para que nunca emita argumentos con bytes nulos
  - [x] Agregar cobertura de smoke para contexto conversacional y args del CLI
  - [x] Recompilar, reempaquetar, reinstalar `own-ide` y cerrar trazabilidad

## Hotfix politica de fallback agente->provider->local (2026-04-28)
- [x] Objetivo principal: corregir la politica operativa del modo agente para que Free JT7 no degrade a runtime local ante fallos genericos del motor principal si la solicitud no es resoluble localmente
  - [x] Intake obligatorio asumido por continuidad: entregable = ruta de ejecucion mas parecida a OpenCode/OpenClaw (`agent -> provider direct -> local solo si aplica`); restricciones = cambios minimos compatibles y reinstalacion own-ide; validacion = smokes runtime/fallback + build/package/setup
  - [x] Resolver skills aplicables: sin skill local especializada adicional para este contrato de runtime/fallback
  - [x] Decision de delegacion: no delegar porque el ownership estaba concentrado en `extension.runtime.js`, `local-agent-runtime.js` y smokes del mismo flujo
  - [x] Auditar la politica real de fallback y confirmar que cualquier error OpenClaw estaba habilitando respuestas locales indebidas
  - [x] Reforzar `shouldUseProviderDirectFallback()` para fallos operativos/transitorios del agente/proveedor
  - [x] Restringir `shouldUseLocalAgentFallback()` para que dependa del objetivo real y solo permita degradacion local en tareas deterministas resolubles
  - [x] Agregar smoke dedicada de politica de fallback
  - [x] Recompilar, reempaquetar, reinstalar `own-ide` y cerrar trazabilidad

## Hotfix autostart del gateway OpenClaw en own-ide (2026-04-28)
- [x] Objetivo principal: evitar que Free JT7 degrade a fallback local porque el gateway OpenClaw no arranca o no se sondea correctamente en el runtime aislado de `own-ide`
  - [x] Intake obligatorio asumido por continuidad: entregable = arranque/sonda automatica del gateway en modo agente; restricciones = cambios minimos compatibles; validacion = smokes OpenClaw/panel + build/package/setup own-ide
  - [x] Resolver skills aplicables: sin skill local especializada adicional para este hotfix runtime
  - [x] Decision de delegacion: no delegar porque el ownership sigue concentrado entre `extension.runtime.js`, helpers OpenClaw y smokes del mismo contrato
  - [x] Reproducir la causa real y confirmar que `gateway status` entrega mejor señal que `gateway health` para readiness en este entorno
  - [x] Implementar autostart/polling del gateway con el config/state aislado de Free JT7 antes de invocar `openclaw agent`
  - [x] Ajustar smokes y ejecutar verificacion ligera
  - [x] Reempaquetar/reinstalar `own-ide` y cerrar trazabilidad/memoria

## Refactor shell inspirado en OpenCode + saneamiento del fallback local (2026-04-28)
- [x] Objetivo principal: dejar el panel menos dashboard y mas shell de sesion tipo OpenCode, y corregir que el fallback local contamine la solicitud actual con historial previo
  - [x] Intake asumido por continuidad: entregable = shell visual mas cercano a OpenCode + fallback local mas coherente; restricciones = no portar OpenCode completo dentro del webview; validacion = smokes panel/runtime + build/package/setup own-ide
  - [x] Resolver skills aplicables: sin skill local especializada adicional para este frente webview/runtime
  - [x] Decision de delegacion: no delegar porque el cambio cruza `control-panel.js`, `local-agent-runtime.js` y sus smokes asociados
  - [x] Auditar estructura de OpenCode local para identificar el shell reutilizable (sesiones a la izquierda, timeline central, inspector lateral)
  - [x] Refactorizar el panel a un layout de tres columnas con shell visual inspirado en OpenCode
  - [x] Corregir heuristicas del fallback local para priorizar `Solicitud actual` y no arrastrar `system_install` desde el historial
  - [x] Mejorar explicacion operacional del fallback para errores gateway/auth/network
  - [x] Verificar, reempaquetar e instalar en `own-ide`

## Hotfix gateway OpenClaw stale provider + latest request focus (2026-04-28)
- [x] Objetivo principal: corregir el fallo real donde el gateway no arranca por providers custom stale en `openclaw.json` y donde el fallback local sigue leyendo la solicitud equivocada dentro del prompt auditado
  - [x] Confirmar en la instalacion real que el bundle nuevo estaba cargado y que el fallo no era solo de despliegue
  - [x] Reproducir el arranque real del gateway con el config del workspace y capturar la causa exacta (`CLOD_API_KEY` faltante por provider stale)
  - [x] Limpiar `models.providers.clod` cuando el provider activo ya no es `clod`
  - [x] Hacer que `extractFocusedGoal()` tome la ultima `Solicitud actual` / `Objetivo solicitado`
  - [x] Verificar con smokes y arranque manual del gateway saneado
  - [x] Reempaquetar, reinstalar `own-ide` y dejar evidencia

## Refactor chat principal e inspector lateral Free JT7 (2026-04-27)
- [x] Objetivo principal: corregir la interfaz del panel para que funcione como chat principal profesional y deje tareas, eventos y configuracion como inspector lateral sin respuestas tipo log crudo
  - [x] Intake obligatorio asumido: entregable = UI chat-first mas clara + respuesta local/fallback legible; restricciones = cambios minimos compatibles; validacion = smokes de panel/runtime + build bundle
  - [x] Resolver skills aplicables: sin skill local especializada disponible para este frente UI/runtime puntual
  - [x] Decision de delegacion: no delegar por ownership concentrado en `control-panel.js`/`local-agent-runtime.js` y working tree con cambios paralelos
  - [x] Auditar ultimas tareas/memoria/documentos MD para confirmar causas recurrentes
  - [x] Refactorizar resumen visible del runtime local/fallback para que sea respuesta conversacional y no inventario tecnico
  - [x] Mejorar tratamiento visual del chat, manteniendo detalles tecnicos en inspector
  - [x] Actualizar smokes y ejecutar verificacion ligera
  - [x] Cerrar trazabilidad en `copilot-agent/` y memoria si aplica

## Hotfix autonomia real modo agente own-ide (2026-04-27)
- [x] Objetivo principal: evitar que el modo agente de Free JT7 degrade a rutas no autonomas por locks/gateway de OpenClaw y asegurar politica autonoma en perfiles propios
  - [x] Intake obligatorio asumido: entregable = modo agente mas autonomo y con permisos completos en own-ide; restricciones = compatible con perfil normal; validacion = smokes OpenClaw/panel/policy + build bundle
  - [x] Resolver skills aplicables: sin skill local especializada adicional para este hotfix runtime
  - [x] Decision de delegacion: no delegar porque el cambio cruza `extension.runtime.js`, `openclaw-agent-runtime.js`, bootstrap y smokes sobre el mismo contrato
  - [x] Sanear locks obsoletos de OpenClaw y usar id de sesion por tarea para evitar bloqueo entre solicitudes
  - [x] Forzar `freejt7.panel.policy.mode=autonomous` en standalone/own-ide
  - [x] Agregar/actualizar smokes y ejecutar verificacion ligera
  - [x] Cerrar trazabilidad y memoria

## Hotfix acciones de sistema en runtime local (2026-04-27)
- [x] Objetivo principal: hacer que el fallback local del agente ejecute o resuelva correctamente solicitudes concretas de sistema como `instala git`
  - [x] Intake obligatorio asumido: entregable = respuesta operativa a instalaciones basicas; restricciones = segura, compatible y sin comandos arbitrarios; validacion = smoke local + panel + bundle + reinstalacion own-ide
  - [x] Resolver skills aplicables: sin skill local especializada adicional para este hotfix runtime
  - [x] Decision de delegacion: no delegar porque el cambio es acotado al runtime local, smokes y reinstalacion del perfil propio
  - [x] Detectar intenciones de instalacion soportadas en `local-agent-runtime`
  - [x] Implementar accion de sistema segura para `git` con verificacion e instalacion condicionada
  - [x] Ajustar la respuesta visible para no caer en auditoria generica cuando la accion ya fue resuelta
  - [x] Actualizar smokes, recompilar, reempaquetar e instalar en `own-ide`
  - [x] Cerrar trazabilidad y memoria

## Auditoria integral interfaz/runtime/autonomia Free JT7 (2026-04-27)
- [ ] Objetivo principal: auditar de extremo a extremo Free JT7 para confirmar rutas reales de interfaz, runtime, proveedores externos, own-ide y autonomia, y preparar refactor guiado por evidencia si la arquitectura actual sigue divergente
  - [x] Intake obligatorio resuelto con el usuario: entregable = auditoria + refactor integral de interfaz/runtime; restricciones = se permite copiar/adaptar arquitectura de OpenClaw/OpenCode/Claurst; validacion = smokes del repo + prueba real en own-ide/VSCodium + comparativa externa
  - [x] Resolver skills aplicables: `using-superpowers`, `agent-orchestration`, `free-jt7-global-runtime-audit`, `systematic-debugging`, `verification-before-completion`
  - [ ] Ejecutar auditoria base verificable del runtime actual (policy/doctor/host/ide/task-run + smokes criticos de panel/providers/runtime/installed extension)
  - [ ] Contrastar rutas y ownership reales en `control-panel`, `provider-router`, `session-engine`, `extension.runtime` y bootstrap `own-ide`
  - [ ] Comparar gaps contra OpenClaw, OpenCode y Claurst en interfaz, autonomia, providers/API, control-plane y sesiones
  - [ ] Consolidar hallazgos en backlog priorizado: bugs, deuda arquitectonica, regresiones, rutas muertas y riesgos
  - [ ] Definir plan de ejecucion por frentes con criterios de aceptacion y evidencias exigidas
  - [ ] Asignar subagentes por frente: auditoria repo principal, comparativa OpenClaw/OpenCode, comparativa Claurst, refactor UI/runtime, verificacion own-ide

## Ejecucion inicial Plan 20 con multi-subagentes (2026-04-27)
- [x] Objetivo principal: arrancar la ejecucion real del plan 20 con delegacion por frentes, acople tecnico minimo compatible y cierre operativo en own-ide
  - [x] Intake asumido por solicitud explicita: entregable = analisis + ejecucion inicial + acople final + verificacion + instalacion own-ide; no-goal = completar toda la refactorizacion A-E en un solo turno; validacion = policy/doctor + smokes criticos + setup own-ide
  - [x] Resolver skills aplicables: `skill-resolve` ejecutado; sin skill local especializada directamente util para este frente tecnico puntual
  - [x] Delegar 5 frentes en paralelo: auditoria rutas repo principal, comparativa OpenClaw/OpenCode, comparativa Claurst, fix deteccion OpenClaw, smoke E2E continuidad own-ide
  - [x] Acoplar entregables de subagentes en backlog accionable (bugs priorizados + matriz copiar/adaptar/no copiar + fronteras de modulos)
  - [x] Implementar fix tecnico minimo de deteccion de binario OpenClaw en rutas locales reales con espacios (`findOpenClawBinary`)
  - [x] Implementar smoke nuevo `openclaw_binary_resolution_smoke`
  - [x] Implementar smoke nuevo `own_ide_continuity_e2e_smoke` (continuidad multi-turno/reinicio + metadata route/verify para UI)
  - [x] Verificacion tecnica ejecutada: `skills_manager policy-validate`, `skills_manager doctor --strict`, `control_panel_ui_smoke`, `panel_execution_mode_smoke`, `provider_router_failover_smoke`, `openclaw_runtime_smoke`, `openclaw_binary_resolution_smoke`, `own_ide_continuity_e2e_smoke`, `freejt7_own_ide_bootstrap_smoke`, `installed_extension_smoke`
  - [x] Reempaquetar e instalar en IDE propio: `npm run package:local` + `npm run app:own-ide:setup` + dry-run launcher own-ide

## Regresion de estado persistido del panel en own-ide (2026-04-27)
- [x] Objetivo principal: evitar que own-ide reabra con chat/botones/modelos en estado roto por persistencia vieja del panel
  - [x] Intake asumido del usuario: entregable = chat, botones y lista de modelos recuperados; no-goals = refactor amplio; validacion = smokes del panel + reinstalacion own-ide si aplica
  - [x] Resolver skills aplicables: `free-jt7-global-runtime-audit`, `systematic-debugging`, `verification-before-completion`
  - [x] Recolectar evidencia del perfil own-ide y del estado persistido del panel
  - [x] Aplicar fix minimo para sanear estado persistido al abrir el panel
  - [x] Verificar con smokes y reinstalar en own-ide si hace falta
  - [x] Cerrar trazabilidad con causa raiz y regla preventiva

## Reinstalacion own-ide y validacion minima de panel real (2026-04-27)
- [x] Objetivo principal: reinstalar `own-ide` si la instalacion actual esta vieja/corrupta y validar el panel real
  - [x] Intake asumido del usuario: entregable = `own-ide` funcionando en la instalacion real; no-goals = refactor grande; validacion = panel abre y botones basicos responden
  - [x] Resolver skills aplicables: `free-jt7-global-runtime-audit`, `systematic-debugging`, `verification-before-completion`
  - [x] Identificar entrypoint real de reinstalacion (`app:own-ide`, `app:own-ide:setup`) y bootstrap asociado
  - [x] Inspeccionar estado actual del perfil/extension instalada de `own-ide`
  - [x] Reinstalar VSIX/perfil aislado si la evidencia confirma drift o corrupcion
  - [x] Lanzar `own-ide` y validar operacion minima del panel/botones
  - [x] Cerrar trazabilidad con evidencia fresca

## Ejecucion completa pendientes Plan 19 Free JT7 UI + Agente + IDE (2026-04-27)
- [x] Objetivo principal: cubrir los pendientes verificables de `docs/19-PLAN-DETALLADO-FREEJT7-UI-AGENT-IDE.md` para dejar la interfaz/IDE de Free JT7 operativa con rutas provider/runtime/MCP/policy/deploy trazadas
  - [x] Intake obligatorio asumido: entregable = codigo+tests+despliegue local; no-goal = reescritura Electron completa; validacion = smokes nuevos/existentes + build + package + own-ide
  - [x] Resolver skills aplicables: `free-jt7-global-runtime-audit`, `mcp-builder`, `mcp-builder-ms`, `wiki-onboarding`, `vscode-ext-localization`
  - [x] Registrar run `20260427-plan19-full-implementation`
  - [x] Delegar en paralelo: provider/streaming, runtime/ACP/sesiones, MCP/policy/MT5/Windows, UI/onboarding/SLO
  - [x] Reconciliar Fase 0 de trazabilidad y tareas stale del plan 19
    - [x] `20260426-phase-5-agent-ui-browser-desktop` absorbida por la ejecucion integral del plan 19
    - [x] `20260424-panel-chat-first-tabs-model-persistence` absorbida por Fase 1 del plan 19
    - [x] `20260422-agente-mt5-design` absorbida por Fase 4 del plan 19
    - [x] `20260317-copilot-sdk-router-impl` absorbida por la arquitectura/runtime vigente del plan 19
    - [x] `20260419-router-hooks-functional-blocked-gate` cerrada sin bloqueo activo sobre la UI/IDE standalone
    - [x] `20260425-openclaw-agent-external` absorbida por Fase 2 del plan 19
  - [x] Implementar provider registry/config + streaming funcional + smokes
  - [x] Implementar ACP adapter + runtime local reforzado + smokes
    - [x] Intake asumido por solicitud explicita: entregable = ACP adapter formal + runtime local con lectura/escritura/verificacion segura + smoke E2E local/subagent; no-goal = provider registry/MCP tools; validacion = smokes Node acotados
    - [x] Resolver skills aplicables: sin skill local especifico para ACP/runtime JS; se sigue inspeccion directa del codigo
    - [x] Delegacion: no se delega dentro de este turno por ownership exclusivo asignado al frente runtime/ACP/sesiones
    - [x] Crear `src-js/core/acp-adapter.js` con contrato formal y fallback local seguro
    - [x] Reforzar `src-js/core/local-agent-runtime.js` con lectura/escritura workspace-safe y verificacion controlada
    - [x] Ajustar `src-js/core/session-engine.js` solo si hace falta para evidencias/ruta ACP
    - [x] Agregar smokes locales/ACP/subagente
    - [x] Ejecutar verificacion y cerrar trazabilidad
  - [x] Implementar MT5 gate + Windows dry-run scripts + smokes security
    - [x] Frente MCP/policy/MT5/Windows completado por run `20260427-plan19-mcp-policy-mt5-windows`: gate MT5 de trading por aprobacion/token, smoke de escritura fuera de workspace, scripts `package:win`/`app:standalone:win` en dry-run y smokes dedicados
  - [x] Implementar UI/onboarding/SLO minimo + smokes
    - [x] Registrar inicio `20260427-plan19-ui-onboarding-slo`
    - [x] Intake asumido: entregable = panel con estado/onboarding/SLO basico + scripts/docs minimos + smoke UI; no-goals = MCP tools/provider-router/runtime fuera de lectura; validacion = smokes de panel
    - [x] Delegacion: no delegada por ownership exclusivo del frente UI/onboarding/SLO y working tree con cambios paralelos
    - [x] Añadir estado operativo, onboarding minimo y SLO basico al panel
    - [x] Añadir artefactos nuevos de onboarding/SLO
    - [x] Actualizar smoke UI y verificar
  - [x] Integrar cambios paralelos y resolver conflictos
  - [x] Verificar bateria completa, empaquetar y desplegar en `own-ide`
    - [x] Evidencia reconciliada: `build:bundle`, `package:local`, `app:own-ide`, smokes provider/runtime/UI y `installed_extension_smoke`
  - [x] Cerrar trazabilidad y memoria
    - [x] `docs/TASKS.md`, `copilot-agent/tasks.yaml`, `copilot-agent/RESUME.md` y `copilot-agent/audit-log.jsonl` reconciliados con el plan 19

## Hotfix runtime local y controles de tarea del panel (2026-04-27)
- [x] Objetivo principal: evitar que el chat del panel quede degradado a una respuesta repetitiva cuando `runtimeBackend=local` y verificar que las acciones de tarea del panel sigan operativas
  - [x] Confirmar causa raiz: `runLocalAgentTask()` ignoraba casi todo el objetivo y devolvia siempre inventario del workspace
  - [x] Hacer que la ruta local infiera lecturas/verificaciones minimas desde el objetivo y genere un resumen orientado a la tarea
  - [x] Señalizar en la UI cuando el runtime activo es `local` para no venderlo como agente completo
  - [x] Agregar/regenerar smokes para heuristica local y controles `approve/reject/cancel/retry`
  - [x] Verificacion: `node tests/local_agent_runtime_smoke.js`, `node tests/session_engine_controls_smoke.js`, `node tests/panel_execution_mode_smoke.js`, `node tests/control_panel_ui_smoke.js`, `npm run build:bundle`

## Auditoria y correccion regresion own-ide/runtime Free JT7 (2026-04-27)
- [x] Objetivo principal: encontrar por que Free JT7 sigue sin funcionar correctamente en `own-ide` y corregir fallas de panel, runtime agente, proveedores, skills, privilegios y MCP
  - [x] Intake obligatorio asumido: entregable = panel/IDE propio operativo; no-goal = reescritura completa o copia 1:1 de OpenCode/OpenClaw; validacion = smokes + bundle + VSIX + reinstalacion `own-ide`
  - [x] Resolver skills aplicables: `free-jt7-global-runtime-audit`, `mcp-builder`, `agent-memory-mcp`
  - [x] Registrar run `20260427-own-ide-runtime-regression-audit` y auditoria base `20260427T112629Z-464c03c5`
  - [x] Delegar auditorias paralelas: panel/own-ide, proveedores/MCP/policy, delta OpenCode/OpenClaw
  - [x] Reproducir fallas con smokes y/o logs de extension instalada: `mcp_documents_tools_smoke` fallaba en `pathSearch`; `package:local` fallaba por `vsce`; `app:own-ide:setup` requirio escritura real en `~/.freejt7-app`
  - [x] Aplicar fix minimo compatible: busqueda MCP tolera `spawnSync EPERM` con stdout, fallback content-search, policy `allowedFileRoots`, 429 permite fallback, `authProfile` llega a SecretStorage, alias `own-ide`
  - [x] Revalidar y reinstalar en `own-ide`
  - [x] Cerrar trazabilidad en `copilot-agent/` y memoria si hubo fallo real
  - [x] Verificacion: smokes panel/runtime/MCP/proveedor OK, `build:bundle` OK, `package:local` OK, `app:own-ide:setup` OK, `app:own-ide -- --skip-install` OK, proceso `codium` activo

## Reinstalar y ejecutar IDE propio Free JT7 (2026-04-27)
- [x] Objetivo principal: instalar y ejecutar el nuevo IDE propio de Free JT7 en estado operativo
  - [x] Intake asumido: entregable = `own-ide` reinstalado y lanzado; no-goal = cambios de arquitectura; validacion = setup + proceso activo
  - [x] Reempaquetar VSIX local (`package:local`) con cambios recientes
  - [x] Reinstalar extension en perfil `own-ide`
  - [x] Ejecutar `own-ide` y validar proceso activo
  - [x] Verificacion: `npm run package:local`, `npm run app:own-ide`, `pgrep -af ...own-ide...`

## Hotfix panel sin acciones ni modelos (2026-04-27)
- [x] Objetivo principal: corregir UI del panel cuando no responde botones/chat y no lista modelos/proveedores
  - [x] Diagnosticar error real del webview (parse/sintaxis script cliente)
  - [x] Corregir string inválido en script inyectado de `control-panel`
  - [x] Agregar smoke dedicado que compile el script generado del webview
  - [x] Recompilar, reempaquetar VSIX y reinstalar en `own-ide`
  - [x] Verificacion: `control_panel_script_syntax_smoke`, `control_panel_ui_smoke`, `build:bundle`, `package:local`, `app:own-ide:setup`, `app:own-ide`, `installed_extension_smoke`

## Hotfix chat sin respuesta y botones avanzados inactivos (2026-04-27)
- [x] Objetivo principal: restaurar envío de chat y acciones avanzadas del panel (`spawn/yield/resume/status/history/health/schema/patch/restart`)
  - [x] Diagnosticar flujo real del webview + runtime del panel para errores silenciosos en `message handler`
  - [x] Aplicar degradación segura en `preparePanelTask` para no bloquear `task.enqueue` cuando falle trazabilidad/skills
  - [x] Exponer errores del backend del panel hacia la UI (`panel.server.error`) en lugar de solo Output Channel
  - [x] Añadir feedback visible cuando no hay sesión activa para botones de sesión
  - [x] Verificar sintaxis/UI/sesiones y reinstalar VSIX en `own-ide`
  - [x] Verificacion: `control_panel_script_syntax_smoke`, `control_panel_ui_smoke`, `panel_execution_mode_smoke`, `session_engine_subagent_tools_smoke`, `build:bundle`, `package:local`, `app:own-ide:setup`, `freejt7-own-ide --skip-install`, `installed_extension_smoke`

## Hotfix resumen ACP/OpenCode y continuidad del panel (2026-04-27)
- [x] Objetivo principal: corregir tareas completadas sin respuesta visible cuando `acp:opencode` devolvía el texto real fuera de `result.summary`
  - [x] Confirmar en estado persistido que la respuesta real existía en `payloads[].text` / `finalAssistantVisibleText`
  - [x] Corregir la extracción de summary en `src-js/core/openclaw-agent-runtime.js`
  - [x] Añadir fallback compatible en `src-js/core/session-engine.js` y `src-js/core/control-panel.js` para tareas ya persistidas con `}`
  - [x] Reforzar smoke de runtime y smoke de contexto de sesión con caso legado
  - [x] Verificacion: `node tests/openclaw_runtime_smoke.js`, `node tests/session_engine_context_smoke.js`, `node tests/control_panel_ui_smoke.js`, `npm run build:bundle`

## Plantilla rapida
- [ ] Objetivo principal
  - [ ] Subtarea A
  - [ ] Subtarea B
  - [ ] Verificacion

## Plan19 provider registry/streaming/direct mode (2026-04-27)
- [x] Objetivo principal: implementar frente provider/streaming del plan19 con cambios acotados
  - [x] Intake obligatorio resuelto por el usuario: entregable = registry/config + `streamCompletion` funcional + smokes provider/direct; constraints = no MCP, Windows scripts ni UI extensa; validacion = smokes relacionados
  - [x] Resolver skills aplicables: no hay skill especifica de provider/router disponible en la lista activa
  - [x] Decision de delegacion: no delegado por ownership exclusivo y cambios acotados en `provider-router.js`
  - [x] Agregar `src-js/core/provider-registry.js` y `src-js/core/provider-config.js`
  - [x] Extender minimamente `src-js/core/provider-router.js` con streaming directo
  - [x] Agregar smokes de registry, streaming y direct mode
  - [x] Ejecutar verificacion ligera y cerrar trazabilidad

## Plan integral OpenCode + OpenClaw para Free JT7 (2026-04-27)
- [x] Objetivo principal: consolidar ambos analisis en un plan unico de evolucion para Free JT7 (interfaz profesional + autonomia + multi-provider)
  - [x] Intake asumido: entregable = roadmap integral documentado; no-goal = ejecutar implementacion completa en este turno; validacion = documento guardado + trazabilidad
  - [x] Unificar arquitectura objetivo tomando OpenCode (provider/runtime/server) y OpenClaw (sessions/subagents/policy/failover)
  - [x] Definir fases, dependencias, riesgos y criterios de aceptacion en un roadmap unico
  - [x] Priorizar quick wins para siguiente iteracion ejecutable
  - [x] Verificacion: documento `docs/18-PLAN-INTEGRAL-OPENCODE-OPENCLAW-FREEJT7.md` creado y trazabilidad actualizada

## Ejecucion integral fases 1-5 del plan OpenCode/OpenClaw (2026-04-27)
- [x] Objetivo principal: ejecutar en codigo todas las fases del plan integral para dejar Free JT7 operativo/autonomo en su interfaz propia
  - [x] Intake asumido: entregable = implementacion funcional de fases 1-5 con verificacion local; no-goal = migracion 1:1 completa de OpenCode/OpenClaw; validacion = smokes + bundle + VSIX + reinstalacion perfiles
  - [x] Fase 1: integrar session tools/subagentes (`spawn`, `yield`, `status`, `history`) en `SessionEngine` y panel
  - [x] Fase 2: implementar resiliencia multi-provider con `primary + fallbacks`, cooldown y telemetria de ruta en `ProviderRouter`
  - [x] Fase 3: evolucionar `PolicyEngine` a perfiles `coding/messaging/minimal` con matriz `allow/ask/deny`
  - [x] Fase 4: integrar control-plane en panel (`health`, `config.schema.lookup`, `config.patch`, `restart runtime`)
  - [x] Fase 5: habilitar backend por tarea `local/openclaw/acp:*` y ruta ACP interoperable
  - [x] Añadir smokes nuevos para failover router, policy profiles y session tools/subagentes
  - [x] Verificacion: `provider_router_failover_smoke`, `policy_engine_profiles_smoke`, `session_engine_subagent_tools_smoke`, `control_panel_ui_smoke`, `panel_execution_mode_smoke`, `session_engine_context_smoke`, `session_engine_verification_smoke`, `openclaw_runtime_smoke`, `build:bundle`, `package:local`, `app:own-ide:setup`, `app:standalone:setup`, `installed_extension_smoke`

## Clonar y analizar OpenClaw para roadmap Free JT7 (2026-04-27)
- [x] Objetivo principal: clonar `openclaw/openclaw` y extraer funciones/metodos reutilizables para llevar Free JT7 a nivel agente autonomo profesional
  - [x] Intake asumido: entregable = analisis guardado + plan por fases; no-goal = migracion completa en este turno; validacion = clon + evidencia por docs/codigo
  - [x] Clonar `https://github.com/openclaw/openclaw.git` en `/home/javier28/Público/REPOSOTORIOS OPCIONALES/open claw`
  - [x] Auditar capacidades clave: runtime agente, sessions/subagents, failover de modelos, policy/sandbox, tools, gateway/control-ui, ACP, memoria y automatizacion
  - [x] Comparar contra estado actual de `free jt7` para detectar funciones no usadas o incompletas
  - [x] Guardar analisis y plan en documento reutilizable de arquitectura
  - [x] Verificacion: `git -C "/home/javier28/Público/REPOSOTORIOS OPCIONALES/open claw" rev-parse --is-inside-work-tree` + `git -C ".../open claw" log -1`

## Clonar y analizar opencode para integracion Free JT7 (2026-04-26)
- [x] Objetivo principal: clonar `anomalyco/opencode` en carpeta opcional y analizar su encaje para Free JT7 (multi-proveedor, interfaz propia, agente autonomo)
  - [x] Intake asumido: entregable = clon local + analisis tecnico accionable; no-goal = migracion inmediata del runtime; validacion = `git log -1` + evidencia de arquitectura
  - [x] Clonar `https://github.com/anomalyco/opencode.git` en `/home/javier28/Público/REPOSOTORIOS OPCIONALES/opencode`
  - [x] Auditar providers/modelos, agentes, permisos, tools, MCP, server/API e interfaz
  - [x] Proponer mapa de integracion por fases para Free JT7 con cambios minimos
  - [x] Verificacion: `git -C "/home/javier28/Público/REPOSOTORIOS OPCIONALES/opencode" rev-parse --is-inside-work-tree` + `git -C ".../opencode" log -1`

## Reinstalacion own-ide + icono de escritorio (2026-04-26)
- [x] Objetivo principal: actualizar/reinstalar el IDE propio de Free JT7 y dejar acceso directo funcional en escritorio
  - [x] Intake asumido: reinstalar VSIX actual en perfil `own-ide`; no-goal cambios de UI/runtime; validacion por setup+launcher dry-run
  - [x] Generar VSIX fresca local para asegurar que incluya cambios recientes
  - [x] Ejecutar `app:own-ide:setup` para reinstalacion en perfil aislado
  - [x] Crear launcher estable en `~/.local/bin/freejt7-own-ide`
  - [x] Crear icono `.desktop` en escritorio con icono de Free JT7
  - [x] Verificacion: `npm run package:local`, `npm run app:own-ide:setup`, `~/.local/bin/freejt7-own-ide --dry-run --no-launch`

## Hotfix UI modelo manual en panel (2026-04-26)
- [x] Objetivo principal: corregir desincronización del modelo manual en la interfaz de chat/control de Free JT7
  - [x] Intake asumido: fix mínimo compatible de webview; no-goal refactor de arquitectura del panel; validación con smokes UI+modo+catálogo y build bundle
  - [x] Auditar interacción real del selector manual (`modelCustom`) y su persistencia al enviar/probar/cambiar proveedor
  - [x] Corregir sincronización de estado para evitar uso de modelo anterior cuando no hay blur
  - [x] Limpiar fuga de modelo manual entre proveedores al cambiar `provider`
  - [x] Añadir cobertura smoke para evitar regresión del flujo manual
  - [x] Verificación: `node tests/control_panel_ui_smoke.js`, `node tests/panel_execution_mode_smoke.js`, `node tests/provider_model_catalog_smoke.js`, `npm run build:bundle`

## Reparacion interfaz y catálogo por proveedor en own-ide + IDE (2026-04-26)
- [x] Objetivo principal: recuperar operatividad real del panel y listado de modelos por proveedor en perfil aislado y en IDE
  - [x] Intake asumido: fix mínimo compatible + verificación runtime real; no-goal refactor mayor del panel/router
  - [x] Diagnosticar trazabilidad/logs de activación y webview en `own-ide`
  - [x] Corregir fragilidad de inyección del catálogo de modelos en el webview (serialización robusta)
  - [x] Añadir fallback defensivo de proveedor en estado persistido del cliente webview
  - [x] Añadir trazabilidad de runtime del panel para refresh de catálogo y `panel.ready`
  - [x] Recompilar bundle, reempaquetar VSIX y validar integridad ZIP
  - [x] Remediar instalación corrupta en `own-ide` (limpieza de metadata y reinstalación)
  - [x] Reinstalar/ejecutar en `own-ide` y en perfil `default` del IDE
  - [x] Verificación: `test:control-panel-ui-smoke`, `test:panel-execution-mode-smoke`, `test:provider-model-catalog-smoke`, `build:bundle`, `package:local`, `app:own-ide:setup`, `app:standalone:setup`, activación en logs + refresh de catálogo

## Remediacion interfaz en perfil aislado + own-ide (2026-04-26)
- [x] Objetivo principal: recuperar operatividad del panel en perfil aislado y en IDE propia evitando bloqueos por modo directo persistido
  - [x] Intake asumido: entregable fix mínimo + reinstalación VSIX en ambos perfiles; no-goals refactor mayor del router; validación con smokes de panel/bootstrap/instalada
  - [x] Verificar trazabilidad previa y errores repetidos (`Copilot CLI not found`, `openclaw doctor --fix`, sesiones fallidas del panel)
  - [x] Forzar `executionMode=agent` cuando `freejt7.app.standaloneMode=true`
  - [x] Bloquear opción `modelo directo` en la UI del panel aislado y mostrar hint explícito
  - [x] Reempaquetar e instalar VSIX en IDE principal + perfil aislado + own-ide
  - [x] Verificar con `node tests/control_panel_ui_smoke.js`, `node tests/panel_execution_mode_smoke.js`, `node tests/local_agent_runtime_smoke.js`, `npm run build:bundle`, `npm run package:local`, `node tests/installed_extension_smoke.js`, `npm run app:standalone:setup`, `npm run app:own-ide:setup`

## Corregir vulnerabilidades npm del MCP local (2026-04-26)
- [x] Objetivo principal: corregir las 3 vulnerabilidades detectadas por `npm audit` durante `package:local` en `servidor mpc free jt7`
  - [x] Intake asumido: entregable lockfile corregido; no-goals cambio mayor de SDK; validacion con `npm audit`, smoke MCP y `package:local`
  - [x] Identificar dependencias vulnerables y ruta transitive
  - [x] Actualizar `package-lock.json` con versiones seguras
  - [x] Sincronizar instalacion del subproyecto MCP
  - [x] Revalidar auditoria, smoke, empaquetado e instalacion VSIX

## Corregir runtime-audit portable + fallback local de agente (2026-04-26)
- [x] Objetivo principal: corregir el bloqueo `Get-ChildItem` en Linux y reducir la dependencia exclusiva de Copilot/OpenClaw para herramientas reales
  - [x] Intake asumido: entregable codigo + pruebas; no-goals refactor mayor; validacion con runtime-audit y smokes
  - [x] Leer trazabilidad obligatoria y resolver skills aplicables
  - [x] Hacer portable la normalizacion PowerShell/POSIX de `task-step`
  - [x] Agregar runtime local de agente con herramientas basicas
  - [x] Conectar fallback local en el panel cuando Copilot/OpenClaw no esten disponibles
  - [x] Ejecutar verificacion y cerrar trazabilidad

## Auditoria trazabilidad + autonomia Free JT7 tipo Codex (2026-04-26)
- [x] Objetivo principal: analizar el proyecto Free JT7, verificar trazabilidad de correcciones recientes y medir brechas para operar autonomamente con capacidades similares a Codex
  - [x] Intake obligatorio asumido: entregable informe + evidencia; no-goals refactor grande; validacion con comandos runtime y smokes ligeros
  - [x] Leer trazabilidad obligatoria y resolver skills aplicables
  - [x] Delegar auditorias paralelas de trazabilidad documental y arquitectura runtime
  - [x] Ejecutar validaciones obligatorias del runtime y pruebas disponibles
  - [x] Reconciliar hallazgos, brechas y estado de tareas abiertas
  - [x] Cerrar trazabilidad en `copilot-agent/` con evidencia

## Desacoplar interfaz propia de GitHub Copilot (2026-04-26)
- [x] Objetivo principal: dejar la interfaz propia de Free JT7 sin dependencia operativa de Copilot, manteniendo compatibilidad opcional en Copilot Chat
  - [x] Intake asumido desde el usuario: panel propio external-first; `@freejt7` sigue opcional en Copilot Chat
  - [x] Leer trazabilidad obligatoria y auditar acoples reales entre panel, provider config y runtime Copilot
  - [x] Separar la configuración del panel respecto a la configuración global del host/chat
  - [x] Quitar `copilot` de la interfaz propia y dejar el panel centrado en proveedores externos
  - [x] Ajustar mensajes/doctor para que Copilot Chat no se trate como requisito del runtime base
  - [x] Verificacion final con smokes del panel y de extension instalada

## Remediacion continuidad de sesiones + runtime Copilot/OpenClaw (2026-04-26)
- [x] Objetivo principal: recuperar continuidad real del panel y corregir las fallas del runtime agente con Copilot/OpenClaw en la extension instalada
  - [x] Leer trazabilidad obligatoria y auditar el estado real del panel, VSIX instalada y runtime agente
  - [x] Corregir el empaquetado de la VSIX para incluir el runtime minimo de Copilot SDK/CLI
  - [x] Corregir el contrato `openclaw.json` generado para proveedores custom y evitar el fallo `doctor --fix`
  - [x] Permitir retomar sesiones/tareas previas con mas continuidad desde el panel
  - [x] Verificacion final con smokes y reinstalacion de la extension

## Auditoria integral + hoja de ruta hacia agente real tipo Codex (2026-04-26)
- [x] Objetivo principal: auditar todo lo construido en Free JT7 y cerrar las brechas para que opere como agente real multi-provider con interfaz nueva unificada
  - [x] Intake obligatorio resuelto con el usuario (entregable exacto, no-goals y validacion esperada)
  - [x] Leer trazabilidad obligatoria y resolver skills aplicables
  - [x] Inventariar capacidades ya implementadas vs capacidades objetivo (autonomia, browser, archivos, PDF, apps, MCP, review, auto-fix, validacion)
  - [x] Auditar si la interfaz nueva realmente enruta al modo agente y no solo al proveedor directo
  - [x] Definir fases de remediacion priorizadas con cambios minimos por iteracion
  - [x] Ejecutar la primera iteracion de remediacion verificable
  - [x] Verificacion final y cierre de trazabilidad

## Fases 2-4 agente real multi-provider (2026-04-26)
- [x] Objetivo principal: continuar fases 2, 3 y 4 para reforzar tools operativas, autonomia/verificacion y experiencia instalada
  - [x] Revalidar estado post-fase-1 y puntos de acople actuales
  - [x] Fase 2: ampliar navegador/documentos/busqueda/seleccion sobre archivos
  - [x] Fase 3: endurecer policy engine y verificacion post-tarea
  - [x] Fase 4: crear y correr smokes de VSIX instalada / extension activa
  - [x] Empaquetar, reinstalar y ejecutar verificacion amplia final

## Fase 5 agente visual + browser/desktop profundos (2026-04-26)
- [x] Objetivo principal: reforzar navegador/escritorio, pulir interfaz tipo consola de agente y corregir defectos visuales del panel
  - [x] Auditar bug visual de selectores y opciones reales de browser/desktop
  - [x] Corregir estilos del panel y acercar la interfaz a una consola de agente mas clara
  - [x] Ampliar tools de browser y desktop con acciones mas profundas
  - [x] Validar autonomia multi-provider con smokes actualizados
  - [x] Empaquetar, reinstalar VSIX y verificar extension instalada

## Remediacion modo agente real en interfaz nueva (2026-04-25)
- [x] Objetivo principal: hacer que el chat del nuevo interfaz priorice la ejecucion real del agente `free jt7` en lugar del modo proveedor directo
  - [x] Intake minimo asumido (entregable: panel usando modo agente real por defecto; no-goals: refactor mayor del router; verificacion: smoke del panel + smoke del enrutamiento + bundle)
  - [x] Leer trazabilidad obligatoria y auditar el flujo real del panel/chat
  - [x] Separar modo `agente` vs `modelo directo` en el panel y dejar `agente` por defecto
  - [x] Conectar el modo `agente` al router real con herramientas y mantener el modo directo como fallback
  - [x] Verificacion final y cierre de trazabilidad

## Alinear panel chat-first con identidad/capacidades reales de Free JT7 (2026-04-25)
- [x] Objetivo principal: hacer que la nueva interfaz de chat use identidad fuerte de `free jt7`, skills resueltos y trazabilidad real en cada interaccion
  - [x] Intake minimo asumido (entregable: panel alineado con identidad/capacidades; no-goals: refactor mayor; verificacion: smokes + bundle)
  - [x] Leer trazabilidad obligatoria y skills aplicables
  - [x] Auditar ruta real del panel, `SessionEngine`, `ProviderRouter` y adaptador externo
  - [x] Inyectar identidad contractual y contexto operativo en el prompt base del panel/chat
  - [x] Preparar tareas del panel con skill resolution + traceabilidad antes de encolarlas
  - [x] Verificacion final con smokes y bundle

## Contexto conversacional + identidad de chat Free JT7 (2026-04-25)
- [x] Objetivo principal: corregir el chat para que conserve contexto real, use la identidad de `free jt7` y continúe mejor tareas de análisis tipo Codex
  - [x] Intake mínimo asumido (entregable: continuidad conversacional + identidad; no-goals: refactor mayor; verificación: smokes + bundle)
  - [x] Leer trazabilidad obligatoria, resolver skills aplicables y validar salud base del runtime
  - [x] Auditar el panel, el `chat participant`, `ProviderRouter`, `SessionEngine` y la referencia de Claurst
  - [x] Implementar historial conversacional persistente por sesión en el `SessionEngine`
  - [x] Inyectar identidad base del agente y contexto local automático cuando el prompt menciona rutas existentes
  - [x] Reusar `chatContext` del host en el `chat participant` para que `continua` no pierda el hilo
  - [x] Verificar con `node tests/chat_context_smoke.js`, `node tests/session_engine_context_smoke.js`, `npm run test:control-panel-ui-smoke` y `npm run build:bundle`

## Analisis integral + panel chat-first + CLōD provider (2026-04-25)
- [x] Objetivo principal: auditar la interfaz nueva, centrarla en chat, mover configuracion a pestaña e integrar CLōD sin romper los proveedores existentes
  - [x] Intake minimo resuelto (entregable, alcance y validacion esperada)
  - [x] Leer trazabilidad obligatoria y resolver skills aplicables
  - [x] Auditar salud base del runtime y arquitectura actual del panel/proveedores
  - [x] Rediseñar el webview hacia un layout chat-first con pestañas secundarias
  - [x] Persistir provider/model por proveedor y sincronizarlo con configuracion global
  - [x] Integrar CLōD como proveedor OpenAI-compatible y validar el token en vivo
  - [x] Corregir el empaquetado para no incluir secretos locales en la VSIX
  - [x] Verificar build, smokes de UI y pruebas dirigidas de proveedores

## Panel chat primero + pestaña de tareas + persistencia de modelo (2026-04-24)
- [ ] Objetivo principal: priorizar Chat en el panel, mover Tareas a una pestaña secundaria y persistir globalmente el último modelo seleccionado
  - [x] Intake minimo resuelto (entregable, restricciones y verificacion)
  - [ ] Inspeccionar layout actual del panel y flujo de persistencia del modelo
  - [ ] Implementar pestañas y detalle secundario de tareas sin romper el chat
  - [ ] Fijar persistencia global del último modelo seleccionado
  - [ ] Verificacion final con smoke del panel y build bundle

## Remediacion HTTP 200 OpenRouter en panel (2026-04-24)
- [x] Objetivo principal: corregir el falso error `Free JT7 (openrouter): error HTTP 200.` en el Control Panel
  - [x] Intake minimo resuelto (panel, cambio minimo, smoke del flujo tocado)
  - [x] Identificar si el 200 viene de payload ambiguo o de parseo incompleto del adaptador
  - [x] Corregir la deteccion de error y/o el parseo de respuesta OpenRouter
  - [x] Cubrir el caso con smoke dirigido
  - [x] Verificacion final

## Remediacion HTTP 429 OpenRouter en panel (2026-04-24)
- [x] Objetivo principal: corregir el manejo de rate limit en el Control Panel sin dejar el error bruto al usuario
  - [x] Intake minimo confirmado (arreglo en codigo, cambios minimos, smoke del panel)
  - [x] Identificar causa raiz local en adaptador y motor de sesiones
  - [x] Implementar tipado/mensaje accionable para HTTP 429
  - [x] Evitar reintentos inmediatos ciegos ante rate limit
  - [x] Verificacion final con smoke del flujo tocado

## Chat participant seguia con VSIX vieja (2026-04-24)
- [x] Objetivo principal: alinear el chat de Free JT7 con la instalacion activa de VS Code
  - [x] Confirmar si el editor estaba usando la extension instalada y no solo el checkout local
  - [x] Empaquetar una VSIX fresca desde el repo corregido
  - [x] Reinstalar la extension con `code --install-extension --force`
  - [x] Verificar que el `dist/extension.cjs` instalado contiene el manejo nuevo de 429

## Release 4.2.11 panel pro (2026-04-23)
- [x] Objetivo principal: publicar corte release completo con backup operativo
  - [x] Crear rama `release/v4.2.11-panel-pro` y preparar push remoto
  - [x] Subir version correlativa a `4.2.11` en metadatos de release
  - [x] Ejecutar verificacion (`test:control-panel-ui-smoke`, `test:agent-manifest-smoke`, `build:bundle`)
  - [x] Empaquetar VSIX `agente-freejt7-extension-funcional-4.2.11.vsix`
  - [x] Crear backups en repo (`backups/releases/4.2.11`) y carpeta local externa (`/home/javier28/Backups/freejt7-release-4.2.11`)
  - [x] Cifrar secretos locales y guardar copia en repo + local externo

## VS Code update + panel pro (2026-04-23)
- [x] Objetivo principal: aterrizar novedades de VS Code y subir el panel Free JT7 a UX profesional tipo chat de agente
  - [x] Intake minimo confirmado (entregable, restricciones y validacion esperada)
  - [x] Analizar impacto real de nuevas features de VS Code para Free JT7
  - [x] Rediseñar UI del panel con layout profesional, lectura rapida de estado y acciones claras
  - [x] Mantener compatibilidad con comandos actuales y chat participant activo
  - [x] Agregar prueba automatica de smoke del nuevo panel
  - [x] Verificacion final: build bundle + smoke funcional

## Panel Webview Free JT7 + Copilot Pro (2026-04-22)
- [x] Objetivo principal: ejecutar fases 0-5 del blueprint de panel Webview con control autonomo mixto
  - [x] Fase 0: contratos base y blueprint tecnico documentado
  - [x] Fase 1: shell de panel y Session Engine inicial con cola persistente
  - [x] Fase 2: Policy Engine mixed con aprobaciones en high-risk
  - [x] Fase 3: Provider Router simultaneo (externos + copilot)
  - [x] Fase 4: Audit bus y persistencia de estado de panel
  - [x] Fase 5: feature flag para desactivar chat participant y usar panel como interfaz principal
  - [x] Verificacion final: build bundle y smoke de comandos/runtime

## Agente MT5 señales cuantitativas (2026-04-22)
- [ ] Objetivo principal: crear nueva herramienta agente_mt5 para análisis de símbolos y señales con riesgo controlado
  - [x] Intake y criterios base definidos (demo, M15-H1, multiestrategia, métricas objetivo)
  - [x] Análisis de componentes actuales (`mcp-servers/mt5/mt5_server.py`, `tools/mt5_bridge.py`)
  - [x] Diseñar arquitectura objetivo de agente_mt5 (ingesta, features, señal, riesgo, ejecución)
  - [x] Definir estrategia inicial y validación cuantitativa (walk-forward/backtest)
  - [x] Desglosar plan en tareas ejecutables por agentes paralelos
  - [x] Implementar MVP del nuevo servidor MCP agente_mt5
  - [ ] Probar en demo y validar métricas mínimas
  - [ ] Cerrar trazabilidad y documentación

## Instalacion MT5 Linux sin sudo (2026-04-22)
- [x] Objetivo principal: instalar MetaTrader 5 en Linux en modo usuario con la mejor opcion entre Bottles y Wine
  - [x] Intake minimo confirmado (entregable, restricciones, verificacion)
  - [x] Auditar entorno Linux y disponibilidad de Flatpak/Wine/Bottles
  - [x] Elegir estrategia tecnica (Bottles o Wine) con criterio de robustez
  - [x] Ejecutar instalacion completa de MT5 en modo usuario
  - [x] Validar apertura real de MT5
  - [x] Cierre de trazabilidad (tasks/audit/resume)

## Verificacion proveedor HF activo (2026-04-22)
- [x] Objetivo principal: confirmar que Free JT7 acepto el cambio a Hugging Face y usa Qwen 2.5 7B
  - [x] Leer configuracion efectiva en VS Code User Settings
  - [x] Validar la resolucion real del router con proveedor/modelo HF
  - [x] Cerrar evidencia y trazabilidad

## Bypass de Copilot con proveedor externo (2026-04-22)
- [x] Objetivo principal: demostrar y corregir la ruta efectiva cuando Free JT7 usa OpenRouter/HF/ZAI
  - [x] Confirmar si la selección UI termina en proveedor externo o en fallback silencioso a Copilot
  - [x] Corregir metadatos/eventos para que reflejen el proveedor/modelo efectivos
  - [x] Validar que la rama externa no cree `CopilotClient` ni importe el SDK cuando no corresponde
  - [x] Documentar el consumo inevitable del host GitHub Copilot Chat si la invocación ocurre desde chat participant
  - [x] Ejecutar verificación end-to-end con evidencia operativa

## Remediacion selector de agentes (2026-04-20)
- [x] Recuperar visibilidad de `free-jt7`, `openclaw` y `skill-creator` en el selector de GitHub Copilot Chat
  - [x] Confirmar la causa raiz inicial en `.agent.md` y settings del selector
  - [x] Normalizar frontmatter y tools de los agentes custom
  - [x] Propagar flags del selector a settings instalados/reparados
  - [x] Añadir smoke test del contrato minimo de agentes
  - [x] Verificacion final con build, pruebas ligeras y reinstalacion del VSIX

## Remediacion agentFiles globales (2026-04-20)
- [x] Confirmar con logs que la extension instalada si activaba fuera del repo y aislar el bloqueo real en `chat.agentFilesLocations`
- [x] Corregir `skills_manager.py` para no escribir rutas absolutas invalidas en user settings globales
- [x] Ajustar el drift-heal del runtime y limpiar configuraciones locales heredadas (`.vscode/settings.json` y `free-jt7-multiroot.code-workspace`)
- [x] Reempaquetar/reinstalar el VSIX y verificar activacion en carpeta externa sin warnings `Skipping invalid path`

## Ciclo Quant Autonomo
- [ ] Fase 1: Setup y datos
  - [ ] Validar entorno Python y dependencias
  - [ ] Descargar datos reales OHLCV
- [ ] Fase 2: Backtest base
  - [ ] Ejecutar estrategia base
  - [ ] Calcular metricas (PF, DD, Sharpe)
- [ ] Fase 3: Iteracion
  - [ ] Registrar resultado en `docs/STRATEGY_LOG.md`
  - [ ] Si falla criterio, aplicar mejora y reintentar
- [ ] Fase 4: Cierre
  - [ ] Seleccionar mejor configuracion
  - [ ] Documentar entregable final

## MCP Free JT7 (2026-03-13)
- [x] Fase 1: Scaffold servidor MCP local
  - [x] Crear carpeta `servidor mpc free jt7`
  - [x] Crear herramientas base (web, scraping, sistema, desktop, media)
  - [x] Definir politica de aprobaciones y bloqueos
- [x] Fase 2: Validacion local
  - [x] Ejecutar smoke test de carga de modulos
  - [x] Verificar arranque de servidor por stdio
- [x] Fase 3: Cierre pre-integracion
  - [x] Documentar uso y limites
  - [x] Dejar listo para integracion en extension

## Disciplina Operativa (2026-03-13)
- [x] Reconciliar tareas abiertas heredadas
- [x] Cerrar duplicados con evidencia en `copilot-agent/tasks.yaml`
- [x] Actualizar `copilot-agent/RESUME.md` y `copilot-agent/audit-log.jsonl`
- [x] Registrar regla preventiva para no reabrir trabajo ya verificado

## MT5 Desktop Automation & Login (2026-03-13)
- [x] Robustecer arranque de terminal MT5 desde `tools/mt5_bridge.py` (start + reintentos)
- [x] Corregir paso de parámetros y transporte seguro de datos en `servidor mpc free jt7/src/tools/mt5.js`
- [x] Verificación ligera (py_compile + import de mt5.js)
- [x] Resolver timeout de `mt5.initialize()` (login desktop con `jt7_mt5_desktop_login` y shortcut de menÃº)

## Integración MCP en VS Code (2026-03-14)
- [x] Verificar soporte MCP y prerequisitos (`code --version`, extensiones clave, dependencias del servidor)
- [x] Crear `.vscode/mcp.json` para el servidor local `free-jt7-local`
- [x] Validar arranque ligero del servidor MCP local
- [x] Confirmar la integración final en VS Code y documentar resultado

## Reparacion wallpaper Windows (2026-03-14)
- [x] Confirmar archivo fuente, registro y cache activa
- [x] Forzar aplicacion del fondo en la sesion interactiva
- [x] Verificar persistencia tras refresco de Explorer

## Diagnostico boot Windows (2026-03-14)
- [ ] Objetivo principal: analizar perdida de boot de arranque
  - [x] Recolectar estado de discos/particiones y BCD
  - [x] Identificar particion EFI y estado de arranque
  - [x] Montar EFI y verificar presencia de archivos de arranque
  - [ ] Proponer remediacion segura segun hallazgos
  - [ ] Verificacion ligera

## Routing planner/executor por costo (2026-03-17)
- [ ] Separar resolucion de modelo para planeacion/asignacion vs ejecucion
  - [ ] Definir roles `planning`, `assignment` y `execution` en el routing
  - [ ] Persistir resolucion por rol en runs y runtime OpenClaw
  - [ ] Extender credenciales para xAI/Anthropic/Google segun fallback de ejecucion
  - [ ] Documentar configuracion recomendada: GPT-5.4 para planner y Grok/Gemini/Haiku para ejecucion
  - [ ] Verificacion CLI de resolucion por rol

## Router real Copilot SDK (2026-03-17)
- [x] Instalar prerequisite local del GitHub Copilot CLI
- [x] Integrar dependencia `@github/copilot-sdk` en la extension
- [x] Crear `copilot_router.js` con planner, ejecutores y sintesis
- [x] Registrar evidencia de runs en `copilot-agent/runs/`
- [x] Exponer comando `Free JT7: Routed Copilot Task`
- [ ] Validar corrida real end-to-end con autenticacion de Copilot disponible

## Router real Copilot SDK (2026-03-17)
- [ ] Implementar router automatico por tarea dentro de GitHub Copilot
  - [ ] Integrar `@github/copilot-sdk` en el runtime de la extension
  - [ ] Crear planner con modelo caro y ejecutores por subtarea con modelos baratos
  - [ ] Exponer tools locales seguras para lectura, edicion y verificacion en workspace
  - [ ] Registrar runs y eventos en `copilot-agent/runs/`
  - [ ] Conectar el router a `free-jt7` y a un comando de VS Code
  - [ ] Validar ejecucion minima real con Copilot CLI autenticado

## Auditoria agente free jt7 (2026-03-18)
- [x] Revisar arquitectura, comandos y puntos de entrada
  - [x] Inspeccionar `package.json`, `extension.js`, `copilot_router.js` y `skills_manager.py`
  - [x] Validar documentacion operativa y consistencia con implementacion
  - [x] Ejecutar verificaciones ligeras disponibles
  - [x] Documentar hallazgos, riesgos y acciones sugeridas
  - [x] Corregir colision de escrituras concurrentes en `skills_manager.py`
  - [x] Revalidar instalacion paralela en workspaces temporales
  - [x] Recuperar runtime del router Copilot (dependencias + compatibilidad ESM)
  - [x] Validar skills, autonomia y servidor MCP local
  - [x] Endurecer dependencias del root hasta `npm audit` = 0 vulnerabilidades
  - [x] Dejar el router Copilot listo para token/env y mensaje claro de autenticacion faltante
  - [x] Eliminar el warning residual del router aumentando la espera de `session.idle`
  - [x] Reducir el peso del VSIX excluyendo artefactos no Windows y basura de `node_modules`
  - [x] Instalar y validar el `.vsix` 4.2.2 ya empaquetado en VS Code real
  - [x] Documentar siguiente palanca de optimizacion: bundling del runtime JS y desacople del binario Copilot
  - [x] Bundlear `extension.js` y `copilot_router.js` en `dist/extension.cjs` con `esbuild`
  - [x] Validar la extension instalada desde VSIX usando el bundle generado

## task-run cross-platform Linux (2026-04-16)
- [x] Identificar causa raiz del bloqueo de `runtime-audit` en Linux
  - [x] Confirmar normalizacion indebida a PowerShell para `pwd`
  - [x] Confirmar ejecucion hardcoded con `_execute_powershell()` en `cmd_task_step`
- [x] Corregir shell por plataforma en `skills_manager.py`
  - [x] Mantener traduccion PowerShell solo para Windows
  - [x] Ejecutar con `bash` o `sh` y reintentos POSIX en Linux
- [x] Revalidar auditoria completa
  - [x] Ejecutar `policy-validate`, `doctor --strict`, `rollout-mode`, `host-mode status`, `ide-detect --json`
  - [x] Ejecutar `task-run --goal "runtime-audit" --commands "pwd" "node --version"`
  - [x] Confirmar run verde con checklist completo

## Pruebas de Regresion task-run Cross-Platform (2026-04-16)
- [x] Crear suite de tests automatizados para evitar regresiones del bug Linux/PowerShell
  - [x] Confirmar 0 infraestructura de tests preexistente (sin directorio `tests/`, sin archivos de test)
  - [x] Instalar pytest 9.0.3 en .venv (pip 26.0.1 via curl bootstrap desde bootstrap.pypa.io)
  - [x] Crear `tests/__init__.py` (paquete Python vacío)
  - [x] Crear `tests/test_task_run_cross_platform.py` — 47 test cases, 4 clases
    - [x] `TestPlatformFamily` (7 tests): linux, windows, darwin, unknown→linux, empty→linux
    - [x] `TestNormalizeShellCommand` (17 tests): passthrough POSIX, traducción Windows, auto-detect
    - [x] `TestTaskStepAttempts` (12 tests): redirect POSIX vs PowerShell redirect+cmd fallback
    - [x] `TestExecuteTaskShell` (10 tests): bash/sh en Linux/Darwin, PS en Windows, timeout→rc=124
  - [x] Verificacion: `.venv/bin/pytest tests/ -v` → **47/47 passed in 0.97s**
  - [x] Suite vinculada al fix verificado en run `20260416T002223Z-5d848cba`

## Proveedor y modelos gratis en la extension (2026-04-16)
- [x] Verificar las 6 areas marcadas en la tabla de tareas
  - [x] Auditar implementacion real en `package.json`, `src-js/extension.runtime.js`, `src-js/free-models-catalog.js` y `src-js/api-provider-adapter.js`
  - [x] Corregir la seleccion QuickPick para usar `label/value` reales del catalogo
  - [x] Arreglar `refreshFreeModels` para recargar el catalogo en runtime sin quedar con referencias viejas
  - [x] Revalidar comandos, build y ausencia de errores relevantes

## Indicador visual de proveedor/modelo (2026-04-16)
- [x] Restaurar y reforzar la visibilidad del proveedor/modelo activo en VS Code
  - [x] Identificar la causa raiz en el runtime empaquetado (`src-js/**` excluido del VSIX)
  - [x] Agregar fallback interno para el catalogo cuando el archivo fuente no existe en el paquete
  - [x] Mover el status bar item a la izquierda y hacerlo mas explicito (`Free JT7: proveedor | modelo`)
  - [x] Sincronizar el indicador con cambios de `freejt7.apiProvider` y `freejt7.apiProviderModel`
  - [x] Revalidar sintaxis, build y presencia del texto final en `dist/extension.cjs`

## Configuracion global VS Code desde la extension (2026-04-16)
- [x] Exponer un flujo global real dentro de VS Code
  - [x] Confirmar que `skills_manager.py` ya soportaba `--update-user-settings` con rutas absolutas de usuario
  - [x] Agregar comando `Free JT7: Aplicar configuracion global en VS Code`
  - [x] Hacer que `@freejt7 /install` degrade a configuracion global cuando no hay workspace
  - [x] Agregar atajo explicito `@freejt7 /global`
  - [x] Revalidar bundle, VSIX, instalacion y escritura de `~/.config/Code/User/settings.json`

## Presupuesto de contexto para proveedores externos (2026-04-16)
- [x] Identificar la causa raiz del 400 por `maximum context length`
  - [x] Confirmar que `request.prompt` se reenviaba casi en bruto al adaptador externo
  - [x] Confirmar que `src-js/api-provider-adapter.js` no tenia recorte ni manejo HTTP >= 400
- [x] Corregir el adaptador de proveedores
  - [x] Normalizar API keys y remover comillas residuales
  - [x] Compactar prompts por proveedor con presupuesto defensivo
  - [x] Fijar `max_tokens` de salida para OpenRouter, HF y ZAI
  - [x] Traducir errores remotos de contexto a mensajes accionables
- [x] Verificacion
  - [x] `node -e "require('./src-js/api-provider-adapter.js')"`
  - [x] `npm run build:bundle`

## Analisis comparativo Claurst vs Free JT7 (2026-04-17)
- [x] Auditar Claurst local como referencia de arquitectura avanzada
  - [x] Revisar `spec/` y el workspace Rust de `src-rust/`
  - [x] Confirmar capacidades reales en memoria, cron, plugins, bridge y command/tool system
- [x] Contrastar con el runtime actual de Free JT7
  - [x] Revisar `src-js/`, `skills_manager.py`, `tools/agent_autolearn/` y el servidor MCP local
  - [x] Distinguir fortalezas actuales vs brechas estructurales
- [x] Sintetizar una matriz de adopcion
  - [x] Priorizar que patrones conviene incorporar primero
  - [x] Separar lo recomendable de lo que no conviene copiar ahora
- [x] Persistir el analisis para roadmap futuro
  - [x] Crear `docs/08-ANALISIS-CLAURST-VS-FREEJT7.md`

## Diagnostico error priority node (2026-04-18)
- [x] Objetivo principal: ubicar el origen del error `No lowest priority node found`
  - [x] Confirmar el punto exacto donde aparece en artefactos construidos o dependencias
  - [x] Verificar si la ruta pasa por el runtime propio (`dist/`, `extension.js`, `bundle-entry.js`, `copilot_router.js`)
  - [x] Determinar si hace falta fix local o encapsulacion defensiva
  - [x] Validacion final con evidencia reproducible

## Hardening de cumplimiento operativo del agente (2026-04-18)
- [x] Objetivo principal: forzar checklist, trazabilidad, intake obligatorio y uso de skills/orquestacion
  - [x] Corregir instrucciones y referencias rotas (`.codex-agent` vs `copilot-agent`, skills inexistentes)
  - [x] Exigir aclaraciones previas y desglose antes del plan en tareas no triviales
  - [x] Resolver skills relevantes y reflejarlas en el flujo del router
  - [x] Integrar el router con `task-start` y `task-close` para cerrar trazabilidad real
  - [x] Validacion final con evidencia y resumen de cumplimiento

## Sincronizacion del catalogo de modelos gratis (2026-04-18)
- [x] Objetivo principal: hacer que el catálogo visible de OpenRouter, HuggingFace y ZAI refleje los modelos gratis que realmente funcionan
  - [x] Confirmar la causa raiz del desfase entre QuickPick, fallback empaquetado y adaptador de proveedores
  - [x] Unificar la fuente de verdad del catálogo con cambios mínimos
  - [x] Corregir el refresco del catálogo y el fallback del runtime empaquetado
  - [x] Verificacion final con build y pruebas ligeras del catálogo

## Regeneracion e instalacion del VSIX (2026-04-18)
- [x] Objetivo principal: regenerar e instalar la extensión empaquetada para probar el QuickPick real
  - [x] Ejecutar empaquetado local del VSIX con el bundle actualizado
  - [x] Reinstalar la extensión con `code --install-extension --force`
  - [x] Verificar el artefacto VSIX generado e instalado

## Auditoria integral final de Free JT7 (2026-04-18)
- [x] Objetivo principal: auditar Free JT7 para detectar errores, duplicidades, codigo muerto y brechas multi-IDE/globales
  - [x] Ejecutar chequeos de runtime, policy, host mode, ide detect y un run auditado
  - [x] Auditar codigo y estructura para solapamientos, duplicidad de funciones y codigo muerto evidente
  - [x] Revisar instalacion global, empaquetado VSIX y experiencia de clonacion + setup
  - [x] Sintetizar hallazgos priorizados, gaps y riesgos residuales con evidencia

## Plan de remediacion corto tras auditoria final (2026-04-19)
- [x] Objetivo principal: ejecutar los fixes de mayor impacto con cambios minimos y compatibles
  - [x] Actualizar README a la version, comandos y alcance operativo reales de la release actual
  - [x] Exponer desde la extension un flujo global multi-IDE real, no limitado a VS Code
  - [x] Consolidar instaladores PowerShell para reducir duplicidad y solapamiento operativo
  - [x] Verificacion final con build del bundle y validacion ligera de comandos/documentacion

## Segunda pasada correctiva de wrappers y matriz comparativa (2026-04-19)
- [x] Objetivo principal: reducir duplicidad de wrappers operativos y dejar lista la comparativa real contra OpenClaw, Codex y Claude Code
  - [x] Confirmar la fuente de verdad de resolucion/arranque de OpenClaw y detectar wrappers que reimplementan la misma logica
  - [x] Simplificar la capa de wrappers OpenClaw con cambios minimos y compatibles
  - [x] Actualizar la documentacion operativa afectada por la simplificacion de wrappers
  - [x] Diseñar una matriz de metricas, pesos, escenarios y evidencia para la comparativa real entre agentes
  - [x] Verificacion final con build y validacion ligera de la documentacion nueva/ajustada

## Integracion restante del analisis Claurst vs Free JT7 (2026-04-19)
- [x] Objetivo principal: integrar las mejoras todavia pendientes del analisis sin romper compatibilidad
  - [x] Delimitar el delta real entre el documento y el runtime actual para no reimplementar subsistemas ya existentes
  - [x] Reforzar el bridge remoto con estado persistente, sesiones y aprobaciones/eventos auditables
  - [x] Introducir fachadas canonicas de capas `runtime/` y `providers/` y reencaminar imports sin romper compatibilidad
  - [x] Corregir huecos de integracion detectados durante la pasada, especialmente en scheduler/runtime
  - [x] Actualizar la documentacion del analisis para reflejar el estado actual tras la integracion
  - [x] Verificacion final con build y chequeos de errores relevantes

## Auditoria comparativa avanzada Free JT7 vs Claurst/Codex (2026-04-19)
- [x] Objetivo principal: auditar el runtime actual y proponer mejoras avanzadas e integraciones seguras sin romper compatibilidad

## Activacion global real y proveedor externo efectivo (2026-04-19)
- [x] Objetivo principal: garantizar que Free JT7 quede activo en cualquier carpeta abierta en VS Code y que el runtime use OpenRouter gratis por defecto en lugar de Copilot
  - [x] Confirmar la causa raiz de la activacion limitada al workspace actual
  - [x] Confirmar por que el router sigue cayendo en Copilot aunque exista configuracion global externa
  - [x] Auto-reparar settings globales para que apunten a la extension instalada y no al checkout fuente
  - [x] Auto-instalar el bridge minimo del workspace al abrir carpetas nuevas en VS Code
  - [x] Cambiar el default operativo del proveedor a OpenRouter gratis y unificar UI/runtime
  - [x] Verificacion final en carpeta externa + runtime auditado
  - [x] Relevar capacidades avanzadas de Claurst no absorbidas todavia por Free JT7 y separar brechas reales de brechas ya cerradas
  - [x] Revisar el modelo operativo de Codex y detectar patrones de trabajo utiles todavia no institucionalizados en Free JT7
  - [x] Auditar Free JT7 post-fix para encontrar mejoras de eficiencia, velocidad, seguridad, estabilidad, token economy y auto-mejora
  - [x] Priorizar iniciativas por impacto, riesgo y costo de integracion, con fases compatibles hacia atras
  - [x] Sintetizar findings, riesgos residuales y roadmap de integracion con verificacion esperada

## Fase 1 review loop del router Copilot (2026-04-19)
- [x] Objetivo principal: cerrar la primera fase del roadmap integrando un review stage nativo con gates reales en el router
  - [x] Diseñar el recorte minimo compatible del review loop y su activacion por configuracion/riesgo
  - [x] Implementar `reviewStage` estructurado en `src-js/core/copilot_router.runtime.js`
  - [x] Extender configuracion y salida final del router para exponer findings y estado del gate
  - [x] Añadir smoke test ligero del review stage sin introducir un framework JS nuevo
  - [x] Verificacion final con build, smoke test y chequeo de errores relevantes

## Fase 2+3 router loop, budget y bridge (2026-04-19)
- [x] Objetivo principal: completar el loop implementacion→review→fix→re-review y consolidar budget/contexto + reanudacion remota
  - [x] Añadir auto-remediacion de findings al router con re-review y gate final compatible
  - [x] Crear una capa central de `context-budget` reutilizable entre router, memoria y proveedores
  - [x] Endurecer el bridge remoto para persistir findings, gates y punteros de reanudacion entre sesiones
  - [x] Extender smoke tests para cubrir auto-fix, budget y recuperacion de estado
  - [x] Verificacion final con build, smoke tests y chequeo de errores relevantes

## Fase 4 router hooks nativos y prueba funcional bloqueada (2026-04-19)
- [ ] Objetivo principal: cerrar hooks reales `preToolUse`/`postToolUse` en el router y ejecutar una corrida funcional que deje el gate bloqueado con resume state verificable
  - [x] Conectar hooks nativos del Copilot SDK con el plugin runtime y policies del router
  - [x] Persistir trazas relevantes de uso de tools para auditoria y reanudacion
  - [x] Añadir cobertura automatizada del cableado de hooks y de la politica de intercepcion
  - [ ] Ejecutar una corrida funcional real del router que provoque gate bloqueado y revisar el resume state final
    - [ ] Bloqueado por autenticacion ausente del Copilot CLI/SDK en este host (`COPILOT_GITHUB_TOKEN`/`GH_TOKEN`/`GITHUB_TOKEN` no configurados y `gh` no instalado)
  - [ ] Verificacion final con tests, build y evidencia de la corrida funcional

## Fase 5 identidad canonica multi-host del bridge (2026-04-19)
- [x] Objetivo principal: endurecer la identidad de proyecto/host para evitar reuse accidental de estado stale entre hosts o rutas no canónicas
  - [x] Normalizar project root canónico y fingerprint estable dentro del remote bridge
  - [x] Exponer compatibilidad/stale state en `getSessionResume()`
  - [x] Extender aprobaciones y snapshot con identidad de proyecto/host relevante
  - [x] Añadir cobertura smoke de coexistencia multi-host y path canónico
  - [x] Verificacion final con smoke suite y build

## Checklist consolidado de auditoría + identidad CLI multi-host (2026-04-19)
- [x] Objetivo principal: dejar visible qué hallazgos/fases de la auditoría avanzada ya están ejecutados y cerrar la identidad canónica pendiente en las superficies CLI
  - [x] Añadir checklist consolidado de hallazgos y fases en `docs/11-AUDITORIA-AVANZADA-FREEJT7-CLAURST-CODEX.md`
  - [x] Endurecer `active-project.json` y la resolución CLI contra rutas stale cross-host/cross-platform
  - [x] Añadir pruebas Python para identidad activa y detección de rutas foráneas
  - [x] Verificación final con pytest selectivo y `doctor --strict`

## Fase 4 evaluada + Fase 5 capability packs externos (2026-04-19)
- [x] Objetivo principal: cerrar la auto-mejora evaluator-driven y habilitar manifests versionados para capability packs externos sin tocar el core por integración
  - [x] Añadir evaluator previo al collector con scoring, tags y criterios de aceptación reutilizables
  - [x] Generar regression packs desde runs/dataset validados y conectarlos al pipeline de AutoLearn
  - [x] Diseñar e implementar `integration manifest` versionado y discovery seguro para capability packs
  - [x] Añadir un capability pack externo de ejemplo y validarlo sin cambios en el core de runtime
  - [x] Verificación final con pruebas Python, smoke del runtime de plugins y build

## Lock definitivo de concurrencia del router core (2026-04-19)
- [x] Objetivo principal: bajar el guard de concurrencia al núcleo del router para cubrir extensión y entradas directas CLI/core
  - [x] Registrar la protección en `src-js/core/copilot_router.runtime.js` sin romper compatibilidad
  - [x] Añadir smoke test JS mínimo para doble invocación concurrente del core
  - [x] Revalidar build y smoke test de concurrencia
  - [x] Actualizar trazabilidad final y memoria preventiva si aplica

## Release final: auditoría, empaquetado e instalación/publicación (2026-04-19)
- [ ] Objetivo principal: cerrar la release empaquetable/publicable del estado actual del runtime con evidencia fresca y metadatos coherentes
  - [x] Auditar runtime, toolchain de empaquetado y estado git antes de tocar la release
  - [x] Registrar y ajustar la versión/changelog para que describan el árbol real a publicar
  - [x] Renumerar la release a `4.2.9` para evitar la colisión con el tag local `v4.2.8`
  - [x] Regenerar el VSIX desde el estado actual del workspace
  - [x] Reinstalar el VSIX `4.2.9` y verificar instalación/artefacto en VS Code
  - [ ] Evaluar publicación git local/remota sobre el working tree actual y cerrar trazabilidad final
  - [ ] Resolver bloqueo de publicación restante: árbol muy mezclado aun después de mover la release a `4.2.9`

## Commit limpio y tag local de release 4.2.9 (2026-04-19)
- [x] Objetivo principal: separar la release real del ruido operativo y dejarla lista para publicar sin empujar nada todavía
  - [x] Auditar la rama y el working tree mezclado para distinguir release vs cambios ajenos
  - [x] Confirmar que `v4.2.8` ya existe y que `v4.2.9` sigue libre
  - [x] Seleccionar el subconjunto exacto de archivos que sí entran en el commit limpio
  - [x] Crear el commit local limpio de la release `4.2.9`
  - [x] Crear y validar el tag local `v4.2.9`
  - [x] Dejar documentado qué archivos quedaron fuera del release para no mezclar publicación con trazabilidad local

## Extension global autosuficiente vs workspace bootstrapado (2026-04-20)
- [x] Objetivo principal: hacer que el VSIX funcione como extensión normal en cualquier carpeta abierta, sin depender de convertirla en repo Free JT7
  - [x] Confirmar la causa raíz técnica en runtime, instalador y empaquetado
  - [x] Separar el modo global instalado del modo workspace gestionado dentro del runtime
  - [x] Evitar que la autocuración global escriba bootstrap dentro de la carpeta de la extensión instalada
  - [x] Mover estado operativo por defecto a storage global cuando el workspace no sea gestionado por Free JT7
  - [x] Verificar build, pruebas y empaquetado del VSIX tras el desacople

## Autocuración global ante drift real de settings (2026-04-20)
- [x] Objetivo principal: impedir que la extensión instalada dé por buena una sincronización vieja cuando `settings.json` ya volvió a apuntar al checkout fuente
  - [x] Confirmar con evidencia si el reparador manual desde la extensión instalada corrige los settings globales
  - [x] Hacer que el runtime valide el contenido real de settings antes de saltarse la reparación automática
  - [x] Verificar build y una prueba reproducible de reparación contra la copia instalada en ~/.vscode/extensions
  - [x] Registrar la regla preventiva en memoria operativa

## Evaluación de factibilidad de integración de ZIP externo (2026-04-20)
- [x] Objetivo principal: analizar `files.zip` y determinar si conviene integrarlo en Free JT7, cómo y con qué riesgo
  - [x] Inventariar el contenido real del ZIP y clasificar su propósito técnico
  - [x] Identificar dependencias, supuestos de entorno y contratos de entrada/salida
  - [x] Mapear puntos de acople con runtime, plugins, tools, scheduler o bridges de Free JT7
  - [x] Evaluar compatibilidad, riesgos, esfuerzo y estrategia de integración recomendada
  - [x] Entregar informe final con evidencia y decisión de factibilidad

## Clonación de repositorio oficial de Remotion (2026-04-19)
- [ ] Objetivo principal: clonar `remotion-dev/remotion` en la carpeta opcional externa indicada por el usuario
  - [x] Verificar cuál es el repositorio oficial de Remotion en GitHub
  - [ ] Validar la carpeta destino y evitar colisión con una clonación previa
  - [ ] Ejecutar `git clone` en `/home/javier28/Público/REPOSOTORIOS OPCIONALES`
  - [ ] Confirmar que la copia quedó accesible y listar la ruta final

## Registro real Canva MCP + validación del design agent (2026-04-21)
- [x] Objetivo principal: completar el alta real del cliente Canva MCP y dejar el design agent listo con evidencia exacta
  - [x] Intentar el registro manual real contra `https://mcp.canva.com/register`
  - [x] Persistir `client_id` y `client_secret` en `.env.free-jt7` si Canva responde correctamente
  - [x] Ejecutar verificación del agente con `doctor` y arrancar `auth-canva`
  - [x] Corregir el flujo OAuth del agente para usar `https://mcp.canva.com/authorize` y `https://mcp.canva.com/token`
  - [x] Completar en navegador el consentimiento OAuth y generar `copilot-agent/runs/design-agent/canva_tokens.json`

## Rama feature/agente-diseno (2026-04-21)
- [x] Objetivo principal: crear y publicar la rama `feature/agente-diseno` desde el estado actual del repo
  - [x] Confirmar nombre de rama, base y modo de publicacion con el usuario
  - [x] Verificar que `origin` exista y que la rama no esté creada previamente
  - [x] Crear la rama local desde el HEAD actual preservando el working tree sin limpiar cambios
  - [x] Publicar la rama en `origin` con upstream configurado
  - [x] Confirmar rama local/remota final y dejar trazabilidad cerrada

## Release 4.2.10 con agente de diseño (2026-04-21)
- [x] Objetivo principal: publicar en `feature/agente-diseno` una nueva versión correlativa empaquetada que incluya el agente de diseño
  - [x] Confirmar alcance de release, rama destino y validación mínima con el usuario
  - [x] Abrir trazabilidad específica para commit, push y empaquetado de la nueva versión
  - [x] Renumerar metadatos de release de `4.2.9` a `4.2.10`
  - [x] Revalidar `doctor` y `pytest tests/test_design_agent.py -q` sobre el estado final de release
  - [x] Generar el VSIX `4.2.10` y comprobar que el artefacto existe
  - [x] Crear commit convencional de release y empujarlo a `origin/feature/agente-diseno`
  - [x] Cerrar la trazabilidad operativa final con evidencia fresca

## VSIX 4.2.11 con panel propio y modo agente/directo (2026-04-26)
- [x] Objetivo principal: regenerar e instalar una VSIX actualizada donde el panel propio sea la interfaz principal de Free JT7
  - [x] Desacoplar la experiencia principal del `chat participant` de GitHub Copilot y dejarlo opcional por defecto
  - [x] Mantener el modo `agent` para capacidades reales de Free JT7 y el modo `direct` para proveedores externos
  - [x] Verificar humo de contexto conversacional, selector de modo, UI del panel y bundle final
  - [x] Empaquetar `agente-freejt7-extension-funcional-4.2.11.vsix` e instalarla con `code --install-extension --force`

## Modo agent externo via OpenClaw (2026-04-26)
- [ ] Objetivo principal: restaurar la autonomia real de Free JT7 en `modo agent` para OpenRouter/Clod/HF/ZAI usando OpenClaw
  - [x] Confirmar intake minimo del usuario (entregable, no-goals y validacion esperada)
  - [x] Leer trazabilidad obligatoria y auditar el corte exacto entre `agent` y `direct`
  - [ ] Diseñar el acople minimo entre panel, `ProviderRouter`, OpenClaw y el MCP local de Free JT7
  - [ ] Implementar el runtime `agent` externo con configuracion y MCP por workspace
  - [ ] Añadir smoke tests del enrutamiento y la configuracion OpenClaw
  - [ ] Empaquetar e instalar una VSIX nueva con la integracion cerrada

## Free JT7 App Standalone inmediata (2026-04-26)
- [ ] Objetivo principal: ejecutar Free JT7 como app aislada tipo Trae/Kiro sin depender de Copilot/Claude/Codex
  - [x] Definir plan de migracion por fases con entregable inmediato y backlog de hardening
  - [x] Implementar bootstrap standalone para perfil aislado (`user-data-dir` + `extensions-dir`) con instalacion VSIX automatica
  - [x] Forzar settings de perfil para panel Free JT7 y desactivar integraciones Copilot en ese entorno
  - [x] Agregar wrappers de lanzamiento (`run-freejt7-app.sh` y `run-freejt7-app.ps1`)
  - [x] Exponer comandos npm de ejecucion (`app:standalone`, `app:standalone:setup`, `app:standalone:dry-run`)
  - [x] Añadir smoke test de bootstrap standalone y documentar uso operativo en README + plan dedicado
  - [x] Iniciar Fase 2 con bootstrap de IDE propio (`app:own-ide*`) para runtime VSCodium portable
  - [x] Ejecutar piloto funcional guiado por el usuario sobre su IDE destino (VSCodium portable + perfil `own-ide`) y validar setup/lanzamiento
  - [x] Empaquetar instalador nativo `.deb` de Free JT7 Desktop y validar instalacion en Linux actual (con fallback local sin root)
  - [x] Empaquetar instalador nativo `.rpm` de Free JT7 Desktop y validar instalacion en Linux actual (con fallback local sin root)
  - [ ] Empaquetar instalador `.exe` sobre el host propio ya validado


## Auditoria estructural profesional y limpieza de duplicados (2026-05-19)
- [x] Inventario de directorios/scripts y deteccion de duplicados reales/no usados.
- [x] Eliminacion de duplicados de artefactos locales (`files (1)`, `test-router-2.js`, `test-bypass.js`).
- [x] Verificacion con pruebas unitarias/smoke de scripts tocados + lint/static checks.
- [x] Cierre de trazabilidad en `copilot-agent/*` y resumen tecnico.


## Evaluacion comparativa Free JT7 vs agentes autonomos profesionales (2026-05-19)
- [x] Desglosar micro-tareas de comparativa profesional por ejes medibles.
- [x] Implementar script reproducible de evaluacion (`tools/agent_evaluation/evaluate_freejt7.py`).
- [x] Agregar prueba unitaria para el evaluador comparativo.
- [x] Ejecutar unit tests + smokes/lint de verificacion final.


## Plan de cierre de brecha competitiva Free JT7 (2026-05-19)
- [x] Definir plan accionable por fases para cerrar brecha 0.8 detectada en la evaluacion.
- [x] Mejorar script de evaluacion para emitir roadmap tecnico priorizado.
- [x] Agregar/ajustar pruebas unitarias del nuevo roadmap.
- [x] Ejecutar pruebas unitarias y checks smoke/build.


## Ejecucion real del cierre de brecha a nivel profesional (2026-05-19)
- [x] Implementar quality gate reproducible (lint + smokes + unit tests estables x3 + build).
- [x] Agregar workflow CI para ejecutar gate en PR/push.
- [x] Ejecutar gate local y registrar metricas reproducibles.
- [x] Analizar repos publicos de referencia para mejoras reutilizables.


## Aclaracion de independencia de Copilot en namespace de estado (2026-05-19)
- [x] Implementar resolucion de estado agent-first (`freejt7-agent`) con fallback legacy compatible.
- [x] Aplicar el resolvedor en modulos de estado/auditoria/sesion/memoria.
- [x] Documentar claramente que `copilot-agent` era namespace historico y no dependencia obligatoria.
- [x] Ejecutar pruebas unitarias/smoke/build sobre rutas tocadas.


## Migracion fisica controlada copilot-agent -> freejt7-agent (2026-05-19)
- [x] Implementar script de migracion con backup y merge seguro.
- [x] Implementar rollback restaurando namespace legacy desde backup.
- [x] Ejecutar migracion real del workspace.
- [x] Ejecutar pruebas unitarias/smoke/build post-migracion.


## Ejecucion del plan Fase 1: compaction manager (2026-05-19)
- [x] Implementar compactador de historial conversacional con meta de compresion.
- [x] Integrar compactacion en `buildConversationRequest` sin romper contrato actual.
- [x] Agregar smoke test dedicada para la compactacion.
- [x] Ejecutar unit/smoke/build post-cambio.


## Ejecucion del plan Fase 2: memoria semantica asincrona (2026-05-19)
- [x] Implementar modulo de memoria semantica con append/retrieve top-K.
- [x] Integrar recuperacion semantica en `chat-context` para enriquecer prompt del agente.
- [x] Agregar smoke test dedicada para memoria semantica.
- [x] Ejecutar pruebas unitarias/smoke/build post-cambio.


## Ejecucion del plan Fase 3: busqueda orientada a agente (2026-05-19)
- [x] Implementar modulo `agent-search` sobre archivos de sesion/proyecto.
- [x] Integrar bloque de busqueda en `chat-context` para prompts mas relevantes.
- [x] Agregar smoke dedicada de busqueda con ranking top-K.
- [x] Ejecutar pruebas unitarias/smoke/build post-cambio.


## Ejecucion del plan Fase 4: provider-core failover hardening (2026-05-19)
- [x] Extraer utilidades de cooldown/ranking a `provider-core`.
- [x] Integrar ranking por cooldown y politicas de enfriamiento en `provider-router`.
- [x] Agregar smoke de provider-core.
- [x] Ejecutar bateria funcional integral del agente (smokes/tests/build/package/setup).


## Ejecucion del plan Fase 5: activacion selectiva de capacidades (2026-05-19)
- [x] Implementar modulo de activacion selectiva por perfil de tarea.
- [x] Integrar activacion selectiva en `freejt7-agent-runtime` dentro de `capabilityPlan`.
- [x] Agregar smoke dedicada de activacion selectiva.
- [x] Ejecutar pruebas funcionales integrales del agente post-fase 5.


## Ejecucion del plan Fase 6: swarm formal (2026-05-19)
- [x] Implementar orquestador swarm con activacion por complejidad.
- [x] Integrar `swarmPlan` en `capabilityPlan` del runtime agente.
- [x] Agregar smoke dedicada para validacion single-agent/multi-agent.
- [x] Ejecutar bateria funcional integral de cierre de fases.


## Cierre operativo post-fases: verificacion funcional unificada (2026-05-19)
- [x] Implementar runner unificado `full_functional_check.py` para validacion completa reproducible.
- [x] Exponer comando npm `quality:functional`.
- [x] Ejecutar verificacion funcional completa y registrar metricas.
