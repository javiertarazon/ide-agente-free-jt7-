# Release 4.2.4

Fecha: 2026-04-15

## Objetivo de esta actualizacion

Cerrar el gap real entre una extension empaquetable para Linux y un stack operativo completo para Free JT7, con foco en:

- diagnostico del participante `@freejt7` en GitHub Copilot Chat
- soporte Linux reproducible para build de la extension
- soporte Linux reproducible para OpenClaw y servidor MCP
- documentacion clara por capas y por IDE

## Cambios realizados

### Runtime de VS Code

- `src-js/extension.runtime.js` ahora diagnostica si GitHub Copilot Chat esta instalado.
- `Free JT7: Validar runtime` informa si falta `github.copilot-chat` o si la API `vscode.chat` no esta disponible.
- al activarse, la extension deja trazas en el canal `Free JT7` cuando el stack de chat no esta disponible.

### Manifiesto de la extension

- `package.json` se actualiza a `4.2.4`.
- se declara dependencia sobre `github.copilot-chat` para reducir instalaciones incompletas en VS Code.

### Gateway OpenClaw

- `skills_manager.py` genera `gateway.mode=local` en `.openclaw/openclaw.json`.
- el `gateway-bootstrap` ahora emite un runbook local con rutas Linux reales y comando base `python3`.

### Estado validado en Linux

- build del bundle y empaquetado del VSIX con Node 20 en espacio de usuario
- runtime OpenClaw funcional con Node 22.14+ mediante wrapper `~/.local/bin/openclaw`
- `servidor mpc free jt7` validado con `npm run smoke`
- extension instalada en VS Code

## Causa verificada de no activacion en Copilot Chat

La causa raiz identificada fue que el participante de chat solo puede activarse si existe infraestructura de GitHub Copilot Chat. Sin `github.copilot-chat`, el evento `onChatParticipant:freejt7.chat` no se dispara y `@freejt7` no aparece en el chat.

## Resultado esperado tras esta release

- la extension se puede construir e instalar en Linux
- el usuario puede diagnosticar rapidamente por que no aparece `@freejt7`
- OpenClaw y MCP quedan como parte del stack base documentado
- MT5 queda explicitamente fuera del flujo minimo