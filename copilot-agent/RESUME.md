# Estado actual
*Actualizado: 2026-04-28 23:25 UTC*
- Últimos runs en progreso: `20260428-phase256-parallel-integration` (2026-04-28).
- Últimos cierres completados: `20260428-phase4-native-capabilities-runtime`, `20260428-phase5-provider-backends-subordinated` y `20260428-phase6-copilot-legacy-isolation` (2026-04-28).
- Resultado clave: Fase 5 queda cerrada formalmente. El runtime propio y `provider-router` ya presentan a Free JT7 como control-plane visible en rutas agent con providers/OpenClaw, y dejan el backend real en `routeMeta.backend` para diagnostico tecnico sin volver a filtrar identidad del proveedor al frente principal.
- Plan maestro persistido: `docs/21-PLAN-MAESTRO-OWN-IDE-AGENT-FIRST.md`
- Instalación final conocida: VSIX 4.2.11 reempaquetada e instalada en el perfil `own-ide` con `app:own-ide:setup`.

## Alineacion de fases
- Fase 1: ejecutada por `phase1a`, `phase1b`, `phase1c`.
- Fase 2: cerrada por `phase2-capability-plan-runtime`, `phase2-runtime-local-dispatch`, hotfixes de soporte UI/local y `20260428-phase2-formal-close-control-panel`.
- Fase 3: cerrada por `phase3-session-agent-state-continuity` y `phase3-formal-close-session-continuity`.
- Fase 4: cerrada por `20260428-phase4-native-capabilities-runtime`.
- Fase 5: cerrada formalmente por `20260428-phase5-provider-backends-subordinated`; `20260428-phase256-parallel-integration` sigue abierto para la integracion global restante.
- Fase 6: cerrada formalmente por `20260428-phase6-copilot-legacy-isolation`; `20260428-phase256-parallel-integration` sigue abierto para la integracion global restante.

## Runs activos adicionales
- `20260428-phase5-provider-backends-subordinated`
  - Scope: `src-js/core/provider-router.js`, `src-js/core/freejt7-agent-runtime.js`, `src-js/core/openclaw-agent-runtime.js`, `src-js/core/provider-registry.js`, `tests/provider_router_failover_smoke.js`, `tests/openclaw_runtime_smoke.js`, `tests/provider_direct_mode_smoke.js`, `tests/provider_model_catalog_smoke.js`, `tests/provider_registry_config_smoke.js`
  - Meta: cierre formal de Fase 5 para dejar OpenClaw/providers como backends subordinados al runtime propio, con menor filtracion visible del control-plane
  - Estado: completado
- `20260428-phase6-copilot-legacy-isolation`
  - Scope: `src-js/core/copilot_router.runtime.js` y pruebas dedicadas nuevas del router
  - Meta: cierre formal de Fase 6 aislando Copilot como ruta legacy secundaria y separando su config/flags del `apiProvider` principal
  - Estado: completado

Importante: los hotfixes no cuentan como cierre de Fase 4, 5 o 6. Desde ahora la lectura oficial del avance debe seguir esta matriz.

## Verificación más reciente
- `node tests/control_panel_ui_smoke.js` -> OK
- `node tests/control_panel_state_regression_smoke.js` -> OK
- `node tests/panel_execution_mode_smoke.js` -> OK
- `node tests/control_panel_script_syntax_smoke.js` -> OK
- `npm run build:bundle` -> OK
- `python3 skills_manager.py policy-validate` -> OK
- `python3 skills_manager.py doctor --strict` -> OK
- `python3 skills_manager.py rollout-mode` -> `autonomous`
- `python3 skills_manager.py host-mode status` -> `full`
- `python3 skills_manager.py ide-detect --json` -> VS Code/Codex/Claude Code detectados; `own-ide` sigue siendo perfil VSCodium aislado
- `python3 skills_manager.py task-run --goal "runtime-audit" --commands "Get-ChildItem" "python3 --version"` -> OK (`20260428T131508Z-81891140`)
- `python3 skills_manager.py task-list --limit 10` -> OK
- `python3 skills_manager.py task-checklist --run-id 20260428T131508Z-81891140` -> OK
- `node tests/freejt7_agent_runtime_smoke.js` -> OK
- `node tests/provider_router_failover_smoke.js` -> OK
- `node tests/provider_direct_mode_smoke.js` -> OK
- `node tests/provider_model_catalog_smoke.js` -> OK
- `node tests/provider_registry_config_smoke.js` -> OK
- `node tests/session_engine_context_smoke.js` -> OK
- `node tests/control_panel_ui_smoke.js` -> OK
- `node tests/local_agent_runtime_smoke.js` -> OK
- `node tests/extension_runtime_fallback_policy_smoke.js` -> OK
- `node tests/chat_context_smoke.js` -> OK
- `node tests/openclaw_runtime_smoke.js` -> OK
- `node tests/control_panel_ui_smoke.js` -> OK
- `npm run build:bundle` -> OK
- `npm run package:local` -> OK
- `npm run app:own-ide:setup` -> OK
- `node tests/installed_extension_smoke.js` -> OK

## Bloqueos activos
- [x] Fase 5 cerrada formalmente: providers y OpenClaw quedan subordinados al runtime propio con facade visible `freejt7-agent` y metadata tecnica de backend.
- [x] Fase 6 cerrada formalmente: compatibilidad heredada Copilot aislada como ruta secundaria en `copilot_router.runtime`.

## Siguiente acción recomendada
Propagar este cierre dentro de `20260428-phase256-parallel-integration` y rematar la integracion global pendiente sin reabrir Fase 5.

## Publicacion remota 2026-04-28
- Snapshot preparado para el remoto `https://github.com/javiertarazon/ide-agente-free-jt7-.git` sobre la rama `release/v4.2.11-panel-pro`.
- Commits creados para esta publicacion:
  - `82c7c2e` — `feat(runtime): Add own-ide agent-first runtimes and smokes`
  - `6e73366` — `docs(agent): Publish own-ide audit and roadmap updates`
  - `5a28520` — `build(app): Add own-ide bootstrap and packaged assets`
- Limite operativo aplicado: se dejan fuera del historial Git solo cuatro binarios mayores de 100 MB (`.deb`, `.rpm` y dos `.vsix` embebidas) porque GitHub los rechaza sin Git LFS.

- 2026-05-19: auditoria estructural profesional completada; removidos duplicados no usados (`files (1)`, `test-router-2.js`, `test-bypass.js`) y verificacion de smokes/lint ejecutada.

- 2026-05-19: evaluacion comparativa Free JT7 vs agentes profesionales formalizada con script reproducible y test unitario (`tools/agent_evaluation/evaluate_freejt7.py`, `tests/test_agent_evaluation.py`).

- 2026-05-19: definido plan de cierre de brecha competitivo con roadmap P0/P1 + KPIs integrado al evaluador (`--roadmap`).

- 2026-05-19: quality gate profesional implementado (`tools/quality/run_quality_gate.py`) y workflow CI (`.github/workflows/quality-gate.yml`) con unit tests x3 anti-flake.

- 2026-05-19: namespace de estado aclarado; Free JT7 prioriza `freejt7-agent/` y usa `copilot-agent/` solo como compatibilidad historica.
