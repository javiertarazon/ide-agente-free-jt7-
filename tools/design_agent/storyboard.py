from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any


def heuristic_storyboard(prompt: str) -> dict[str, Any]:
    topic = (prompt or "video de producto").strip()
    headline = topic[:72].rstrip(" ,.;:")
    return {
        "title": headline.title(),
        "subtitle": "Canva, Remotion y mcp-video trabajando en un solo flujo",
        "duration_sec": 12,
        "call_to_action": "Activa el flujo completo desde Free JT7",
        "scenes": [
            {
                "headline": "Idea y contexto",
                "body": f"{headline} convertido en storyboard operativo dentro del runtime de Free JT7.",
                "duration_sec": 4,
                "background": "#101820",
                "accent": "#F2AA4C",
                "bullets": ["prompt estructurado", "salida lista para video"],
            },
            {
                "headline": "Diseño y ensamblado",
                "body": "Canva aporta piezas visuales; Remotion compone escenas; mcp-video remata la edición.",
                "duration_sec": 4,
                "background": "#1B4965",
                "accent": "#CAE9FF",
                "bullets": ["assets reutilizables", "render reproducible"],
            },
            {
                "headline": "Entrega automatizada",
                "body": "El resultado queda versionado dentro del workspace con trazabilidad y salida final lista para revisar.",
                "duration_sec": 4,
                "background": "#2D3142",
                "accent": "#EF8354",
                "bullets": ["salida mp4", "pipeline verificable"],
            },
        ],
    }


def normalize_storyboard(candidate: dict[str, Any] | None, prompt: str) -> dict[str, Any]:
    base = heuristic_storyboard(prompt)
    if not isinstance(candidate, dict):
        return base

    scenes = candidate.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        scenes = base["scenes"]

    normalized_scenes = []
    for index, scene in enumerate(scenes[:5]):
        fallback = base["scenes"][index] if index < len(base["scenes"]) else base["scenes"][-1]
        normalized_scenes.append(
            {
                "headline": str(scene.get("headline") or fallback["headline"]).strip(),
                "body": str(scene.get("body") or fallback["body"]).strip(),
                "duration_sec": int(scene.get("duration_sec") or fallback["duration_sec"]),
                "background": str(scene.get("background") or fallback["background"]).strip(),
                "accent": str(scene.get("accent") or fallback.get("accent") or "#FFFFFF").strip(),
                "bullets": [str(item).strip() for item in (scene.get("bullets") or fallback.get("bullets") or []) if str(item).strip()],
            }
        )

    duration_sec = sum(scene["duration_sec"] for scene in normalized_scenes)
    return {
        "title": str(candidate.get("title") or base["title"]).strip(),
        "subtitle": str(candidate.get("subtitle") or base["subtitle"]).strip(),
        "duration_sec": duration_sec,
        "call_to_action": str(candidate.get("call_to_action") or base["call_to_action"]).strip(),
        "scenes": normalized_scenes,
    }


def generate_storyboard(
    prompt: str,
    provider: str,
    model: str,
    workspace_root: Path,
    bridge_path: Path,
    timeout: int = 120,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not provider or provider == "copilot" or not bridge_path.exists():
        return heuristic_storyboard(prompt), {"mode": "heuristic", "provider": provider or "heuristic"}

    payload = json.dumps(
        {
            "prompt": prompt,
            "provider": provider,
            "model": model,
            "workspaceRoot": str(workspace_root),
        },
        ensure_ascii=False,
    )
    try:
        completed = subprocess.run(
            ["node", str(bridge_path)],
            input=payload,
            text=True,
            capture_output=True,
            cwd=str(workspace_root),
            timeout=timeout,
            check=True,
        )
        parsed = json.loads(completed.stdout)
        return normalize_storyboard(parsed.get("storyboard"), prompt), {
            "mode": "provider",
            "provider": parsed.get("provider") or provider,
            "model": parsed.get("model") or model,
        }
    except Exception as error:  # pragma: no cover - fallback path verified by CLI execution
        return heuristic_storyboard(prompt), {
            "mode": "heuristic-fallback",
            "provider": provider,
            "model": model,
            "error": str(error),
        }
