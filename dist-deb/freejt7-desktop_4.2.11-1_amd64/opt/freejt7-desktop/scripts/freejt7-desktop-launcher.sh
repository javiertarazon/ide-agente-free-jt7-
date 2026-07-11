#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${NODE_BIN:-}" ]]; then
  NODE_BIN=$(command -v node || command -v nodejs || echo "")
  if [[ -z "$NODE_BIN" ]]; then
    # Intentar rutas comunes en sistemas tipo Debian/Zorin
    if [[ -x "/usr/bin/node" ]]; then NODE_BIN="/usr/bin/node"
    elif [[ -x "/usr/local/bin/node" ]]; then NODE_BIN="/usr/local/bin/node"
    fi
  fi
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "[freejt7-desktop] ERROR: no se pudo encontrar un ejecutable de node válido." >&2
  exit 1
fi

if [[ -n "${FREEJT7_APP_ROOT:-}" ]]; then
  APP_ROOT="$FREEJT7_APP_ROOT"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  RELATIVE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  if [[ -f "$RELATIVE_ROOT/scripts/freejt7-own-ide-bootstrap.js" ]]; then
    APP_ROOT="$RELATIVE_ROOT"
  elif [[ -f "/opt/freejt7-desktop/scripts/freejt7-own-ide-bootstrap.js" ]]; then
    APP_ROOT="/opt/freejt7-desktop"
  else
    echo "[freejt7-desktop] ERROR: no se pudo resolver APP_ROOT." >&2
    exit 1
  fi
fi

WORKSPACE="${FREEJT7_WORKSPACE:-$PWD}"

exec "$NODE_BIN" "$APP_ROOT/scripts/freejt7-own-ide-bootstrap.js" \
  --repo-root="$APP_ROOT" \
  --workspace="$WORKSPACE" \
  "$@"
