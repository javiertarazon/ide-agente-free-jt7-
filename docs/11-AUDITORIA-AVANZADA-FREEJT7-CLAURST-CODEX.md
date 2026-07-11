# Auditoria avanzada: Free JT7 vs Claurst y patrones de trabajo tipo Codex

Fecha: 2026-04-19
Estado: auditoria comparativa y roadmap de integracion segura

## Resumen ejecutivo

Free JT7 ya dejo de estar atrasado en varias brechas grandes que existian frente a Claurst: hoy tiene scheduler runtime, compresion jerarquica de contexto, orquestador de memoria, runtime de plugins con hooks base, bridge remoto persistente y routing por perfiles/IDE.

La diferencia real ya no esta en “tener o no tener” esos subsistemas, sino en el nivel de cierre operativo:

- Claurst mantiene mejor separacion arquitectonica y mas servicios internos del loop como estado global, retry, cache awareness, bridge remoto fuerte y compactacion integrada como producto, no como adaptacion.
- Free JT7 destaca en despliegue multi-IDE, gobernanza operativa, trazabilidad y flexibilidad de proveedores, pero aun tiene capacidades importantes repartidas entre varios puntos del runtime.
- El patron mas claro que falta desde el lado Codex no es otro proveedor, sino un workflow formalizado de review loop y verificacion de segunda pasada integrado al runtime.

La conclusion es que la mejor evolucion de Free JT7 no es copiar Claurst completo ni perseguir features vistosas. Es consolidar cinco lineas:

1. cerrar el review loop multi-modelo;
2. endurecer bridge y estado de sesion;
3. unificar economia de tokens y politicas de contexto;
4. convertir auto-mejora en un pipeline evaluado y gobernado;
5. abrir una capa de extensiones/importacion externa realmente estable.

## Checklist de estado real

### Hallazgos de la auditoría

- [x] Hallazgo 1. Review loop integrado al runtime.
	Estado: `reviewStage`, auto-fix, re-review y closing gate ya existen en el router y están cubiertos por smoke suite.
- [~] Hallazgo 2. Bridge/session state al nivel de Claurst.
	Estado: sesiones persistentes, approvals, findings, resume pointer e identidad multi-host ya están en runtime; siguen pendientes auth fuerte, transporte remoto resumible y lifecycle remoto más duro.
- [ ] Hallazgo 3. Exceso de concentración en el router principal.
	Estado: sigue pendiente una separación más profunda entre executor loop, policy engine, state/session service y telemetry.
- [~] Hallazgo 4. Economía de tokens gobernada extremo a extremo.
	Estado: `context-budget` compartido ya está integrado en router, memoria y providers; faltan métricas comparativas por run y detección formal de cache/prompt breaks.
- [~] Hallazgo 5. Runtime de plugins end-to-end en tool use.
	Estado: hooks nativos `preToolUse`/`postToolUse` ya están cableados y auditados en runtime; falta solo la evidencia funcional real en un host con autenticación útil de Copilot CLI/SDK.
- [x] Hallazgo 6. Auto-mejora evaluator-driven.
	Estado: cerrado con evaluator previo al collector, `evaluations.jsonl`, `routing_hints.json`, regression packs y extracción de runs redirigida al pipeline evaluado.
- [x] Hallazgo 7. Coherencia operativa multi-host.
	Estado: cerrado en bridge y CLI con identidad canónica de proyecto/host, detección de stale state y rechazo de rutas foráneas entre plataformas.

### Fases del roadmap

- [x] Fase 1. Cerrar workflow y verificación.
	Estado: review loop, findings estructurados y gates reales ya integrados y verificados.
- [~] Fase 2. Harden bridge y session state.
	Estado: persistencia, resume pointer e identidad multi-host ya ejecutados; faltan auth fuerte, transporte abstraído resumible y separación total de lifecycle.
- [~] Fase 3. Unificar token economy.
	Estado: servicio central `context-budget` ya ejecutado; faltan métricas de ahorro por run y cache-break taxonomy.
- [x] Fase 4. Auto-mejora evaluada.
	Estado: ejecutada con scoring reutilizable, aceptación por evaluator, packs de regresión y hints de routing desde historial validado.
- [x] Fase 5. Plataforma de integraciones externas.
	Estado: ejecutada con `integration manifest` versionado, discovery seguro en runtime y capability pack externo de ejemplo sin tocar el core.

### Bloqueos externos actuales

- [~] Corrida funcional real del router con gate bloqueado.
	Estado: bloqueada por autenticación ausente del Copilot CLI/SDK en este host.

## Base usada para esta auditoria

### Free JT7 revisado en codigo real

- Routing y ejecucion principal: [src-js/core/copilot_router.runtime.js](src-js/core/copilot_router.runtime.js)
- Scheduler runtime: [src-js/scheduler/agent-scheduler.js](src-js/scheduler/agent-scheduler.js)
- Bridge remoto persistente: [src-js/bridge/remote-bridge.js](src-js/bridge/remote-bridge.js)
- Runtime de plugins: [src-js/plugins/plugin-runtime.js](src-js/plugins/plugin-runtime.js)
- Fachada canonica de plugins: [src-js/runtime/plugin-runtime.js](src-js/runtime/plugin-runtime.js)
- Orquestacion de memoria: [src-js/memory/memory-orchestrator.js](src-js/memory/memory-orchestrator.js)
- Compresion jerarquica de contexto: [src-js/memory/context-hierarchy.js](src-js/memory/context-hierarchy.js)
- Integracion del contexto en el router: [src-js/memory/context-integration.js](src-js/memory/context-integration.js)
- Routing por IDE/modelo: [.github/free-jt7-model-routing.json](.github/free-jt7-model-routing.json)
- Autoaprendizaje por lotes: [tools/agent_autolearn/README.md](tools/agent_autolearn/README.md)

### Referencias internas ya existentes sobre la comparativa

- Analisis Claurst vs Free JT7: [docs/08-ANALISIS-CLAURST-VS-FREEJT7.md](docs/08-ANALISIS-CLAURST-VS-FREEJT7.md)
- Matriz comparativa de agentes: [docs/10-MATRIZ-COMPARATIVA-AGENTES.md](docs/10-MATRIZ-COMPARATIVA-AGENTES.md)
- Patrón emergente de review loop con Codex: [.github/skills/last30days/README.md](.github/skills/last30days/README.md)

### Claurst revisado

Se uso el README, el workspace Rust y sus specs como referencia arquitectonica. Los aportes mas valiosos observados fueron:

- separacion por crates de core, api, query, commands, bridge, plugins y buddy;
- bridge remoto con protocolo y ciclo de sesion mucho mas fuerte;
- servicios integrados de compactacion, retry, session memory y cache awareness;
- comandos y tools mas claramente separados;
- surfaces experimentales aisladas del core.

## Lo que Free JT7 ya tiene y esta bien encaminado

### 1. Economia de contexto ya existe

Free JT7 ya no depende solo de truncado bruto. Tiene compresion jerarquica por tiers y reinyeccion lazy de memoria:

- [src-js/memory/context-hierarchy.js](src-js/memory/context-hierarchy.js)
- [src-js/memory/context-integration.js](src-js/memory/context-integration.js)

Ademas, el router ya calcula caps de texto y el adaptador de proveedores ya expone limites reales de contexto/salida por modelo:

- [src-js/core/copilot_router.runtime.js](src-js/core/copilot_router.runtime.js)
- [src-js/core/api-provider-adapter.js](src-js/core/api-provider-adapter.js)

Esto significa que la base para gastar menos tokens ya esta. Falta consolidarla y gobernarla mejor.

### 2. Auto-mejora y memoria ya pasaron de idea a runtime parcial

La consolidacion ya no es solo documental. Existe:

- extraccion de ejemplos desde runs;
- snapshots de memoria/tareas;
- entrenamiento por lotes;
- scheduler que dispara estos procesos.

Evidencia:

- [src-js/memory/memory-orchestrator.js](src-js/memory/memory-orchestrator.js)
- [src-js/scheduler/agent-scheduler.js](src-js/scheduler/agent-scheduler.js)
- [tools/agent_autolearn/README.md](tools/agent_autolearn/README.md)

### 3. Plugins ya no son solo CLI

Hay validacion de manifests, capacidades y hooks de runtime:

- [src-js/plugins/plugin-runtime.js](src-js/plugins/plugin-runtime.js)

Y el router ya emite hooks de ruta:

- [src-js/core/copilot_router.runtime.js](src-js/core/copilot_router.runtime.js)

### 4. Bridge remoto ya existe en runtime

Ya no es solo idea de roadmap. Hay sesiones, cola, aprobaciones y eventos persistidos:

- [src-js/bridge/remote-bridge.js](src-js/bridge/remote-bridge.js)

### 5. Routing multi-IDE y multi-proveedor ya es una ventaja real

Free JT7 esta mejor posicionado que Claurst para operar en entornos mixtos y para escoger coste/calidad por perfil:

- [.github/free-jt7-model-routing.json](.github/free-jt7-model-routing.json)
- [src-js/core/api-provider-adapter.js](src-js/core/api-provider-adapter.js)

## Hallazgos prioritarios

### Hallazgo 1. Falta un review loop real integrado al runtime

Severidad: alta

El patron de trabajo tipo Codex mas valioso para Free JT7 no es “usar Codex” como branding, sino cerrar el ciclo:

- implementacion;
- review de segunda pasada;
- integracion de findings;
- verificacion final.

Hoy Free JT7 tiene piezas sueltas para esto:

- habilidades de verificacion y review en instrucciones;
- tickets de aprobacion remota en el router;
- matriz de comparacion de agentes.

Pero no existe una orquestacion nativa y automatica de review loop en codigo. No aparecen integraciones directas con `codex-review`, `requesting-code-review` o un verificador estructurado dentro de [src-js/core/copilot_router.runtime.js](src-js/core/copilot_router.runtime.js).

Impacto:

- mas riesgo de declarar exito con una sola pasada;
- menor aprovechamiento de multi-modelo;
- menos paridad con el flujo de trabajo fuerte que hoy se asocia a Codex.

### Hallazgo 2. El bridge remoto existe, pero sigue siendo liviano frente a Claurst

Severidad: alta

El bridge actual persiste estado local, sesiones, cola y aprobaciones en JSON. Eso resuelve la brecha funcional inicial, pero no alcanza el nivel de robustez del modelo observado en Claurst, que separa transporte, autenticacion, work secrets, pointer de recuperacion y lifecycle remoto.

En Free JT7, la base esta en [src-js/bridge/remote-bridge.js](src-js/bridge/remote-bridge.js), pero faltan al menos:

- autenticacion fuerte por sesion;
- canal remoto resumible;
- crash recovery formal;
- distincion clara entre transporte, sesion y aprobaciones;
- sincronizacion de estado pensada para UI remota real.

Impacto:

- buena base para control remoto basico;
- baja resiliencia si se quiere escalar a companion web/mobile o sesiones largas.

### Hallazgo 3. La arquitectura sigue concentrando demasiado poder en el router principal

Severidad: alta

La introduccion de fachadas `runtime/` y `providers/` mejoro mucho la situacion, pero [src-js/core/copilot_router.runtime.js](src-js/core/copilot_router.runtime.js) sigue siendo el gran punto de convergencia para:

- contexto;
- routing;
- permisos;
- bridge;
- provider delegation;
- evidencias;
- aprobaciones remotas.

Comparado con Claurst, falta una separacion mas firme entre:

- session state;
- executor loop;
- review loop;
- bridge transport;
- policy/approval engine;
- telemetry/token budgeting.

Impacto:

- dificulta evolucionar sin regresiones;
- sube el coste cognitivo de cambios profundos;
- hace mas fragil la extensibilidad.

### Hallazgo 4. La economia de tokens es buena, pero todavia no esta gobernada extremo a extremo

Severidad: media-alta

Estado 2026-04-19: parcialmente cerrado en runtime. Ya existe un servicio central [src-js/core/context-budget.js](src-js/core/context-budget.js) y hoy lo consumen router, memoria y providers. Lo que sigue pendiente no es crear el servicio, sino ampliar su telemetría comparativa y la detección de cache/prompt breaks a nivel de run.

La base tecnica ya es buena:

- caps por seccion del prompt en el router;
- limites por modelo/proveedor;
- compresion jerarquica;
- lazy loading de memoria.

Pero faltan piezas de “productizacion” que Claurst si sugiere por su superficie de servicios:

- deteccion de roturas de cache/prompt;
- un servicio central de presupuesto de contexto, no repartido entre router, memoria y providers;
- metricas comparables de ahorro real por ejecucion;
- politicas consistentes entre rutas Copilot SDK y delegacion a proveedores externos.

Impacto:

- Free JT7 ya puede ahorrar tokens, pero no siempre puede demostrar donde y cuanto;
- todavia hay riesgo de divergencia entre superficies de ejecucion.

### Hallazgo 5. El runtime de plugins esta abierto, pero el circuito end-to-end todavia es parcial

Severidad: media

Estado 2026-04-19: cerrado a nivel de runtime para el router Copilot. `preToolUse` y `postToolUse` ya se cablean como hooks nativos del Copilot SDK dentro de [src-js/core/copilot_router.runtime.js](src-js/core/copilot_router.runtime.js), con persistencia de trazas en [src-js/bridge/remote-bridge.js](src-js/bridge/remote-bridge.js). Queda pendiente solo la validacion end-to-end en un host con autenticacion utilizable de Copilot CLI/SDK.

El runtime de plugins ya valida capacidades y registra hooks. El problema es que en el router solo se observan emisiones claras para:

- `onRouteStart`
- `onRouteEnd`
- `onError`

No aparece un uso equivalente de `preToolUse` y `postToolUse` como primer ciudadano del flujo real.

Resultado:

- la arquitectura de plugins existe;
- la extensibilidad por interceptacion de herramientas aun no esta completamente cerrada.

Esto limita el valor de integraciones externas avanzadas, auditoria de herramientas y policy plugins.

### Hallazgo 6. La auto-mejora sigue siendo batch-oriented, no evaluator-driven

Severidad: media

El bucle actual de AutoLearn esta bien planteado para no sobreentrenar y para guardar exitos verificados. Eso es correcto.

Lo que falta es una capa intermedia de evaluacion mas rica:

- score de calidad por ejemplo;
- rechazo de ejemplos debiles aunque “pasen” una verificacion minima;
- dataset tagging por patron de tarea;
- regresion sets reutilizables;
- feedback loop hacia routing y seleccion de estrategia.

Sin eso, la auto-mejora existe, pero no optimiza agresivamente la calidad futura del agente.

### Hallazgo 7. Existe una oportunidad clara de endurecer la coherencia operativa multi-host

Severidad: media-baja

Estado 2026-04-19: mitigado de extremo a extremo en bridge y CLI. [src-js/bridge/remote-bridge.js](src-js/bridge/remote-bridge.js) ya normaliza `projectRoot` canónico, guarda `projectId` y `hostFingerprint`, y expone `identityStatus` en `getSessionResume()`; la misma identidad canónica ya se aplica también al estado CLI en [skills_manager.py](skills_manager.py) y [copilot-agent/active-project.json](copilot-agent/active-project.json) para invalidar rutas stale o de otra plataforma.

En el estado actual ya aparecio un indicio de drift operativo: el proyecto activo seguia apuntando a una ruta Windows desde un workspace Linux. Eso no rompe el runtime por si solo, pero revela un problema de normalizacion de contexto entre hosts.

Si Free JT7 quiere ser realmente multi-IDE y multi-host, debe tratar el estado persistido con mas reglas de identidad de proyecto:

- raiz canonica;
- host fingerprint;
- path mapping por plataforma;
- invalidacion de estado obsoleto.

## Mejoras concretas inspiradas en Claurst

### Adoptar ya

1. Separacion mas estricta de runtime services.
2. Session state formal y serializable como subsistema propio.
3. Bridge por capas: auth, transport, session lifecycle, approvals.
4. Retry y error taxonomy reutilizable entre providers y router.
5. Politica de compaction y token budgeting como servicio central.

### Adoptar con adaptacion

1. Compactacion y memory services integrados al loop, pero manteniendo la gobernanza documental de Free JT7.
2. Plugin system con discovery dinamico solo si no rompe el control actual de manifests.
3. Remotizacion mas fuerte, pero sin arrastrar complejidad innecesaria de UI o canales si aun no hay producto remoto claro.

### No priorizar ahora

1. Buddy/Tamagotchi.
2. Features experimentales vistosas sin retorno operativo.
3. Un modo proactive/always-on tipo KAIROS antes de cerrar seguridad, permisos y coste.

## Mejoras concretas inspiradas en patrones de trabajo tipo Codex

### 1. Review loop nativo

Integrar un modo opcional pero facil de activar:

- fase A: implementar;
- fase B: revisar con modelo verificador o skill de review;
- fase C: aplicar findings;
- fase D: re-verificar;
- fase E: cerrar solo si no quedan findings criticos.

Esto debe vivir en el runtime, no solo en prompts o instrucciones.

### 2. Roles de modelo por etapa

Free JT7 ya tiene planner/executor/synthesis. Falta añadir explicitamente:

- verifier/reviewer model;
- risk reviewer opcional para cambios sensibles;
- parser estructurado de findings.

### 3. Cierre con gates reales

El cierre deberia unir:

- verificacion ejecutada;
- findings absorbidos o aceptados explicitamente;
- residual risks estructurados;
- decision de `task_complete` o equivalente solo cuando los gates se cumplan.

### 4. Uso selectivo de doble pasada, no universal

No todo requiere review loop. Debe activarse por reglas de riesgo:

- cambios multi-file;
- seguridad;
- refactors arquitectonicos;
- rutas de integracion externa;
- cambios en bridge, scheduler o providers.

## Roadmap de integracion seguro

## Fase 1. Cerrar workflow y verificacion

Riesgo: bajo
Impacto: alto

Objetivo:

- institucionalizar el review loop multi-modelo y el cierre con gates.

Cambios:

1. Añadir un `reviewStage` al router con reviewer configurable.
2. Reusar tickets de aprobacion remota para findings estructurados.
3. Integrar `codex-review` o skill equivalente como etapa formal opcional.
4. Emitir un resumen final con `findings`, `fixesApplied` y `residualRisks`.

Verificacion:

- smoke test de una tarea con findings simulados;
- confirmacion de que el cierre no ocurre si hay findings criticos abiertos.

## Fase 2. Harden bridge y session state

Riesgo: medio
Impacto: alto

Objetivo:

- convertir el bridge actual en una base de sesion remota estable y recuperable.

Cambios:

1. Separar almacenamiento de sesion, cola, approvals y eventos.
2. Añadir identificacion de host y proyecto.
3. Diseñar pointer de recuperacion y reanudacion segura.
4. Preparar transporte abstraido para polling hoy y SSE/WebSocket mañana.

Verificacion:

- prueba de reinicio del proceso con recuperacion de estado;
- prueba de coexistencia multi-host sin reutilizar estado stale.

## Fase 3. Unificar token economy

Riesgo: medio
Impacto: muy alto

Objetivo:

- medir y gobernar el gasto de contexto y salida en una sola capa.

Cambios:

1. Crear servicio central de `context-budget`.
2. Instrumentar compaction ratio y ahorro estimado por corrida.
3. Unificar caps de router y providers bajo una API comun.
4. Añadir deteccion de prompt-cache break y retry taxonomy.

Verificacion:

- dashboard o log por run con presupuesto, truncado y compaction ratio;
- comparacion antes/despues en runs representativos.

## Fase 4. Auto-mejora evaluada

Riesgo: medio
Impacto: alto

Objetivo:

- pasar de entrenamiento por lote util a aprendizaje realmente utilizable.

Cambios:

1. Añadir evaluator previo al collector.
2. Etiquetar dataset por tipo de tarea, error y stack.
3. Crear regression packs desde runs de alta calidad.
4. Alimentar routing y sugerencia de estrategia desde historial validado.

Verificacion:

- porcentaje de ejemplos aceptados por score;
- mejoria observable en tareas repetidas.

## Fase 5. Plataforma de integraciones externas

Riesgo: medio-alto
Impacto: muy alto

Objetivo:

- permitir absorber valor de repos externos sin copiar codigo ad hoc cada vez.

Cambios:

1. Definir `integration manifest` versionado.
2. Mapear capacidades importables: commands, tools, policies, docs, prompts, evaluators.
3. Enlazar el runtime de plugins con discovery seguro y compatibilidad versionada.
4. Separar integraciones confiables de experimentales.

Verificacion:

- integrar una capability pack externa de ejemplo sin tocar el core;
- rollback limpio y sin efectos laterales.

## Orden recomendado de ejecucion

1. Fase 1
2. Fase 3
3. Fase 2
4. Fase 4
5. Fase 5

Razon:

- primero conviene aumentar calidad y rigor de salida;
- despues bajar coste y controlar contexto;
- luego endurecer el bridge;
- y solo entonces abrir auto-mejora e integracion externa a escala.

## Acciones concretas recomendadas para la siguiente iteracion

### Top 5

1. Implementar `reviewStage` en el router con findings estructurados.
2. Añadir un servicio `context-budget` compartido entre router, memoria y providers.
	Estado 2026-04-19: implementado en runtime; pendiente enriquecer métricas comparativas por run y detección de cache breaks.
3. Expandir el plugin runtime hasta hooks reales de tool use.
	Estado 2026-04-19: implementado en runtime; pendiente la corrida funcional real en host autenticado para dejar evidencia end-to-end.
4. Normalizar identidad de proyecto/host en el estado persistido.
	Estado 2026-04-19: implementado en remote bridge y en superficies CLI (`active-project.json` + resolución en `skills_manager.py`).
5. Diseñar `integration manifest` para capability packs externos.

## Riesgos residuales si no se actua

- El runtime seguira mejorando, pero con un centro de gravedad demasiado concentrado en el router.
- El ahorro de tokens seguira existiendo sin ser totalmente gobernable ni medible.
- La auto-mejora seguira siendo util, pero de retorno limitado.
- El bridge remoto puede quedar util para demo interna, no para una superficie remota madura.
- La ventaja multi-IDE de Free JT7 podria diluirse si la extensibilidad externa no se estandariza.

## Conclusion

Free JT7 ya no necesita una reescritura inspirada en Claurst. Necesita cerrar producto alrededor de las capacidades que ya tiene sembradas.

La mejor estrategia es:

- menos “nuevas features visibles”;
- mas cierre de loop, medicion, verificacion, hardening y contratos de extension.

Si se ejecutan bien Fase 1 a Fase 3, Free JT7 puede quedar por delante de Claurst en operabilidad real y por delante de un flujo Codex aislado en gobernanza, multi-IDE y coste por tarea resuelta.