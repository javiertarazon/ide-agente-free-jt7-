# Release 4.2.6

Fecha: 2026-04-17

## Objetivo de esta actualizacion

Hacer utilizable de forma real el uso de proveedores distintos a Copilot dentro de la extension Free JT7, con foco en:

- seleccion visible del proveedor activo;
- seleccion de modelo gratuito por proveedor;
- configuracion de API key desde VS Code;
- fallback robusto en el bundle empaquetado;
- proteccion contra errores de contexto excesivo en proveedores OpenAI-compatible.

## Cambios realizados

### Runtime de proveedores externos

- `src-js/copilot_router.runtime.js` delega en proveedores externos cuando `freejt7.apiProvider` no es `copilot`.
- `src-js/api-provider-adapter.js` encapsula llamadas a `OpenRouter`, `HuggingFace` y `ZAI`.
- cada proveedor usa presupuesto defensivo de prompt y `max_tokens` de salida.
- los errores remotos por exceso de contexto ahora se traducen a mensajes accionables en lugar de dejar un `400 invalid_request_body` opaco.
- las credenciales ya no se embeben en el runtime; se leen desde `SecretStorage`, variables de entorno o archivos locales ignorados por git.

### UX de proveedor y modelo en VS Code

- `src-js/extension.runtime.js` agrega comandos para:
  - seleccionar proveedor de API;
  - guardar API key del proveedor;
  - seleccionar modelo gratuito;
  - refrescar catálogo de modelos.
- la barra de estado muestra `Free JT7: proveedor | modelo` para que el estado activo sea visible sin abrir settings.

### Catálogo y bundle

- `src-js/free-models-catalog.js` centraliza modelos gratuitos conocidos por proveedor.
- el runtime ahora trae fallback interno para que la funcionalidad siga viva aunque `src-js/**` no viaje dentro del VSIX.

### Instalacion global desde la extension

- se añade `Free JT7: Aplicar configuracion global en VS Code`.
- `@freejt7 /global` permite hacer lo mismo desde Copilot Chat.
- `@freejt7 /install` usa ese camino cuando no existe un workspace abierto.

## Resultado esperado tras esta release

- Free JT7 puede operar con `OpenRouter`, `HuggingFace` y `ZAI` desde VS Code sin editar settings manualmente.
- el usuario puede ver inmediatamente que proveedor y modelo estan activos.
- los errores de contexto excesivo dejan de presentarse como fallo HTTP opaco y pasan a tener manejo defensivo en el adaptador.
- el bundle empaquetado mantiene la funcionalidad de catálogo y estado visual del proveedor.