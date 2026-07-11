from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from canva_mcp.auth import DEFAULT_SCOPES
from dotenv import dotenv_values


CANVA_ENV_KEYS = (
    "CANVA_CLIENT_ID",
    "CANVA_CLIENT_SECRET",
    "CANVA_REDIRECT_URI",
    "CANVA_TOKEN_FILE",
)


def slugify(value: str, fallback: str = "freejt7-design") -> str:
    lowered = (value or "").strip().lower()
    lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
    lowered = lowered.strip("-")
    return lowered[:48] or fallback


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def hydrate_canva_env_from_local_files() -> None:
    root = repo_root()
    for env_file in (root / ".env.free-jt7", root / ".env"):
        if not env_file.is_file():
            continue
        values = dotenv_values(env_file)
        for key in CANVA_ENV_KEYS:
            if os.getenv(key):
                continue
            value = values.get(key)
            if value is None:
                continue
            normalized = str(value).strip()
            if normalized:
                os.environ[key] = normalized


@dataclass(frozen=True)
class RuntimePaths:
    root_dir: Path
    design_agent_dir: Path
    remotion_project_dir: Path
    remotion_public_dir: Path
    runs_dir: Path
    provider_bridge: Path
    default_fps: int = 30
    default_width: int = 1280
    default_height: int = 720
    default_scene_duration: int = 4


@dataclass(frozen=True)
class CanvaSettings:
    client_id: str
    client_secret: str
    redirect_uri: str
    token_file: Path
    scopes: list[str] = field(default_factory=lambda: list(DEFAULT_SCOPES))

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)


def resolve_runtime_paths() -> RuntimePaths:
    root = repo_root()
    design_agent_dir = root / "tools" / "design_agent"
    remotion_project_dir = design_agent_dir / "remotion_project"
    return RuntimePaths(
        root_dir=root,
        design_agent_dir=design_agent_dir,
        remotion_project_dir=remotion_project_dir,
        remotion_public_dir=remotion_project_dir / "public",
        runs_dir=root / "copilot-agent" / "runs" / "design-agent",
        provider_bridge=design_agent_dir / "provider_bridge.cjs",
    )


def load_canva_settings(strict: bool = False) -> CanvaSettings:
    hydrate_canva_env_from_local_files()
    token_file = Path(
        os.getenv("CANVA_TOKEN_FILE", str(resolve_runtime_paths().runs_dir / "canva_tokens.json"))
    )
    settings = CanvaSettings(
        client_id=os.getenv("CANVA_CLIENT_ID", "").strip(),
        client_secret=os.getenv("CANVA_CLIENT_SECRET", "").strip(),
        redirect_uri=os.getenv("CANVA_REDIRECT_URI", "http://localhost:8765/callback").strip(),
        token_file=token_file,
    )
    if strict and not settings.is_configured:
        raise ValueError(
            "Faltan CANVA_CLIENT_ID o CANVA_CLIENT_SECRET. "
            "Crea una Canva Developer App y exporta ambas variables antes de autenticar."
        )
    return settings


def create_run_dir(label: str) -> Path:
    paths = resolve_runtime_paths()
    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{slugify(label)}"
    run_dir = paths.runs_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir
