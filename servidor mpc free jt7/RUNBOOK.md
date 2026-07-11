# Runbook - Servidor MCP Free JT7

## Arranque local
1. `cd "servidor mpc free jt7"`
2. `npm install`
3. `npm run smoke`
4. `npm start`

## Validacion minima
- Ejecutar herramienta `jt7_ping` desde cliente MCP.
- Verificar `jt7_system_exec` con comando seguro (`whoami`).

## Endurecimiento recomendado
- Ajustar `config/policy.json` antes de uso real.
- Definir dominios permitidos en `allowedWebDomains`.
- Reducir `allowedCommands` a lo minimo necesario.
- Mantener `allowYouTubeDownload=false` salvo casos legalmente autorizados.

## Integracion futura con extension Free JT7
- Agregar comando de extension para iniciar/parar este servidor.
- Incorporar validacion de `npm run smoke` previa a integracion.
