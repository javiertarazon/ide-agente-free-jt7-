#!/usr/bin/env python3
"""Bootstrap local para ejecutar mcp-video con FFmpeg portable."""

from __future__ import annotations

import json
import sys


def _print_json(payload: dict[str, object]) -> None:
    print(json.dumps(payload, indent=2))


def main() -> int:
    try:
        from static_ffmpeg import add_paths
    except Exception as error:  # pragma: no cover - bootstrap failure path
        _print_json(
            {
                "ok": False,
                "error": f"No se pudo importar static-ffmpeg: {error}",
                "hint": "Instala static-ffmpeg en la .venv del workspace.",
            }
        )
        return 1

    try:
        add_paths(weak=True)
    except Exception as error:  # pragma: no cover - bootstrap failure path
        _print_json(
            {
                "ok": False,
                "error": f"No se pudo preparar FFmpeg portable: {error}",
                "hint": "Reintenta con conectividad a internet o instala ffmpeg del sistema.",
            }
        )
        return 1

    if len(sys.argv) > 1 and sys.argv[1] == "doctor-json":
        from mcp_video.doctor import run_diagnostics

        _print_json(run_diagnostics())
        return 0

    from mcp_video.__main__ import main as mcp_video_main

    if sys.argv:
        sys.argv[0] = "mcp-video"
    mcp_video_main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())