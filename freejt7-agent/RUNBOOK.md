# Free JT7 Runbook

## Checklist operativo

1. Intake obligatorio antes del plan:
   - Confirmar entregable esperado
   - Confirmar restricciones/no-goals
   - Confirmar verificacion esperada
2. Validar policy:
   - `python skills_manager.py policy-validate`
3. Confirmar modo rollout:
   - `python skills_manager.py rollout-mode`
4. Diagnostico estricto:
   - `python skills_manager.py doctor --strict`
5. Resolver skills para la tarea:
   - `python skills_manager.py skill-resolve --query "<objetivo>" --top 3`
6. Registrar/ejecutar run:
   - `python skills_manager.py task-run --goal "<objetivo>" --commands "..."`
7. Revisar checklist:
   - `python skills_manager.py task-list --limit 20`
   - `python skills_manager.py task-checklist --run-id <run_id>`
8. Revisar evidencia:
   - `copilot-agent/runs/<run_id>.json`
   - `copilot-agent/runs/<run_id>.events.jsonl`
9. Registrar decision de delegacion:
   - Delegar si la tarea compleja se beneficia de aislamiento o paralelismo
   - Si no se delega, dejar motivo breve en la trazabilidad

## Router Copilot SDK

- Comando VS Code: `Free JT7: Routed Copilot Task`
- CLI local: `node copilot_router.js --goal "..." --workspace . --json`
- Planner: `gpt-5.4`
- Ejecutores baratos por defecto: `claude-haiku-4.5` y `gemini-3-flash`
- Fallback de alto riesgo: `gpt-5.4`
- Si el CLI responde que no hay autenticacion, ejecutar `copilot` y usar `/login`, o definir `COPILOT_GITHUB_TOKEN`, `GH_TOKEN` o `GITHUB_TOKEN`.

10. Aprendizaje automático:
   - **Siempre** que el agente ejecute una tarea (autónoma o guiada), se
     crea un ejemplo de entrenamiento: el prompt es el `user_goal` y la
     respuesta el `summary`. Un campo `score` marca éxito (1.0) o fallo
     (0.0).
   - La recolección ocurre automáticamente a través de `collect_from_runs.py`.
   - El entrenamiento LoRA **debe ser autorizado** por el usuario o bien
     ejecutarse exclusivamente en horas de inactividad (el script
     `nightly_train.ps1` está diseñado para correr cuando no hay tareas
     activas).
   - Para forzar la recolección manual:
     ```powershell
     python tools\agent_autolearn\collect_from_runs.py
     ```
   - Para entrenar manualmente en cualquier momento:
     ```powershell
     python tools\agent_autolearn\auto_trainer.py --config tools\agent_autolearn\config.json
     ```
   - Un script programado (`tools\agent_autolearn\nightly_train.ps1`)
     ejecuta el recolector y luego entrena; no programarlo mientras se
     estén ejecutando tareas activas.


## Modo canary

- `shadow`: simula steps sin ejecutar comandos.
- `assist`: ejecuta con guardrails y reporta sugerencias.
- `autonomous`: ejecuta pipeline completo con quality gate.
