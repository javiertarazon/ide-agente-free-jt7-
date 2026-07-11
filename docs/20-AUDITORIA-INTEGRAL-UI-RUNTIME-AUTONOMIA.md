# Auditoria integral UI, runtime y autonomia Free JT7

Fecha: 2026-04-27

## Objetivo

Validar si Free JT7 esta realmente listo para operar como interfaz principal tipo Codes/Copilot Chat con:

- panel funcional y estable en own-ide/VSCodium
- runtime agente coherente
- proveedores externos operativos
- trazabilidad y control de riesgo
- posibilidad real de orquestar subagentes

La auditoria se apoya en evidencia ejecutable del repo actual y en comparativa con:

- OpenClaw
- OpenCode
- Claurst

## Evidencia ejecutada en esta pasada

Base runtime del repo principal:

- `python skills_manager.py policy-validate` -> OK
- `python skills_manager.py doctor --strict` -> OK
- `python skills_manager.py rollout-mode` -> `autonomous`
- `python skills_manager.py host-mode status` -> `full / sandbox`
- `python skills_manager.py ide-detect --json` -> OK

Smokes criticos del flujo actual:

- `node tests/control_panel_ui_smoke.js` -> OK
- `node tests/panel_execution_mode_smoke.js` -> OK
- `node tests/openclaw_runtime_smoke.js` -> OK
- `node tests/provider_router_failover_smoke.js` -> OK
- `node tests/installed_extension_smoke.js` -> OK

## Conclusión ejecutiva

El proyecto no esta “roto” por ausencia de piezas. El problema actual es de deriva arquitectonica y de validacion:

1. La base tecnica principal pasa smokes.
2. La experiencia real sigue pudiendo fallar por mezcla de rutas de ejecucion y estado persistido.
3. El panel, el runtime del agente y el bootstrap del IDE propio siguen demasiado acoplados en pocos archivos grandes.
4. OpenClaw/OpenCode ya ofrecen patrones mas limpios para separar interfaz, runtime, control-plane y proveedores.

## Hipotesis de trabajo

La causa raiz mas probable de las regresiones de interfaz y de la sensacion de que “no usa el agente real” es esta:

- Free JT7 mezcla en el mismo flujo UI tres caminos distintos: proveedor directo, agente OpenClaw y fallback local.
- Esa mezcla vive repartida entre el panel y `extension.runtime.js`.
- Los smokes cubren cada pieza por separado, pero no fuerzan una sesion real interactiva larga en own-ide con cambios de proveedor/backend/continuidad.

Chequeo discriminante principal para la siguiente fase:

- reproducir una sesion interactiva real en own-ide con cambio de proveedor, cambio de backend, tarea multi-turno, continuidad y evidencia de ruta efectiva.

## Hallazgos principales

### F1. La ruta del chat global todavia bifurca a proveedor directo antes de entrar al runtime agente

Evidencia local:

- `src-js/core/extension.runtime.js`
- función `routeTaskWithGoal`

Hallazgo:

- si el proveedor efectivo no es `copilot`, el flujo llama `_callProvider(...)` directamente y evita `runCopilotRouter(...)`.
- eso reduce consumo del host Copilot, pero tambien evita herramientas/agente real en esa ruta.

Impacto:

- el usuario puede percibir “chat bonito” pero sin autonomia real.
- explica por qué parte del producto parece LLM directo aunque el proyecto ya tenga SessionEngine, OpenClaw y fallback local.

### F2. El panel sigue siendo un archivo-orquestador demasiado grande

Evidencia local:

- `src-js/core/control-panel.js`

Hallazgo:

- el mismo archivo contiene normalizacion de estado, HTML, logica cliente, persistencia, sesiones, runtime backend y feedback de tareas.
- esto hace que cada hotfix del panel mezcle UI, estado persistido y wiring con el runtime.

Impacto:

- alta probabilidad de regresion cruzada.
- dificil validar si un bug es de UI, de estado o de backend.

### F3. El runtime principal tambien esta demasiado concentrado

Evidencia local:

- `src-js/core/extension.runtime.js`

Hallazgo:

- mezcla participante de chat, panel, routing Copilot, OpenClaw, fallback local, bootstrap, settings globales y hooks operativos.

Impacto:

- ownership difuso del flujo.
- cuesta garantizar que own-ide use siempre el backend correcto y no una ruta lateral.

### F4. Hay un candidato real a bug de rutas en la deteccion de OpenClaw

Evidencia local:

- `src-js/core/extension.runtime.js`
- función `findOpenClawBinary`

Hallazgo:

- busca un binario local en `OPEN CLAW/node_modules/.bin/openclaw` dentro del workspace gestionado.
- la ruta opcional real que usa el usuario es externa al workspace y se llama `open claw`.

Impacto:

- la deteccion local no apunta a la ubicacion real de referencia.
- hoy puede no romper porque cae a `openclaw` en PATH, pero es una ruta muerta o engañosa.

### F5. El proyecto ya corrigio sintomas repetidos, pero sigue faltando una prueba E2E interactiva canonica

Evidencia local:

- `docs/TASKS.md`
- `docs/MEMORY.md`
- `copilot-agent/tasks.yaml`

Hallazgo:

- hay varios hotfixes de panel, modelos, own-ide, OpenClaw summary, runtime local y estado persistido.
- falta una smoke E2E unica que atraviese panel instalado + own-ide + proveedor + backend + continuidad.

Impacto:

- los smokes “en verde” no garantizan experiencia real consistente.

## Qué aporta cada repo externo

### OpenClaw

Aporta primero:

- session tools reales
- subagentes
- `primary + fallbacks`
- cooldown y auth profiles
- control-plane (`health`, `config`, `schema`, `restart`)

No copiar tal cual:

- toda su superficie de gateway y sandbox
- toda la complejidad de tooling si no se integra por capas

### OpenCode

Aporta primero:

- separacion mas limpia entre core, ui, web, desktop y provider core
- contratos mas limpios para providers/modelos
- ACP y control de configuracion mas ordenado

No copiar tal cual:

- el monorepo completo ni el stack Bun/Turbo si no hay necesidad directa

### Claurst

Aporta primero:

- separacion fuerte entre core/runtime/plugins/bridge
- idea de subsistemas del runtime mas aislados

No copiar tal cual:

- su stack Rust completo; vale mas como referencia de arquitectura que como base de migracion inmediata

## Arquitectura objetivo recomendada para Free JT7

### Capa 1. Provider Core

Responsable de:

- catalogo dinamico
- defaults por proveedor
- fallbacks y cooldown
- auth profile por sesion

Inspiracion principal:

- OpenCode para estructura
- OpenClaw para resiliencia

### Capa 2. Session Runtime

Responsable de:

- sesiones
- tareas
- subagentes
- continuidad
- verificacion por run

Inspiracion principal:

- OpenClaw

### Capa 3. Panel App

Responsable de:

- render UI
- estado visual
- dispatch de acciones
- observabilidad de ruta

Regla:

- no debe decidir la estrategia de runtime; solo pedirla al Session Runtime.

### Capa 4. IDE Bootstrap y Standalone

Responsable de:

- instalar VSIX
- preparar perfil aislado
- localizar binarios externos
- comprobar integridad del runtime instalado

### Capa 5. Control Plane

Responsable de:

- `health`
- `status`
- `schema lookup`
- `config patch`
- `restart runtime`

## Plan por fases

## Fase A. Auditoria dura de rutas reales

Objetivo:

- confirmar con evidencia que ruta usa cada accion del panel en own-ide.

Trabajo:

- instrumentar o endurecer trazas de ruta efectiva (`direct`, `openclaw`, `local`, `acp:*`)
- correr sesion real de own-ide con continuidad
- registrar mismatches entre UI y backend efectivo

Criterio de aceptacion:

- cada tarea del panel muestra ruta efectiva, backend, provider y estado de verificacion.

## Fase B. Separacion `provider-core` y `session-runtime`

Objetivo:

- sacar de `extension.runtime.js` la mezcla de decisiones de proveedor y runtime.

Trabajo:

- dejar `ProviderRouter` y config/fallbacks como capa unica
- dejar `SessionEngine` como owner de ejecucion de tareas y continuidad
- convertir `extension.runtime.js` en composition root, no en mega-controlador

Criterio de aceptacion:

- `extension.runtime.js` deja de decidir flujos complejos directamente.

## Fase C. Refactor de panel en modulos

Objetivo:

- dividir `control-panel.js` en modulos de UI, store, actions y renderer.

Trabajo:

- separar estado persistido
- separar plantilla UI
- separar comandos del panel
- separar sincronizacion session/task/provider

Criterio de aceptacion:

- el panel puede probarse por modulo y por E2E sin hotfixes cruzados.

## Fase D. Adopcion fuerte de patrones OpenClaw/OpenCode

Objetivo:

- integrar lo util sin importar la complejidad innecesaria.

Trabajo:

- session tools y subagentes de estilo OpenClaw
- provider core y ACP ordenado de estilo OpenCode
- control-plane embebido

Criterio de aceptacion:

- el panel puede lanzar subagentes, usar fallback real y cambiar backend sin perder continuidad.

## Fase E. Hardening y release candidate

Objetivo:

- cerrar el gap entre smokes y uso real.

Trabajo:

- smoke E2E instalada en own-ide
- smoke E2E provider/backends/continuidad
- validacion de binarios/rutas externas

Criterio de aceptacion:

- prueba interactiva real consistente con la bateria automatizada.

## Asignacion a subagentes

### Subagente 1. Auditor de repo principal

Mision:

- mapear rutas efectivas en Free JT7
- localizar codigo muerto, duplicado y ownership difuso

Entradas:

- `src-js/core/control-panel.js`
- `src-js/core/extension.runtime.js`
- `src-js/core/session-engine.js`
- `src-js/core/provider-router.js`
- `scripts/freejt7-own-ide-bootstrap.js`

Salida esperada:

- mapa de control path con bugs concretos y refactor targets

### Subagente 2. Comparador OpenClaw/OpenCode

Mision:

- extraer patrones reutilizables para sesiones, providers, control-plane y ACP

Salida esperada:

- tabla `copiar/adaptar/no copiar`

### Subagente 3. Comparador Claurst

Mision:

- traducir sus ventajas de separacion arquitectonica a acciones pequeñas para Free JT7

Salida esperada:

- propuesta de modulos frontera y ownership

### Subagente 4. Refactor UI/runtime

Mision:

- ejecutar la separacion del panel y del composition root

Salida esperada:

- PR interno o patch por fases con smokes actualizados

### Subagente 5. Validador own-ide

Mision:

- correr pruebas reales sobre extension instalada y perfil aislado

Salida esperada:

- evidencia de que own-ide usa el backend correcto y mantiene continuidad

## Matriz de verificacion final

- `policy-validate`
- `doctor --strict`
- `control_panel_ui_smoke`
- `panel_execution_mode_smoke`
- `provider_router_failover_smoke`
- `openclaw_runtime_smoke`
- `installed_extension_smoke`
- nueva smoke E2E de own-ide con continuidad real

## Decisiones recomendadas para la siguiente iteracion

1. No seguir con hotfixes grandes dentro de `control-panel.js` y `extension.runtime.js` sin separar ownership.
2. Corregir primero las rutas efectivas y la deteccion de binarios externos.
3. Después ejecutar el refactor del panel y del runtime composition root.
4. Mantener OpenClaw como patron de sesiones/subagentes y OpenCode como patron de provider core/control-plane.