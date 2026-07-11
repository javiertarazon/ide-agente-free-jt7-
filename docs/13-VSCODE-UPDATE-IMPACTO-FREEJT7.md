# Analisis de novedades VS Code y su impacto en Free JT7

Fecha: 2026-04-23
Version base analizada: release con foco en Copilot Chat/Agent y terminal

## Resumen ejecutivo

Esta version de VS Code mejora tres frentes que encajan directamente con Free JT7:

1. Fluidez de chat y sesiones de agente.
2. Mejor observabilidad de procesos en background.
3. Mejor operacion multi-CLI en terminales con titulos claros.

Para Free JT7, esto reduce friccion de uso, facilita seguimiento de tareas largas y permite una UX mas cercana a un "agent console" dentro de VS Code sin perder compatibilidad con Copilot Chat.

## Novedades y aplicacion directa

### 1) BYOK para Copilot Business/Enterprise

Novedad:
- Permite usar claves y modelos propios (OpenRouter, Ollama, Google, OpenAI, etc.) desde VS Code chat.

Impacto en Free JT7:
- Se alinea con nuestra estrategia multi-provider (`openrouter`, `hf`, `zai`, `copilot`).
- En entornos Enterprise, reduce necesidad de puentes externos para algunos flujos.

Nota:
- Es una capacidad orientada a organizaciones con politicas en GitHub; para uso individual sigue siendo util nuestro enrutamiento propio.

### 2) Incremental rendering en chat (experimental)

Novedad:
- Render de respuesta por bloques con animaciones configurables.

Impacto en Free JT7:
- Mejora la percepcion de velocidad cuando se usa el participant del chat.
- Complementa el panel: el chat queda como canal rapido y el panel como consola operativa.

Recomendacion:
- Mantener documentado perfil sugerido:
  - `chat.experimental.incrementalRendering.enabled = true`
  - `chat.experimental.incrementalRendering.buffering = word` o `off` segun preferencia.

### 3) Ordenar sesiones de agente por actividad

Novedad:
- Vista de Agent Sessions con orden por actualizacion/creacion.

Impacto en Free JT7:
- Misma necesidad que nuestro panel: retomar rapido el contexto correcto.
- Ya se incorporo selector de orden de sesiones en el panel (`actualizadas`/`creadas`) para coherencia de UX.

### 4) Notificaciones de sistema para comandos en background

Novedad:
- El chat muestra notificaciones cuando comandos largos cambian de estado.

Impacto en Free JT7:
- Reduce perdida de contexto durante `build`, `tests`, auditorias y tareas largas.
- Encaja con nuestro motor de colas y eventos: usuario ve progreso sin abrir terminal constantemente.

### 5) VS Code Agents app (Insiders)

Novedad:
- App separada, orientada a sesiones paralelas y diffs inline.

Impacto en Free JT7:
- Oportunidad para un modo "control room" con sesiones paralelas por repo.
- Nuestro panel actual cubre una parte de ese valor dentro del host principal.

Decision propuesta:
- Mantener panel embebido como base estable.
- Evaluar integracion dedicada con Agents app en un track separado solo si aporta productividad real en pruebas.

### 6) Mejoras de terminal para CLIs de agentes

Novedad:
- Perfil Copilot CLI funciona mejor con shells no por defecto.
- Titulos de terminal detectan CLIs de agentes (Copilot, Claude, Gemini).

Impacto en Free JT7:
- Menos errores operativos en Linux/macOS/Windows al lanzar CLIs.
- Mejor trazabilidad visual cuando hay multiples sesiones activas.

Limitacion conocida:
- Codex aun no detectado en macOS por OSC title ausente.

### 7) TypeScript 6.0.3

Novedad:
- Recovery release con fixes de imports/regresiones.

Impacto en Free JT7:
- Riesgo bajo, mejora estabilidad en herramientas y extensiones con toolchain TS.
- Sin cambios obligatorios inmediatos en este repo JS/CJS.

## Acciones recomendadas para Free JT7

## Acciones inmediatas (aplicables ya)
- Usar el panel como consola primaria para sesiones/colas/aprobaciones.
- Mantener participant activo como canal paralelo de consulta y comandos rapidos.
- Aprovechar notificaciones del chat para tareas largas en background.

## Acciones de corto plazo
- Exponer en docs un perfil recomendado de settings de chat/terminal para equipos.
- Añadir telemetria de tiempos por estado de tarea (queued/running/approval/failed).
- Homologar terminologia panel/chat (sesion, cola, aprobacion, retry).

## Riesgos y mitigaciones

Riesgo:
- Duplicidad de experiencia entre chat y panel.

Mitigacion:
- Definir rol claro:
  - Chat: consultas y ejecucion puntual.
  - Panel: operacion continua, gobernanza y observabilidad.

Riesgo:
- Dependencia de features experimentales de VS Code.

Mitigacion:
- Mantener fallback estable del panel sin depender de features experimentales.

## Conclusión

La actualizacion de VS Code favorece claramente la estrategia de Free JT7: un agente multiproveedor con operacion visible y controlada. El mayor valor practico esta en combinacion de mejor experiencia de sesiones/agentes + notificaciones de procesos + terminales mas legibles. El panel profesional de Free JT7 se consolida como capa de control operativa encima de estas mejoras del host.
