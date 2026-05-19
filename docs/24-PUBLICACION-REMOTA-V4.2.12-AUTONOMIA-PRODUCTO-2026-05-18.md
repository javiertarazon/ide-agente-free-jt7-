# Publicacion remota v4.2.12 - autonomia nativa producto

Fecha: 2026-05-18
Rama preparada: `release/v4.2.12-native-autonomy-product`
Version correlativa: `4.2.12`
Remoto objetivo: `https://github.com/javiertarazon/ide-agente-free-jt7-.git`

## Objetivo

Publicar en una rama remota nueva el estado consolidado de Free JT7 como agente autonomo nativo, sin dependencia funcional de GitHub Copilot, con trazabilidad, memoria de tareas, verificaciones offline y gates opt-in para validacion live/final.

## Cambios incluidos desde la base 4.2.11

- Ruta nativa Free JT7: router/runtime nativo, doctor de autonomia, proveedor multi-API y modelos locales.
- Eliminacion de dependencia funcional de Copilot SDK y router legacy en la ruta principal.
- Hardening de autonomia: sandbox por tarea, aislamiento de procesos, subagentes paralelos, memoria semantica y review/rollback.
- UI de producto: panel chat-first con workflow visual de plan, diff, review, rollback y evidencia por tarea.
- Validacion: `test:offline`, `doctor:native`, gates live opt-in (`doctor:live-api`) y validador de instalacion final (`doctor:final-install`).
- Trazabilidad: `docs/TASKS.md`, `docs/MEMORY.md`, `docs/STRATEGY_LOG.md`, `copilot-agent/tasks.yaml`, `copilot-agent/audit-log.jsonl` y `copilot-agent/RESUME.md` actualizados.

## Estado de funcionamiento esperado

| Area | Estado | Evidencia |
| --- | --- | --- |
| Version | `4.2.12` | `package.json` y `package-lock.json` |
| Build bundle | OK | `npm run build:bundle` |
| Doctor nativo | OK (`67 checks / 0 failed / 0 warnings`) | `npm run doctor:native` |
| Suite offline | OK | `npm run test:offline` |
| Live APIs reales | Skip seguro sin credenciales; opt-in para claves reales | `npm run doctor:live-api` |
| Instalacion final own-IDE | OK en layout workspace; estricto requiere ruta instalada real | `npm run doctor:final-install` |
| Rama remota | Bloqueada por entorno: `git push -u origin release/v4.2.12-native-autonomy-product` fallo con `CONNECT tunnel failed, response 403`; sin proxy falla DNS para `github.com` | `release/v4.2.12-native-autonomy-product` |

## Riesgos y limites

- El push remoto depende de que el entorno tenga credenciales GitHub validas para la cuenta propietaria del repositorio.
- Las pruebas live con APIs reales no deben ejecutarse como requisito offline porque requieren claves y pueden generar coste.
- La validacion final estricta de una instalacion real debe usar `FREEJT7_INSTALLED_EXTENSION_DIR` apuntando al directorio instalado.

## Proximo paso operativo

1. Ejecutar verificaciones ligeras.
2. Crear commit de release/trazabilidad.
3. `origin` fue configurado al remoto objetivo.
4. Publicar la rama desde un entorno con salida GitHub habilitada usando:

```bash
git push -u origin release/v4.2.12-native-autonomy-product
```

## Resultado de push en este entorno

- `git push -u origin release/v4.2.12-native-autonomy-product`: bloqueado por proxy (`CONNECT tunnel failed, response 403`).
- `HTTPS_PROXY= HTTP_PROXY= https_proxy= http_proxy= git ls-remote https://github.com/javiertarazon/ide-agente-free-jt7-.git HEAD`: confirma que sin proxy el host `github.com` no resuelve desde el contenedor.
- Estado final: rama local y commit preparados; publicacion remota requiere ejecutar el push desde un entorno con acceso GitHub o credenciales/red habilitadas.
