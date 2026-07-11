# Trayectoria de Origen

## Repositorio fuente

- URL: `https://github.com/javiertarazon/agente-copilot.git`

## Linea de evolucion (resumen)

1. `v1.1` (`179b37b`): base OpenClaw + catalogo inicial de skills.
2. `v1.2` (`10deb27`): instalacion global para VS Code/Copilot.
3. `v2.0` (`0595e5d`): runtime autonomo OpenClaw.
4. `v3.0` (`ace1bb4`): sincronizacion y rename global a Free JT7.
5. `v3.1` (`feature/agente-free-extension-v3.1`, base `1e4e6a3`): rama de transicion para extension Free JT7.
6. `v4.0` (este repositorio): split dedicado con runtime migrado + extension VS Code instalable.

## Motivo del split a v4.0

- Aislar el producto "Free JT7 Extension" del monorepo historico.
- Mejorar mantenibilidad y gobernanza de releases.
- Facilitar onboarding y auditoria tecnica de cambios.
