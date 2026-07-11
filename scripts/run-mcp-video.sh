#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PYTHON_BIN="$ROOT_DIR/.venv/bin/python"

if [ ! -x "$PYTHON_BIN" ]; then
  echo "Free JT7: no existe el Python de la .venv en $PYTHON_BIN" >&2
  exit 1
fi

exec "$PYTHON_BIN" "$ROOT_DIR/tools/run_mcp_video.py" "$@"