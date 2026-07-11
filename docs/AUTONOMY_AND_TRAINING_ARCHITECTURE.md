# Arquitectura de Autonomia y Entrenamiento de Agentes de Codigo

## Objetivo
Unificar dos capas de mejora:
- Capa 1 (operativa): memoria persistente en Markdown para no repetir errores y mantener trazabilidad.
- Capa 2 (modelo): entrenamiento por lotes (no en vivo) para absorber conocimiento sin degradar el modelo.

## Politica de almacenamiento
- Modo activo: **single-folder**.
- Todo el estado del agente vive dentro del mismo proyecto (`.agent-learning/`, `docs/`, `tools/agent_autolearn/`).
- No se usan rutas externas para datasets, checkpoints o logs en esta configuracion.

## Analisis tecnico (incluido desde tu referencia)
- Entrenar el modelo tras cada error en vivo es mala practica para modelos pequenos por riesgo de "catastrophic forgetting".
- Enfoque recomendado: separar ejecucion y entrenamiento.
- Durante el trabajo diario se recolectan exitos validados.
- En ventanas de tiempo (nocturno o por umbral) se entrena LoRA por lotes.

## Bucle recomendado
1. Resolver skills aplicables y hacer intake obligatorio antes del plan.
2. Planificar en `docs/TASKS.md` y abrir trazabilidad en `copilot-agent/`.
3. Decidir si conviene delegar a sub-agentes; registrar la decisión.
4. Ejecutar y validar soluciones (tests, lint, backtest, scripts).
5. Si falla: corregir y registrar leccion en `docs/MEMORY.md`.
6. Siempre: evaluar cada run/ejemplo y registrar el veredicto en `.agent-learning/logs/evaluations.jsonl`.
7. Guardar en `.agent-learning/dataset.jsonl` solo ejemplos aceptados por score y sin señales de fallo estructural.
8. Regenerar `.agent-learning/regression-packs/` y `.agent-learning/routing_hints.json` desde el historial validado.
9. Cuando hay suficientes ejemplos nuevos: ejecutar `tools/agent_autolearn/auto_trainer.py`.
10. Registrar resultados de estrategia en `docs/STRATEGY_LOG.md`.

## Implementacion en este repo
- Memoria persistente:
  - `docs/TASKS.md`
  - `docs/MEMORY.md`
  - `docs/STRATEGY_LOG.md`
- Auto-entrenamiento:
  - `tools/agent_autolearn/collector.py`
  - `tools/agent_autolearn/validate_and_collect.py`
  - `tools/agent_autolearn/evaluator.py`
  - `tools/agent_autolearn/regression_packs.py`
  - `tools/agent_autolearn/auto_trainer.py`
  - `tools/agent_autolearn/lora_train_unsloth.py`
  - `tools/agent_autolearn/nightly_train.ps1`

## Politica operativa
- Politica abierta para `free-jt7` y Codex/OpenClaw habilitada en:
  - `.github/free-jt7-policy.yaml`
  - `.github/agents/free-jt7.agent.md`
  - `.github/agents/openclaw.agent.md`
  - `.github/copilot-instructions.md`
  - `copilot-agent/`

## Criterio de calidad minimo para trading
- Profit Factor > 1.5
- Max Drawdown < 10%
- Sharpe > 1.0
- Siempre con datos reales descargados por script (no datos inventados)

## Limites y seguridad tecnica
- No entrenar por cada fallo individual.
- Priorizar lotes de ejemplos exitosos y deduplicados.
- Mantener historial y estado para rollback operativo.
- Si no hay progreso en N intentos, generar reporte de bloqueo en `docs/MEMORY.md`.
