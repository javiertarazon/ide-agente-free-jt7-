# Namespace de estado del agente (Free JT7)

Desde 2026-05-19, Free JT7 prioriza el directorio de estado **`freejt7-agent/`**.

## Compatibilidad hacia atrás
- Si existe `freejt7-agent/`, se usa ese directorio.
- Si no existe pero existe `copilot-agent/`, se usa `copilot-agent/` para no romper instalaciones previas.
- Se puede forzar el namespace con `FREEJT7_STATE_DIR`.

## Importante
`copilot-agent/` en este proyecto se usa como **namespace histórico de archivos locales de estado/trazabilidad**. No implica dependencia obligatoria del proveedor Copilot para la operación del runtime agent-first.
