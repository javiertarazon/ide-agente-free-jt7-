# Release 4.1.0 - Free JT7 Extension

Fecha: 2026-03-12

## Objetivo del release
- Estabilizar autonomia real en Antigravity.
- Corregir ruta de instalacion en extension VS Code.
- Activar aprendizaje continuo automatico por run (aciertos y errores).
- Mejorar trazabilidad operativa y documentacion.
- Reducir tamano de VSIX eliminando contenido no runtime.

## Mejoras incluidas
1. Integracion Antigravity reforzada:
- `.antigravity/settings.json` ahora incluye:
  - `antigravity.freejt7.autonomy.mode = "autonomous"`
  - `antigravity.freejt7.approvals.auto = true`
  - `antigravity.freejt7.requireUserConfirmationDefault = false`
- `%APPDATA%/Antigravity/User/settings.json` recibe las mismas claves.
- `.antigravity/freejt7.runtime.json` pasa a `activation = "always"` y permisos extendidos.

2. Instalador VS Code corregido:
- `extension.js` ahora usa `scripts/add-free-jt7-agent.ps1`.

3. Aprendizaje continuo:
- Nuevo `tools/agent_autolearn/collect_from_runs.py`.
- Recolecta ejemplos desde `copilot-agent/runs/*.json`.
- Guarda score de acierto/error en `.agent-learning/dataset.jsonl`.
- `nightly_train.ps1` ejecuta recoleccion antes de entrenar.

4. Comandos de extension visibles en paleta:
- Comandos OpenClaw agregados a `package.json` -> `contributes.commands`.

5. Empaquetado optimizado:
- `.vscodeignore` actualizado para excluir directorios pesados/no distribucion.

## Errores corregidos
- Ruta de instalacion obsoleta en extension (`add-free-jt7-agent.ps1` en raiz).
- Falta de flags de autonomia en Antigravity (workspace y user settings).
- Manifiesto runtime de Antigravity con activacion ephemereal insuficiente.
- VSIX inflado por inclusion de `OPEN CLAW/` y artefactos de desarrollo.

## Trazabilidad
- Changelog: `CHANGELOG.md` (entrada 4.1.0)
- Runbook operativo: `copilot-agent/RUNBOOK.md`
- Arquitectura de autonomia/entrenamiento: `docs/AUTONOMY_AND_TRAINING_ARCHITECTURE.md`
- Evidencias de run: `copilot-agent/runs/`
- Dataset aprendizaje: `.agent-learning/dataset.jsonl`

## Impacto esperado
- Instalacion consistente en VS Code y Antigravity.
- Flujo autonomo estable para ejecucion de tareas.
- Aprendizaje continuo activo sin bloquear trabajo interactivo.
- Menor tamano de paquete y mejor mantenibilidad del release.
