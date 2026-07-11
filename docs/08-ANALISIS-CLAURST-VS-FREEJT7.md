# Analisis comparativo: Claurst vs Free JT7

## Estado de vigencia

Actualizado tras la integracion correctiva del 2026-04-19.

Este documento ya no debe leerse como una lista de brechas totalmente abiertas.
Ahora funciona como:

- comparativa arquitectonica base entre Claurst y Free JT7;
- registro de las capacidades que faltaban al momento del analisis original;
- referencia de que partes ya quedaron cerradas o parcialmente cerradas en el runtime actual.

Estado resumido tras esta pasada:

- memoria runtime: cerrada a nivel estructural;
- scheduler runtime: cerrado y ya arrancado desde la extension;
- plugins runtime: cerrado a nivel de hooks principales, aunque todavia con margen para evolucionar el discovery/carga viva;
- bridge remoto: elevado a una base persistente con sesiones, eventos y aprobaciones;
- refactor por capas: parcialmente cerrado con fachadas canonicas `runtime/` y `providers/`, todavia sin una separacion completa `router/` e `integrations/`.

## Objetivo

Comparar el repositorio local de Claurst con el runtime actual de Free JT7 para identificar modos avanzados, capacidades de arquitectura y formas de trabajo que valga la pena incorporar.

## Base observada

### Claurst

- Reimplementacion Rust organizada como workspace con crates separados para core, api, tools, query, tui, commands, mcp, bridge, buddy y plugins.
- Capa de especificacion separada en `spec/`, usada como contrato funcional antes de la implementacion.
- Runtime centrado en CLI/TUI con slash commands, tools invocables por el modelo, scheduler interno y bridge remoto.

### Free JT7

- Runtime centrado en extension VS Code con capa JS en `src-js/`, orquestacion CLI/instalacion en `skills_manager.py` y servidor MCP local complementario.
- Fuerte foco en multi-IDE, bootstrap operativo, policy, trazabilidad, instalacion y herramientas auxiliares.
- Integraciones practicas que Claurst no trae de base: Copilot SDK router, proveedor externo OpenRouter/HF/ZAI, MCP local modular y MT5.

## Lo mejor de Claurst

### 1. Separacion arquitectonica mas nitida

Claurst separa de forma explicita las responsabilidades duras del agente:

- `crates/core`: tipos, config, permisos, historial y contexto.
- `crates/api`: cliente y streaming.
- `crates/tools`: herramientas invocables.
- `crates/query`: loop agentico, compactacion, memoria, cron.
- `crates/commands`: slash commands.
- `crates/bridge`: sesion remota web/mobile.
- `crates/plugins`: runtime de plugins.

Esto hace mas facil evolucionar capacidades avanzadas sin meter logica transversal en un mismo archivo o runtime.

### 2. Sistemas avanzados integrados en el loop, no solo documentados

En Claurst, varias capacidades avanzadas existen como modulos de runtime reales dentro de `crates/query/`:

- `auto_dream.rs`: consolidacion automatica de memoria con compuertas de tiempo, sesiones nuevas y lock.
- `cron_scheduler.rs`: scheduler de prompts en background al siguiente minuto valido.
- `session_memory.rs`: extraccion y gestion de memoria de sesion.
- `skill_prefetch.rs`: precarga de skills antes del loop.
- `compact.rs`: compactacion de contexto como parte del query loop.

La diferencia importante es que la memoria y la automatizacion no dependen solo de disciplina operativa: forman parte del runtime.

### 3. Runtime de plugins de verdad

Claurst tiene un crate dedicado a plugins con:

- descubrimiento y carga;
- manifests;
- registry global;
- hooks pre y post tool use;
- enforcement de capacidades declaradas por plugin.

Eso habilita extensibilidad real sin tocar el core.

### 4. Superficie de comandos y tools mas rica y coherente

La combinacion `crates/commands` + `crates/tools` muestra una plataforma de agente bastante madura:

- plan mode;
- cron;
- ask user;
- worktrees;
- team tools y subagentes;
- remote trigger;
- skills como herramienta de primer nivel;
- comandos de plugin, remote-control, ultrareview, voice, teleport, etc.

No todas esas capacidades merecen copiarse, pero el patron si: una plataforma unificada donde command layer y tool layer estan bien diferenciadas.

### 5. Bridge remoto como capacidad nativa

El crate `bridge` implementa:

- fingerprint de dispositivo;
- decode de JWT de sesion;
- registro y polling de sesiones;
- canal bidireccional con interfaz web.

Eso apunta a un modelo donde el agente puede seguir operando fuera del terminal local.

### 6. Companion/Buddy como modulo aislado

El sistema Buddy existe como crate independiente. No es prioritario para Free JT7, pero su valor arquitectonico es que las features experimentales viven desacopladas del core.

## Fortalezas actuales de Free JT7

### 1. Mejor postura operativa e integracion real con IDE

Free JT7 hoy gana claramente en:

- instalacion y bootstrap multi-IDE;
- empaquetado como extension;
- comandos de VS Code y participante de chat;
- policy operativa;
- trazabilidad en `copilot-agent/` y `docs/`;
- proveedor externo configurable;
- soporte de servidor MCP local;
- integracion MT5.

Claurst se ve mas sofisticado como runtime agente general; Free JT7 se ve mas util como sistema desplegable y gobernado dentro del flujo real del usuario.

### 2. Autoaprendizaje y memoria operativa ya sembrados

Free JT7 ya tiene una base valida en:

- `docs/TASKS.md`, `docs/MEMORY.md`, `docs/STRATEGY_LOG.md`;
- `tools/agent_autolearn/`;
- recoleccion desde runs;
- entrenamiento por lote planificado.

El problema no es ausencia de idea. El problema es que todavia no esta cerrado como subsistema integrado al loop principal.

### 3. Andamiaje de plugins ya existe, pero mas como gestion que como runtime

`skills_manager.py` ya trae:

- `plugin-list`;
- `plugin-enable`;
- `plugin-disable`;
- `plugin-validate`;
- metadata y deteccion de manifests.

Pero en la evidencia revisada no aparece una capa equivalente a `PluginRegistry`/hooks ejecutandose dentro del runtime JS principal o del servidor MCP. Hoy parece mas administracion de plugins que ejecucion viva de plugins.

## Brechas principales

### Brecha 1. Free JT7 no tiene un "agent core" claramente separado

Estado 2026-04-19: parcial.

La extension y el router concentran mucha responsabilidad en pocos puntos:

- `src-js/extension.runtime.js`
- `src-js/copilot_router.runtime.js`
- `src-js/api-provider-adapter.js`

Eso acelera cambios pequeños, pero complica introducir capacidades persistentes como scheduler, memoria autonoma o plugins runtime sin inflar estos entrypoints.

### Brecha 2. La memoria sigue siendo una convencion operativa

Estado 2026-04-19: cerrada en lo esencial.

Hoy Free JT7 depende de que el agente lea y escriba documentación y datasets. Claurst va un paso mas alla: su consolidacion automatica existe como modulo propio del loop.

### Brecha 3. No hay scheduler de prompts/tareas integrado al runtime

Estado 2026-04-19: cerrada.

Free JT7 tiene arranque automatico y scripts nocturnos, pero no un scheduler transversal en el loop del agente equivalente al cron interno de Claurst.

### Brecha 4. El soporte de plugins no esta cerrado extremo a extremo

Estado 2026-04-19: parcialmente cerrada.

Hay CLI de administracion, pero no vi una cadena completa de carga, registro, hooks y enforcement en el runtime del agente como si ocurre en Claurst.

### Brecha 5. Falta una capa remota nativa

Estado 2026-04-19: parcialmente cerrada.

Free JT7 tiene extension, gateway y MCP local, pero no una sesion remota unificada tipo bridge para control web/mobile con protocolo propio.

## Recomendaciones priorizadas para Free JT7

## P1. Convertir memoria y aprendizaje en subsistema runtime

Estado 2026-04-19: implementado en la base del runtime.

Objetivo:

- integrar una tarea de consolidacion automatica sobre `docs/MEMORY.md`, `docs/TASKS.md`, `copilot-agent/runs/` y `.agent-learning/dataset.jsonl`.

Inspiracion de Claurst:

- `auto_dream.rs`
- `session_memory.rs`

Adaptacion sugerida en Free JT7:

- crear un modulo JS dedicado, por ejemplo `src-js/runtime/memory-orchestrator.js`;
- correr consolidacion por umbrales de tiempo y cantidad de runs nuevos;
- separar claramente consolidacion de memoria, extraccion de ejemplos y entrenamiento por lote.

Impacto:

- alto valor;
- bajo riesgo conceptual;
- mejora directa sobre la base ya existente.

## P2. Elevar plugins a runtime real

Estado 2026-04-19: implementado en hooks base, pendiente evolucion de carga viva end-to-end.

Objetivo:

- pasar de plugin management a plugin runtime.

Inspiracion de Claurst:

- crate `plugins` con registry global, hooks y capabilities.

Adaptacion sugerida en Free JT7:

- crear un loader JS de plugins en runtime;
- soportar hooks `preToolUse`, `postToolUse`, `onRouteStart`, `onRouteEnd`;
- exigir manifest con capacidades declaradas;
- integrar eso tanto en router como en servidor MCP cuando aplique.

Impacto:

- muy alto;
- convierte Free JT7 en plataforma, no solo en extension.

## P3. Introducir scheduler cross-platform dentro del runtime

Estado 2026-04-19: implementado y activado desde la extension.

Objetivo:

- programar prompts, validaciones, reintentos, recollections y maintenance tasks dentro del agente, no solo via scripts externos.

Inspiracion de Claurst:

- `cron_scheduler.rs`
- tools cron.

Adaptacion sugerida:

- scheduler interno con persistencia ligera en `copilot-agent/`;
- jobs como `consolidar memoria`, `extraer dataset`, `doctor nocturno`, `gateway-status`, `revisar pendientes`.

Impacto:

- alto;
- especialmente util para Free JT7 por su enfoque operativo.

## P4. Refactor por capas del runtime JS

Estado 2026-04-19: parcialmente implementado.

Objetivo:

- acercar Free JT7 a una separacion tipo core/router/tools/runtime/integrations.

Propuesta minima:

- `src-js/core/` para config, estado, tracing;
- `src-js/router/` para planificacion y ejecucion;
- `src-js/providers/` para APIs externas;
- `src-js/runtime/` para memoria, scheduler, plugins;
- `src-js/integrations/` para VS Code, OpenClaw, MCP, MT5.

Impacto:

- medio/alto;
- habilita crecer sin seguir cargando `extension.runtime.js`.

Avance real tras la pasada correctiva:

- ya existen fachadas canonicas en `src-js/runtime/`;
- ya existe fachada canonica en `src-js/providers/`;
- el router y la extension consumen esas fachadas sin romper compatibilidad hacia atras.

## P5. Crear un bridge remoto real, no solo gateway local

Estado 2026-04-19: implementado en version base util.

Objetivo:

- permitir sesiones remotas controladas, aprobaciones y consultas fuera del IDE.

Inspiracion de Claurst:

- crate `bridge`.

Adaptacion sugerida:

- no copiar protocolo ni detalles ajenos;
- diseñar un bridge propio sobre el gateway actual de Free JT7;
- empezar con una cola de eventos y aprobaciones remotas simples.

Impacto:

- alto potencial;
- mas costoso que P1-P3.

Avance real tras la pasada correctiva:

- bridge con persistencia en `copilot-agent/remote-bridge-state.json`;
- sesiones registradas por `run_id`;
- eventos de ruta y tareas;
- cola de comandos con acknowledgement;
- tickets de aprobacion/revision remota para corridas bloqueadas o con riesgos residuales.

## P6. Companion/Buddy: no prioritario

Conclusión:

- interesante como feature experimental desacoplada;
- no aporta valor directo ahora al producto Free JT7.

Solo tendría sentido despues de cerrar memoria runtime, plugins runtime y scheduler.

## Lo que no conviene copiar tal cual

- Inflar la superficie de comandos demasiado pronto.
- Llevar gamificacion antes de madurar core y extensibilidad.
- Intentar replicar todos los modos especiales de Claurst sin antes definir una arquitectura por capas en Free JT7.
- Mezclar conceptos de bridge remoto, scheduler, memoria y plugins dentro de `extension.runtime.js`.

## Hoja de ruta recomendada

### Fase 1

- Memory orchestrator runtime.
- Scheduler interno cross-platform.
- Dataset/autolearn integrado al ciclo de runs.

### Fase 2

- Plugin runtime con hooks y capacidades.
- Refactor inicial de `src-js/` por capas.

### Fase 3

- Bridge remoto propio.
- Review/approval loops asincronos.

### Fase 4

- Features experimentales aisladas, si siguen teniendo sentido.

## Veredicto

Claurst no supera a Free JT7 en despliegue operativo, integracion IDE ni verticales practicas como MCP local y MT5. Pero si muestra una arquitectura de agente mas madura en cuatro frentes:

- separacion modular real;
- memoria automatica en runtime;
- scheduler interno;
- runtime de plugins con hooks y capacidades.

La mejor estrategia para Free JT7 no es copiar Claurst completo. Es absorber esos cuatro patrones y adaptarlos al contexto real de Free JT7: extension VS Code, router Copilot, servidor MCP y operacion multi-IDE.