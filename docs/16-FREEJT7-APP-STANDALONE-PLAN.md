# Plan de ejecucion por fases: Free JT7 App Standalone

Fecha: 2026-04-26

## Objetivo
Convertir Free JT7 de "extension dependiente del host" a una app operativa tipo Trae/Kiro, con runtime y perfil aislado, sin depender de Copilot/Claude/Codex para funcionar.

## Estado actual
- Fase 1 ejecutada en este repositorio con arranque inmediato.
- Se agrego bootstrap de app aislada y comando de lanzamiento.

## Fase 1 (ejecutada): App aislada inmediata
- Entregable:
  - Perfil dedicado en `~/.freejt7-app/profiles/<perfil>`.
  - Instalacion automatica de la VSIX en ese perfil.
  - Lanzamiento de IDE aislada con desactivacion explicita de extensiones Copilot/Claude.
  - Settings de perfil forzando panel Free JT7 como interfaz principal.
- Comandos:
  - `npm run app:standalone` (instala/actualiza VSIX en perfil aislado y abre la app).
  - `npm run app:standalone:setup` (prepara e instala sin abrir la IDE).
  - `npm run app:standalone:dry-run` (simulacion, sin ejecutar binarios externos).

## Fase 2 (en ejecucion): host de IDE propio + empaquetado inicial
- Entregable:
  - Runtime VSCodium portable bajo `~/.freejt7-app/runtime/vscodium`.
  - Launcher `app:own-ide` usando ese runtime como host principal.
  - Instalador (`.deb/.rpm/.exe`) con launcher dedicado.
  - Runtime OpenClaw + MCP preconfigurados por defecto.
  - Autodiagnostico al primer arranque (`doctor`, `gateway-status`, smoke panel).
- Criterio de cierre:
  - Instalacion limpia en maquina nueva y primer uso sin pasos manuales del usuario.

Estado parcial Fase 2 (2026-04-26):
- `.deb` implementado y validado en Linux actual (`freejt7-desktop_4.2.11-1_amd64.deb`).
- Instalacion probada con fallback rootless en `~/.local/freejt7-desktop` + launcher `~/.local/bin/freejt7-desktop`.
- `.rpm` implementado y validado en Linux actual (`freejt7-desktop_4.2.11-1_noarch.rpm`).
- Instalacion `.rpm` probada con fallback rootless en `~/.local/freejt7-desktop-rpm` + launcher `~/.local/bin/freejt7-desktop-rpm`.
- Pendiente: empaquetado `.exe`.

## Fase 3: Branding y experiencia de producto
- Entregable:
  - Distribucion con identidad propia ("Free JT7 Desktop").
  - Menu de arranque, iconos y accesos directos nativos.
  - Wizard inicial para API keys y proveedor/modelo.
- Criterio de cierre:
  - Onboarding completo en menos de 5 minutos.

## Fase 4: IDE propia full (fork controlado)
- Entregable:
  - Base Code-OSS/VSCodium embebida con Free JT7 como modulo nativo.
  - Ruta principal sin dependencia de marketplace externo.
- Criterio de cierre:
  - Build reproducible y actualizable por canal estable.

## Riesgos y mitigacion
- Riesgo: drift de compatibilidad entre versiones de IDE.
  - Mitigacion: perfil aislado + smoke de extension instalada + empaquetado versionado.
- Riesgo: dependencias runtime OpenClaw/MCP en entornos limpios.
  - Mitigacion: preflight en bootstrap y fallback local-agent-tools.
- Riesgo: falsa percepcion de autonomia por mezcla de host plugins.
  - Mitigacion: `--disable-extension` explicito para Copilot/Claude en modo app.

## Validacion minima por release de la app
- `npm run test:freejt7-app-bootstrap-smoke`
- `npm run test:control-panel-ui-smoke`
- `npm run test:panel-execution-mode-smoke`
- `npm run package:local`
