# Registro de Resultados de Estrategias

## Criterios objetivo
- Profit Factor > 1.5
- Max Drawdown < 10%
- Sharpe > 1.0

| Intento | Activo | Temporalidad | Estrategia | Profit Factor | Max Drawdown | Sharpe | Veredicto y Proximo Paso |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 001 | N/A | N/A | Inicializacion del registro | N/A | N/A | N/A | Registro creado. Listo para primeras corridas reales. |
| 002 | own-ide / agent runtime | N/A | Fase 1B agent-first: continuidad y contexto dentro del runtime propio | N/A | N/A | N/A | Veredicto: mejora estructural validada. `freejt7-agent-runtime` ya arma el contexto conversacional y `provider-router` delega la ruta agente. Proximo paso: Fase 1C para centralizar decision operativa, herramientas y persistencia de sesion. |
| 003 | own-ide / agent runtime | N/A | Fase 1C agent-first: planificacion operativa por tarea y persistencia de routePlan | N/A | N/A | N/A | Veredicto: mejora estructural validada. El runtime ya decide la ruta por tarea y el panel persiste `routePlan`. Proximo paso: Fase 2 para mover seleccion de tools/MCP y mas estado de sesion al runtime propio. |
| 004 | own-ide / agent runtime | N/A | Fase 2 inicial: capabilityPlan, skills y MCP dentro del runtime propio | N/A | N/A | N/A | Veredicto: mejora estructural validada. El runtime ya publica `capabilityPlan` y el panel lo refleja. Proximo paso: mover el despacho real de tools/MCP al runtime propio. |
| 005 | own-ide / agent runtime | N/A | Fase 2 siguiente: despacho real de acciones locales desde el runtime propio | N/A | N/A | N/A | Veredicto: mejora estructural validada. El runtime ya no solo planifica; ahora prepara `actions` locales reales para el fallback local. Proximo paso: extender el mismo ownership a skills/MCP/harness. |
| 006 | own-ide / agent runtime | N/A | Fase 3 inicial: continuity via session agent state | N/A | N/A | N/A | Veredicto: mejora estructural validada. `continua` ya puede apoyarse en `agentState` persistido por sesion. Proximo paso: ampliar el estado operativo de sesion y la reanudacion del trabajo tras reinicio. |
| 007 | own-ide / control panel | N/A | Fase 2 cierre formal: panel chat-first con inspector lateral agent-first | N/A | N/A | N/A | Veredicto: Fase 2 cerrada. `control-panel.js` deja tareas como tab lateral por defecto, baja el tono de router/control-plane en la superficie principal y conserva la trazabilidad tecnica en el inspector. Proximo paso: cerrar formalmente Fase 3 con reanudacion real post-restart. |
| 008 | own-ide / agent runtime | N/A | Fase 3 formal: reconstruccion de `agentState`, `yield/resume` y continuidad post-restart | N/A | N/A | N/A | Veredicto: Fase 3 cerrada. `session-engine` ya reconstruye continuidad desde tareas persistidas, actualiza el estado al recuperar tareas interrumpidas y mantiene reanudacion verificable. Proximo paso: Fase 5/Fase 6 formales. |
| 008 | own-ide / copilot legacy | N/A | Fase 6 cierre formal: aislamiento de Copilot como ruta secundaria legacy | N/A | N/A | N/A | Veredicto: Fase 6 cerrada. `copilot_router.runtime` ya usa seleccion/config separada del provider principal, deja metadata explícita de compatibilidad secundaria y conserva override explícito compatible. Proximo paso: cerrar Fase 5 para terminar de subordinar providers y OpenClaw al runtime propio. |
| 008 | own-ide / agent runtime | N/A | Fase 4 cierre formal: dispatch provider-independent de skills, MCP y tools nativos | N/A | N/A | N/A | Veredicto: Fase 4 cerrada. `freejt7-agent-runtime` ahora publica `capabilityPlan.dispatch` con `owner`, `dispatchTarget` y `trace`, y `local-agent-runtime` preserva esa evidencia en resumen tecnico/verificacion. Proximo paso: cerrar Fase 5 subordinando providers/OpenClaw sin perder esta trazabilidad. |

## Hardening avanzado producto autonomia (2026-05-17)
- Run: `20260517-advanced-product-hardening`.
- Metricas: doctor nativo `67 checks / 0 failed / 0 warnings`; suite offline completa OK; build bundle OK.
- Cierre: se agrega aislamiento de procesos con entorno saneado y timeout, UI visual de plan/diff/review/rollback, gate live opt-in y validador de instalacion final own-IDE.
- Siguiente paso: ejecutar `npm run doctor:live-api` con credenciales reales por proveedor en entorno seguro y `npm run doctor:final-install` contra una VSIX instalada en own-IDE real.

## Publicacion remota v4.2.12 (2026-05-18)
- Run: `20260518-release-v4-2-12-remote-publish`.
- Metricas: version `4.2.12`, doctor nativo OK, build OK, suite offline OK.
- Resultado: rama local `release/v4.2.12-native-autonomy-product` preparada; push remoto bloqueado por proxy del contenedor (`CONNECT tunnel failed, response 403`).
- Siguiente paso: ejecutar `git push -u origin release/v4.2.12-native-autonomy-product` desde un entorno con acceso a GitHub.

## Reintento push remoto con credencial temporal (2026-05-18)
- Run: `20260518-github-token-push-retry`.
- Resultado: rama local `release/v4.2.12-native-autonomy-product` creada desde el commit actual, remoto `origin` configurado.
- Bloqueo: `git push -u origin release/v4.2.12-native-autonomy-product` fallo por proxy (`CONNECT tunnel failed, response 403`) antes de autenticar contra GitHub.
- Siguiente paso: ejecutar el mismo push desde un host/red con salida HTTPS a GitHub habilitada; no se persistio la credencial en Git config ni en archivos del repo.
