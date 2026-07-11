$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot | Split-Path -Parent
Set-Location $workspace

# Primero recoge ejemplos útiles de los archivos de run recientes.
python tools/agent_autolearn/collect_from_runs.py --runs-dir copilot-agent/runs

# Ejecuta entrenamiento por lotes; por defecto corre en modo real.
python tools/agent_autolearn/auto_trainer.py --config tools/agent_autolearn/config.json
