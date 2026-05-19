# Auditoria operativa Free JT7 agente autonomo native-IDE (2026-05-15)

## Objetivo
Analizar fallos reales que bloquean la operacion verificable de Free JT7 como agente autonomo nativo de su propia IDE, con proveedores de modelos por API, skills, MCP, subagentes, apertura de programas y trazabilidad de ejecucion.

## Intake y alcance aplicado
- Entregable esperado: analisis detallado, correcciones minimas y pruebas unitarias/smoke sobre los scripts modificados.
- Restricciones y no-objetivos: no reestructurar carpetas fisicamente en esta pasada para evitar romper empaquetado, rutas de VSIX, scripts de release o compatibilidad con instalaciones existentes.
- Validacion esperada: la suite smoke debe poder ejecutarse en entorno limpio sin exigir secretos privados, IDE instalada o login Copilot live cuando el objetivo sea validar logica local.
- Decision de delegacion: no se usaron subagentes externos en esta ejecucion porque la solicitud menciona subagentes como capacidad del producto, no como autorizacion explicita para delegar el trabajo actual.

## Documentacion revisada
Se reviso el mapa documental completo de `docs/`, incluyendo trayectoria, auditorias previas, releases, planes de UI/IDE, OpenClaw/OpenCode, MCP/MT5, tareas, memoria y estrategia. La lectura confirma que el producto objetivo es una IDE agent-first donde Free JT7 sea el control-plane visible y los proveedores externos, OpenClaw, Copilot legacy, skills, MCP y subagentes funcionen como backends subordinados.

## Hallazgos reales corregidos

### F1. Smoke CLŌD dependia de una API key live
- Impacto: `npm run test:clod-provider-smoke` fallaba en entornos limpios sin `CLOD_API_KEY`, aunque el catalogo local y el error de configuracion eran comportamientos validos.
- Riesgo operativo: una verificacion basica del proveedor parecia fallo del agente cuando en realidad faltaba un secreto privado.
- Correccion: el smoke ahora valida catalogo local y, si no hay API key, comprueba que `callProvider` devuelva un error marcado como `isConfigurationError`, `isUserActionRequired` y no reintentable. Si existe API key, mantiene la prueba live.

### F2. Smoke de extension instalada dependia de `~/.vscode/extensions`
- Impacto: `npm run test:installed-extension-smoke` fallaba con `ENOENT` cuando no habia una extension VS Code instalada en el usuario del contenedor.
- Riesgo operativo: bloqueaba CI y auditorias en workspace aunque el bundle local y el servidor MCP estuvieran presentes.
- Correccion: el smoke mantiene modo estricto con `FREEJT7_STRICT_INSTALLED_SMOKE=1`, pero por defecto cae a modo `workspace` y valida `package.json`, `dist/extension.cjs` y el servidor MCP local.

### F3. Drill funcional del router requeria autenticacion Copilot live
- Impacto: `npm run test:router-functional-blocked-gate` fallaba si no existia token o CLI Copilot autenticado.
- Riesgo operativo: la prueba que debe validar bloqueo de herramientas y cierre seguro no podia ejecutarse en entorno offline/no autenticado.
- Correccion: el drill conserva la ruta live cuando hay indicios de autenticacion, pero agrega fallback offline que emite `preToolUse` contra `pluginRuntime`, registra evento `tool-pre`, deja `closingGate.passed=false` y resuelve tickets pendientes creados por intentos live fallidos.

## Hallazgos de producto y organizacion pendientes

### P1. El repositorio mezcla producto, artefactos empaquetados y laboratorios
- Observacion: conviven runtime principal, empaquetados `dist-deb/` y `dist-rpm/`, carpetas de laboratorio (`files`, `files (1)`), servidor MCP, herramientas y pruebas.
- Recomendacion: crear una fase dedicada para mover laboratorios a `examples/` o `archive/`, artefactos generados a release assets externos y mantener rutas de empaquetado mediante aliases o scripts de migracion.
- Motivo para no mover ahora: el empaquetado y los smokes referencian rutas actuales; una reorganizacion fisica requiere plan de compatibilidad.

### P2. Hay pruebas live y offline mezcladas
- Observacion: algunos smokes verifican integracion local y otros intentan servicios externos.
- Recomendacion: separar nombres o flags: `test:*:smoke` offline por defecto, `test:*:live` solo con secretos y autenticacion.

### P3. La autonomia real necesita contrato de capacidades mas explicito
- Observacion: la arquitectura ya contiene runtimes, provider router, MCP, skills y subagentes; el siguiente salto es consolidar una matriz ejecutable de capacidades por entorno.
- Recomendacion: agregar un comando `doctor` unico que emita estado de providers, claves, MCP, skills, OpenClaw, Copilot legacy, permisos de escritorio y subagentes locales.

## Estado validado
- Build del bundle local: correcto.
- Pruebas Python relevantes: correctas con advertencias de deprecacion conocidas en `datetime.utcnow`.
- Suite de scripts `test:*` de `package.json`: correcta tras las correcciones.
- Smokes adicionales de runtime, provider router, OpenClaw, own-IDE, ACP, session engine y subagentes: correctos.

## Siguiente fase recomendada
1. Crear `npm run test:offline` que agrupe todos los smokes que no requieren secretos ni IDE instalada.
2. Crear `npm run test:live` para CLŌD/OpenRouter/Copilot/instalacion real, activado solo con variables de entorno explicitas.
3. Implementar `freejt7 doctor --json` para auditar providers API, MCP, skills, subagentes, apertura de programas y perfil own-IDE.
4. Planificar reorganizacion de directorios con compatibilidad, sin mover artefactos de golpe.


## Actualizacion 2026-05-15: matriz de proveedores API y modelos locales
- Se agrego compatibilidad directa configurable para `openai`, `anthropic`, `deepseek`, `gemini` y `local`, ademas de los proveedores ya existentes `openrouter`, `hf`, `zai` y `clod`.
- OpenAI, DeepSeek, Gemini y Local usan contrato OpenAI-compatible `/chat/completions`; Anthropic usa contrato `/v1/messages` con `x-api-key` y `anthropic-version`.
- `local` apunta por defecto a Ollama OpenAI-compatible (`http://127.0.0.1:11434/v1/chat/completions`) y no exige API key; se puede cambiar con `FREEJT7_LOCAL_CHAT_COMPLETIONS_URL`.
- La UI de Settings ahora lista los proveedores y modelos base para configurar el panel sin depender de editar archivos manualmente.
- Validacion offline: `provider_multi_api_compat_smoke` mockea HTTP/HTTPS y confirma headers, endpoint, payload y ausencia de API key obligatoria en local.


## Actualizacion 2026-05-15: doctor nativo de autonomia completa
- Se agrego `doctor:native` como verificacion offline centralizada de contratos del producto.
- El doctor valida proveedores/modelos locales, runtime agent-first, MCP/tools, agente MT5, skills, subagentes, autoaprendizaje, UI nativa, modos autonomo/asistido y empaquetado own-IDE.
- La verificacion distingue contratos offline instalables de dependencias live: claves de APIs externas, login Copilot, servidor Ollama/LM Studio y terminal MT5 real siguen siendo validaciones de entorno, no requisitos para que el paquete sea verificable offline.
- El comando `freejt7.runtimeDoctor` ahora ejecuta primero el doctor nativo antes de continuar con `skills_manager.py`, evitando declarar sano un runtime al que le falten piezas propias del agente.
