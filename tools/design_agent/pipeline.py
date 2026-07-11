from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

import static_ffmpeg
from mcp_video.client import Client as VideoClient

from .config import RuntimePaths, resolve_runtime_paths

VISUAL_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac"}


def build_render_payload(
    storyboard: dict[str, Any],
    output_name: str,
    remotion_public_assets: list[Path],
    canva_export_asset: Path | None,
    audio_asset: Path | None,
) -> dict[str, Any]:
    paths = resolve_runtime_paths()
    visuals = []
    if canva_export_asset:
        visuals.append(canva_export_asset)
    visuals.extend(remotion_public_assets)

    scenes = []
    for index, scene in enumerate(storyboard.get("scenes", [])):
        duration_sec = int(scene.get("duration_sec") or paths.default_scene_duration)
        image_path = visuals[index].as_posix() if index < len(visuals) else None
        scenes.append(
            {
                "headline": scene["headline"],
                "body": scene["body"],
                "bullets": scene.get("bullets", []),
                "background": scene.get("background", "#111111"),
                "accent": scene.get("accent", "#FFFFFF"),
                "durationInFrames": duration_sec * paths.default_fps,
                "imagePath": image_path,
            }
        )

    return {
        "compositionId": "FreeJT7DesignVideo",
        "title": storyboard["title"],
        "subtitle": storyboard.get("subtitle", ""),
        "callToAction": storyboard.get("call_to_action", ""),
        "width": paths.default_width,
        "height": paths.default_height,
        "fps": paths.default_fps,
        "durationInFrames": sum(scene["durationInFrames"] for scene in scenes),
        "audioPath": audio_asset.as_posix() if audio_asset else None,
        "outputName": output_name,
        "scenes": scenes,
    }


def copy_assets_to_remotion_public(run_id: str, assets: list[Path]) -> list[Path]:
    paths = resolve_runtime_paths()
    target_dir = paths.remotion_public_dir / "generated" / run_id
    target_dir.mkdir(parents=True, exist_ok=True)

    relative_assets: list[Path] = []
    for asset in assets:
        if not asset.exists():
            continue
        target = target_dir / asset.name
        shutil.copy2(asset, target)
        relative_assets.append(Path("generated") / run_id / asset.name)
    return relative_assets


def split_supported_assets(source_file: Path | None) -> tuple[list[Path], Path | None]:
    if not source_file or not source_file.exists():
        return [], None
    suffix = source_file.suffix.lower()
    visual_assets = [source_file] if suffix in VISUAL_EXTENSIONS else []
    audio_asset = source_file if suffix in AUDIO_EXTENSIONS else None
    return visual_assets, audio_asset


def write_generated_props(paths: RuntimePaths, payload: dict[str, Any]) -> Path:
    props_path = paths.remotion_project_dir / "src" / "generated-props.json"
    props_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return props_path


def npm_binary() -> str:
    return "npm.cmd" if os.name == "nt" else "npm"


def ensure_remotion_dependencies(paths: RuntimePaths) -> None:
    node_modules = paths.remotion_project_dir / "node_modules"
    if node_modules.exists():
        return
    subprocess.run(
        [npm_binary(), "install"],
        cwd=str(paths.remotion_project_dir),
        check=True,
        capture_output=True,
        text=True,
    )


def render_remotion_video(paths: RuntimePaths, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            npm_binary(),
            "exec",
            "--",
            "remotion",
            "render",
            "src/index.tsx",
            "FreeJT7DesignVideo",
            str(output_path),
        ],
        cwd=str(paths.remotion_project_dir),
        check=True,
        capture_output=True,
        text=True,
    )
    return output_path


def postprocess_with_mcp_video(input_video: Path, output_video: Path, title: str) -> Path:
    static_ffmpeg.add_paths()
    editor = VideoClient()
    result = editor.add_text(
        video=str(input_video),
        text=title,
        position="bottom-center",
        size=34,
        duration=3.0,
        output=str(output_video),
    )
    return Path(result.output_path)
