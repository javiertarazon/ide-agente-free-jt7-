# Agent AutoLearn (Free-JT7 / Codex)

Este modulo implementa el bucle recomendado para auto-mejora sin olvido catastrofico:

1. El agente trabaja normalmente.
2. Un evaluator puntua cada ejemplo antes de guardarlo.
3. Las evaluaciones completas se registran en `logs/evaluations.jsonl`.
4. Solo los ejemplos aceptados por score se guardan en `dataset.jsonl`.
5. Se regeneran `regression packs` e `routing_hints.json` desde el historial validado.
6. Un entrenamiento nocturno por lotes consume ejemplos nuevos y genera un adaptador LoRA.

## Politica activa de almacenamiento

- Todo en la misma carpeta del proyecto (single-folder).
- Estado, dataset, checkpoints y logs se guardan en `.agent-learning/`.

La arquitectura completa de operacion autonoma + memoria persistente esta en:

- `docs/AUTONOMY_AND_TRAINING_ARCHITECTURE.md`

## Archivos

- `tools/agent_autolearn/collector.py`: inserta ejemplos exitosos (deduplicados por hash).
- `tools/agent_autolearn/validate_and_collect.py`: valida una respuesta y guarda solo si pasa.
- `tools/agent_autolearn/evaluator.py`: puntua, etiqueta y decide aceptación/regression-candidate.
- `tools/agent_autolearn/regression_packs.py`: materializa regression packs e hints de routing.
- `tools/agent_autolearn/auto_trainer.py`: ejecuta entrenamiento por lotes cuando hay X ejemplos nuevos.
- `tools/agent_autolearn/lora_train_unsloth.py`: stub listo para reemplazar con entrenamiento real Unsloth/PEFT.
- `tools/agent_autolearn/config.json`: configuracion de rutas, umbral y comandos.
- `tools/agent_autolearn/nightly_train.ps1`: entrada para scheduler nocturno en Windows.

## Flujo rapido

### 1) Guardar un exito manual

```powershell
python tools/agent_autolearn/collector.py --prompt "Corrige KeyError Close" --response "Usa df.dropna(subset=['Close'])" --tag trading
```

### 2) Validar y guardar automaticamente

```powershell
python tools/agent_autolearn/validate_and_collect.py `
  --prompt "Compila este modulo" `
  --response-file "bot_mt5_gbpusd/strategy.py" `
  --validate-cmd "python -m py_compile bot_mt5_gbpusd/strategy.py" `
  --tag python
```

### 3) Regenerar regression packs e hints de routing

```powershell
python tools/agent_autolearn/regression_packs.py
```

### 4) Entrenamiento por lote (dry run)

```powershell
python tools/agent_autolearn/auto_trainer.py --dry-run
```

### 5) Entrenamiento real por lote

```powershell
python tools/agent_autolearn/auto_trainer.py
```

## Integrar entrenamiento LoRA real

Reemplaza el contenido de `lora_train_unsloth.py` por un pipeline real con:

- `unsloth` o `transformers + peft`
- dataset en formato instruction tuning
- guardado de adaptador LoRA en `.agent-learning/checkpoints/`
- merge opcional segun tu runtime (GGUF, vLLM, Ollama)

## Programar ejecucion nocturna (Windows Task Scheduler)

Comando recomendado:

```powershell
powershell -ExecutionPolicy Bypass -File "E:\javie\bot nueva estarategia\tools\agent_autolearn\nightly_train.ps1"
```

## Notas tecnicas

- Este enfoque evita entrenar "en vivo" tras cada error.
- Minimiza olvido catastrofico al entrenar por lotes de ejemplos aceptados.
- Mantiene trazabilidad en `.agent-learning/logs/`.
- `routing_hints.json` resume qué tipos de tarea/stack muestran mejor historial validado.
