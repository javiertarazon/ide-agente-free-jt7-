#!/usr/bin/env python3
"""
Skills Library Manager for Claude Code.
Gestiona una libreria local de skills (habilidades de experto) que se
inyectan en CLAUDE.md para que Claude las use automaticamente.

Uso:
    python skills_manager.py <comando> [opciones]

Comandos:
    list       Listar skills disponibles
    search     Buscar skills por nombre/descripcion/tags
    activate   Activar una o mas skills
    deactivate Desactivar skills
    fetch      Importar skills desde un repo GitHub
    add        Agregar una skill nueva o desde archivo
    github-search  Buscar repos de skills en GitHub
    sync-claude    Actualizar CLAUDE.md con skills activas
    policy-validate  Validar policy de ejecuciÃ³n
    rollout-mode     Ver/cambiar modo canary
    host-mode        Ver/cambiar modo de ejecucion host (safe/full)
    skill-resolve    Resolver skills efÃ­meras
    task-run/task-*  Orquestar runs de tarea con evidencia
    task-list        Listar tareas/runs y su estado
    task-checklist   Ver checklist detallado de un run
    ide-detect       Detectar perfiles IDE instalados
    credentials-*    Guardar/aplicar credenciales de canales/modelos
    easy-onboard     Flujo simple 1-comando para activar Free JT7 gateway
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import shlex
import socket
import subprocess
import sys
import time
import urllib.request
import urllib.parse
import uuid
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

try:
    import tomllib  # py3.11+
except Exception:
    tomllib = None

# Evita caidas por UnicodeEncodeError en consolas Windows con cp1252.
for stream_name in ("stdout", "stderr"):
    stream = getattr(sys, stream_name, None)
    if stream is not None and hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(errors="replace")
        except Exception:
            pass

# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Constantes
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ROOT          = Path(__file__).resolve().parent
# por defecto el catálogo residente se ubica en el directorio /skills del proyecto
SKILLS_DIR    = ROOT / "skills"
INDEX_FILE    = SKILLS_DIR / ".skills_index.json"
ACTIVE_FILE   = SKILLS_DIR / ".active_skills.json"
SOURCES_FILE  = SKILLS_DIR / ".sources.json"
LEGACY_SKILLS_DIR = ROOT / "skills"
LEGACY_INDEX_FILE = LEGACY_SKILLS_DIR / ".skills_index.json"
CLAUDE_MD     = ROOT / "CLAUDE.md"
COPILOT_AGENT = ROOT / "copilot-agent"
GH_SKILLS_DIR = ROOT / ".github" / "skills"
GH_INSTR_DIR  = ROOT / ".github" / "instructions"
COPILOT_INSTR = ROOT / ".github" / "copilot-instructions.md"
VERSION_FILE  = ROOT / "VERSION"
README_MD     = ROOT / "README.md"
CHANGELOG_MD  = ROOT / "CHANGELOG.md"
AGENT_FILE    = ROOT / ".github" / "agents" / "free-jt7.agent.md"
LEGACY_AGENT_FILE = ROOT / ".github" / "agents" / "freejt7.agent.md"
POLICY_FILE   = ROOT / ".github" / "free-jt7-policy.yaml"
LEGACY_POLICY_FILE = ROOT / ".github" / "freejt7-policy.yaml"
MODEL_ROUTING_FILE = ROOT / ".github" / "free-jt7-model-routing.json"
MODEL_ROUTING_LEGACY_FILE = ROOT / ".github" / "freejt7-model-routing.json"
ROLLOUT_FILE  = COPILOT_AGENT / "rollout-mode.json"
OPENCLAW_REPO_DIR = ROOT / "OPEN CLAW"
OPENCLAW_REPO_NAMES: tuple[str, ...] = (
    "OPEN CLAW",
    "open claw",
    "OPEN_CLAW",
    "open_claw",
    "openclaw",
    "OpenClaw",
    "open-claw",
)

SUPPORTED_IDES: tuple[str, ...] = (
    "vscode",
    "cursor",
    "kiro",
    "antigravity",
    "codex",
    "claude-code",
    "gemini-cli",
)
IDE_ALIASES: dict[str, str] = {
    "vscode": "vscode",
    "vs-code": "vscode",
    "code": "vscode",
    "own-ide": "vscode",
    "freejt7-own-ide": "vscode",
    "free-jt7-own-ide": "vscode",
    "cursor": "cursor",
    "kiro": "kiro",
    "antigravity": "antigravity",
    "codex": "codex",
    "claude": "claude-code",
    "claude-code": "claude-code",
    "claudecode": "claude-code",
    "gemini": "gemini-cli",
    "gemini-cli": "gemini-cli",
    "geminicli": "gemini-cli",
}
IDE_SETTINGS_SUBPATHS: dict[str, dict[str, tuple[str, ...]]] = {
    "windows": {
        "vscode": ("Code", "User", "settings.json"),
        "cursor": ("Cursor", "User", "settings.json"),
        "kiro": ("Kiro", "User", "settings.json"),
        "antigravity": ("Antigravity", "User", "settings.json"),
    },
    "linux": {
        "vscode": ("Code", "User", "settings.json"),
        "cursor": ("Cursor", "User", "settings.json"),
        "kiro": ("Kiro", "User", "settings.json"),
        "antigravity": ("Antigravity", "User", "settings.json"),
    },
    "darwin": {
        "vscode": ("Code", "User", "settings.json"),
        "cursor": ("Cursor", "User", "settings.json"),
        "kiro": ("Kiro", "User", "settings.json"),
        "antigravity": ("Antigravity", "User", "settings.json"),
    },
}
IDE_USER_SETTINGS_SUPPORTED: tuple[str, ...] = (
    "vscode",
    "cursor",
    "kiro",
    "antigravity",
    "codex",
    "claude-code",
    "gemini-cli",
)

FREEJT7_DEFAULT_PROVIDER = "openrouter"
FREEJT7_DEFAULT_PROVIDER_MODELS: dict[str, str] = {
    "openrouter": "meta-llama/llama-3.3-70b-instruct:free",
    "hf": "Qwen/Qwen2.5-7B-Instruct-Turbo",
    "zai": "glm-4.5-flash",
}

FREEJT7_DEFAULT_PROVIDER = "openrouter"
FREEJT7_DEFAULT_PROVIDER_MODELS: dict[str, str] = {
    "openrouter": "meta-llama/llama-3.3-70b-instruct:free",
    "hf": "Qwen/Qwen2.5-7B-Instruct-Turbo",
    "zai": "glm-4.5-flash",
}

GITHUB_RAW  = "https://raw.githubusercontent.com"
GITHUB_API  = "https://api.github.com"
DEFAULT_REPO   = "javiertarazon/antigravity-awesome-skills"
DEFAULT_BRANCH = "main"

SKILLS_START = "<!-- SKILLS_LIBRARY_START -->"
SKILLS_END   = "<!-- SKILLS_LIBRARY_END -->"

DEFAULT_POLICY: dict[str, Any] = {
    "autonomy": {"mode": "autonomous"},
    "risk": {
        "allow_high_risk_without_approval": False,
        "allow_destructive": False,
        "thresholds": {
            "low_keywords": ["list", "search", "read", "inspect", "analyze"],
            "medium_keywords": ["install", "update", "configure", "build", "test"],
            "high_keywords": ["delete", "drop", "format", "reset", "remove", "shutdown"],
        },
        "destructive_patterns": ["rm ", "rmdir", "del ", "drop ", "truncate ", "git reset --hard"],
    },
    "execution": {
        "retry": {"max_attempts": 3},
        "allowlist": {
            "enabled": False,
            "bins": [
                "get-childitem",
                "get-content",
                "select-string",
                "python",
                "git",
                "node",
                "npm",
                "pnpm",
                "powershell",
                "pwsh",
                "cmd",
            ],
        },
    },
    "quality_gate": {"required": True},
    "skills": {"activation": "ephemeral", "max_composed": 3},
    "shell": {"strategy": "cross-shell", "default": "powershell"},
    "telemetry": {"level": "full_sanitized"},
    "report": {"style": "executive_technical"},
}

DEFAULT_MODEL_ROUTING: dict[str, Any] = {
    "version": 1,
    "default": {
        "profile": "default",
        "preferIdeProfile": True,
        "allowApiFallback": True,
        "apiFallback": {
            "provider": "openai",
            "model": "gpt-5-mini",
            "env": ["OPENAI_API_KEY"],
        },
    },
    "apiEnvByProvider": {
        "openai": ["OPENAI_API_KEY"],
        "anthropic": ["ANTHROPIC_API_KEY"],
        "google": ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
    },
    "ideProfiles": {
        "codex": {
            "provider": "codex",
            "model": "codex-default",
            "apiFallback": {"provider": "openai", "model": "gpt-5-codex", "env": ["OPENAI_API_KEY"]},
            "profiles": {"default": {}},
        },
        "claude-code": {
            "provider": "claude-code",
            "model": "claude-default",
            "apiFallback": {
                "provider": "anthropic",
                "model": "claude-sonnet-4-5",
                "env": ["ANTHROPIC_API_KEY"],
            },
            "profiles": {"default": {}},
        },
        "gemini-cli": {
            "provider": "gemini-cli",
            "model": "gemini-default",
            "apiFallback": {
                "provider": "google",
                "model": "gemini-2.5-pro",
                "env": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
            },
            "profiles": {"default": {}},
        },
        "vscode": {
            "provider": "github-copilot",
            "model": "copilot-default",
            "apiFallback": {"provider": "openai", "model": "gpt-5-mini", "env": ["OPENAI_API_KEY"]},
            "profiles": {"default": {}},
        },
        "cursor": {
            "provider": "cursor",
            "model": "cursor-default",
            "apiFallback": {"provider": "openai", "model": "gpt-5-mini", "env": ["OPENAI_API_KEY"]},
            "profiles": {"default": {}},
        },
        "kiro": {
            "provider": "kiro",
            "model": "kiro-default",
            "apiFallback": {"provider": "openai", "model": "gpt-5-mini", "env": ["OPENAI_API_KEY"]},
            "profiles": {"default": {}},
        },
        "antigravity": {
            "provider": "antigravity",
            "model": "antigravity-default",
            "apiFallback": {"provider": "openai", "model": "gpt-5-mini", "env": ["OPENAI_API_KEY"]},
            "profiles": {"default": {}},
        },
    },
    "copilotSdkRouter": {
        "planner": {"model": "gpt-5.4"},
        "execution": {
            "cheapModel": "claude-haiku-4.5",
            "contextModel": "gemini-3-flash",
            "fallbackModel": "gpt-5.4",
            "experimentalCodeModel": "",
        },
        "synthesis": {"model": "gpt-5.4"},
        "permissions": {"autoApproveSafeTools": True},
    },
}

# Palabras clave para auto-categorizar skills
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "architecture": ["architect", "c4-", "cqrs", "event-sourcing", "adr", "brainstorm",
                     "refactor", "monorepo", "nestjs", "elixir", "haskell", "inngest"],
    "business":     ["seo", "crm", "growth", "pricing", "marketing", "sales", "content",
                     "copy", "hr", "competitor", "market", "startup", "notion-", "defi",
                     "contract", "conductor"],
    "data-ai":      ["llm", "rag", "agent-", "langchain", "langgraph", "crewai", "embedding",
                     "hugging", "fal-", "dbt", "feature-eng", "hybrid-search", "mlops",
                     "data-sci", "data-eng", "data-qual", "graphql", "analytics", "faiss"],
    "development":  ["python", "typescript", "javascript", "golang", "rust", "java", "php",
                     "ruby", "swift", "flutter", "django", "fastapi", "react", "vue",
                     "nextjs", "laravel", "shopify", "expo", "bun", "prisma", "clickhouse",
                     "discord-bot", "slack-bot", "mobile", "ios-dev", "android"],
    "general":      ["git-", "github-issue", "planning", "docs-", "code-review", "debug",
                     "clean-code", "commit", "create-pr", "readme", "tutorial", "mermaid",
                     "prompt-lib", "context-", "finishing-"],
    "infrastructure":["docker", "kubernetes", "terraform", "aws", "azure-", "devops",
                     "helm", "cicd", "ci-", "gitlab-ci", "github-action", "prometheus",
                     "grafana", "istio", "nginx", "serverless", "gitops", "mlops"],
    "security":     ["security", "pentest", "xss", "sql-inject", "auth-", "oauth",
                     "gdpr", "vulnerab", "burp", "metasploit", "idor", "active-directory",
                     "threat-model", "stride", "malware", "firmware", "incident-resp",
                     "pci-", "sast", "csrf"],
    "testing":      ["test", "tdd", "playwright", "cypress", "jest", "pytest", "qa-",
                     "ab-test", "unit-test", "e2e-", "bats-", "screen-reader"],
    "workflow":     ["slack-", "jira", "notion-", "airtable", "hubspot", "trello",
                     "asana", "monday", "zapier", "stripe-", "sentry", "datadog",
                     "linear-", "zendesk", "github-workflow", "confluence", "make-",
                     "clickup", "todoist", "figma"],
}


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Utilidades I/O
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def load_json(path: Path, default: Any) -> Any:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return default
    return default


def _atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    tmp.write_text(content, encoding="utf-8")
    try:
        for attempt in range(6):
            try:
                tmp.replace(path)
                return
            except PermissionError:
                if attempt == 5:
                    raise
                time.sleep(0.1 * (attempt + 1))
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


def save_json(path: Path, data: Any) -> None:
    _atomic_write_text(path, json.dumps(data, indent=2, ensure_ascii=False))


def load_index() -> list[dict]:
    return load_json(INDEX_FILE, [])


def save_index(skills: list[dict]) -> None:
    save_json(INDEX_FILE, skills)


def load_active() -> dict:
    return load_json(ACTIVE_FILE, {"active": [], "auto_detect": True, "last_changed": ""})


def save_active(data: dict) -> None:
    save_json(ACTIVE_FILE, data)


def load_sources() -> dict:
    return load_json(SOURCES_FILE, {"sources": []})


def save_sources(data: dict) -> None:
    save_json(SOURCES_FILE, data)


def _normalize_ide_name(raw: str) -> str:
    key = str(raw or "").strip().lower()
    return IDE_ALIASES.get(key, key)


def _platform_family() -> str:
    sys_name = platform.system().lower()
    if sys_name.startswith("win"):
        return "windows"
    if sys_name == "darwin":
        return "darwin"
    return "linux"


def _host_fingerprint(platform_family: str | None = None) -> str:
    family = platform_family or _platform_family()
    host = socket.gethostname().strip().lower() or "unknown-host"
    return hashlib.sha256(f"{family}:{host}".encode("utf-8")).hexdigest()[:16]


def _looks_like_windows_path(raw: str) -> bool:
    value = str(raw or "").strip()
    return bool(re.match(r"^[a-zA-Z]:[\\/]", value)) or value.startswith("\\\\")


def _looks_like_posix_path(raw: str) -> bool:
    return str(raw or "").strip().startswith("/")


def _build_active_project_identity(project: Path, platform_family: str | None = None) -> dict[str, str]:
    family = platform_family or _platform_family()
    resolved = project.expanduser().resolve()
    canonical_path = _to_posix(resolved)
    project_id = hashlib.sha256(canonical_path.encode("utf-8")).hexdigest()[:16]
    return {
        "canonical_path": canonical_path,
        "project_id": project_id,
        "platform": family,
        "host_fingerprint": _host_fingerprint(family),
    }


def _resolve_active_project_record(active: dict[str, Any] | None, platform_family: str | None = None) -> dict[str, Any]:
    family = platform_family or _platform_family()
    record = active if isinstance(active, dict) else {}
    raw = str(record.get("canonical_path") or record.get("path") or "").strip()
    expected_platform = str(record.get("platform") or "").strip().lower()
    expected_host = str(record.get("host_fingerprint") or "").strip().lower()

    if not raw:
        return {"path": None, "requested_path": "", "stale_reason": "missing-path", "identity": {}}

    if family != "windows" and _looks_like_windows_path(raw):
        return {"path": None, "requested_path": raw, "stale_reason": "foreign-windows-path", "identity": {}}
    if family == "windows" and _looks_like_posix_path(raw):
        return {"path": None, "requested_path": raw, "stale_reason": "foreign-posix-path", "identity": {}}

    try:
        candidate = Path(raw).expanduser().resolve()
    except Exception:
        return {"path": None, "requested_path": raw, "stale_reason": "invalid-path", "identity": {}}

    if not candidate.exists():
        stale_reason = "missing-path"
        if expected_platform and expected_platform != family:
            stale_reason = "platform-mismatch"
        elif expected_host and expected_host != _host_fingerprint(family):
            stale_reason = "host-mismatch"
        return {
            "path": None,
            "requested_path": raw,
            "stale_reason": stale_reason,
            "identity": {},
        }

    resolved_identity = _build_active_project_identity(candidate, family)
    mismatches: list[str] = []
    if expected_platform and expected_platform != family:
        mismatches.append("platform")
    if expected_host and expected_host != resolved_identity["host_fingerprint"]:
        mismatches.append("host")
    expected_project_id = str(record.get("project_id") or "").strip().lower()
    if expected_project_id and expected_project_id != resolved_identity["project_id"]:
        mismatches.append("project_id")

    return {
        "path": candidate,
        "requested_path": raw,
        "stale_reason": "",
        "identity": resolved_identity,
        "mismatches": mismatches,
    }


def _codex_home() -> Path:
    override = os.environ.get("FREE_JT7_CODEX_HOME", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    codex_home = os.environ.get("CODEX_HOME", "").strip()
    if codex_home:
        return Path(codex_home).expanduser().resolve()
    return (Path.home() / ".codex").resolve()


def _claude_home() -> Path:
    override = os.environ.get("FREE_JT7_CLAUDE_HOME", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return (Path.home() / ".claude").resolve()


def _gemini_home() -> Path:
    override = os.environ.get("FREE_JT7_GEMINI_HOME", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return (Path.home() / ".gemini").resolve()


def _command_exists(candidates: list[str]) -> bool:
    for candidate in candidates:
        if shutil.which(candidate):
            return True
    return False


def _appdata_root() -> Path:
    override = os.environ.get("FREE_JT7_APPDATA_ROOT", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    family = _platform_family()
    if family == "windows":
        appdata = os.environ.get("APPDATA", "").strip()
        if appdata:
            return Path(appdata).expanduser().resolve()
        return (Path.home() / "AppData" / "Roaming").resolve()
    if family == "darwin":
        return (Path.home() / "Library" / "Application Support").resolve()
    return (Path.home() / ".config").resolve()


def _ide_settings_path(ide: str, appdata_root: Path | None = None) -> Path:
    normalized = _normalize_ide_name(ide)
    if normalized == "codex":
        return _codex_home() / "config.toml"
    if normalized == "claude-code":
        if appdata_root is not None:
            return appdata_root / "ClaudeCode" / "config.json"
        return _claude_home() / "config.json"
    if normalized == "gemini-cli":
        if appdata_root is not None:
            return appdata_root / "GeminiCLI" / "settings.json"
        return _gemini_home() / "settings.json"
    family = _platform_family()
    table = IDE_SETTINGS_SUBPATHS.get(family, IDE_SETTINGS_SUBPATHS["linux"])
    if normalized not in table:
        raise RuntimeError(f"IDE no soportado: {ide}")
    root = appdata_root or _appdata_root()
    return root.joinpath(*table[normalized])


def _ide_profile_settings_paths(ide: str, appdata_root: Path | None = None) -> list[Path]:
    normalized = _normalize_ide_name(ide)
    if normalized in {"codex", "claude-code", "gemini-cli"}:
        return []
    base_settings = _ide_settings_path(normalized, appdata_root)
    profiles_dir = base_settings.parent / "profiles"
    if not profiles_dir.exists():
        return []
    result: list[Path] = []
    for child in sorted(profiles_dir.iterdir(), key=lambda item: item.name.lower()):
        if child.is_dir():
            result.append(child / "settings.json")
    return result


def _detect_ide_profiles(appdata_root: Path | None = None) -> list[dict[str, Any]]:
    profiles: list[dict[str, Any]] = []
    root = appdata_root or _appdata_root()
    for ide in SUPPORTED_IDES:
        settings_path = _ide_settings_path(ide, root)
        detected_profiles = _detect_ide_profile_names(ide, root)
        if ide == "codex":
            codex_root = _codex_home()
            installed = (
                codex_root.exists()
                or settings_path.exists()
                or settings_path.parent.exists()
                or _command_exists(["codex"])
            )
        elif ide == "claude-code":
            installed = (
                settings_path.exists()
                or settings_path.parent.exists()
                or _claude_home().exists()
                or _command_exists(["claude", "claude-code"])
            )
        elif ide == "gemini-cli":
            installed = (
                settings_path.exists()
                or settings_path.parent.exists()
                or _gemini_home().exists()
                or _command_exists(["gemini", "gemini-cli"])
            )
        else:
            installed = settings_path.exists() or settings_path.parent.exists()
        profiles.append({
            "ide": ide,
            "installed": installed,
            "settings_path": str(settings_path),
            "settings_exists": settings_path.exists(),
            "profiles": detected_profiles,
        })
    return profiles


def _resolve_ide_targets(ide_value: str, appdata_root: Path | None = None) -> list[str]:
    normalized = _normalize_ide_name(ide_value or "auto")
    if normalized == "all":
        return list(SUPPORTED_IDES)
    if normalized == "auto":
        detected = [p["ide"] for p in _detect_ide_profiles(appdata_root) if p["installed"]]
        return detected if detected else ["vscode"]
    if normalized not in SUPPORTED_IDES:
        raise RuntimeError(
            "IDE invalido. Usa: auto|all|vscode|cursor|kiro|antigravity|codex|claude-code|gemini-cli"
        )
    return [normalized]


def _load_json_object(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _to_posix(path: Path) -> str:
    return str(path).replace("\\", "/")


def _same_path(a: Path, b: Path) -> bool:
    try:
        return a.resolve() == b.resolve()
    except Exception:
        return _to_posix(a) == _to_posix(b)


def _is_freejt7_instruction_path(value: Any) -> bool:
    text = str(value or "").replace("\\", "/")
    return "agente-freejt7-extension-funcional" in text and text.endswith("/.github/copilot-instructions.md")


def _is_freejt7_agent_path(value: Any) -> bool:
    text = str(value or "").replace("\\", "/")
    return "agente-freejt7-extension-funcional" in text and text.endswith("/.github/agents")


def _append_instruction_entry(settings: dict[str, Any], instruction_file: str) -> None:
    key = "github.copilot.chat.codeGeneration.instructions"
    value = settings.get(key, [])
    if not isinstance(value, list):
        value = []
    value = [item for item in value if not (isinstance(item, dict) and _is_freejt7_instruction_path(item.get("file")))]
    exists = any(isinstance(item, dict) and item.get("file") == instruction_file for item in value)
    if not exists:
        value.append({"file": instruction_file})
    settings[key] = value


def _prune_freejt7_agent_locations(settings: dict[str, Any]) -> None:
    key = "chat.agentFilesLocations"
    value = settings.get(key, {})
    if isinstance(value, list):
        value = {str(item): True for item in value if isinstance(item, str) and item.strip()}
    elif not isinstance(value, dict):
        settings.pop(key, None)
        return
    value = {path_key: enabled for path_key, enabled in value.items() if not _is_freejt7_agent_path(path_key)}
    if value:
        settings[key] = value
    else:
        settings.pop(key, None)


def _append_agent_location(settings: dict[str, Any], agent_location: str) -> None:
    _prune_freejt7_agent_locations(settings)
    key = "chat.agentFilesLocations"
    value = settings.get(key, {})
    if not isinstance(value, dict):
        value = {}
    value[agent_location] = True
    settings[key] = value


def _apply_freejt7_settings(
    settings: dict[str, Any],
    instruction_file: str,
    agent_location: str,
    ide: str,
    *,
    include_agent_location: bool = True,
) -> None:
    _append_instruction_entry(settings, instruction_file)
    if include_agent_location:
        _append_agent_location(settings, agent_location)
    else:
        _prune_freejt7_agent_locations(settings)
    settings["github.copilot.chat.codeGeneration.useInstructionFiles"] = True
    settings["github.copilot.chat.customInstructionsInSystemMessage"] = True
    settings["github.copilot.chat.cli.customAgents.enabled"] = True
    settings["github.copilot.chat.switchAgent.enabled"] = True
    settings["chat.agent.enabled"] = True
    settings["freejt7.enabled"] = True
    settings[f"freejt7.integrations.{ide}.enabled"] = True
    settings["freejt7.skills.index"] = ".github/skills/.skills_index.json"
    settings["freejt7.policy.file"] = ".github/free-jt7-policy.yaml"
    settings["freejt7.models.routing"] = ".github/free-jt7-model-routing.json"
    settings["freejt7.models.ide"] = ide
    current_provider = str(settings.get("freejt7.apiProvider") or "").strip()
    if current_provider in {"", "copilot"}:
        current_provider = FREEJT7_DEFAULT_PROVIDER
        settings["freejt7.apiProvider"] = current_provider
    current_model = str(settings.get("freejt7.apiProviderModel") or "").strip()
    if current_provider != "copilot" and not current_model:
        settings["freejt7.apiProviderModel"] = FREEJT7_DEFAULT_PROVIDER_MODELS.get(current_provider, FREEJT7_DEFAULT_PROVIDER_MODELS[FREEJT7_DEFAULT_PROVIDER])
    settings.setdefault("freejt7.autoRepairGlobalSettings", True)
    settings.setdefault("freejt7.autoInstallWorkspaceBridge", True)
    current_provider = str(settings.get("freejt7.apiProvider") or "").strip()
    if current_provider in {"", "copilot"}:
        current_provider = FREEJT7_DEFAULT_PROVIDER
        settings["freejt7.apiProvider"] = current_provider
    current_model = str(settings.get("freejt7.apiProviderModel") or "").strip()
    if current_provider != "copilot" and not current_model:
        settings["freejt7.apiProviderModel"] = FREEJT7_DEFAULT_PROVIDER_MODELS.get(current_provider, FREEJT7_DEFAULT_PROVIDER_MODELS[FREEJT7_DEFAULT_PROVIDER])
    settings.setdefault("freejt7.autoRepairGlobalSettings", True)
    settings.setdefault("freejt7.autoInstallWorkspaceBridge", True)


def _save_json_object(path: Path, data: dict[str, Any]) -> None:
    _atomic_write_text(path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def _upsert_text_block(content: str, start_marker: str, end_marker: str, block_body: str) -> str:
    block = f"{start_marker}\n{block_body.rstrip()}\n{end_marker}\n"
    if start_marker in content and end_marker in content:
        start = content.index(start_marker)
        end = content.index(end_marker) + len(end_marker)
        updated = content[:start].rstrip() + "\n\n" + block
        return updated if updated.endswith("\n") else (updated + "\n")
    if not content.strip():
        return block
    updated = content.rstrip() + "\n\n" + block
    return updated if updated.endswith("\n") else (updated + "\n")


def _write_text_if_needed(path: Path, content: str, force: bool) -> bool:
    if path.exists() and not force:
        return False
    _atomic_write_text(path, content)
    return True


def _upsert_marked_block(
    path: Path,
    start_marker: str,
    end_marker: str,
    block_body: str,
    header: str,
) -> str:
    block = f"{start_marker}\n{block_body.rstrip()}\n{end_marker}\n"
    if path.exists():
        content = path.read_text(encoding="utf-8")
        if start_marker in content and end_marker in content:
            start = content.index(start_marker)
            end = content.index(end_marker) + len(end_marker)
            updated = content[:start].rstrip() + "\n\n" + block
            if not updated.endswith("\n"):
                updated += "\n"
            _atomic_write_text(path, updated)
            return "updated"
        updated = content.rstrip() + "\n\n" + block
        _atomic_write_text(path, updated)
        return "appended"
    _atomic_write_text(path, header.rstrip() + "\n\n" + block)
    return "created"


def _install_workspace_ide_adapter(target: Path, ide: str, force: bool) -> list[str]:
    notes: list[str] = []
    gh_dir = target / ".github"
    instruction_file = ".github/copilot-instructions.md"
    agent_location = ".github/agents"

    if ide == "vscode":
        settings_path = target / ".vscode" / "settings.json"
        settings = _load_json_object(settings_path)
        _apply_freejt7_settings(settings, instruction_file, agent_location, ide)
        _save_json_object(settings_path, settings)
        notes.append(f"workspace settings: {settings_path}")
        return notes

    if ide == "cursor":
        settings_path = target / ".cursor" / "settings.json"
        settings = _load_json_object(settings_path)
        _apply_freejt7_settings(settings, instruction_file, agent_location, ide)
        _save_json_object(settings_path, settings)
        notes.append(f"workspace settings: {settings_path}")
        rules_path = target / ".cursor" / "rules" / "freejt7.mdc"
        rules_content = (
            "---\n"
            "description: Free JT7 runtime policy\n"
            "alwaysApply: true\n"
            "---\n\n"
            "Use .github/copilot-instructions.md and .github/skills as canonical source.\n"
            "Respect .github/free-jt7-policy.yaml and task quality gate before closing work.\n"
        )
        if _write_text_if_needed(rules_path, rules_content, force):
            notes.append(f"rules: {rules_path}")
        return notes

    if ide == "kiro":
        settings_path = target / ".kiro" / "settings.json"
        settings = _load_json_object(settings_path)
        _apply_freejt7_settings(settings, instruction_file, agent_location, ide)
        settings["kiro.freejt7.enabled"] = True
        _save_json_object(settings_path, settings)
        notes.append(f"workspace settings: {settings_path}")
        steering_path = target / ".kiro" / "steering" / "freejt7.md"
        steering_content = (
            "# Free JT7 Steering\n\n"
            "- Instructions: `.github/copilot-instructions.md`\n"
            "- Skills index: `.github/skills/.skills_index.json`\n"
            "- Policy: `.github/free-jt7-policy.yaml`\n"
            "- Runs: `copilot-agent/runs/`\n"
        )
        if _write_text_if_needed(steering_path, steering_content, force):
            notes.append(f"steering: {steering_path}")
        source_agent = _agent_file_path()
        if source_agent.exists():
            kiro_agent = target / ".kiro" / "agents" / "freejt7.agent.md"
            if not kiro_agent.exists() or force:
                kiro_agent.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_agent, kiro_agent)
                notes.append(f"agent: {kiro_agent}")
        return notes

    if ide == "antigravity":
        manifest = target / ".antigravity" / "freejt7.runtime.json"
        settings_path = target / ".antigravity" / "settings.json"
        settings = _load_json_object(settings_path)
        _apply_freejt7_settings(settings, instruction_file, agent_location, ide)
        settings["antigravity.freejt7.enabled"] = True
        settings["antigravity.freejt7.autonomy.mode"] = "autonomous"
        settings["antigravity.freejt7.approvals.auto"] = True
        settings["antigravity.freejt7.requireUserConfirmationDefault"] = False
        _save_json_object(settings_path, settings)
        notes.append(f"workspace settings: {settings_path}")
        payload = {
            "name": "freejt7-runtime",
            "version": VERSION_FILE.read_text(encoding="utf-8").strip() if VERSION_FILE.exists() else "0.0",
            "root": ".",
            "sources": {
                "instructions": str((gh_dir / "copilot-instructions.md").relative_to(target)).replace("\\", "/"),
                "skills_dir": str((gh_dir / "skills").relative_to(target)).replace("\\", "/"),
                "skills_index": str((gh_dir / "skills" / ".skills_index.json").relative_to(target)).replace("\\", "/"),
                "policy": str((gh_dir / "free-jt7-policy.yaml").relative_to(target)).replace("\\", "/"),
            },
            "permissions": ["read", "write", "terminal", "search", "process", "network"],
            "activation": "always",
            "autonomy": {
                "mode": "autonomous",
                "autoApprove": True,
                "requireUserConfirmationDefault": False,
            },
        }
        if not manifest.exists() or force:
            _save_json_object(manifest, payload)
            notes.append(f"manifest: {manifest}")
        return notes

    if ide == "codex":
        codex_dir = target / ".codex"
        codex_runtime = codex_dir / "freejt7-agent.md"
        codex_content = (
            "# Free JT7 Agent Bridge for Codex\n\n"
            "- Instructions: `.github/copilot-instructions.md`\n"
            "- Agent file: `.github/agents/free-jt7.agent.md`\n"
            "- Skills index: `.github/skills/.skills_index.json`\n"
            "- Policy: `.github/free-jt7-policy.yaml`\n"
            "- Runtime runs: `copilot-agent/runs/`\n"
        )
        if _write_text_if_needed(codex_runtime, codex_content, force):
            notes.append(f"codex runtime: {codex_runtime}")

        agents_path = target / "AGENTS.md"
        status = _upsert_marked_block(
            path=agents_path,
            start_marker="<!-- FREE_JT7_CODEX_START -->",
            end_marker="<!-- FREE_JT7_CODEX_END -->",
            block_body=(
                "## Free JT7 Codex Bridge\n"
                "When operating in this workspace, prioritize Free JT7 runtime assets:\n"
                "- `.github/copilot-instructions.md`\n"
                "- `.github/agents/free-jt7.agent.md`\n"
                "- `.github/skills/.skills_index.json`\n"
                "- `.github/free-jt7-policy.yaml`\n"
                "Use `python skills_manager.py task-run` for end-to-end execution with evidence.\n"
            ),
            header="# Workspace Agents",
        )
        notes.append(f"AGENTS bridge {status}: {agents_path}")
        return notes

    if ide == "claude-code":
        claude_runtime = target / ".claude" / "freejt7-agent.md"
        claude_content = (
            "# Free JT7 Bridge for Claude Code\n\n"
            "- Canonical instructions: `.github/copilot-instructions.md`\n"
            "- Skills index: `.github/skills/.skills_index.json`\n"
            "- Policy: `.github/free-jt7-policy.yaml`\n"
            "- Runs: `copilot-agent/runs/`\n"
        )
        if _write_text_if_needed(claude_runtime, claude_content, force):
            notes.append(f"claude runtime: {claude_runtime}")
        claude_md = target / "CLAUDE.md"
        status = _upsert_marked_block(
            path=claude_md,
            start_marker="<!-- FREE_JT7_CLAUDE_CODE_START -->",
            end_marker="<!-- FREE_JT7_CLAUDE_CODE_END -->",
            block_body=(
                "## Free JT7 Claude Code Bridge\n"
                "Use these files as source of truth:\n"
                "- `.github/copilot-instructions.md`\n"
                "- `.github/agents/free-jt7.agent.md`\n"
                "- `.github/skills/.skills_index.json`\n"
                "- `.github/free-jt7-policy.yaml`\n"
                "Prefer `python skills_manager.py task-run` for full execution flow.\n"
            ),
            header="# CLAUDE Instructions",
        )
        notes.append(f"CLAUDE bridge {status}: {claude_md}")
        return notes

    if ide == "gemini-cli":
        gemini_runtime = target / ".gemini" / "freejt7-agent.md"
        gemini_content = (
            "# Free JT7 Bridge for Gemini CLI\n\n"
            "- Canonical instructions: `.github/copilot-instructions.md`\n"
            "- Skills index: `.github/skills/.skills_index.json`\n"
            "- Policy: `.github/free-jt7-policy.yaml`\n"
            "- Runs: `copilot-agent/runs/`\n"
        )
        if _write_text_if_needed(gemini_runtime, gemini_content, force):
            notes.append(f"gemini runtime: {gemini_runtime}")
        gemini_md = target / "GEMINI.md"
        status = _upsert_marked_block(
            path=gemini_md,
            start_marker="<!-- FREE_JT7_GEMINI_CLI_START -->",
            end_marker="<!-- FREE_JT7_GEMINI_CLI_END -->",
            block_body=(
                "## Free JT7 Gemini CLI Bridge\n"
                "Use these files as source of truth:\n"
                "- `.github/copilot-instructions.md`\n"
                "- `.github/agents/free-jt7.agent.md`\n"
                "- `.github/skills/.skills_index.json`\n"
                "- `.github/free-jt7-policy.yaml`\n"
                "Prefer `python skills_manager.py task-run` for full execution flow.\n"
            ),
            header="# GEMINI Instructions",
        )
        notes.append(f"GEMINI bridge {status}: {gemini_md}")
        return notes

    raise RuntimeError(f"IDE no soportado para adaptador workspace: {ide}")


def _update_user_settings_for_ide(
    ide: str,
    appdata_root: Path | None = None,
) -> Path:
    ide = _normalize_ide_name(ide)
    if ide not in IDE_USER_SETTINGS_SUPPORTED:
        raise RuntimeError(f"IDE sin soporte de user settings: {ide}")
    settings_path = _ide_settings_path(ide, appdata_root)
    settings = _load_json_object(settings_path)
    if ide == "codex":
        codex_root = (appdata_root / ".codex").resolve() if appdata_root is not None else _codex_home()
        settings_path = codex_root / "config.toml"
        freejt7_payload = {
            "enabled": True,
            "instructions_file": _to_posix((ROOT / ".github" / "copilot-instructions.md").resolve()),
            "agents_path": _to_posix((ROOT / ".github" / "agents").resolve()),
            "skills_index": _to_posix((ROOT / ".github" / "skills" / ".skills_index.json").resolve()),
            "policy_file": _to_posix((ROOT / ".github" / "free-jt7-policy.yaml").resolve()),
            "model_routing": _to_posix((ROOT / ".github" / "free-jt7-model-routing.json").resolve()),
        }
        codex_payload = codex_root / "freejt7.config.json"
        _save_json_object(codex_payload, freejt7_payload)
        current = settings_path.read_text(encoding="utf-8") if settings_path.exists() else ""
        pointer = _to_posix(codex_payload.resolve())
        block_body = f'freejt7_config = "{pointer}"'
        updated = _upsert_text_block(
            current,
            "# FREE_JT7_CODEX_START",
            "# FREE_JT7_CODEX_END",
            block_body,
        )
        _atomic_write_text(settings_path, updated)
        return settings_path
    if ide in {"claude-code", "gemini-cli"}:
        freejt7_payload = {
            "enabled": True,
            "instructions_file": _to_posix((ROOT / ".github" / "copilot-instructions.md").resolve()),
            "agents_path": _to_posix((ROOT / ".github" / "agents").resolve()),
            "skills_index": _to_posix((ROOT / ".github" / "skills" / ".skills_index.json").resolve()),
            "policy_file": _to_posix((ROOT / ".github" / "free-jt7-policy.yaml").resolve()),
        }
        settings["freejt7"] = freejt7_payload
        settings["freejt7"] = {
            **freejt7_payload
        }
    else:
        instruction_file = _to_posix((ROOT / ".github" / "copilot-instructions.md").resolve())
        agent_location = _to_posix((ROOT / ".github" / "agents").resolve())
        skills_index = _to_posix((ROOT / ".github" / "skills" / ".skills_index.json").resolve())
        policy_file = _to_posix((ROOT / ".github" / "free-jt7-policy.yaml").resolve())
        model_routing = _to_posix((ROOT / ".github" / "free-jt7-model-routing.json").resolve())
        _apply_freejt7_settings(settings, instruction_file, agent_location, ide, include_agent_location=False)
        # In global user settings these must be absolute, otherwise they break per-workspace.
        settings["freejt7.skills.index"] = skills_index
        settings["freejt7.policy.file"] = policy_file
        settings["freejt7.models.routing"] = model_routing
        if ide == "kiro":
            settings["kiro.freejt7.enabled"] = True
        if ide == "antigravity":
            settings["antigravity.freejt7.enabled"] = True
            settings["antigravity.freejt7.autonomy.mode"] = "autonomous"
            settings["antigravity.freejt7.approvals.auto"] = True
            settings["antigravity.freejt7.requireUserConfirmationDefault"] = False
    _save_json_object(settings_path, settings)
    if ide in {"vscode", "cursor", "kiro", "antigravity"}:
        instruction_file = _to_posix((ROOT / ".github" / "copilot-instructions.md").resolve())
        agent_location = _to_posix((ROOT / ".github" / "agents").resolve())
        skills_index = _to_posix((ROOT / ".github" / "skills" / ".skills_index.json").resolve())
        policy_file = _to_posix((ROOT / ".github" / "free-jt7-policy.yaml").resolve())
        model_routing = _to_posix((ROOT / ".github" / "free-jt7-model-routing.json").resolve())
        for profile_settings in _ide_profile_settings_paths(ide, appdata_root):
            if _same_path(profile_settings, settings_path):
                continue
            profile_data = _load_json_object(profile_settings)
            _apply_freejt7_settings(profile_data, instruction_file, agent_location, ide, include_agent_location=False)
            profile_data["freejt7.skills.index"] = skills_index
            profile_data["freejt7.policy.file"] = policy_file
            profile_data["freejt7.models.routing"] = model_routing
            if ide == "kiro":
                profile_data["kiro.freejt7.enabled"] = True
            if ide == "antigravity":
                profile_data["antigravity.freejt7.enabled"] = True
                profile_data["antigravity.freejt7.autonomy.mode"] = "autonomous"
                profile_data["antigravity.freejt7.approvals.auto"] = True
                profile_data["antigravity.freejt7.requireUserConfirmationDefault"] = False
            _save_json_object(profile_settings, profile_data)
    return settings_path


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for key, value in override.items():
        if key in out and isinstance(out[key], dict) and isinstance(value, dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def _parse_scalar(value: str) -> Any:
    val = value.strip()
    if val.lower() in {"true", "false"}:
        return val.lower() == "true"
    if re.fullmatch(r"-?\d+", val):
        try:
            return int(val)
        except Exception:
            return val
    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
        return val[1:-1]
    if val.startswith("[") and val.endswith("]"):
        items = [x.strip() for x in val[1:-1].split(",") if x.strip()]
        return [item.strip("'\"") for item in items]
    return val


def _parse_simple_yaml(text: str) -> dict[str, Any]:
    root: dict[str, Any] = {}
    stack: list[tuple[int, dict[str, Any]]] = [(-1, root)]
    for raw_line in text.splitlines():
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        line = raw_line.strip()
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        while len(stack) > 1 and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]
        if value == "":
            node: dict[str, Any] = {}
            parent[key] = node
            stack.append((indent, node))
        else:
            parent[key] = _parse_scalar(value)
    return root


def _to_yaml_lines(data: dict[str, Any], level: int = 0) -> list[str]:
    lines: list[str] = []
    prefix = " " * level
    for key, value in data.items():
        if isinstance(value, dict):
            lines.append(f"{prefix}{key}:")
            lines.extend(_to_yaml_lines(value, level + 2))
        elif isinstance(value, list):
            rendered = ", ".join(
                f"'{x}'" if isinstance(x, str) and ("," in x or " " in x) else str(x)
                for x in value
            )
            lines.append(f"{prefix}{key}: [{rendered}]")
        elif isinstance(value, bool):
            lines.append(f"{prefix}{key}: {'true' if value else 'false'}")
        else:
            lines.append(f"{prefix}{key}: {value}")
    return lines


def _write_policy(policy: dict[str, Any]) -> None:
    lines = ["# Free JT7 policy file (autogenerated)", * _to_yaml_lines(policy), ""]
    _atomic_write_text(_policy_file_path(), "\n".join(lines))


def _load_policy() -> dict[str, Any]:
    path = _policy_file_path()
    if not path.exists():
        _write_policy(DEFAULT_POLICY)
        return DEFAULT_POLICY
    try:
        parsed = _parse_simple_yaml(path.read_text(encoding="utf-8"))
    except Exception:
        parsed = {}
    return _deep_merge(DEFAULT_POLICY, parsed if isinstance(parsed, dict) else {})


def _validate_policy(policy: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    mode = str(policy.get("autonomy", {}).get("mode", ""))
    if mode not in {"shadow", "assist", "autonomous"}:
        errors.append("autonomy.mode debe ser shadow|assist|autonomous")
    strategy = str(policy.get("shell", {}).get("strategy", ""))
    if strategy not in {"cross-shell", "powershell"}:
        errors.append("shell.strategy debe ser cross-shell|powershell")
    max_attempts = policy.get("execution", {}).get("retry", {}).get("max_attempts", 0)
    if not isinstance(max_attempts, int) or max_attempts < 1 or max_attempts > 5:
        errors.append("execution.retry.max_attempts debe ser entero entre 1 y 5")
    allowlist = policy.get("execution", {}).get("allowlist", {})
    if not isinstance(allowlist, dict):
        errors.append("execution.allowlist debe ser un objeto")
    else:
        bins = allowlist.get("bins", [])
        if not isinstance(bins, list):
            errors.append("execution.allowlist.bins debe ser una lista")
        elif any(not str(item).strip() for item in bins):
            errors.append("execution.allowlist.bins no admite entradas vacias")
    risk = policy.get("risk", {})
    if isinstance(risk, dict):
        if "allow_high_risk_without_approval" in risk and not isinstance(risk.get("allow_high_risk_without_approval"), bool):
            errors.append("risk.allow_high_risk_without_approval debe ser bool")
        if "allow_destructive" in risk and not isinstance(risk.get("allow_destructive"), bool):
            errors.append("risk.allow_destructive debe ser bool")
    level = str(policy.get("telemetry", {}).get("level", ""))
    if level not in {"full_sanitized", "moderate", "minimal"}:
        errors.append("telemetry.level invÃ¡lido")
    return errors


def _load_rollout_mode(policy: dict[str, Any]) -> str:
    if ROLLOUT_FILE.exists():
        data = load_json(ROLLOUT_FILE, {})
        mode = str(data.get("mode", ""))
        if mode in {"shadow", "assist", "autonomous"}:
            return mode
    return str(policy.get("autonomy", {}).get("mode", "autonomous"))


def _save_rollout_mode(mode: str) -> None:
    COPILOT_AGENT.mkdir(parents=True, exist_ok=True)
    save_json(ROLLOUT_FILE, {
        "mode": mode,
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    })


def _coerce_bool(raw: Any, default: bool = False) -> bool:
    if isinstance(raw, bool):
        return raw
    value = str(raw or "").strip().lower()
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _agent_file_path() -> Path:
    if AGENT_FILE.exists():
        return AGENT_FILE
    if LEGACY_AGENT_FILE.exists():
        return LEGACY_AGENT_FILE
    return AGENT_FILE


def _policy_file_path() -> Path:
    if POLICY_FILE.exists():
        return POLICY_FILE
    if LEGACY_POLICY_FILE.exists():
        return LEGACY_POLICY_FILE
    return POLICY_FILE


def _model_routing_path() -> Path:
    if MODEL_ROUTING_FILE.exists():
        return MODEL_ROUTING_FILE
    if MODEL_ROUTING_LEGACY_FILE.exists():
        return MODEL_ROUTING_LEGACY_FILE
    return MODEL_ROUTING_FILE


def _load_model_routing() -> dict[str, Any]:
    path = _model_routing_path()
    if not path.exists():
        save_json(path, DEFAULT_MODEL_ROUTING)
        return json.loads(json.dumps(DEFAULT_MODEL_ROUTING))
    data = load_json(path, {})
    if not isinstance(data, dict):
        data = {}
    return _deep_merge(DEFAULT_MODEL_ROUTING, data)


def _save_model_routing(data: dict[str, Any]) -> Path:
    path = _model_routing_path()
    save_json(path, data)
    return path


def _ensure_target_model_routing(target: Path, force: bool = False) -> Path:
    route = _load_model_routing()
    out = target / ".github" / "free-jt7-model-routing.json"
    if out.exists() and not force:
        return out
    save_json(out, route)
    return out


def _env_key_present(candidates: list[str]) -> str:
    for name in candidates:
        if str(os.environ.get(name, "")).strip():
            return name
    return ""


def _normalize_profile_name(raw: str) -> str:
    value = str(raw or "").strip()
    return value or "default"


def _collect_profile_names_from_json(data: Any) -> set[str]:
    names: set[str] = set()

    def _push(value: Any) -> None:
        if isinstance(value, str):
            item = value.strip()
            if item:
                names.add(item)

    if isinstance(data, dict):
        for key in ("profile", "defaultProfile", "activeProfile", "selectedProfile", "currentProfile"):
            _push(data.get(key))
        profiles = data.get("profiles")
        if isinstance(profiles, dict):
            for key, value in profiles.items():
                _push(str(key))
                if isinstance(value, dict):
                    for nested in ("name", "id", "profile"):
                        _push(value.get(nested))
        elif isinstance(profiles, list):
            for item in profiles:
                if isinstance(item, dict):
                    for nested in ("name", "id", "profile"):
                        _push(item.get(nested))
                else:
                    _push(item)
    return names


def _collect_profile_names_from_toml(data: Any) -> set[str]:
    names: set[str] = set()

    def _push(value: Any) -> None:
        if isinstance(value, str):
            item = value.strip()
            if item:
                names.add(item)

    if not isinstance(data, dict):
        return names
    for key in ("profile", "default_profile", "active_profile", "current_profile"):
        _push(data.get(key))
    profiles = data.get("profiles")
    if isinstance(profiles, dict):
        for key, value in profiles.items():
            _push(str(key))
            if isinstance(value, dict):
                for nested in ("name", "id", "profile"):
                    _push(value.get(nested))
    return names


def _detect_ide_profile_names(ide: str, appdata_root: Path | None = None) -> list[str]:
    normalized = _normalize_ide_name(ide)
    names: set[str] = set()
    settings = _ide_settings_path(normalized, appdata_root)

    if normalized == "codex":
        cfg = _codex_home() / "config.toml"
        candidates = [cfg, settings]
        for path in candidates:
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            if tomllib is not None:
                try:
                    parsed = tomllib.loads(text)
                    names.update(_collect_profile_names_from_toml(parsed))
                except Exception:
                    pass
            names.update(re.findall(r"(?m)^\s*\[profiles\.([A-Za-z0-9._-]+)\]\s*$", text))
            names.update(re.findall(r"""(?m)^\s*profile\s*=\s*["']([^"']+)["']\s*$""", text))
    elif normalized in {"claude-code", "gemini-cli"}:
        home_cfg = (_claude_home() if normalized == "claude-code" else _gemini_home()) / (
            "config.json" if normalized == "claude-code" else "settings.json"
        )
        candidates = [home_cfg, settings]
        for path in candidates:
            data = _load_json_object(path)
            names.update(_collect_profile_names_from_json(data))
    else:
        data = _load_json_object(settings)
        names.update(_collect_profile_names_from_json(data))
        profiles_dir = settings.parent / "profiles"
        if profiles_dir.exists():
            for child in profiles_dir.iterdir():
                if child.is_dir() and child.name.strip():
                    names.add(child.name.strip())

    return sorted({name for name in names if name.strip()})


def _ide_auth_probe(
    ide: str,
    profile: str = "default",
    appdata_root: Path | None = None,
) -> dict[str, Any]:
    normalized = _normalize_ide_name(ide)
    requested_profile = _normalize_profile_name(profile)
    settings = _ide_settings_path(normalized, appdata_root)
    evidence: list[str] = []
    available = False
    if settings.exists():
        available = True
        evidence.append(f"settings:{settings}")
    if normalized == "codex":
        codex_home = _codex_home()
        for item in ("auth.json", "credentials.json", "config.toml"):
            fp = codex_home / item
            if fp.exists():
                available = True
                evidence.append(f"codex:{fp}")
    elif normalized == "claude-code":
        claude_home = _claude_home()
        for item in ("auth.json", "credentials.json", "config.json"):
            fp = claude_home / item
            if fp.exists():
                available = True
                evidence.append(f"claude:{fp}")
    elif normalized == "gemini-cli":
        gemini_home = _gemini_home()
        for item in ("auth.json", "credentials.json", "settings.json"):
            fp = gemini_home / item
            if fp.exists():
                available = True
                evidence.append(f"gemini:{fp}")
    detected_profiles = _detect_ide_profile_names(normalized, appdata_root)
    lowered = {item.lower() for item in detected_profiles}
    if lowered:
        profile_available = requested_profile.lower() in lowered
    else:
        profile_available = requested_profile.lower() == "default"
    available = available and profile_available
    return {
        "ide": normalized,
        "available": available,
        "evidence": evidence,
        "settings_path": str(settings),
        "profile_requested": requested_profile,
        "profile_available": profile_available,
        "detected_profiles": detected_profiles,
    }


def _resolve_model_for_ide(
    ide: str,
    profile: str = "default",
    appdata_root: Path | None = None,
) -> dict[str, Any]:
    normalized = _normalize_ide_name(ide)
    requested_profile = _normalize_profile_name(profile)
    if normalized not in SUPPORTED_IDES:
        raise RuntimeError(f"IDE no soportado para modelos: {ide}")
    routing = _load_model_routing()
    base = routing.get("default", {})
    ide_cfg = routing.get("ideProfiles", {}).get(normalized, {})
    merged = _deep_merge(base if isinstance(base, dict) else {}, ide_cfg if isinstance(ide_cfg, dict) else {})
    profiles = merged.get("profiles", {})
    if isinstance(profiles, dict) and requested_profile in profiles and isinstance(profiles.get(requested_profile), dict):
        merged = _deep_merge(merged, profiles[requested_profile])
    prefer_ide = _coerce_bool(merged.get("preferIdeProfile", True), True)
    allow_fallback = _coerce_bool(merged.get("allowApiFallback", True), True)
    provider = str(merged.get("provider", "openai"))
    model = str(merged.get("model", "auto"))
    ide_probe = _ide_auth_probe(normalized, profile=requested_profile, appdata_root=appdata_root)

    fallback = merged.get("apiFallback", {})
    if not isinstance(fallback, dict):
        fallback = {}
    fallback_provider = str(fallback.get("provider", "openai"))
    fallback_model = str(fallback.get("model", "gpt-5-mini"))
    fallback_env = fallback.get("env", [])
    if not isinstance(fallback_env, list):
        fallback_env = []
    if not fallback_env:
        provider_env = routing.get("apiEnvByProvider", {}).get(fallback_provider, [])
        fallback_env = provider_env if isinstance(provider_env, list) else []
    selected_env = _env_key_present([str(item) for item in fallback_env if str(item).strip()])

    auth_mode = "unavailable"
    reason = "no ide profile and no api key"
    selected_provider = provider
    selected_model = model
    if prefer_ide and ide_probe["available"]:
        auth_mode = "ide-profile"
        reason = "ide profile detected"
    elif allow_fallback and selected_env:
        auth_mode = "api-key-env"
        reason = f"env:{selected_env}"
        selected_provider = fallback_provider
        selected_model = fallback_model
    elif ide_probe["available"]:
        auth_mode = "ide-profile"
        reason = "ide profile detected"
    elif not bool(ide_probe.get("profile_available", True)):
        reason = f"profile '{requested_profile}' not detected in IDE auth"
    return {
        "ide": normalized,
        "profile": requested_profile,
        "provider": selected_provider,
        "model": selected_model,
        "auth_mode": auth_mode,
        "reason": reason,
        "prefer_ide_profile": prefer_ide,
        "allow_api_fallback": allow_fallback,
        "api_env_var": selected_env,
        "ide_profile_available": bool(ide_probe["available"]),
        "requested_profile_available": bool(ide_probe.get("profile_available", False)),
        "ide_detected_profiles": ide_probe.get("detected_profiles", []),
        "ide_evidence": ide_probe["evidence"],
        "routing_file": str(_model_routing_path()),
    }


def _active_project_path() -> Path | None:
    active = load_json(COPILOT_AGENT / "active-project.json", {})
    resolved = _resolve_active_project_record(active)
    path_value = resolved.get("path")
    return path_value if isinstance(path_value, Path) else None


def _resolve_target_project(path_raw: str = "") -> Path:
    raw = str(path_raw or "").strip()
    if raw:
        project = Path(raw).expanduser().resolve()
    else:
        project = _active_project_path() or ROOT
    project.mkdir(parents=True, exist_ok=True)
    return project


def _render_command(parts: list[str]) -> str:
    return " ".join(shlex.quote(str(p)) for p in parts)


def _is_gateway_listening(port: int, host: str = "127.0.0.1", timeout_sec: float = 0.4) -> bool:
    if port <= 0:
        return False
    try:
        with socket.create_connection((host, port), timeout=timeout_sec):
            return True
    except OSError:
        return False


def _wait_gateway_listening(
    port: int,
    timeout_ms: int,
    host: str = "127.0.0.1",
    poll_interval_sec: float = 0.25,
) -> bool:
    deadline = time.time() + max(0.5, timeout_ms / 1000.0)
    while time.time() < deadline:
        if _is_gateway_listening(port=port, host=host):
            return True
        time.sleep(poll_interval_sec)
    return _is_gateway_listening(port=port, host=host)


def _openclaw_build_ready(repo: Path) -> bool:
    if not (repo / "node_modules").exists():
        return False
    entry = None
    for name in ("entry.js", "entry.mjs"):
        candidate = repo / "dist" / name
        if candidate.exists():
            entry = candidate
            break
    if entry is None:
        return False
    try:
        text = entry.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return False
    rel_imports = set(re.findall(r"""from\s+["'](\./[^"']+)["']""", text))
    rel_imports.update(re.findall(r"""import\(\s*["'](\./[^"']+)["']\s*\)""", text))
    for spec in rel_imports:
        target = (entry.parent / spec).resolve()
        if not target.exists():
            return False
    return True


def _is_openclaw_repo(repo: Path) -> bool:
    return (repo / "openclaw.mjs").exists() and (repo / "package.json").exists()


def _discover_openclaw_repo(openclaw_repo: str = "") -> Path | None:
    probes: list[Path] = []
    explicit = str(openclaw_repo or "").strip()
    env_repo = str(os.environ.get("FREE_JT7_OPENCLAW_REPO", "")).strip()
    for raw in (explicit, env_repo):
        if raw:
            probes.append(Path(raw).expanduser())

    for base in (ROOT, ROOT.parent, Path.cwd()):
        for name in OPENCLAW_REPO_NAMES:
            probes.append(base / name)

    probes.append(OPENCLAW_REPO_DIR)

    seen: set[str] = set()
    for probe in probes:
        try:
            resolved = probe.resolve()
        except Exception:
            resolved = probe
        key = _to_posix(resolved)
        if key in seen:
            continue
        seen.add(key)
        if _is_openclaw_repo(resolved):
            return resolved
    return None


def _resolve_openclaw_command(openclaw_repo: str = "") -> list[str]:
    override = str(os.environ.get("FREE_JT7_OPENCLAW_CMD", "")).strip()
    if override:
        parsed = shlex.split(override, posix=False)
        if parsed:
            return [str(item) for item in parsed]

    repo = _discover_openclaw_repo(openclaw_repo)
    local_entry = (repo / "openclaw.mjs") if repo else None
    if local_entry and local_entry.exists():
        build_ready = _openclaw_build_ready(repo)
        if build_ready:
            node = shutil.which("node")
            if not node:
                raise RuntimeError("No se encontrÃ³ Node.js en PATH para ejecutar OpenClaw local")
            return [node, str(local_entry)]

    cli = shutil.which("openclaw")
    if cli:
        return [cli]
    if local_entry and local_entry.exists():
        raise RuntimeError(
            f"OpenClaw local detectado en '{repo}' pero sin build listo. "
            f"Ejecuta: pnpm --dir \"{repo}\" install && pnpm --dir \"{repo}\" build"
        )
    raise RuntimeError(
        "No se encontrÃ³ comando openclaw ni repositorio local de OpenClaw. "
        "Define FREE_JT7_OPENCLAW_CMD o FREE_JT7_OPENCLAW_REPO, o instala OpenClaw."
    )


def _resolve_openclaw_command_hint(openclaw_repo: str = "") -> list[str]:
    override = str(os.environ.get("FREE_JT7_OPENCLAW_CMD", "")).strip()
    if override:
        parsed = shlex.split(override, posix=False)
        if parsed:
            return [str(item) for item in parsed]
    repo = _discover_openclaw_repo(openclaw_repo)
    local_entry = (repo / "openclaw.mjs") if repo else None
    node = shutil.which("node")
    if local_entry and local_entry.exists() and node:
        return [node, str(local_entry)]
    cli = shutil.which("openclaw")
    if cli:
        return [cli]
    return ["openclaw"]


def _link_openclaw_repo_into_target(target: Path, force: bool = False) -> str:
    source_repo = _discover_openclaw_repo("")
    if source_repo is None:
        return "WARN OpenClaw no detectado localmente; define FREE_JT7_OPENCLAW_REPO o instala openclaw CLI"

    target_repo = target / "OPEN CLAW"
    if _same_path(source_repo, target_repo):
        return f"SKIP OpenClaw repo ya disponible en {target_repo}"

    if target_repo.exists() or target_repo.is_symlink():
        if _same_path(source_repo, target_repo):
            return f"SKIP OpenClaw repo ya enlazado en {target_repo}"
        if not force:
            if _is_openclaw_repo(target_repo):
                return f"SKIP OpenClaw repo ya existe en destino: {target_repo}"
            return f"WARN no se vinculo OpenClaw: {target_repo} ya existe (usa --force)"
        if target_repo.is_symlink():
            target_repo.unlink()
        else:
            shutil.rmtree(target_repo)

    try:
        target_repo.symlink_to(source_repo, target_is_directory=True)
        return f"LINK OpenClaw repo -> {target_repo} -> {source_repo}"
    except OSError:
        try:
            shutil.copytree(source_repo, target_repo)
            return f"COPY OpenClaw repo -> {target_repo}"
        except Exception as exc:
            return f"WARN fallo vinculando OpenClaw ({exc})"


def _gateway_paths(project: Path) -> tuple[Path, Path]:
    base = project / ".openclaw"
    config = base / "openclaw.json"
    state_dir = base / "state"
    return config, state_dir


def _credentials_file(project: Path) -> Path:
    return project / ".secrets" / "free-jt7.env"


def _load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip().lstrip("\ufeff")
        if key:
            values[key] = value.strip()
    return values


def _write_env_file(path: Path, values: dict[str, str]) -> Path:
    lines = [
        "# Free JT7 private credentials",
        "# No subir este archivo al repo",
        f"OWNER_PHONE={values.get('OWNER_PHONE', '')}",
        f"TELEGRAM_BOT_TOKEN={values.get('TELEGRAM_BOT_TOKEN', '')}",
        f"OPENAI_API_KEY={values.get('OPENAI_API_KEY', '')}",
        f"ANTHROPIC_API_KEY={values.get('ANTHROPIC_API_KEY', '')}",
        f"GEMINI_API_KEY={values.get('GEMINI_API_KEY', '')}",
        "",
    ]
    _atomic_write_text(path, "\n".join(lines))
    return path


def _valid_phone(phone: str) -> bool:
    value = str(phone or "").strip()
    return bool(re.match(r"^\+[1-9][0-9]{6,15}$", value))


def _secret_mask(value: str) -> str:
    text = str(value or "")
    if len(text) <= 8:
        return "***"
    return text[:4] + "***" + text[-4:]


def _resolve_credentials(
    project: Path,
    *,
    owner_phone: str = "",
    telegram_bot_token: str = "",
    openai_api_key: str = "",
    anthropic_api_key: str = "",
    gemini_api_key: str = "",
    interactive: bool = False,
) -> tuple[dict[str, str], Path]:
    cred_path = _credentials_file(project)
    existing = _load_env_file(cred_path)

    owner = str(owner_phone or existing.get("OWNER_PHONE", "")).strip()
    tg = str(telegram_bot_token or existing.get("TELEGRAM_BOT_TOKEN", "")).strip()
    openai_key = str(openai_api_key or existing.get("OPENAI_API_KEY", "")).strip()
    anthropic_key = str(anthropic_api_key or existing.get("ANTHROPIC_API_KEY", "")).strip()
    gemini_key = str(gemini_api_key or existing.get("GEMINI_API_KEY", "")).strip()

    if interactive:
        owner_in = input(f"Telefono WhatsApp owner [+E164] [{owner}]: ").strip()
        if owner_in:
            owner = owner_in
        tg_in = input(
            f"Telegram bot token [actual={_secret_mask(tg) if tg else 'vacío'}] (Enter conserva): "
        ).strip()
        if tg_in:
            tg = tg_in
        openai_in = input(
            f"OPENAI_API_KEY [actual={_secret_mask(openai_key) if openai_key else 'vacío'}] (Enter conserva): "
        ).strip()
        if openai_in:
            openai_key = openai_in
        anthropic_in = input(
            f"ANTHROPIC_API_KEY [actual={_secret_mask(anthropic_key) if anthropic_key else 'vacío'}] (Enter conserva): "
        ).strip()
        if anthropic_in:
            anthropic_key = anthropic_in
        gemini_in = input(
            f"GEMINI_API_KEY [actual={_secret_mask(gemini_key) if gemini_key else 'vacío'}] (Enter conserva): "
        ).strip()
        if gemini_in:
            gemini_key = gemini_in

    if not owner:
        raise RuntimeError("OWNER_PHONE requerido")
    if not _valid_phone(owner):
        raise RuntimeError("OWNER_PHONE invalido. Usa formato +E164 (ej: +584243703569)")
    if not tg:
        raise RuntimeError("TELEGRAM_BOT_TOKEN requerido")

    values = {
        "OWNER_PHONE": owner,
        "TELEGRAM_BOT_TOKEN": tg,
        "OPENAI_API_KEY": openai_key,
        "ANTHROPIC_API_KEY": anthropic_key,
        "GEMINI_API_KEY": gemini_key,
    }
    path = _write_env_file(cred_path, values)
    return values, path


def _credentials_env_overrides(project: Path) -> dict[str, str]:
    values = _load_env_file(_credentials_file(project))
    result: dict[str, str] = {}
    for key in ("TELEGRAM_BOT_TOKEN", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"):
        value = str(values.get(key, "")).strip()
        if value:
            result[key] = value
    return result


def _apply_credentials_to_gateway_config(project: Path, values: dict[str, str]) -> Path:
    config_path, _ = _gateway_paths(project)
    cfg = load_json(config_path, {})
    if not isinstance(cfg, dict):
        cfg = {}

    gateway = cfg.setdefault("gateway", {})
    if not isinstance(gateway, dict):
        gateway = {}
        cfg["gateway"] = gateway
    gateway["mode"] = "local"

    channels = cfg.setdefault("channels", {})
    if not isinstance(channels, dict):
        channels = {}
        cfg["channels"] = channels

    owner = str(values.get("OWNER_PHONE", "")).strip()
    tg = str(values.get("TELEGRAM_BOT_TOKEN", "")).strip()

    whatsapp = channels.setdefault("whatsapp", {})
    if not isinstance(whatsapp, dict):
        whatsapp = {}
        channels["whatsapp"] = whatsapp
    whatsapp["enabled"] = True
    whatsapp["dmPolicy"] = str(whatsapp.get("dmPolicy", "pairing") or "pairing")
    if owner:
        whatsapp["allowFrom"] = [owner]
        whatsapp["groupAllowFrom"] = [owner]
    whatsapp["groupPolicy"] = str(whatsapp.get("groupPolicy", "allowlist") or "allowlist")

    telegram = channels.setdefault("telegram", {})
    if not isinstance(telegram, dict):
        telegram = {}
        channels["telegram"] = telegram
    telegram["enabled"] = True
    telegram["dmPolicy"] = str(telegram.get("dmPolicy", "pairing") or "pairing")
    telegram["groupPolicy"] = str(telegram.get("groupPolicy", "allowlist") or "allowlist")
    if tg:
        telegram["botToken"] = tg

    save_json(config_path, cfg)
    return config_path


def _path_to_project_string(project: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(project.resolve())).replace("\\", "/")
    except Exception:
        return str(path.resolve())


def _resolve_project_path(project: Path, raw: str) -> Path:
    candidate = Path(str(raw or "").strip()).expanduser()
    if not candidate.is_absolute():
        candidate = project / candidate
    return candidate.resolve()


def _load_gateway_config(project: Path) -> tuple[dict[str, Any], Path]:
    config_path, _ = _gateway_paths(project)
    data = load_json(config_path, {})
    if not isinstance(data, dict) or not data:
        data = _build_gateway_config(owner_phone="", telegram_bot_token="")
    plugins = data.get("plugins")
    if not isinstance(plugins, dict):
        plugins = {}
        data["plugins"] = plugins
    if "enabled" not in plugins:
        plugins["enabled"] = True
    entries = plugins.get("entries")
    if not isinstance(entries, dict):
        plugins["entries"] = {}
    load_cfg = plugins.get("load")
    if not isinstance(load_cfg, dict):
        plugins["load"] = {"paths": []}
    else:
        paths = load_cfg.get("paths")
        if not isinstance(paths, list):
            load_cfg["paths"] = []
    return data, config_path


def _save_gateway_config(project: Path, config: dict[str, Any]) -> Path:
    config_path, _ = _gateway_paths(project)
    save_json(config_path, config)
    return config_path


def _normalize_plugin_id(raw: str) -> str:
    value = re.sub(r"[^a-z0-9._-]+", "-", str(raw or "").strip().lower()).strip("-.")
    return value


def _plugin_metadata_path(project: Path) -> Path:
    return project / ".openclaw" / "free-jt7-plugins.json"


def _load_plugin_metadata(project: Path) -> dict[str, Any]:
    path = _plugin_metadata_path(project)
    data = load_json(path, {})
    if not isinstance(data, dict):
        data = {}
    plugins = data.get("plugins")
    if not isinstance(plugins, dict):
        data["plugins"] = {}
    return data


def _save_plugin_metadata(project: Path, data: dict[str, Any]) -> Path:
    path = _plugin_metadata_path(project)
    save_json(path, data)
    return path


def _detect_plugin_manifest(source_path: Path) -> Path | None:
    if source_path.is_file():
        if source_path.name.lower().endswith(".json"):
            return source_path
        candidate = source_path.parent / "openclaw.plugin.json"
        return candidate if candidate.exists() else None
    if source_path.is_dir():
        for name in ("openclaw.plugin.json", "plugin.json", "manifest.json"):
            candidate = source_path / name
            if candidate.exists():
                return candidate
    return None


def _validate_plugin_manifest(manifest_path: Path | None) -> tuple[dict[str, Any], list[str]]:
    if manifest_path is None:
        return {}, ["manifest no encontrado (esperado: openclaw.plugin.json)"]
    if not manifest_path.exists():
        return {}, [f"manifest no existe: {manifest_path}"]
    manifest = load_json(manifest_path, {})
    if not isinstance(manifest, dict):
        return {}, [f"manifest invalido (JSON objeto requerido): {manifest_path}"]
    name = str(manifest.get("name", "")).strip()
    if not name:
        return manifest, ["manifest sin campo 'name'"]
    return manifest, []


def _validate_plugin_entry(
    project: Path,
    plugin_id: str,
    entry: dict[str, Any],
    metadata_entry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    meta = metadata_entry if isinstance(metadata_entry, dict) else {}
    source = str(meta.get("source", "local") or "local").strip().lower()
    enabled = _coerce_bool(entry.get("enabled", True), True)
    path_raw = str(meta.get("path", "") or "").strip()
    manifest_raw = str(meta.get("manifest", "") or "").strip()
    package = str(meta.get("package", "") or "").strip()
    resolved_path = None
    resolved_manifest = None
    manifest_data: dict[str, Any] = {}

    if source == "local":
        if not path_raw:
            errors.append("path requerido para source=local")
        else:
            resolved_path = _resolve_project_path(project, path_raw)
            if not resolved_path.exists():
                errors.append(f"path no existe: {resolved_path}")
        if manifest_raw:
            resolved_manifest = _resolve_project_path(project, manifest_raw)
        elif resolved_path is not None and resolved_path.exists():
            resolved_manifest = _detect_plugin_manifest(resolved_path)
        data, manifest_errors = _validate_plugin_manifest(resolved_manifest)
        manifest_data = data
        errors.extend(manifest_errors)
    elif source == "npm":
        if not package:
            errors.append("package requerido para source=npm")
    else:
        errors.append(f"source no soportado: {source}")

    if enabled and not path_raw and source == "local":
        warnings.append("plugin habilitado sin path configurado")

    detected_name = str(manifest_data.get("name", "")).strip()
    if detected_name:
        expected = _normalize_plugin_id(detected_name)
        if expected and expected != plugin_id:
            warnings.append(
                f"id '{plugin_id}' distinto a manifest.name '{detected_name}' (sugerido: {expected})"
            )

    return {
        "id": plugin_id,
        "enabled": enabled,
        "source": source,
        "path": str(resolved_path) if resolved_path is not None else path_raw,
        "manifest": str(resolved_manifest) if resolved_manifest is not None else manifest_raw,
        "package": package,
        "manifest_name": detected_name,
        "manifest_version": str(manifest_data.get("version", "")).strip(),
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }


def _collect_plugin_validation(
    project: Path,
    config: dict[str, Any],
    plugin_id: str = "",
) -> list[dict[str, Any]]:
    metadata = _load_plugin_metadata(project).get("plugins", {})
    plugins = config.get("plugins", {})
    entries = plugins.get("entries", {}) if isinstance(plugins, dict) else {}
    if not isinstance(entries, dict):
        entries = {}
    if not isinstance(metadata, dict):
        metadata = {}
    selected = sorted(set(entries.keys()) | set(metadata.keys()))
    requested = _normalize_plugin_id(plugin_id)
    if requested:
        selected = [requested] if requested in set(selected) else []
    results: list[dict[str, Any]] = []
    for pid in selected:
        raw = entries.get(pid, {})
        entry = raw if isinstance(raw, dict) else {}
        meta_entry = metadata.get(pid, {})
        results.append(_validate_plugin_entry(project, pid, entry, metadata_entry=meta_entry))
    return results


def _build_gateway_config(
    owner_phone: str,
    telegram_bot_token: str,
) -> dict[str, Any]:
    allow_from = [owner_phone] if owner_phone else []
    cfg: dict[str, Any] = {
        "gateway": {
            "mode": "local",
            "bind": "loopback",
            "port": 18789,
            "reload": {"mode": "hybrid"},
        },
        "channels": {
            "defaults": {"groupPolicy": "allowlist"},
            "whatsapp": {
                "dmPolicy": "pairing",
                "allowFrom": allow_from,
                "groupPolicy": "allowlist",
                "groupAllowFrom": allow_from,
            },
            "telegram": {
                "enabled": True,
                "dmPolicy": "pairing",
                "allowFrom": [],
                "groupPolicy": "allowlist",
                "groups": {"*": {"requireMention": True}},
            },
        },
        "web": {"enabled": True},
        "tools": {
            "profile": "coding",
            "exec": {"host": "sandbox", "security": "allowlist", "ask": "on-miss"},
        },
        "plugins": {"enabled": True, "entries": {}},
    }
    if telegram_bot_token:
        cfg["channels"]["telegram"]["botToken"] = telegram_bot_token
    return cfg


def _write_gateway_env_example(
    project: Path,
    model_resolution: dict[str, Any],
) -> Path:
    env_file = project / ".env.free-jt7.example"
    lines = [
        "# Free JT7 gateway env template",
        "# Completa solo si no quieres depender del perfil del IDE",
        "",
        "TELEGRAM_BOT_TOKEN=",
        "OPENAI_API_KEY=",
        "ANTHROPIC_API_KEY=",
        "GEMINI_API_KEY=",
        "",
        f"# IDE/modelo resuelto por defecto: {model_resolution.get('ide')}/{model_resolution.get('model')}",
    ]
    _atomic_write_text(env_file, "\n".join(lines) + "\n")
    return env_file


def _openclaw_run(
    cli_args: list[str],
    project: Path,
    openclaw_repo: str = "",
    dry_run: bool = False,
    timeout_ms: int = 120000,
) -> tuple[int, str]:
    config_path, state_dir = _gateway_paths(project)
    if dry_run:
        cmd = _resolve_openclaw_command_hint(openclaw_repo) + cli_args
    else:
        cmd = _resolve_openclaw_command(openclaw_repo) + cli_args
    rendered = _render_command(cmd)
    if dry_run:
        return 0, f"[dry-run] {rendered}"
    env = os.environ.copy()
    env.update(_credentials_env_overrides(project))
    env["OPENCLAW_CONFIG_PATH"] = str(config_path)
    env["OPENCLAW_STATE_DIR"] = str(state_dir)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=max(1, timeout_ms // 1000),
            env=env,
            cwd=str(project),
        )
    except subprocess.TimeoutExpired:
        return 124, f"timeout ejecutando: {rendered}"
    output = ((proc.stdout or "") + (proc.stderr or "")).strip()
    if not output:
        output = rendered
    return proc.returncode, output[:8000]


def _runs_dir() -> Path:
    return COPILOT_AGENT / "runs"


def _run_paths(run_id: str) -> tuple[Path, Path]:
    base = _runs_dir()
    base.mkdir(parents=True, exist_ok=True)
    return base / f"{run_id}.json", base / f"{run_id}.events.jsonl"


def _redact_sensitive(text: str) -> str:
    if not text:
        return text
    out = text
    out = re.sub(
        r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*['\"]?([^\s'\"`]+)",
        r"\1=***REDACTED***",
        out,
    )
    out = re.sub(r"(?i)bearer\s+([a-z0-9\._\-]+)", "Bearer ***REDACTED***", out)
    out = re.sub(r"ghp_[A-Za-z0-9]{20,}", "***REDACTED***", out)
    out = re.sub(r"sk-[A-Za-z0-9]{20,}", "***REDACTED***", out)
    return out


def _append_run_event(run_id: str, payload: dict[str, Any]) -> None:
    _, events = _run_paths(run_id)
    safe_payload = {
        **payload,
        "command": _redact_sensitive(str(payload.get("command", ""))),
        "result": _redact_sensitive(str(payload.get("result", ""))),
        "redaction_applied": True,
    }
    with open(events, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(safe_payload, ensure_ascii=False) + "\n")


def _classify_risk(text: str, policy: dict[str, Any]) -> str:
    probe = text.lower()
    thresholds = policy.get("risk", {}).get("thresholds", {})
    if any(k in probe for k in thresholds.get("high_keywords", [])):
        return "high"
    if any(k in probe for k in thresholds.get("medium_keywords", [])):
        return "medium"
    return "low"


def _is_destructive(command: str, policy: dict[str, Any]) -> bool:
    probe = command.lower()
    for pat in policy.get("risk", {}).get("destructive_patterns", []):
        if pat.lower() in probe:
            return True
    return False


def _normalize_shell_command(command: str, strategy: str, platform_family: str | None = None) -> str:
    if strategy != "cross-shell":
        return command
    family = platform_family or _platform_family()
    trimmed = command.strip()

    if family != "windows":
        lower = trimmed.lower()
        if lower in {"get-childitem", "gci", "dir"}:
            return "ls"
        if lower == "get-location":
            return "pwd"
        if lower.startswith("get-content "):
            arg = trimmed[len("get-content "):].strip()
            if arg.lower().startswith("-path "):
                arg = arg[6:].strip()
            return f"cat {arg}"
        if lower.startswith("select-string "):
            try:
                parts = shlex.split(trimmed)
            except Exception:
                parts = []
            path_value = ""
            pattern_value = ""
            index = 1
            while index < len(parts):
                token = parts[index].lower()
                if token in {"-path", "-literalpath"} and index + 1 < len(parts):
                    path_value = parts[index + 1]
                    index += 2
                    continue
                if token == "-pattern" and index + 1 < len(parts):
                    pattern_value = parts[index + 1]
                    index += 2
                    continue
                index += 1
            if path_value and pattern_value:
                return f"grep -R {shlex.quote(pattern_value)} {shlex.quote(path_value)}"
        return command

    if trimmed == "ls":
        return "Get-ChildItem"
    if trimmed.startswith("cat "):
        arg = trimmed[4:].strip()
        return f"Get-Content -Path {arg}"
    if trimmed == "pwd":
        return "Get-Location"
    if trimmed.startswith("grep "):
        parts = shlex.split(trimmed)
        if len(parts) >= 3:
            pat = parts[1]
            target = parts[2]
            return f"Select-String -Path {target} -Pattern {pat}"
    return command


def _extract_primary_bin(command: str) -> str:
    text = str(command or "").strip()
    if not text:
        return ""
    try:
        tokens = shlex.split(text, posix=False)
    except Exception:
        tokens = []
    if not tokens:
        match = re.match(r"^\s*([^\s|;&]+)", text)
        token = match.group(1) if match else ""
    else:
        token = tokens[0]
    token = token.strip().strip("\"'")
    if not token:
        return ""
    return Path(token).name.lower()


def _command_allowed_by_policy(command: str, policy: dict[str, Any]) -> tuple[bool, str]:
    allow_cfg = policy.get("execution", {}).get("allowlist", {})
    enabled = _coerce_bool(allow_cfg.get("enabled", False), False) if isinstance(allow_cfg, dict) else False
    primary = _extract_primary_bin(command)
    if not enabled:
        return True, primary
    bins = allow_cfg.get("bins", []) if isinstance(allow_cfg, dict) else []
    allowed_bins = {str(item).strip().lower() for item in bins if str(item).strip()}
    if not primary:
        return False, primary
    return primary in allowed_bins, primary


def _execute_powershell(command: str, timeout: int = 120000) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-Command", command],
            capture_output=True,
            text=True,
            timeout=timeout / 1000,
            encoding="utf-8",
            errors="replace",
        )
        output = (proc.stdout or "") + (proc.stderr or "")
        return proc.returncode, output[:8000]
    except subprocess.TimeoutExpired:
        return 124, "command timed out"
    except Exception as exc:
        return 1, str(exc)


def _execute_task_shell(
    command: str,
    timeout: int = 120000,
    platform_family: str | None = None,
) -> tuple[int, str]:
    family = platform_family or _platform_family()
    if family == "windows":
        return _execute_powershell(command, timeout=timeout)

    shell_bin = shutil.which("bash") or shutil.which("sh")
    if not shell_bin:
        return 1, "No compatible POSIX shell found"

    shell_name = Path(shell_bin).name.lower()
    shell_args = [shell_bin, "-lc" if shell_name == "bash" else "-c", command]
    try:
        proc = subprocess.run(
            shell_args,
            capture_output=True,
            text=True,
            timeout=timeout / 1000,
            encoding="utf-8",
            errors="replace",
        )
        output = (proc.stdout or "") + (proc.stderr or "")
        return proc.returncode, output[:8000]
    except subprocess.TimeoutExpired:
        return 124, "command timed out"
    except Exception as exc:
        return 1, str(exc)


def _task_step_attempts(command: str, normalized: str, platform_family: str | None = None) -> list[str]:
    family = platform_family or _platform_family()
    attempts: list[str] = []

    def _push(candidate: str) -> None:
        text = str(candidate or "").strip()
        if text and text not in attempts:
            attempts.append(text)

    _push(normalized)
    if family == "windows":
        _push(f"{normalized} 2>$null")
        _push(f"cmd /c {command}")
    else:
        try:
            normalized_parts = shlex.split(normalized)
        except Exception:
            normalized_parts = []
        if normalized_parts and normalized_parts[0] == "python" and not shutil.which("python") and shutil.which("python3"):
            _push(" ".join(["python3", *[shlex.quote(part) for part in normalized_parts[1:]]]))
        _push(f"{normalized} 2>/dev/null")
        _push(command)
    return attempts


def _resolve_skills_for_query(query: str, top_n: int = 3) -> list[dict[str, Any]]:
    skills = load_index()
    scored = [(s, _relevance(s, query)) for s in skills]
    scored = [(s, score) for s, score in scored if score > 0]
    scored.sort(key=lambda item: item[1], reverse=True)
    picked = []
    for skill, score in scored[:top_n]:
        picked.append({
            "id": skill["id"],
            "category": skill.get("category", "general"),
            "score": round(score, 3),
            "gh_path": skill.get("gh_path", ""),
        })
    return picked
def _backup_file(path: Path) -> Path | None:
    if not path.exists():
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = path.with_name(f"{path.name}.bak.{stamp}")
    shutil.copy2(path, backup)
    return backup


def _mirror_legacy_index(skills: list[dict]) -> None:
    LEGACY_SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    save_json(LEGACY_INDEX_FILE, skills)


def _ensure_active_consistency(skills: list[dict]) -> list[dict]:
    active_data = load_active()
    active_set = set(active_data.get("active", []))
    for skill in skills:
        skill["active"] = skill.get("id") in active_set
    return skills


def _load_skills_from_disk(skills_dir: Path) -> list[dict]:
    skills: list[dict] = []
    active_set = set(load_active().get("active", []))
    for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
        skill_id = skill_md.parent.name
        with open(skill_md, "r", encoding="utf-8", errors="replace") as handle:
            header_probe = handle.read(16384)
        if not header_probe.startswith("---"):
            header_probe = ""
        meta, _ = parse_frontmatter(header_probe)
        fm_meta = meta.get("metadata", {}) if isinstance(meta.get("metadata"), dict) else {}
        name = str(meta.get("name", skill_id))
        description = str(meta.get("description", "")).strip()
        category = str(fm_meta.get("category", "")) or auto_categorize(skill_id, description)
        skills.append({
            "id": skill_id,
            "name": name,
            "description": description[:120],
            "category": category,
            "path": str(skill_md.relative_to(ROOT)).replace("\\", "/"),
            "gh_path": str(skill_md.relative_to(ROOT)).replace("\\", "/"),
            "tags": [t for t in skill_id.replace("-", " ").split() if len(t) > 2],
            "risk": str(fm_meta.get("risk", "unknown")),
            "source": str(fm_meta.get("source", "local")),
            "active": skill_id in active_set,
        })
    return skills


def _rebuild_index_from_disk() -> list[dict]:
    if not SKILLS_DIR.exists():
        raise RuntimeError(f"No existe el catÃ¡logo de skills: {SKILLS_DIR}")
    skills = _load_skills_from_disk(SKILLS_DIR)
    if not skills:
        raise RuntimeError("No se encontraron SKILL.md en .github/skills")
    skills.sort(key=lambda s: s["id"])
    save_index(skills)
    _mirror_legacy_index(skills)
    return skills


def _migrate_legacy_state() -> list[str]:
    notes: list[str] = []
    if LEGACY_INDEX_FILE.exists() and not INDEX_FILE.exists():
        backup = _backup_file(LEGACY_INDEX_FILE)
        if backup:
            notes.append(f"backup legado creado: {backup.name}")
    if not INDEX_FILE.exists() and SKILLS_DIR.exists():
        skills = _load_skills_from_disk(SKILLS_DIR)
        if skills:
            save_index(skills)
            _mirror_legacy_index(skills)
            notes.append("Ã­ndice reconstruido desde .github/skills")
    elif INDEX_FILE.exists():
        _mirror_legacy_index(load_index())
        notes.append("espejo legado actualizado")
    return notes


def _preflight(require_index: bool = False, strict_active_project: bool = False) -> None:
    if not SKILLS_DIR.exists():
        raise RuntimeError(f"CatÃ¡logo no encontrado: {SKILLS_DIR}")
    migrate_notes = _migrate_legacy_state()
    if migrate_notes:
        _log_audit("migrate", "; ".join(migrate_notes))
    if require_index and not INDEX_FILE.exists():
        _rebuild_index_from_disk()
    if strict_active_project:
        active_project = load_json(COPILOT_AGENT / "active-project.json", {})
        resolved_active = _resolve_active_project_record(active_project)
        if not resolved_active.get("path"):
            reason = resolved_active.get("stale_reason") or "missing-path"
            raise RuntimeError(
                f"Proyecto activo no resoluble ({reason}). Ejecuta: python skills_manager.py set-project <ruta>"
            )


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Frontmatter
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Parsea frontmatter YAML simple (solo primer nivel + metadata: bloque)."""
    pattern = re.compile(r'^---\s*\n(.*?)\n---\s*\n', re.DOTALL)
    m = pattern.match(text)
    if not m:
        return {}, text
    meta: dict[str, Any] = {}
    lines = m.group(1).splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or line.startswith('#'):
            i += 1
            continue
        if re.match(r'^[a-zA-Z0-9_-]+:\s*$', line):
            # bloque anidado
            key = line.split(':')[0].strip()
            sub: dict[str, Any] = {}
            i += 1
            while i < len(lines) and (lines[i].startswith('  ') or lines[i].startswith('\t')):
                sub_line = lines[i].strip()
                if ':' in sub_line:
                    sk, _, sv = sub_line.partition(':')
                    sv = sv.strip().strip('"')
                    # parse list
                    if sv.startswith('[') and sv.endswith(']'):
                        sv = [x.strip().strip('"') for x in sv[1:-1].split(',') if x.strip()]
                    sub[sk.strip()] = sv
                i += 1
            meta[key] = sub
        elif ':' in line:
            k, _, v = line.partition(':')
            v = v.strip().strip('"')
            if v.startswith('[') and v.endswith(']'):
                v = [x.strip().strip('"') for x in v[1:-1].split(',') if x.strip()]
            meta[k.strip()] = v
            i += 1
        else:
            i += 1
            continue
    return meta, text[m.end():]


def build_frontmatter(meta: dict, body: str) -> str:
    """Serializa frontmatter dict a YAML block + cuerpo."""
    lines = ["---"]
    for k, v in meta.items():
        if isinstance(v, dict):
            lines.append(f"{k}:")
            for sk, sv in v.items():
                if isinstance(sv, list):
                    lines.append(f"  {sk}: [{', '.join(sv)}]")
                else:
                    lines.append(f"  {sk}: {sv}")
        elif isinstance(v, list):
            lines.append(f"{k}: [{', '.join(str(x) for x in v)}]")
        else:
            lines.append(f"{k}: {v}")
    lines.append("---")
    lines.append("")
    return "\n".join(lines) + body


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Categorization automatica
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def auto_categorize(skill_id: str, description: str = "") -> str:
    text = (skill_id + " " + description).lower()
    best_cat  = "general"
    best_score = 0
    for cat, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw.lower() in text)
        if score > best_score:
            best_score = score
            best_cat   = cat
    return best_cat


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# HTTP helpers
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _headers() -> dict[str, str]:
    h = {"User-Agent": "skills-manager/1.0"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def fetch_url(url: str, timeout: int = 15) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers=_headers())
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except Exception:
        return None


def fetch_json(url: str) -> Any:
    data = fetch_url(url)
    if data is None:
        return None
    try:
        return json.loads(data)
    except Exception:
        return None


def print_progress(done: int, total: int, label: str = "", width: int = 36) -> None:
    pct   = done / total if total else 0
    filled = int(width * pct)
    bar   = "=" * filled + "-" * (width - filled)
    suffix = f" {label}" if label else ""
    sys.stdout.write(f"\r  [{bar}] {done}/{total}{suffix}   ")
    sys.stdout.flush()
    if done >= total:
        sys.stdout.write("\n")


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# cmd_fetch
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def cmd_fetch(args: argparse.Namespace) -> int:
    """Importa skills desde un repositorio GitHub."""
    try:
        _preflight(require_index=False)
    except RuntimeError as exc:
        print(f"[fetch] ERROR: {exc}")
        return 1

    repo   = args.repo   if hasattr(args, "repo")   and args.repo   else DEFAULT_REPO
    branch = args.branch if hasattr(args, "branch") and args.branch else DEFAULT_BRANCH
    force  = getattr(args, "update", False)
    dry    = getattr(args, "dry_run", False)

    raw_base = f"{GITHUB_RAW}/{repo}/{branch}"

    print(f"[fetch] Repo   : {repo} (branch: {branch})")
    print(f"[fetch] Destino: {SKILLS_DIR}")

    # 1. Obtener skills_index.json del repo
    print("[fetch] Descargando skills_index.json...")
    index_data = fetch_json(f"{raw_base}/skills_index.json")
    if not index_data or not isinstance(index_data, list):
        print("[fetch] ERROR: No se pudo obtener skills_index.json del repo.")
        return 1

    total = len(index_data)
    print(f"[fetch] Encontrados {total} skills.")

    if dry:
        print("[fetch] Modo --dry-run: no se descarga nada.")
        for s in index_data[:5]:
            print(f"  {s['id']:40s}  {s.get('description','')[:60]}")
        print(f"  ... y {total - 5} mas.")
        return 0

    # 2. Descargar cada SKILL.md
    ok = 0
    skip = 0
    errors: list[str] = []

    for i, entry in enumerate(index_data):
        skill_path  = entry.get("path", "")           # e.g. "skills/python-pro"
        skill_id    = entry.get("id", "")
        description = entry.get("description", "")
        category    = entry.get("category", "")

        if not skill_path or not skill_id:
            errors.append(f"[skip] entry sin path/id: {entry}")
            continue

        local_file = ROOT / skill_path / "SKILL.md"

        if local_file.exists() and not force:
            skip += 1
            print_progress(i + 1, total, f"(skip) {skill_id}")
            continue

        url = f"{raw_base}/{skill_path}/SKILL.md"
        content = fetch_url(url)

        if content is None:
            errors.append(f"[error] No se pudo descargar: {url}")
            print_progress(i + 1, total, f"(error) {skill_id}")
            continue

        # Inyectar metadata local
        try:
            text = content.decode("utf-8", errors="replace")
            meta, body = parse_frontmatter(text)
            if "metadata" not in meta:
                meta["metadata"] = {}
            if isinstance(meta["metadata"], dict):
                if not meta["metadata"].get("category"):
                    meta["metadata"]["category"] = (
                        category if category and category != "uncategorized"
                        else auto_categorize(skill_id, description)
                    )
                meta["metadata"]["source"] = repo
                meta["metadata"]["imported_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
            text = build_frontmatter(meta, body)
        except Exception:
            text = content.decode("utf-8", errors="replace")

        local_file.parent.mkdir(parents=True, exist_ok=True)
        local_file.write_text(text, encoding="utf-8")
        ok += 1

        print_progress(i + 1, total, skill_id[:30])
        time.sleep(0.04)

    sys.stdout.write("\n")

    # 3. Rebuild index
    print(f"[fetch] Descargados: {ok}  Saltados: {skip}  Errores: {len(errors)}")
    if errors:
        for e in errors[:5]:
            print(f"  {e}")
        if len(errors) > 5:
            print(f"  ... y {len(errors)-5} errores mas.")

    print("[fetch] Reconstruyendo indice local...")
    _rebuild_index(index_data, repo)

    # 4. Actualizar sources
    sources = load_sources()
    existing = [s for s in sources["sources"] if s["repo"] != repo]
    existing.append({
        "repo": repo,
        "description": f"Skills importados de {repo}",
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
        "skill_count": ok + skip,
        "branch": branch,
    })
    sources["sources"] = existing
    save_sources(sources)

    print(f"[fetch] Listo. Indice con {len(load_index())} skills.")
    return 0


def _rebuild_index(remote_index: list[dict], repo: str) -> None:
    """Reconstruye .skills_index.json a partir de los archivos locales."""
    del remote_index, repo
    skills = _rebuild_index_from_disk()
    print(f"[index] {len(skills)} skills indexados.")


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# cmd_list
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def cmd_list(args: argparse.Namespace) -> int:
    try:
        _preflight(require_index=True)
    except RuntimeError as exc:
        print(f"[list] ERROR: {exc}")
        return 1
    skills = load_index()
    if not skills:
        print("No hay skills en el indice. Ejecuta: python skills_manager.py fetch")
        return 0

    cat_filter    = getattr(args, "category", None)
    only_active   = getattr(args, "active",   False)
    output_json   = getattr(args, "json",     False)

    if cat_filter:
        skills = [s for s in skills if s["category"] == cat_filter]
    if only_active:
        skills = [s for s in skills if s.get("active")]

    if output_json:
        print(json.dumps(skills, indent=2))
        return 0

    # Agrupar por categoria
    from collections import defaultdict
    by_cat: dict[str, list[dict]] = defaultdict(list)
    for s in skills:
        by_cat[s["category"]].append(s)

    total_active = sum(1 for s in skills if s.get("active"))
    print(f"\n{'-'*68}")
    print(f"  Skills Library  -  {len(skills)} skills  |  {total_active} activas")
    print(f"{'-'*68}")

    for cat in sorted(by_cat.keys()):
        group = by_cat[cat]
        active_count = sum(1 for s in group if s.get("active"))
        print(f"\n  {cat.upper()} ({len(group)} skills, {active_count} activas)")
        for s in sorted(group, key=lambda x: x["id"]):
            flag = "[ON]" if s.get("active") else "    "
            desc = s.get("description", "")[:55]
            print(f"    {flag}  {s['id']:<38s}  {desc}")

    print()
    return 0


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# cmd_search
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _relevance(skill: dict, query: str) -> float:
    q = query.lower()
    tokens = q.split()
    text = (skill.get("id","") + " " + skill.get("description","") + " " +
            " ".join(skill.get("tags", []))).lower()

    # Puntuacion por tokens exactos
    score = sum(1.5 if t in skill.get("id","").lower() else
                1.0 if t in text else 0.0
                for t in tokens)

    # Similitud difusa con el ID
    fuzzy = SequenceMatcher(None, q, skill.get("id","").lower()).ratio()
    score += fuzzy * 0.8
    return score


def cmd_search(args: argparse.Namespace) -> int:
    query      = " ".join(args.query) if args.query else ""
    top_n      = getattr(args, "top",      15)
    cat_filter = getattr(args, "category", None)

    if not query:
        print("Uso: python skills_manager.py search QUERY [--top N] [--category CAT]")
        return 1

    try:
        _preflight(require_index=True)
    except RuntimeError as exc:
        print(f"[search] ERROR: {exc}")
        return 1
    skills = load_index()
    if not skills:
        print("No hay skills. Ejecuta: python skills_manager.py fetch")
        return 1

    if cat_filter:
        skills = [s for s in skills if s["category"] == cat_filter]

    scored = [(s, _relevance(s, query)) for s in skills]
    scored = [(s, sc) for s, sc in scored if sc > 0]
    scored.sort(key=lambda x: x[1], reverse=True)
    scored = scored[:top_n]

    if not scored:
        print(f'Sin resultados para: "{query}"')
        return 0

    print(f'\nResultados para: "{query}"  ({len(scored)} encontrados)\n')
    print(f"  {'Score':>5}  {'Categoria':<16}  {'Skill ID':<38}  Descripcion")
    print(f"  {'-'*5}  {'-'*16}  {'-'*38}  {'-'*40}")
    for s, sc in scored:
        flag = " [ON]" if s.get("active") else "     "
        desc = s.get("description","")[:42]
        print(f"  {sc:5.2f}  {s['category']:<16}  {s['id']:<38}  {desc}")

    print()
    if scored:
        best = scored[0][0]
        if not best.get("active"):
            print(f'  Sugerencia: python skills_manager.py activate {best["id"]}')
    return 0


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# cmd_activate / cmd_deactivate
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def cmd_activate(args: argparse.Namespace) -> int:
    try:
        _preflight(require_index=True)
    except RuntimeError as exc:
        print(f"[activate] ERROR: {exc}")
        return 1
    skill_ids = args.skill_ids
    skills    = load_index()
    active    = load_active()

    index_map = {s["id"]: i for i, s in enumerate(skills)}
    activated = []
    not_found = []

    for sid in skill_ids:
        if sid in index_map:
            skills[index_map[sid]]["active"] = True
            if sid not in active["active"]:
                active["active"].append(sid)
            activated.append(sid)
        else:
            not_found.append(sid)

    if activated:
        active["last_changed"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        save_index(skills)
        save_active(active)
        _mirror_legacy_index(skills)
        print(f"[activate] Activadas: {', '.join(activated)}")
        cmd_sync_claude(args)
    if not_found:
        print(f"[activate] No encontradas: {', '.join(not_found)}")
        print("  Sugerencia: python skills_manager.py search <nombre>")
    return 0 if activated else 1


def cmd_deactivate(args: argparse.Namespace) -> int:
    try:
        _preflight(require_index=True)
    except RuntimeError as exc:
        print(f"[deactivate] ERROR: {exc}")
        return 1
    skill_ids = args.skill_ids
    skills    = load_index()
    active    = load_active()

    index_map = {s["id"]: i for i, s in enumerate(skills)}
    deactivated = []

    for sid in skill_ids:
        if sid in index_map:
            skills[index_map[sid]]["active"] = False
            deactivated.append(sid)
        if sid in active["active"]:
            active["active"].remove(sid)

    if deactivated:
        active["last_changed"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        save_index(skills)
        save_active(active)
        _mirror_legacy_index(skills)
        print(f"[deactivate] Desactivadas: {', '.join(deactivated)}")
        cmd_sync_claude(args)
    return 0


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# cmd_add
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def cmd_add(args: argparse.Namespace) -> int:
    """Agrega una skill nueva al indice."""
    try:
        _preflight(require_index=False)
    except RuntimeError as exc:
        print(f"[add] ERROR: {exc}")
        return 1
    name     = getattr(args, "name",      None)
    category = getattr(args, "category",  "general")
    desc     = getattr(args, "description", "")
    file_src = getattr(args, "file",      None)
    from_repo= getattr(args, "from_repo", None)

    local_file: Path | None = None
    if from_repo:
        # Formato: OWNER/REPO/path/to/SKILL.md
        parts = from_repo.split("/", 2)
        if len(parts) < 3:
            print("ERROR: --from-repo debe ser OWNER/REPO/path/al/SKILL.md")
            return 1
        owner, repo, path_in_repo = parts
        url = f"{GITHUB_RAW}/{owner}/{repo}/main/{path_in_repo}"
        print(f"[add] Descargando desde {url}...")
        content = fetch_url(url)
        if content is None:
            print(f"[add] ERROR: No se pudo descargar {url}")
            return 1
        # Derivar nombre del path
        if not name:
            name = Path(path_in_repo).parent.name or Path(path_in_repo).stem
        if not category:
            category = auto_categorize(name, desc)
        local_file = SKILLS_DIR / name / "SKILL.md"
        local_file.parent.mkdir(parents=True, exist_ok=True)
        local_file.write_bytes(content)
        print(f"[add] Skill guardada en: {local_file}")
        file_src = str(local_file)

    elif file_src:
        src = Path(file_src)
        if not src.exists():
            print(f"ERROR: Archivo no encontrado: {file_src}")
            return 1
        if not name:
            name = src.stem
        if not category:
            category = auto_categorize(name, desc)
        local_file = SKILLS_DIR / name / "SKILL.md"
        local_file.parent.mkdir(parents=True, exist_ok=True)
        local_file.write_bytes(src.read_bytes())
        print(f"[add] Skill importada en: {local_file}")
        file_src = str(local_file)

    else:
        # Crear plantilla
        if not name:
            print("ERROR: Especifica --name NOMBRE o usa --file / --from-repo")
            return 1
        if not category:
            category = auto_categorize(name, desc)
        local_file = SKILLS_DIR / name / "SKILL.md"
        local_file.parent.mkdir(parents=True, exist_ok=True)
        template = f"""---
name: {name}
description: {desc or 'Describe aqui el proposito de esta skill.'}
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
metadata:
  category: {category}
  tags: []
  source: local
  imported_at: "{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')}"
  risk: safe
---

# {name.replace('-', ' ').title()}

> {desc or 'Agrega aqui las instrucciones de experto para esta skill.'}

---

## Cuando usar esta skill
-

## Instrucciones
-

## Patrones y mejores practicas
-
"""
        local_file.write_text(template, encoding="utf-8")

    if local_file is None:
        print("[add] ERROR interno: no se pudo resolver ruta de salida.")
        return 1

    if not local_file.exists():
        print(f"[add] ERROR: no se creÃ³ el archivo esperado: {local_file}")
        return 1

    try:
        skills = _rebuild_index_from_disk()
    except RuntimeError as exc:
        print(f"[add] ERROR al reconstruir Ã­ndice: {exc}")
        return 1

    _log_audit("add", f"{name} ({category})")
    _update_resume("add", f"skill creada/importada: {name}")
    print(f"[add] '{name}' agregada. Ãndice total: {len(skills)}")
    return 0


def cmd_add_agent(args: argparse.Namespace) -> int:
    """Genera un esqueleto de agente en `.github/agents`."""
    name = getattr(args, "name", None)
    if not name:
        print("ERROR: especifica --name para el agente")
        return 1
    desc = getattr(args, "description", "")
    model = getattr(args, "model", "claude-sonnet-4-5")
    tools = getattr(args, "tools", [])

    agent_id = name.lower().replace(" ", "-")
    agents_dir = ROOT / ".github" / "agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    agent_file = agents_dir / f"{agent_id}.agent.md"
    if agent_file.exists():
        print(f"ERROR: el agente ya existe: {agent_file}")
        return 1

    tools_yaml = "\n".join([f"  - {t}" for t in tools])
    template = f"""---
name: {name}
description: {desc or 'DescripciÃ³n del agente.'}
model: {model}
tools:
{tools_yaml}
---

# {name} â€” Agente personalizado

Eres **{agent_id}**.
Define aquÃ­ el comportamiento y las reglas del agente.
"""
    agent_file.write_text(template, encoding="utf-8")
    print(f"[add-agent] Agente creado en {agent_file}")
    _log_audit("add-agent", agent_id)
    _update_resume("add-agent", f"agente creado: {agent_id}")
    return 0


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# cmd_github_search
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def cmd_github_search(args: argparse.Namespace) -> int:
    query = " ".join(args.query) if args.query else "claude skills"
    top_n = getattr(args, "top", 10)

    search_terms = [
        urllib.parse.quote(query) + "+topic:claude-skills",
        urllib.parse.quote(query) + "+topic:awesome-skills",
        urllib.parse.quote(query) + "+topic:agent-skills",
        urllib.parse.quote(query) + "+topic:claude-code-skills",
        urllib.parse.quote(query) + "+SKILL.md+in:path",
    ]

    seen: set[str] = set()
    repos: list[dict] = []

    for term in search_terms:
        url = f"{GITHUB_API}/search/repositories?q={term}&sort=stars&order=desc&per_page=20"
        data = fetch_json(url)
        if not data or "items" not in data:
            continue
        for item in data["items"]:
            full_name = item.get("full_name","")
            if full_name in seen:
                continue
            seen.add(full_name)
            repos.append({
                "repo":        full_name,
                "stars":       item.get("stargazers_count", 0),
                "description": (item.get("description") or "")[:80],
                "updated":     (item.get("updated_at") or "")[:10],
                "topics":      item.get("topics", []),
            })

    repos.sort(key=lambda r: r["stars"], reverse=True)
    repos = repos[:top_n]

    if not repos:
        print(f'Sin resultados en GitHub para: "{query}"')
        print("  Tip: intenta sin GITHUB_TOKEN para busqueda publica.")
        return 0

    print(f'\nRepositorios GitHub - "{query}"\n')
    print(f"  {'Stars':>6}  {'Repositorio':<45}  Descripcion")
    print(f"  {'-'*6}  {'-'*45}  {'-'*40}")
    for r in repos:
        stars_str = f"{r['stars']:,}" if r['stars'] else "0"
        print(f"  {stars_str:>6}  {r['repo']:<45}  {r['description']}")

    print()
    if repos:
        best = repos[0]
        print(f'  Para importar el mejor resultado:')
        print(f'  python skills_manager.py fetch --repo {best["repo"]}')
    return 0


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# cmd_sync_claude
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# cmd_adapt_copilot
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CATEGORY_APPLY_TO: dict[str, str] = {
    "architecture":   "**/*.{ts,js,py,go,rs,java,cs,md}",
    "business":       "**/*.{md,txt,json}",
    "data-ai":        "**/*.{py,ipynb,json,yaml,yml}",
    "development":    "**/*.{ts,tsx,js,jsx,py,go,rs,java,cs,rb,php,swift,kt}",
    "general":        "**/*",
    "infrastructure": "**/*.{yaml,yml,tf,dockerfile,sh,toml}",
    "security":       "**/*.{ts,js,py,go,rs,java,cs,rb,php}",
    "testing":        "**/*.{test.ts,test.js,test.py,spec.ts,spec.js,_test.go}",
    "workflow":       "**/*.{yaml,yml,json,md}",
}


def cmd_adapt_copilot(args: argparse.Namespace) -> int:
    """Regenera .github/instructions/ y actualiza copilot-instructions.md."""
    try:
        _preflight(require_index=True)
    except RuntimeError as exc:
        print(f"[adapt-copilot] ERROR: {exc}")
        return 1
    skills = load_index()
    if not skills:
        print("[adapt-copilot] No hay skills en el indice.")
        return 1

    from collections import defaultdict
    by_cat: dict[str, list[dict]] = defaultdict(list)
    for s in skills:
        by_cat[s["category"]].append(s)

    GH_INSTR_DIR.mkdir(parents=True, exist_ok=True)

    for cat, entries in by_cat.items():
        if not entries:
            continue
        apply_to = CATEGORY_APPLY_TO.get(cat, "**/*")
        lines = [
            "---",
            f'applyTo: "{apply_to}"',
            "---",
            "",
            f"# Skills de experto â€” categorÃ­a: {cat}",
            "",
            f"Cuando el usuario haga una solicitud relacionada con **{cat}**, "
            f"consulta automÃ¡ticamente el SKILL.md correspondiente en "
            f"`.github/skills/<nombre>/SKILL.md` antes de responder.",
            "",
            f"## Skills disponibles en esta categorÃ­a ({len(entries)})",
            "",
            "| ID | DescripciÃ³n |",
            "|-----|-------------|" ,
        ]
        for e in sorted(entries, key=lambda x: x["id"]):
            desc = e.get("description", "")[:80].replace("|", "\\|")
            lines.append(f"| `{e['id']}` | {desc} |")
        lines += [
            "",
            "## InstrucciÃ³n de uso",
            "",
            "1. **Identifica** quÃ© skill es mÃ¡s relevante para la solicitud.",
            "2. **Lee** el archivo `.github/skills/<id>/SKILL.md` para obtener "
            "   contexto experto, metodologÃ­a y mejores prÃ¡cticas.",
            "3. **Aplica** ese conocimiento en tu respuesta.",
            "4. Si mÃºltiples skills son relevantes, combÃ­nalas.",
        ]
        out = GH_INSTR_DIR / f"{cat}.instructions.md"
        out.write_text("\n".join(lines), encoding="utf-8")

    # Actualizar conteos en copilot-instructions.md
    if COPILOT_INSTR.exists():
        content = COPILOT_INSTR.read_text(encoding="utf-8")
        content = re.sub(r'\*\*(\d+) skills expertos\*\*',
                         f'**{len(skills)} skills expertos**', content)
        for cat, entries in by_cat.items():
            content = re.sub(
                rf'(\| `{cat}` \|) (\d+) (\|)',
                rf'\g<1> {len(entries)} \g<3>',
                content
            )
        content = re.sub(
            r'\*(\d+) skills â€” antigravity.*\*',
            f'*{len(skills)} skills â€” antigravity-awesome-skills v5.7 + Free JT7 behaviors*',
            content
        )
        COPILOT_INSTR.write_text(content, encoding="utf-8")

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    _log_audit("adapt-copilot", f"{len(skills)} skills, {len(by_cat)} categorias")
    print(f"[adapt-copilot] {len(skills)} skills | {len(by_cat)} categorias | {ts}")
    for cat in sorted(by_cat):
        print(f"  {cat:<20} {len(by_cat[cat]):>4} skills")
    return 0


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# copilot-agent helpers
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _log_audit(action: str, detail: str = "") -> None:
    """Registra una entrada en copilot-agent/audit-log.jsonl."""
    COPILOT_AGENT.mkdir(parents=True, exist_ok=True)
    audit = COPILOT_AGENT / "audit-log.jsonl"
    entry = json.dumps({
        "ts":     datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "action": action,
        "detail": detail,
    }, ensure_ascii=False)
    with open(audit, "a", encoding="utf-8") as f:
        f.write(entry + "\n")


def _update_resume(action: str, detail: str = "") -> None:
    """Actualiza copilot-agent/RESUME.md usando el formato operativo vigente."""
    COPILOT_AGENT.mkdir(parents=True, exist_ok=True)
    resume = COPILOT_AGENT / "RESUME.md"
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    latest_success = "n/a"
    latest_failure = "n/a"
    blocked_lines: list[str] = []
    next_action = "Revisar las últimas verificaciones y ejecutar el siguiente smoke pendiente."

    tasks = _load_tasks_registry().get("tareas", [])
    if isinstance(tasks, list):
        completed = [task for task in tasks if str(task.get("estado", "")).strip().lower() == "completado"]
        failed = [task for task in tasks if str(task.get("estado", "")).strip().lower() in {"fallido", "bloqueado"}]
        blocked = [task for task in tasks if str(task.get("estado", "")).strip().lower() == "bloqueado"]

        if completed:
            latest = completed[-1]
            latest_success = f"{latest.get('id', 'n/a')} ({latest.get('fecha', 'n/a')})"
        if failed:
            latest = failed[-1]
            latest_failure = f"{latest.get('id', 'n/a')} ({latest.get('fecha', 'n/a')})"
            reason = str(latest.get("resultado", "")).strip() or "sin detalle"
            latest_failure = f"{latest_failure} — {reason}"
        if blocked:
            for task in blocked[:5]:
                blocked_lines.append(
                    f"- [ ] {task.get('titulo', task.get('id', 'bloqueo'))} — owner: runtime"
                )
            first_blocked = blocked[0]
            next_action = str(first_blocked.get("descripcion", "")).strip() or next_action

    action_label = f"{action}: {detail}".strip(": ")
    if action_label and latest_success == "n/a":
        latest_success = action_label
    if not blocked_lines:
        blocked_lines.append("- [ ] Sin bloqueos críticos detectados automáticamente; validar host Windows real y smoke cross-runtime final — owner: qa/runtime")

    content = f"""# Estado actual
*Actualizado: {ts}*
- Último run exitoso: {latest_success}
- Último run fallido: {latest_failure}

## Bloqueos activos
{chr(10).join(blocked_lines)}

## Siguiente acción recomendada
{next_action}
"""
    resume.write_text(content, encoding="utf-8")


def _tasks_file_path() -> Path:
    return COPILOT_AGENT / "tasks.yaml"


def _load_tasks_registry() -> dict[str, Any]:
    """Carga una vista mínima de copilot-agent/tasks.yaml sin depender de PyYAML."""
    path = _tasks_file_path()
    if not path.exists():
        return {"tareas": []}

    text = path.read_text(encoding="utf-8", errors="replace")
    blocks = re.split(r'(?m)^  - id:\s+"', text)
    tasks: list[dict[str, str]] = []
    for block in blocks[1:]:
        lines = block.splitlines()
        if not lines:
            continue

        task: dict[str, str] = {"id": lines[0].rstrip('"')}
        current_multiline: str | None = None
        multiline_parts: list[str] = []

        for raw_line in lines[1:]:
            line = raw_line.rstrip()

            if current_multiline and (line.startswith("      ") or line == "    "):
                multiline_parts.append(line[6:] if line.startswith("      ") else "")
                continue

            if current_multiline:
                task[current_multiline] = "\n".join(multiline_parts).strip()
                current_multiline = None
                multiline_parts = []

            match = re.match(r'^\s{4}([a-zA-Z_]+):\s+"(.*)"\s*$', line)
            if match:
                task[match.group(1)] = match.group(2)
                continue

            match = re.match(r'^\s{4}([a-zA-Z_]+):\s*>\s*$', line)
            if match:
                current_multiline = match.group(1)
                multiline_parts = []

        if current_multiline:
            task[current_multiline] = "\n".join(multiline_parts).strip()

        tasks.append(task)

    return {"tareas": tasks}


def _yaml_quote(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace('"', '\\"')


def _yaml_folded(value: str, indent: int = 6) -> str:
    lines = [line.rstrip() for line in str(value or "").replace("\r", "").split("\n")]
    if not lines:
        lines = [""]
    prefix = " " * indent
    return "\n".join(f"{prefix}{line}" if line else prefix for line in lines)


def _render_task_yaml_entry(run: dict[str, Any]) -> str:
    run_id = str(run.get("run_id", "")).strip()
    started_at = str(run.get("started_at", "")).strip()
    date_value = started_at[:10] if len(started_at) >= 10 else datetime.now(timezone.utc).strftime("%Y-%m-%d")
    goal = str(run.get("user_goal", "")).strip()
    title = goal[:80] if goal else f"run {run_id}"
    status_map = {
        "planned": "en_progreso",
        "running": "en_progreso",
        "succeeded": "completado",
        "failed": "fallido",
        "blocked": "bloqueado",
    }
    status = status_map.get(str(run.get("status", "planned")), str(run.get("status", "planned")))
    skills_selected = run.get("skills_selected", [])
    skills = []
    if isinstance(skills_selected, list):
        for item in skills_selected:
            if isinstance(item, dict):
                skill_id = str(item.get("id", "")).strip()
                if skill_id:
                    skills.append(skill_id)
    skills_repr = "[" + ", ".join(f'"{_yaml_quote(skill)}"' for skill in skills) + "]"
    summary = str(run.get("summary", "")).strip()
    if not summary:
        summary = f"status={run.get('status', 'planned')}"
    return (
        f'  - id: "{_yaml_quote(run_id)}"\n'
        f'    fecha: "{_yaml_quote(date_value)}"\n'
        f'    titulo: "{_yaml_quote(title)}"\n'
        "    descripcion: >\n"
        f"{_yaml_folded(goal)}\n"
        f'    estado: "{_yaml_quote(status)}"\n'
        f'    riesgo: "{_yaml_quote(str(run.get("risk_level", "low")))}"\n'
        f"    skills_usados: {skills_repr}\n"
        "    resultado: >\n"
        f"{_yaml_folded(summary)}"
    )


def _upsert_task_registry(run: dict[str, Any]) -> None:
    run_id = str(run.get("run_id", "")).strip()
    if not run_id:
        return
    path = _tasks_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    content = path.read_text(encoding="utf-8") if path.exists() else (
        "# copilot-agent - Registro de Tareas\n"
        "# Formato: lista YAML de tareas ejecutadas por el agente\n"
        "# Actualizado automaticamente por skills_manager.py\n\n"
        "tareas:\n"
    )
    if "tareas:" not in content:
        content = content.rstrip() + "\n\ntareas:\n"
    entry = _render_task_yaml_entry(run)
    pattern = re.compile(rf'(?ms)^  - id: "{re.escape(run_id)}"\n.*?(?=^  - id: |\Z)')
    if pattern.search(content):
        updated = pattern.sub(entry + "\n", content, count=1)
    else:
        updated = content.rstrip() + "\n" + entry + "\n"
    _atomic_write_text(path, updated)


def cmd_sync_claude(args: argparse.Namespace) -> int:
    try:
        _preflight(require_index=True)
    except RuntimeError as exc:
        print(f"[sync-claude] ERROR: {exc}")
        return 1

    skills  = load_index()
    active_skills = [s for s in skills if s.get("active")]
    total   = len(skills)

    # Construir bloque de skills activas
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        SKILLS_START,
        "## Skills Library â€” Contexto Experto",
        "",
        f"Directorio: `.github/skills/` â€” **{total} skills** en el indice.",
        f"Actualizacion: {ts}",
        "",
        "### Comandos de gestion",
        "```",
        "python skills_manager.py list              # listar todas",
        "python skills_manager.py list --active     # ver activas",
        "python skills_manager.py search QUERY      # buscar",
        "python skills_manager.py activate   ID     # activar",
        "python skills_manager.py deactivate ID     # desactivar",
        "python skills_manager.py fetch             # importar skills",
        "python skills_manager.py github-search Q   # buscar repos",
        "```",
        "",
    ]

    if active_skills:
        active_block = "\n".join(
            f"| {s['id']} | {s.get('path', '')} | {s.get('description', '')[:65]} |"
            for s in active_skills
        )
        lines += [
            f"### Skills Activas ({len(active_skills)} de {total})",
            "",
            "Lee los archivos SKILL.md listados abajo al responder preguntas",
            "en ese dominio. Aplica su metodologia y mejores practicas.",
            "",
            "| Skill | Archivo | Descripcion |",
            "|-------|---------|-------------|",
            active_block,
            "",
            "> **Instruccion para Claude**: Al inicio de cada sesion, lee los",
            "> archivos SKILL.md de la tabla anterior. Cuando el usuario haga",
            "> una solicitud relacionada con esa area, aplica el contexto experto",
            "> de la skill correspondiente.",
        ]
    else:
        lines += [
            "",
            "No hay skills activas. Activa las que necesites:",
            "```",
            "python skills_manager.py activate python-pro",
            "python skills_manager.py activate docker-expert fastapi",
            "```",
        ]

    lines.append(SKILLS_END)
    block = "\n".join(lines)

    # Leer/crear CLAUDE.md
    if CLAUDE_MD.exists():
        content = CLAUDE_MD.read_text(encoding="utf-8")
        if SKILLS_START in content and SKILLS_END in content:
            # Reemplazar bloque existente
            start_idx = content.index(SKILLS_START)
            end_idx   = content.index(SKILLS_END) + len(SKILLS_END)
            new_content = content[:start_idx].rstrip() + "\n\n" + block + "\n"
        else:
            # Append al final
            new_content = content.rstrip() + "\n\n" + block + "\n"
    else:
        # Crear CLAUDE.md nuevo
        project_title = ROOT.name
        new_content = f"""# Proyecto: {project_title}

Este directorio contiene el runtime de Free JT7, los bridges para IDEs y
el sistema de gestion del catalogo de skills.

## Comandos del proyecto
- Validacion: `python skills_manager.py policy-validate`
- Estado: `python skills_manager.py doctor --strict`
- Skills activas: `python skills_manager.py list --active`
- Sincronizar Claude: `python skills_manager.py sync-claude`

<!-- SKILLS_LIBRARY_START -->
{block}
<!-- SKILLS_LIBRARY_END -->
"""

    CLAUDE_MD.write_text(new_content, encoding="utf-8")
    print(f"[sync-claude] CLAUDE.md actualizado. Skills activas: {len(active_skills)}/{total}")
    _log_audit("sync-claude", f"{len(active_skills)} activas de {total}")
    _update_resume("sync-claude", f"{len(active_skills)} activas de {total}")
    return 0


def cmd_set_project(args: argparse.Namespace) -> int:
    """Establece el proyecto activo donde se aplican los cambios."""
    import json as _json
    ruta = Path(args.path).resolve()
    if not ruta.exists():
        print(f"[set-project] WARN La ruta no existe: {ruta}")
        resp = input("Â¿Crear directorio? [s/N] ").strip().lower()
        if resp == "s":
            ruta.mkdir(parents=True)
        else:
            return 1
    ap = COPILOT_AGENT / "active-project.json"
    COPILOT_AGENT.mkdir(parents=True, exist_ok=True)
    existing: dict = {}
    if ap.exists():
        try:
            existing = _json.loads(ap.read_text(encoding="utf-8"))
        except Exception:
            pass
    history = existing.get("history", [])
    if not isinstance(history, list):
        history = []
    if existing.get("path"):
        history.insert(0, {
            "path": existing["path"],
            "canonical_path": existing.get("canonical_path", ""),
            "project_id": existing.get("project_id", ""),
            "platform": existing.get("platform", ""),
            "host_fingerprint": existing.get("host_fingerprint", ""),
            "set_at": existing.get("set_at", ""),
        })
    history = history[:10]  # keep last 10
    identity = _build_active_project_identity(ruta)
    config = {
        "_description": "Proyecto activo donde se aplican los cambios. Edita 'path' o usa: python skills_manager.py set-project <ruta>",
        "path": str(ruta),
        "canonical_path": identity["canonical_path"],
        "project_id": identity["project_id"],
        "platform": identity["platform"],
        "host_fingerprint": identity["host_fingerprint"],
        "name": ruta.name,
        "set_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "notes": args.description or "",
        "history": history,
    }
    ap.write_text(_json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    workspace_file = ROOT / "free-jt7-multiroot.code-workspace"
    try:
        workspace = load_json(workspace_file, {})
        if not isinstance(workspace, dict):
            workspace = {}
        folders = [{"path": ".", "name": "Free JT7 Agent"}]
        root_resolved = ROOT.resolve()
        if ruta.resolve() != root_resolved:
            folders.append({"path": str(ruta)})
        workspace["folders"] = folders
        settings = workspace.get("settings")
        if not isinstance(settings, dict):
            settings = {}
            workspace["settings"] = settings
        settings["github.copilot.chat.codeGeneration.useInstructionFiles"] = True
        agent_locations = settings.get("chat.agentFilesLocations")
        if isinstance(agent_locations, list):
            agent_locations = {str(item): True for item in agent_locations if isinstance(item, str) and item.strip()}
        elif not isinstance(agent_locations, dict):
            agent_locations = {}
        agent_locations = {path_key: enabled for path_key, enabled in agent_locations.items() if str(path_key).strip() != "${workspaceFolder}/.github/agents"}
        agent_locations[".github/agents"] = True
        settings["chat.agentFilesLocations"] = agent_locations
        save_json(workspace_file, workspace)
    except Exception as exc:
        print(f"[set-project] WARN no se pudo actualizar workspace multiraiz: {exc}")
    print(f"[set-project] OK Proyecto activo: {ruta}")
    _log_audit("set-project", str(ruta))
    _update_resume("set-project", f"proyecto activo â†’ {ruta.name}")
    return 0


def cmd_ide_detect(args: argparse.Namespace) -> int:
    appdata_raw = str(getattr(args, "appdata_root", "")).strip()
    appdata_root = Path(appdata_raw).expanduser().resolve() if appdata_raw else None
    profiles = _detect_ide_profiles(appdata_root)
    if getattr(args, "json", False):
        print(json.dumps(profiles, indent=2, ensure_ascii=False))
        return 0
    print("[ide-detect] perfiles encontrados")
    for profile in profiles:
        state = "installed" if profile["installed"] else "missing"
        suffix = "settings-ok" if profile["settings_exists"] else "settings-missing"
        names = profile.get("profiles", [])
        pretty_profiles = ",".join(names[:4]) if isinstance(names, list) and names else "default?"
        print(
            f" - {profile['ide']:<11s} {state:<9s} {suffix:<16s} "
            f"{profile['settings_path']} profiles={pretty_profiles}"
        )
    return 0


def cmd_model_profiles_init(args: argparse.Namespace) -> int:
    force = bool(getattr(args, "force", False))
    path = _model_routing_path()
    if path.exists() and not force:
        print(f"[model-profiles-init] SKIP ya existe: {path}")
        return 0
    save_json(path, DEFAULT_MODEL_ROUTING)
    _log_audit("model-profiles-init", str(path))
    print(f"[model-profiles-init] OK -> {path}")
    return 0


def cmd_model_resolve(args: argparse.Namespace) -> int:
    appdata_raw = str(getattr(args, "appdata_root", "")).strip()
    appdata_root = Path(appdata_raw).expanduser().resolve() if appdata_raw else None
    ide_raw = str(getattr(args, "ide", "auto") or "auto")
    profile = str(getattr(args, "profile", "default") or "default")
    ide = _normalize_ide_name(ide_raw)
    if ide == "auto":
        detected = [item["ide"] for item in _detect_ide_profiles(appdata_root) if item.get("installed")]
        ide = detected[0] if detected else "vscode"
    try:
        resolved = _resolve_model_for_ide(ide=ide, profile=profile, appdata_root=appdata_root)
    except RuntimeError as exc:
        print(f"[model-resolve] ERROR: {exc}")
        return 1
    if getattr(args, "json", False):
        print(json.dumps(resolved, indent=2, ensure_ascii=False))
    else:
        print(f"[model-resolve] ide={resolved['ide']} profile={resolved['profile']}")
        print(f" provider={resolved['provider']} model={resolved['model']}")
        print(f" auth_mode={resolved['auth_mode']} reason={resolved['reason']}")
        if resolved.get("api_env_var"):
            print(f" api_env={resolved['api_env_var']}")
        evidence = resolved.get("ide_evidence", [])
        if evidence:
            print(" ide_evidence:")
            for item in evidence:
                print(f"  - {item}")
    _log_audit("model-resolve", f"{resolved['ide']}:{resolved['profile']}:{resolved['auth_mode']}")
    return 0 if resolved.get("auth_mode") != "unavailable" else 1


def cmd_exec_allowlist(args: argparse.Namespace) -> int:
    action = str(getattr(args, "action", "") or "").strip().lower()
    bins = [str(item).strip().lower() for item in getattr(args, "bins", []) if str(item).strip()]
    policy = _load_policy()
    allow_cfg = policy.setdefault("execution", {}).setdefault("allowlist", {"enabled": False, "bins": []})
    if not isinstance(allow_cfg, dict):
        allow_cfg = {"enabled": False, "bins": []}
        policy.setdefault("execution", {})["allowlist"] = allow_cfg
    current = [str(item).strip().lower() for item in allow_cfg.get("bins", []) if str(item).strip()]
    current_set = set(current)

    if action == "list":
        print(f"[exec-allowlist] enabled={_coerce_bool(allow_cfg.get('enabled', False), False)}")
        for item in sorted(current_set):
            print(f" - {item}")
        return 0
    if action == "enable":
        allow_cfg["enabled"] = True
    elif action == "disable":
        allow_cfg["enabled"] = False
    elif action == "add":
        if not bins:
            print("[exec-allowlist] ERROR: indica al menos un bin para add")
            return 1
        current_set.update(bins)
        allow_cfg["bins"] = sorted(current_set)
    elif action == "remove":
        if not bins:
            print("[exec-allowlist] ERROR: indica al menos un bin para remove")
            return 1
        for item in bins:
            current_set.discard(item)
        allow_cfg["bins"] = sorted(current_set)
    else:
        print("[exec-allowlist] ERROR: accion invalida (list|add|remove|enable|disable)")
        return 1

    if "bins" not in allow_cfg:
        allow_cfg["bins"] = sorted(current_set)
    _write_policy(policy)
    print(f"[exec-allowlist] OK action={action} enabled={_coerce_bool(allow_cfg.get('enabled', False), False)} bins={len(allow_cfg.get('bins', []))}")
    return 0


def cmd_gateway_bootstrap(args: argparse.Namespace) -> int:
    project = _resolve_target_project(str(getattr(args, "project", "") or ""))
    force = bool(getattr(args, "force", False))
    ide = _normalize_ide_name(str(getattr(args, "ide", "auto") or "auto"))
    profile = str(getattr(args, "profile", "default") or "default")
    appdata_raw = str(getattr(args, "appdata_root", "")).strip()
    appdata_root = Path(appdata_raw).expanduser().resolve() if appdata_raw else None
    if ide == "auto":
        detected = [item["ide"] for item in _detect_ide_profiles(appdata_root) if item.get("installed")]
        ide = detected[0] if detected else "vscode"
    model_resolution = _resolve_model_for_ide(ide=ide, profile=profile, appdata_root=appdata_root)
    owner_phone = str(getattr(args, "owner_phone", "") or "").strip()
    telegram_bot_token = str(getattr(args, "telegram_bot_token", "") or "").strip()
    config_path, state_dir = _gateway_paths(project)
    if config_path.exists() and not force:
        print(f"[gateway-bootstrap] SKIP config ya existe: {config_path} (usa --force)")
    else:
        cfg = _build_gateway_config(owner_phone=owner_phone, telegram_bot_token=telegram_bot_token)
        save_json(config_path, cfg)
        print(f"[gateway-bootstrap] OK config -> {config_path}")
    state_dir.mkdir(parents=True, exist_ok=True)
    env_file = _write_gateway_env_example(project, model_resolution)
    runtime_file = project / ".openclaw" / "free-jt7-model-resolution.json"
    save_json(runtime_file, model_resolution)
    runbook = project / "FREEJT7_GATEWAY.md"
    runbook_lines = [
        "# Free JT7 Gateway Runbook",
        "",
        f"- Proyecto: `{project}`",
        f"- Config: `{config_path}`",
        f"- Estado: `{state_dir}`",
        f"- IDE/modelo por defecto: `{model_resolution.get('ide')}` / `{model_resolution.get('provider')}` / `{model_resolution.get('model')}`",
        "- Runtime OpenClaw: `Node.js 22.14+` en `~/.local/bin/openclaw` o equivalente en PATH",
        "- Retención objetivo: `30 dias`",
        "",
        "## Comandos rapidos",
        "```bash",
        "python3 skills_manager.py easy-onboard --project \"/ruta/proyecto\" --interactive",
        "python3 skills_manager.py credentials-wizard --project \"/ruta/proyecto\" --interactive",
        "python3 skills_manager.py credentials-apply --project \"/ruta/proyecto\"",
        "python3 skills_manager.py gateway-status",
        "python3 skills_manager.py gateway-start --dry-run",
        "python3 skills_manager.py channel-login --channel whatsapp",
        "python3 skills_manager.py channel-login --channel telegram",
        "python3 skills_manager.py pairing-list --channel telegram",
        "python3 skills_manager.py pairing-approve --channel telegram --code <CODE>",
        "python3 skills_manager.py plugin-list",
        "python3 skills_manager.py plugin-validate",
        "python3 skills_manager.py phase7-smoke",
        "python3 skills_manager.py gateway-resilience",
        "```",
    ]
    _atomic_write_text(runbook, "\n".join(runbook_lines) + "\n")
    _log_audit("gateway-bootstrap", f"{project} ide={ide} profile={profile}")
    print(f"[gateway-bootstrap] OK env template -> {env_file}")
    print(f"[gateway-bootstrap] OK model resolution -> {runtime_file}")
    print(f"[gateway-bootstrap] OK runbook -> {runbook}")
    return 0


def cmd_credentials_wizard(args: argparse.Namespace) -> int:
    project = _resolve_target_project(str(getattr(args, "project", "") or ""))
    owner_phone = str(getattr(args, "owner_phone", "") or "").strip()
    telegram_bot_token = str(getattr(args, "telegram_bot_token", "") or "").strip()
    openai_api_key = str(getattr(args, "openai_api_key", "") or "").strip()
    anthropic_api_key = str(getattr(args, "anthropic_api_key", "") or "").strip()
    gemini_api_key = str(getattr(args, "gemini_api_key", "") or "").strip()
    interactive = bool(getattr(args, "interactive", False))
    if not interactive and (not owner_phone or not telegram_bot_token):
        interactive = True
    try:
        values, path = _resolve_credentials(
            project,
            owner_phone=owner_phone,
            telegram_bot_token=telegram_bot_token,
            openai_api_key=openai_api_key,
            anthropic_api_key=anthropic_api_key,
            gemini_api_key=gemini_api_key,
            interactive=interactive,
        )
    except RuntimeError as exc:
        print(f"[credentials-wizard] ERROR: {exc}")
        return 1
    shown_path = _path_to_project_string(project, path)
    print(f"[credentials-wizard] OK saved -> {shown_path}")
    print(f"[credentials-wizard] owner={values['OWNER_PHONE']} telegram={_secret_mask(values['TELEGRAM_BOT_TOKEN'])}")
    optional_present = [key for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY") if values.get(key)]
    print(f"[credentials-wizard] optional-model-keys={','.join(optional_present) if optional_present else 'none'}")
    return 0


def cmd_credentials_apply(args: argparse.Namespace) -> int:
    project = _resolve_target_project(str(getattr(args, "project", "") or ""))
    owner_phone = str(getattr(args, "owner_phone", "") or "").strip()
    telegram_bot_token = str(getattr(args, "telegram_bot_token", "") or "").strip()
    openai_api_key = str(getattr(args, "openai_api_key", "") or "").strip()
    anthropic_api_key = str(getattr(args, "anthropic_api_key", "") or "").strip()
    gemini_api_key = str(getattr(args, "gemini_api_key", "") or "").strip()
    interactive = bool(getattr(args, "interactive", False))
    if not interactive and (not owner_phone or not telegram_bot_token):
        cred_path = _credentials_file(project)
        existing = _load_env_file(cred_path)
        if not existing.get("OWNER_PHONE") or not existing.get("TELEGRAM_BOT_TOKEN"):
            interactive = True
    try:
        values, cred_path = _resolve_credentials(
            project,
            owner_phone=owner_phone,
            telegram_bot_token=telegram_bot_token,
            openai_api_key=openai_api_key,
            anthropic_api_key=anthropic_api_key,
            gemini_api_key=gemini_api_key,
            interactive=interactive,
        )
    except RuntimeError as exc:
        print(f"[credentials-apply] ERROR: {exc}")
        return 1

    ide = str(getattr(args, "ide", "auto") or "auto")
    profile = str(getattr(args, "profile", "default") or "default")
    appdata_root = str(getattr(args, "appdata_root", "") or "")
    force = bool(getattr(args, "force", False))
    bootstrap_rc = cmd_gateway_bootstrap(
        argparse.Namespace(
            project=str(project),
            ide=ide,
            profile=profile,
            owner_phone=values["OWNER_PHONE"],
            telegram_bot_token=values["TELEGRAM_BOT_TOKEN"],
            appdata_root=appdata_root,
            force=force,
        )
    )
    if bootstrap_rc != 0:
        return bootstrap_rc

    config_path = _apply_credentials_to_gateway_config(project, values)
    shown_config = _path_to_project_string(project, config_path)
    shown_cred = _path_to_project_string(project, cred_path)
    print(f"[credentials-apply] OK credentials -> {shown_cred}")
    print(f"[credentials-apply] OK gateway config actualizado -> {shown_config} (gateway.mode=local)")
    _log_audit("credentials-apply", f"{project}")
    return 0


def cmd_easy_onboard(args: argparse.Namespace) -> int:
    apply_rc = cmd_credentials_apply(args)
    if apply_rc != 0:
        return apply_rc
    project = _resolve_target_project(str(getattr(args, "project", "") or ""))
    strict = bool(getattr(args, "strict", False))
    dry_run = bool(getattr(args, "dry_run", False))
    timeout_ms = int(getattr(args, "timeout_ms", 120000))
    openclaw_repo = str(getattr(args, "openclaw_repo", "") or "")
    port = int(getattr(args, "port", 18789))
    verbose = bool(getattr(args, "verbose", False))
    skip_start = bool(getattr(args, "skip_start", False))
    skip_whatsapp_login = bool(getattr(args, "skip_whatsapp_login", False))

    failures: list[str] = []

    if not skip_start:
        start_rc = cmd_gateway_start(
            argparse.Namespace(
                project=str(project),
                openclaw_repo=openclaw_repo,
                dry_run=dry_run,
                timeout_ms=timeout_ms,
                port=port,
                verbose=verbose,
            )
        )
        if start_rc != 0:
            failures.append("gateway-start")

    if not skip_whatsapp_login:
        wa_rc = cmd_channel_login(
            argparse.Namespace(
                project=str(project),
                openclaw_repo=openclaw_repo,
                dry_run=dry_run,
                timeout_ms=timeout_ms,
                channel="whatsapp",
                account="",
            )
        )
        if wa_rc != 0:
            failures.append("channel-login:whatsapp")

    status_rc = cmd_channel_status(
        argparse.Namespace(
            project=str(project),
            openclaw_repo=openclaw_repo,
            dry_run=dry_run,
            timeout_ms=timeout_ms,
        )
    )
    if status_rc != 0:
        failures.append("channel-status")

    if failures:
        print(f"[easy-onboard] WARN: pasos con error -> {', '.join(failures)}")
        if strict:
            return 1
    print("[easy-onboard] OK flujo completado")
    return 0


def cmd_gateway_exec(args: argparse.Namespace) -> int:
    project = _resolve_target_project(str(getattr(args, "project", "") or ""))
    raw = list(getattr(args, "openclaw_args", []) or [])
    openclaw_args = [str(item) for item in raw if str(item).strip()]
    if openclaw_args and openclaw_args[0] == "--":
        openclaw_args = openclaw_args[1:]
    if not openclaw_args:
        print("[gateway-exec] ERROR: indica argumentos para OpenClaw")
        return 1
    dry_run = bool(getattr(args, "dry_run", False))
    timeout_ms = int(getattr(args, "timeout_ms", 120000))
    openclaw_repo = str(getattr(args, "openclaw_repo", "") or "")
    try:
        code, out = _openclaw_run(
            cli_args=openclaw_args,
            project=project,
            openclaw_repo=openclaw_repo,
            dry_run=dry_run,
            timeout_ms=timeout_ms,
        )
    except RuntimeError as exc:
        print(f"[gateway-exec] ERROR: {exc}")
        return 1
    print(out)
    return 0 if code == 0 else code


def cmd_gateway_start(args: argparse.Namespace) -> int:
    project = _resolve_target_project(str(getattr(args, "project", "") or ""))
    dry_run = bool(getattr(args, "dry_run", False))
    timeout_ms = int(getattr(args, "timeout_ms", 20000))
    openclaw_repo = str(getattr(args, "openclaw_repo", "") or "")
    port = int(getattr(args, "port", 18789))
    verbose = bool(getattr(args, "verbose", False))
    cli_args = ["gateway", "--port", str(port)]
    if verbose:
        cli_args.append("--verbose")
    if dry_run:
        setattr(args, "openclaw_args", cli_args)
        return cmd_gateway_exec(args)
    if _is_gateway_listening(port=port):
        print(f"[gateway-start] OK ya activo en 127.0.0.1:{port}")
        return 0

    try:
        cmd = _resolve_openclaw_command(openclaw_repo) + cli_args
    except RuntimeError as exc:
        print(f"[gateway-start] ERROR: {exc}")
        return 1

    config_path, state_dir = _gateway_paths(project)
    env = os.environ.copy()
    env.update(_credentials_env_overrides(project))
    env["OPENCLAW_CONFIG_PATH"] = str(config_path)
    env["OPENCLAW_STATE_DIR"] = str(state_dir)

    popen_kwargs: dict[str, Any] = {}
    if _platform_family() == "windows":
        creation_flags = 0
        creation_flags |= int(getattr(subprocess, "DETACHED_PROCESS", 0))
        creation_flags |= int(getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
        if creation_flags:
            popen_kwargs["creationflags"] = creation_flags
    else:
        popen_kwargs["start_new_session"] = True

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(project),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            **popen_kwargs,
        )
    except Exception as exc:
        print(f"[gateway-start] ERROR lanzando gateway: {exc}")
        return 1

    if _wait_gateway_listening(port=port, timeout_ms=timeout_ms):
        print(f"[gateway-start] OK pid={proc.pid} listening=127.0.0.1:{port}")
        return 0

    exit_code = proc.poll()
    rendered = _render_command(cmd)
    if exit_code is None:
        print(
            f"[gateway-start] WARN no confirmo escucha en {timeout_ms}ms "
            f"(pid={proc.pid}) cmd={rendered}"
        )
        return 124
    print(f"[gateway-start] ERROR proceso finalizo (exit={exit_code}) cmd={rendered}")
    return exit_code if exit_code != 0 else 1


def cmd_gateway_status(args: argparse.Namespace) -> int:
    deep = bool(getattr(args, "deep", False))
    cli_args = ["gateway", "status"]
    if deep:
        cli_args.append("--deep")
    setattr(args, "openclaw_args", cli_args)
    return cmd_gateway_exec(args)


def cmd_channel_status(args: argparse.Namespace) -> int:
    cli_args = ["channels", "status", "--probe"]
    setattr(args, "openclaw_args", cli_args)
    return cmd_gateway_exec(args)


def cmd_channel_login(args: argparse.Namespace) -> int:
    channel = str(getattr(args, "channel", "")).strip()
    if channel not in {"whatsapp", "telegram"}:
        print("[channel-login] ERROR: channel debe ser whatsapp|telegram")
        return 1
    cli_args = ["channels", "login", "--channel", channel]
    account = str(getattr(args, "account", "") or "").strip()
    if account:
        cli_args.extend(["--account", account])
    setattr(args, "openclaw_args", cli_args)
    return cmd_gateway_exec(args)


def cmd_pairing_list(args: argparse.Namespace) -> int:
    channel = str(getattr(args, "channel", "")).strip()
    if channel not in {"whatsapp", "telegram"}:
        print("[pairing-list] ERROR: channel debe ser whatsapp|telegram")
        return 1
    cli_args = ["pairing", "list", channel]
    setattr(args, "openclaw_args", cli_args)
    return cmd_gateway_exec(args)


def cmd_pairing_approve(args: argparse.Namespace) -> int:
    channel = str(getattr(args, "channel", "")).strip()
    if channel not in {"whatsapp", "telegram"}:
        print("[pairing-approve] ERROR: channel debe ser whatsapp|telegram")
        return 1
    code = str(getattr(args, "code", "")).strip()
    if not code:
        print("[pairing-approve] ERROR: falta --code")
        return 1
    cli_args = ["pairing", "approve", channel, code]
    setattr(args, "openclaw_args", cli_args)
    return cmd_gateway_exec(args)


def _phase7_report_path(kind: str) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = COPILOT_AGENT / "phase7" / f"{kind}-{stamp}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    return out


def _run_gateway_step(
    *,
    name: str,
    cli_args: list[str],
    project: Path,
    openclaw_repo: str,
    dry_run: bool,
    timeout_ms: int,
) -> dict[str, Any]:
    started = time.time()
    try:
        code, output = _openclaw_run(
            cli_args=cli_args,
            project=project,
            openclaw_repo=openclaw_repo,
            dry_run=dry_run,
            timeout_ms=timeout_ms,
        )
    except RuntimeError as exc:
        code, output = 1, str(exc)
    elapsed_ms = int((time.time() - started) * 1000)
    return {
        "name": name,
        "command": " ".join(cli_args),
        "exit_code": int(code),
        "ok": int(code) == 0,
        "duration_ms": elapsed_ms,
        "output": _redact_sensitive(str(output or ""))[:2000],
    }


def cmd_plugin_list(args: argparse.Namespace) -> int:
    project = _resolve_target_project(str(getattr(args, "project", "") or ""))
    cfg, _ = _load_gateway_config(project)
    plugins = cfg.get("plugins", {}) if isinstance(cfg.get("plugins", {}), dict) else {}
    results = _collect_plugin_validation(project, cfg)
    total = len(results)

    if getattr(args, "json", False):
        payload = {
            "enabled": _coerce_bool(plugins.get("enabled", True), True),
            "count": total,
            "plugins": results,
        }
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0

    print(f"[plugin-list] enabled={_coerce_bool(plugins.get('enabled', True), True)} total={total}")
    if not results:
        print(" - sin plugins configurados")
        return 0
    for item in results:
        status = "ok" if item["valid"] else "invalid"
        enabled = "enabled" if item["enabled"] else "disabled"
        print(f" - {item['id']}: {enabled} source={item['source']} status={status}")
        if item["errors"]:
            for err in item["errors"]:
                print(f"   error: {err}")
    return 0


def cmd_plugin_enable(args: argparse.Namespace) -> int:
    project = _resolve_target_project(str(getattr(args, "project", "") or ""))
    plugin_id = _normalize_plugin_id(str(getattr(args, "plugin_id", "") or ""))
    if not plugin_id:
        print("[plugin-enable] ERROR: --id es obligatorio")
        return 1
    cfg, _ = _load_gateway_config(project)
    plugins = cfg.setdefault("plugins", {})
    if not isinstance(plugins, dict):
        plugins = {}
        cfg["plugins"] = plugins
    entries = plugins.setdefault("entries", {})
    if not isinstance(entries, dict):
        entries = {}
        plugins["entries"] = entries
    load_cfg = plugins.setdefault("load", {})
    if not isinstance(load_cfg, dict):
        load_cfg = {}
        plugins["load"] = load_cfg
    load_paths = load_cfg.setdefault("paths", [])
    if not isinstance(load_paths, list):
        load_paths = []
        load_cfg["paths"] = load_paths
    metadata = _load_plugin_metadata(project)
    plugin_meta = metadata.setdefault("plugins", {})
    if not isinstance(plugin_meta, dict):
        plugin_meta = {}
        metadata["plugins"] = plugin_meta

    previous_meta = plugin_meta.get(plugin_id, {})
    if not isinstance(previous_meta, dict):
        previous_meta = {}
    source = str(getattr(args, "source", previous_meta.get("source", "local")) or "local").strip().lower()
    if source not in {"local", "npm"}:
        print("[plugin-enable] ERROR: --source debe ser local|npm")
        return 1

    meta_entry = dict(previous_meta)
    meta_entry["source"] = source
    path_raw = str(getattr(args, "path", "") or "").strip()
    manifest_raw = str(getattr(args, "manifest", "") or "").strip()
    package_raw = str(getattr(args, "package", "") or "").strip()

    if source == "local":
        selected_path = path_raw or str(meta_entry.get("path", "") or "")
        if not selected_path:
            print("[plugin-enable] ERROR: para source=local debes indicar --path")
            return 1
        resolved_path = _resolve_project_path(project, selected_path)
        path_store = _path_to_project_string(project, resolved_path)
        meta_entry["path"] = path_store

        selected_manifest = manifest_raw or str(meta_entry.get("manifest", "") or "")
        if selected_manifest:
            resolved_manifest = _resolve_project_path(project, selected_manifest)
        else:
            resolved_manifest = _detect_plugin_manifest(resolved_path)
        if resolved_manifest is not None:
            meta_entry["manifest"] = _path_to_project_string(project, resolved_manifest)
        elif "manifest" in meta_entry:
            meta_entry.pop("manifest", None)
        meta_entry.pop("package", None)
        if path_store not in [str(item) for item in load_paths]:
            load_paths.append(path_store)
    else:
        selected_pkg = package_raw or str(meta_entry.get("package", "") or "")
        if not selected_pkg:
            print("[plugin-enable] ERROR: para source=npm debes indicar --package")
            return 1
        meta_entry["package"] = selected_pkg
        meta_entry.pop("path", None)
        meta_entry.pop("manifest", None)

    validation = _validate_plugin_entry(
        project,
        plugin_id,
        {"enabled": True, "config": {}},
        metadata_entry=meta_entry,
    )
    if not validation["valid"]:
        print(f"[plugin-enable] ERROR plugin invalido: {plugin_id}")
        for err in validation["errors"]:
            print(f" - {err}")
        return 1

    plugin_entry = {"enabled": True}
    existing_entry = entries.get(plugin_id, {})
    if isinstance(existing_entry, dict) and isinstance(existing_entry.get("config"), dict):
        plugin_entry["config"] = existing_entry["config"]
    entries[plugin_id] = plugin_entry
    meta_entry["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if validation.get("manifest_name"):
        meta_entry["name"] = validation["manifest_name"]
    if validation.get("manifest_version"):
        meta_entry["version"] = validation["manifest_version"]
    plugin_meta[plugin_id] = meta_entry
    plugins["enabled"] = True
    config_path = _save_gateway_config(project, cfg)
    meta_path = _save_plugin_metadata(project, metadata)
    _log_audit("plugin-enable", f"{plugin_id} project={project}")
    print(f"[plugin-enable] OK {plugin_id} -> {config_path}")
    print(f"[plugin-enable] metadata -> {meta_path}")
    return 0


def cmd_plugin_disable(args: argparse.Namespace) -> int:
    project = _resolve_target_project(str(getattr(args, "project", "") or ""))
    plugin_id = _normalize_plugin_id(str(getattr(args, "plugin_id", "") or ""))
    if not plugin_id:
        print("[plugin-disable] ERROR: --id es obligatorio")
        return 1
    cfg, _ = _load_gateway_config(project)
    plugins = cfg.get("plugins", {}) if isinstance(cfg.get("plugins", {}), dict) else {}
    entries = plugins.get("entries", {}) if isinstance(plugins.get("entries", {}), dict) else {}
    metadata = _load_plugin_metadata(project).get("plugins", {})
    if not isinstance(metadata, dict):
        metadata = {}
    if plugin_id not in entries and plugin_id not in metadata:
        print(f"[plugin-disable] ERROR: plugin no encontrado: {plugin_id}")
        return 1
    existing = entries.get(plugin_id, {})
    if isinstance(existing, dict):
        config = existing.get("config", {}) if isinstance(existing.get("config"), dict) else {}
        entries[plugin_id] = {"enabled": False, "config": config} if config else {"enabled": False}
    else:
        entries[plugin_id] = {"enabled": False}
    config_path = _save_gateway_config(project, cfg)
    _log_audit("plugin-disable", f"{plugin_id} project={project}")
    print(f"[plugin-disable] OK {plugin_id} -> {config_path}")
    return 0


def cmd_plugin_validate(args: argparse.Namespace) -> int:
    project = _resolve_target_project(str(getattr(args, "project", "") or ""))
    plugin_id = _normalize_plugin_id(str(getattr(args, "plugin_id", "") or ""))
    cfg, _ = _load_gateway_config(project)
    results = _collect_plugin_validation(project, cfg, plugin_id=plugin_id)
    if plugin_id and not results:
        print(f"[plugin-validate] ERROR: plugin no encontrado: {plugin_id}")
        return 1
    if getattr(args, "json", False):
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        print(f"[plugin-validate] plugins={len(results)}")
        for item in results:
            status = "OK" if item["valid"] else "INVALID"
            print(f" - {item['id']}: {status} source={item['source']} enabled={item['enabled']}")
            for warn in item["warnings"]:
                print(f"   warn: {warn}")
            for err in item["errors"]:
                print(f"   error: {err}")
    all_valid = all(item["valid"] for item in results)
    return 0 if all_valid else 1


def cmd_phase7_smoke(args: argparse.Namespace) -> int:
    project = _resolve_target_project(str(getattr(args, "project", "") or ""))
    live = bool(getattr(args, "live", False))
    dry_run = not live
    openclaw_repo = str(getattr(args, "openclaw_repo", "") or "")
    timeout_ms = int(getattr(args, "timeout_ms", 120000))
    approve_code = str(getattr(args, "approve_code", "DEMO-CODE") or "DEMO-CODE")
    ide_raw = str(getattr(args, "ide", "auto") or "auto")
    profile = str(getattr(args, "profile", "default") or "default")
    appdata_raw = str(getattr(args, "appdata_root", "")).strip()
    appdata_root = Path(appdata_raw).expanduser().resolve() if appdata_raw else None

    ide = _normalize_ide_name(ide_raw)
    if ide == "auto":
        detected = [item["ide"] for item in _detect_ide_profiles(appdata_root) if item.get("installed")]
        ide = detected[0] if detected else "vscode"
    model_resolution = _resolve_model_for_ide(ide=ide, profile=profile, appdata_root=appdata_root)

    policy_errors = _validate_policy(_load_policy())
    gateway_cfg, _ = _load_gateway_config(project)
    plugin_checks = _collect_plugin_validation(project, gateway_cfg)
    plugin_failures = [item for item in plugin_checks if item["enabled"] and not item["valid"]]

    step_specs = [
        ("gateway-status", ["gateway", "status"]),
        ("channel-status", ["channels", "status", "--probe"]),
        ("login-whatsapp", ["channels", "login", "--channel", "whatsapp"]),
        ("login-telegram", ["channels", "login", "--channel", "telegram"]),
        ("pairing-list-telegram", ["pairing", "list", "telegram"]),
        ("pairing-approve-telegram", ["pairing", "approve", "telegram", approve_code]),
    ]
    steps: list[dict[str, Any]] = []
    for name, cmd in step_specs:
        steps.append(
            _run_gateway_step(
                name=name,
                cli_args=cmd,
                project=project,
                openclaw_repo=openclaw_repo,
                dry_run=dry_run,
                timeout_ms=timeout_ms,
            )
        )

    steps_ok = all(item["ok"] for item in steps)
    model_ok = model_resolution.get("auth_mode") != "unavailable"
    success = steps_ok and model_ok and not policy_errors and not plugin_failures

    report = {
        "kind": "phase7-smoke",
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "project": str(project),
        "dry_run": dry_run,
        "openclaw_repo": openclaw_repo,
        "model_resolution": model_resolution,
        "policy_errors": policy_errors,
        "plugins": plugin_checks,
        "steps": steps,
        "summary": {
            "steps_total": len(steps),
            "steps_ok": sum(1 for item in steps if item["ok"]),
            "model_ok": model_ok,
            "policy_ok": len(policy_errors) == 0,
            "plugins_ok": len(plugin_failures) == 0,
            "success": success,
        },
    }
    report_path = _phase7_report_path("smoke")
    save_json(report_path, report)
    print(
        f"[phase7-smoke] success={success} steps={report['summary']['steps_ok']}/{report['summary']['steps_total']} "
        f"model_ok={model_ok} policy_errors={len(policy_errors)} plugin_failures={len(plugin_failures)}"
    )
    print(f"[phase7-smoke] report -> {report_path}")
    return 0 if success else 1


def cmd_gateway_resilience(args: argparse.Namespace) -> int:
    project = _resolve_target_project(str(getattr(args, "project", "") or ""))
    attempts = max(1, int(getattr(args, "attempts", 5)))
    interval_ms = max(0, int(getattr(args, "interval_ms", 1000)))
    timeout_ms = int(getattr(args, "timeout_ms", 120000))
    min_success_ratio = max(0.0, min(1.0, float(getattr(args, "min_success_ratio", 0.8))))
    live = bool(getattr(args, "live", False))
    dry_run = not live
    openclaw_repo = str(getattr(args, "openclaw_repo", "") or "")

    probes: list[dict[str, Any]] = []
    for i in range(attempts):
        probes.append(
            _run_gateway_step(
                name=f"probe-{i + 1}",
                cli_args=["gateway", "status"],
                project=project,
                openclaw_repo=openclaw_repo,
                dry_run=dry_run,
                timeout_ms=timeout_ms,
            )
        )
        if i < attempts - 1 and interval_ms > 0:
            time.sleep(interval_ms / 1000.0)

    ok_count = sum(1 for item in probes if item["ok"])
    ratio = ok_count / attempts
    success = ratio >= min_success_ratio
    report = {
        "kind": "gateway-resilience",
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "project": str(project),
        "dry_run": dry_run,
        "attempts": attempts,
        "min_success_ratio": min_success_ratio,
        "success_ratio": ratio,
        "success": success,
        "probes": probes,
    }
    report_path = _phase7_report_path("resilience")
    save_json(report_path, report)
    print(
        f"[gateway-resilience] success={success} probes_ok={ok_count}/{attempts} "
        f"ratio={ratio:.2f} min={min_success_ratio:.2f}"
    )
    print(f"[gateway-resilience] report -> {report_path}")
    return 0 if success else 1


def cmd_admin_exec(args: argparse.Namespace) -> int:
    """
    Ejecuta un comando en PowerShell elevado (RunAs/UAC).
    Nota: Windows siempre puede pedir confirmacion UAC; no es evitable por software.
    """
    command = str(getattr(args, "command", "") or "").strip()
    if not command:
        print("[admin-exec] ERROR: especifica --command")
        return 1

    wait = bool(getattr(args, "wait", False))
    timeout_ms = int(getattr(args, "timeout_ms", 600000))
    admin_dir = COPILOT_AGENT / "admin-runs"
    admin_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    runner = admin_dir / f"admin-exec-{stamp}.ps1"
    log_file = admin_dir / f"admin-exec-{stamp}.log"
    escaped_log = str(log_file).replace("'", "''")
    escaped_runner = str(runner).replace("'", "''")

    script = (
        "$ErrorActionPreference = 'Continue'\n"
        f"Start-Transcript -Path '{escaped_log}' -Force | Out-Null\n"
        f"{command}\n"
        "Write-Host \"`n[admin-exec] exit code: $LASTEXITCODE\"\n"
        "Stop-Transcript | Out-Null\n"
    )
    runner.write_text(script, encoding="utf-8")

    ps_cmd = (
        "Start-Process powershell "
        "-Verb RunAs "
        "-ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"
        f"'{escaped_runner}')"
    )
    if wait:
        ps_cmd += " -Wait -PassThru | Out-Null"
    else:
        ps_cmd += " | Out-Null"

    code, out = _execute_powershell(ps_cmd, timeout=timeout_ms)
    if code != 0:
        print(f"[admin-exec] ERROR lanzando proceso elevado: {out.strip()}")
        return code

    _log_audit("admin-exec", f"runner={runner.name} wait={wait}")
    print(f"[admin-exec] OK solicitado (UAC) | runner={runner}")
    print(f"[admin-exec] log esperado -> {log_file}")
    return 0


def cmd_admin_doctor(args: argparse.Namespace) -> int:
    """
    Diagnostico administrativo 1-comando para Windows:
    - Estado de activacion (slmgr /xpr)
    - Productos/licencias Windows
    - Edicion actual y ediciones destino (DISM)
    - Clave OEM (opcional mostrar completa)
    """
    reveal_key = bool(getattr(args, "reveal_key", False))
    elevated = not bool(getattr(args, "no_elevated", False))
    wait = bool(getattr(args, "wait", False))
    timeout_ms = int(getattr(args, "timeout_ms", 600000))

    doctor_cmd = (
        "$ErrorActionPreference='Continue'; "
        "Write-Output '=== ACTIVATION ==='; "
        "cscript //nologo $env:windir\\system32\\slmgr.vbs /xpr; "
        "Write-Output '=== LICENSE STATUS ==='; "
        "Get-CimInstance SoftwareLicensingProduct | "
        "Where-Object { $_.PartialProductKey -and $_.Name -like '*Windows*' } | "
        "Select-Object Name,LicenseStatus,Description,PartialProductKey | Format-Table -AutoSize; "
        "Write-Output '=== EDITIONS ==='; "
        "DISM /Online /Get-CurrentEdition; "
        "DISM /Online /Get-TargetEditions; "
        "Write-Output '=== OEM KEY ==='; "
        "$k=(Get-CimInstance -Query \"select OA3xOriginalProductKey from SoftwareLicensingService\").OA3xOriginalProductKey; "
        "if($k){"
    )
    if reveal_key:
        doctor_cmd += "Write-Output (\"OEM_KEY:\" + $k)"
    else:
        doctor_cmd += (
            "$masked = if($k.Length -gt 5){ ('*' * ($k.Length - 5)) + $k.Substring($k.Length-5) } else { '*****' }; "
            "Write-Output (\"OEM_KEY_MASKED:\" + $masked)"
        )
    doctor_cmd += "} else { Write-Output 'OEM_KEY:NO' }"

    if elevated:
        return cmd_admin_exec(argparse.Namespace(command=doctor_cmd, wait=wait, timeout_ms=timeout_ms))

    code, out = _execute_powershell(doctor_cmd, timeout=timeout_ms)
    print(out)
    return code


def cmd_install(args: argparse.Namespace) -> int:
    """Instala/vincula skills de este agente en otro proyecto."""
    try:
        _preflight(require_index=True)
    except RuntimeError as exc:
        print(f"[install] ERROR: {exc}")
        return 1

    appdata_raw = str(getattr(args, "appdata_root", "")).strip()
    appdata_root = Path(appdata_raw).expanduser().resolve() if appdata_raw else None
    ide_request = str(getattr(args, "ide", "auto") or "auto")
    try:
        ide_targets = _resolve_ide_targets(ide_request, appdata_root)
    except RuntimeError as exc:
        print(f"[install] ERROR: {exc}")
        return 1

    target = Path(args.path).resolve()
    user_settings_only = bool(getattr(args, "user_settings_only", False))
    gh_target = target / ".github"
    skills_target = gh_target / "skills"
    instr_target = gh_target / "instructions"
    ci_target = gh_target / "copilot-instructions.md"

    if not target.exists() and not user_settings_only:
        target.mkdir(parents=True, exist_ok=True)

    if not user_settings_only:
        gh_target.mkdir(parents=True, exist_ok=True)

    if not user_settings_only:
        # copilot-instructions.md
        ci_source = ROOT / ".github" / "copilot-instructions.md"
        if _same_path(ci_source, ci_target):
            print("[install] SKIP copilot-instructions.md ya apunta al origen")
        elif not ci_target.exists() or args.force:
            shutil.copy2(ci_source, ci_target)
            print(f"[install] OK copilot-instructions.md -> {ci_target}")
        else:
            print(f"[install] SKIP copilot-instructions.md ya existe (usa --force para sobreescribir)")

        # skills/ (symlink)
        if _same_path(skills_target, GH_SKILLS_DIR):
            print("[install] SKIP .github/skills/ ya apunta al origen")
        else:
            if skills_target.exists() or skills_target.is_symlink():
                if args.force:
                    if skills_target.is_symlink():
                        skills_target.unlink()
                    else:
                        shutil.rmtree(skills_target)
                else:
                    print(f"[install] SKIP .github/skills/ ya existe (usa --force)")
            if not skills_target.exists() and not skills_target.is_symlink():
                try:
                    skills_target.symlink_to(GH_SKILLS_DIR, target_is_directory=True)
                    print(f"[install] LINK .github/skills/ -> symlink a {GH_SKILLS_DIR}")
                except OSError:
                    shutil.copytree(GH_SKILLS_DIR, skills_target)
                    print(f"[install] COPY .github/skills/ -> copiado (sin privilegios de symlink)")

        # instructions/ (symlink)
        instr_src = ROOT / ".github" / "instructions"
        if _same_path(instr_target, instr_src):
            print("[install] SKIP .github/instructions/ ya apunta al origen")
        else:
            if instr_target.exists() or instr_target.is_symlink():
                if args.force:
                    if instr_target.is_symlink():
                        instr_target.unlink()
                    else:
                        shutil.rmtree(instr_target)
                else:
                    print(f"[install] SKIP .github/instructions/ ya existe (usa --force)")
            if not instr_target.exists() and not instr_target.is_symlink():
                try:
                    instr_target.symlink_to(instr_src, target_is_directory=True)
                    print(f"[install] LINK .github/instructions/ -> symlink a {instr_src}")
                except OSError:
                    shutil.copytree(instr_src, instr_target)
                    print(f"[install] COPY .github/instructions/ -> copiado")

        # Ensure both routing and policy files exist in target .github for all IDE bridges.
        model_routing_target = _ensure_target_model_routing(target, force=getattr(args, "force", False))
        print(f"[install] OK model routing -> {model_routing_target}")

        policy_target = gh_target / "free-jt7-policy.yaml"
        if _same_path(POLICY_FILE, policy_target):
            print("[install] SKIP free-jt7-policy.yaml ya apunta al origen")
        elif not policy_target.exists() or args.force:
            shutil.copy2(POLICY_FILE, policy_target)
            print(f"[install] OK policy -> {policy_target}")
        else:
            print("[install] SKIP free-jt7-policy.yaml ya existe (usa --force para sobreescribir)")

        openclaw_note = _link_openclaw_repo_into_target(target, force=getattr(args, "force", False))
        print(f"[install] {openclaw_note}")

        for ide in ide_targets:
            notes = _install_workspace_ide_adapter(target, ide, force=getattr(args, "force", False))
            if notes:
                print(f"[install] IDE {ide}:")
                for note in notes:
                    print(f"  - {note}")
    else:
        print("[install] Modo user-settings-only: se omite bootstrap de workspace y solo se reparan settings globales.")

    if getattr(args, "update_user_settings", False):
        for ide in ide_targets:
            try:
                settings_path = _update_user_settings_for_ide(ide, appdata_root)
                print(f"[install] IDE {ide} user settings -> {settings_path}")
            except RuntimeError as exc:
                print(f"[install] WARN IDE {ide} user settings: {exc}")

    _log_audit("install", f"{target} | ide={','.join(ide_targets)} | user_settings_only={user_settings_only}")
    if user_settings_only:
        _update_resume("install", f"settings globales reparados | ide={','.join(ide_targets)}")
        print(f"[install] OK Settings globales reparados | ide={','.join(ide_targets)}")
    else:
        _update_resume("install", f"skills instalados en {target.name} | ide={','.join(ide_targets)}")
        print(f"[install] OK Skills vinculados en: {target} | ide={','.join(ide_targets)}")
    return 0


def cmd_policy_validate(args: argparse.Namespace) -> int:
    del args
    policy = _load_policy()
    errors = _validate_policy(policy)
    if errors:
        print("[policy-validate] ERROR")
        for err in errors:
            print(f"  - {err}")
        return 1
    print("[policy-validate] OK")
    print(json.dumps(policy, indent=2, ensure_ascii=False))
    return 0


def cmd_rollout_mode(args: argparse.Namespace) -> int:
    policy = _load_policy()
    mode = getattr(args, "mode", None)
    if not mode:
        current = _load_rollout_mode(policy)
        print(f"[rollout-mode] {current}")
        return 0
    if mode not in {"shadow", "assist", "autonomous"}:
        print("[rollout-mode] ERROR: modo invÃ¡lido")
        return 1
    _save_rollout_mode(mode)
    _log_audit("rollout-mode", mode)
    print(f"[rollout-mode] OK -> {mode}")
    return 0


def cmd_host_mode(args: argparse.Namespace) -> int:
    mode = str(getattr(args, "mode", "status") or "status").strip().lower()
    project = _resolve_target_project(str(getattr(args, "project", "") or ""))
    policy = _load_policy()
    gateway_cfg, _ = _load_gateway_config(project)

    tools_cfg = gateway_cfg.get("tools", {}) if isinstance(gateway_cfg.get("tools", {}), dict) else {}
    exec_cfg = tools_cfg.get("exec", {}) if isinstance(tools_cfg.get("exec", {}), dict) else {}
    risk_cfg = policy.get("risk", {}) if isinstance(policy.get("risk", {}), dict) else {}
    allow_cfg = policy.get("execution", {}).get("allowlist", {}) if isinstance(policy.get("execution", {}), dict) else {}

    if mode in {"status", "show"}:
        payload = {
            "mode": "full" if _coerce_bool(risk_cfg.get("allow_high_risk_without_approval"), False) and _coerce_bool(risk_cfg.get("allow_destructive"), False) else "safe",
            "policy": {
                "autonomy_mode": str(policy.get("autonomy", {}).get("mode", "autonomous")),
                "allow_high_risk_without_approval": _coerce_bool(risk_cfg.get("allow_high_risk_without_approval"), False),
                "allow_destructive": _coerce_bool(risk_cfg.get("allow_destructive"), False),
                "allowlist_enabled": _coerce_bool(allow_cfg.get("enabled"), False),
            },
            "gateway_exec": {
                "host": str(exec_cfg.get("host", "sandbox")),
                "security": str(exec_cfg.get("security", "allowlist")),
                "ask": str(exec_cfg.get("ask", "on-miss")),
            },
            "project": str(project),
        }
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0

    if mode not in {"safe", "full"}:
        print("[host-mode] ERROR: modo invalido (status|safe|full)")
        return 1

    risk = policy.setdefault("risk", {})
    if not isinstance(risk, dict):
        risk = {}
        policy["risk"] = risk
    execution = policy.setdefault("execution", {})
    if not isinstance(execution, dict):
        execution = {}
        policy["execution"] = execution
    allowlist = execution.setdefault("allowlist", {})
    if not isinstance(allowlist, dict):
        allowlist = {}
        execution["allowlist"] = allowlist

    tools = gateway_cfg.setdefault("tools", {})
    if not isinstance(tools, dict):
        tools = {}
        gateway_cfg["tools"] = tools
    gw_exec = tools.setdefault("exec", {})
    if not isinstance(gw_exec, dict):
        gw_exec = {}
        tools["exec"] = gw_exec

    if mode == "full":
        policy.setdefault("autonomy", {})["mode"] = "autonomous"
        risk["allow_high_risk_without_approval"] = True
        risk["allow_destructive"] = True
        allowlist["enabled"] = False
        gw_exec["host"] = "gateway"
        gw_exec["security"] = "full"
        gw_exec["ask"] = "off"
    else:
        policy.setdefault("autonomy", {})["mode"] = "autonomous"
        risk["allow_high_risk_without_approval"] = False
        risk["allow_destructive"] = False
        allowlist["enabled"] = True
        if not isinstance(allowlist.get("bins"), list) or not allowlist.get("bins"):
            allowlist["bins"] = list(DEFAULT_POLICY["execution"]["allowlist"]["bins"])
        gw_exec["host"] = "gateway"
        gw_exec["security"] = "allowlist"
        gw_exec["ask"] = "on-miss"

    _write_policy(policy)
    _save_gateway_config(project, gateway_cfg)
    _log_audit("host-mode", f"{mode} project={project}")
    print(f"[host-mode] OK mode={mode}")
    print("[host-mode] Reinicia gateway para aplicar tools.exec: python skills_manager.py gateway-start --project \"<ruta>\"")
    return 0


def _create_run_record(run_id: str, payload: dict[str, Any]) -> None:
    run_file, _ = _run_paths(run_id)
    save_json(run_file, payload)


def _load_run_record(run_id: str) -> dict[str, Any] | None:
    run_file, _ = _run_paths(run_id)
    if not run_file.exists():
        return None
    return load_json(run_file, {})


def cmd_task_start(args: argparse.Namespace) -> int:
    try:
        _preflight(require_index=True)
    except RuntimeError as exc:
        print(f"[task-start] ERROR: {exc}")
        return 1
    policy = _load_policy()
    policy_errors = _validate_policy(policy)
    if policy_errors:
        print("[task-start] ERROR: policy invÃ¡lida")
        for err in policy_errors:
            print(f"  - {err}")
        return 1

    goal = str(getattr(args, "goal", "")).strip()
    if not goal:
        print("[task-start] ERROR: especifica --goal")
        return 1
    run_id = getattr(args, "run_id", None) or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    scope = str(getattr(args, "scope", "workspace"))
    ide = _normalize_ide_name(str(getattr(args, "ide", "auto") or "auto"))
    profile = str(getattr(args, "profile", "default") or "default")
    appdata_raw = str(getattr(args, "appdata_root", "")).strip()
    appdata_root = Path(appdata_raw).expanduser().resolve() if appdata_raw else None
    if ide == "auto":
        detected = [item["ide"] for item in _detect_ide_profiles(appdata_root) if item.get("installed")]
        ide = detected[0] if detected else "vscode"
    model_resolution = _resolve_model_for_ide(ide=ide, profile=profile, appdata_root=appdata_root)
    risk_level = _classify_risk(goal, policy)
    skills_selected = _resolve_skills_for_query(goal, int(policy.get("skills", {}).get("max_composed", 3)))

    run = {
        "run_id": run_id,
        "started_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ended_at": "",
        "user_goal": goal,
        "scope": scope,
        "risk_level": risk_level,
        "status": "planned",
        "skills_selected": skills_selected,
        "quality_gate": {"required": bool(policy.get("quality_gate", {}).get("required", True)), "passed": False},
        "steps": [],
        "summary": "",
        "rollout_mode": _load_rollout_mode(policy),
        "model_resolution": model_resolution,
    }
    _create_run_record(run_id, run)
    _upsert_task_registry(run)
    _append_run_event(run_id, {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "step_id": "intake",
        "action": "task-start",
        "command": "",
        "result": f"goal={goal}",
        "exit_code": 0,
        "retry_index": 0,
        "evidence_ref": "",
    })
    print(
        f"[task-start] OK run_id={run_id} risk={risk_level} mode={run['rollout_mode']} "
        f"model={model_resolution['provider']}/{model_resolution['model']} auth={model_resolution['auth_mode']}"
    )
    return 0


def cmd_skill_resolve(args: argparse.Namespace) -> int:
    try:
        _preflight(require_index=True)
    except RuntimeError as exc:
        print(f"[skill-resolve] ERROR: {exc}")
        return 1
    query = str(getattr(args, "query", "")).strip()
    if not query:
        print("[skill-resolve] ERROR: especifica --query")
        return 1
    top = int(getattr(args, "top", 3))
    items = _resolve_skills_for_query(query, top)
    if getattr(args, "json", False):
        print(json.dumps(items, indent=2, ensure_ascii=False))
        return 0
    print(f"[skill-resolve] query='{query}' -> {len(items)} skills")
    for item in items:
        print(f"  - {item['id']} ({item['category']}) score={item['score']}")
    return 0


def cmd_task_step(args: argparse.Namespace) -> int:
    run_id = str(getattr(args, "run_id", "")).strip()
    if not run_id:
        print("[task-step] ERROR: especifica --run-id")
        return 1
    run = _load_run_record(run_id)
    if not run:
        print(f"[task-step] ERROR: run no encontrado: {run_id}")
        return 1
    command = str(getattr(args, "command", "")).strip()
    if not command:
        print("[task-step] ERROR: especifica --command")
        return 1

    policy = _load_policy()
    mode = run.get("rollout_mode", _load_rollout_mode(policy))
    strategy = str(policy.get("shell", {}).get("strategy", "cross-shell"))
    platform_family = _platform_family()
    normalized = _normalize_shell_command(command, strategy, platform_family)
    risk_level = _classify_risk(command, policy)
    destructive = _is_destructive(command, policy)
    risk_cfg = policy.get("risk", {}) if isinstance(policy.get("risk", {}), dict) else {}
    policy_allow_destructive = _coerce_bool(risk_cfg.get("allow_destructive"), False)
    policy_auto_high_risk = _coerce_bool(risk_cfg.get("allow_high_risk_without_approval"), False)

    if destructive and not (getattr(args, "allow_destructive", False) or policy_allow_destructive):
        step_result = {
            "step_id": f"step-{len(run.get('steps', [])) + 1}",
            "action": "blocked-destructive",
            "command": command,
            "normalized_command": normalized,
            "result": "Comando bloqueado por polÃ­tica destructiva",
            "exit_code": 2,
            "retry_index": 0,
            "risk_level": risk_level,
            "mode": mode,
        }
        run.setdefault("steps", []).append(step_result)
        run["status"] = "blocked"
        _create_run_record(run_id, run)
        _upsert_task_registry(run)
        _append_run_event(run_id, {
            "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "step_id": step_result["step_id"],
            "action": step_result["action"],
            "command": command,
            "result": step_result["result"],
            "exit_code": 2,
            "retry_index": 0,
            "evidence_ref": "",
        })
        print("[task-step] BLOCKED destructive command")
        return 1

    if risk_level == "high" and not (getattr(args, "approve_high_risk", False) or policy_auto_high_risk):
        print("[task-step] BLOCKED high-risk requires --approve-high-risk")
        return 1

    allowed, primary_bin = _command_allowed_by_policy(normalized, policy)
    if not allowed:
        step_result = {
            "step_id": f"step-{len(run.get('steps', [])) + 1}",
            "action": "blocked-allowlist",
            "command": command,
            "normalized_command": normalized,
            "result": f"Binario no permitido por allowlist: {primary_bin or '<unknown>'}",
            "exit_code": 2,
            "retry_index": 0,
            "risk_level": risk_level,
            "mode": mode,
        }
        run.setdefault("steps", []).append(step_result)
        run["status"] = "blocked"
        _create_run_record(run_id, run)
        _upsert_task_registry(run)
        _append_run_event(run_id, {
            "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "step_id": step_result["step_id"],
            "action": step_result["action"],
            "command": command,
            "result": step_result["result"],
            "exit_code": 2,
            "retry_index": 0,
            "evidence_ref": "",
        })
        print(f"[task-step] BLOCKED allowlist bin={primary_bin or 'unknown'}")
        return 1

    max_attempts = int(policy.get("execution", {}).get("retry", {}).get("max_attempts", 3))
    run["status"] = "running"
    attempts = _task_step_attempts(command, normalized, platform_family)
    attempts = attempts[:max_attempts]

    if mode == "shadow":
        exit_code, result = 0, f"[shadow] command simulated: {normalized}"
        used_attempt = 0
    else:
        exit_code, result, used_attempt = 1, "", 0
        for retry_index, candidate in enumerate(attempts):
            code, out = _execute_task_shell(candidate, platform_family=platform_family)
            exit_code, result, used_attempt = code, out, retry_index
            _append_run_event(run_id, {
                "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "step_id": f"step-{len(run.get('steps', [])) + 1}",
                "action": "task-step-attempt",
                "command": candidate,
                "result": out[:1000],
                "exit_code": code,
                "retry_index": retry_index,
                "evidence_ref": "",
            })
            if code == 0:
                break

    step = {
        "step_id": f"step-{len(run.get('steps', [])) + 1}",
        "action": "task-step",
        "command": command,
        "normalized_command": normalized,
        "result": result[:4000],
        "exit_code": exit_code,
        "retry_index": used_attempt,
        "risk_level": risk_level,
        "mode": mode,
    }
    run.setdefault("steps", []).append(step)
    if exit_code != 0:
        run["status"] = "failed"
    _create_run_record(run_id, run)
    _upsert_task_registry(run)
    print(f"[task-step] run_id={run_id} exit={exit_code} retries={used_attempt}")
    return 0 if exit_code == 0 else 1


def cmd_task_close(args: argparse.Namespace) -> int:
    run_id = str(getattr(args, "run_id", "")).strip()
    if not run_id:
        print("[task-close] ERROR: especifica --run-id")
        return 1
    run = _load_run_record(run_id)
    if not run:
        print(f"[task-close] ERROR: run no encontrado: {run_id}")
        return 1
    steps = run.get("steps", [])
    required = bool(run.get("quality_gate", {}).get("required", True))
    passed = bool(steps) and all(int(s.get("exit_code", 1)) == 0 for s in steps)
    if required and not passed:
        run["status"] = "blocked"
        run["quality_gate"]["passed"] = False
        run["summary"] = "Bloqueado por quality gate: existen steps fallidos o sin evidencia."
        _create_run_record(run_id, run)
        _upsert_task_registry(run)
        _update_resume("task-close", f"{run_id}:blocked")
        print("[task-close] BLOCKED quality gate")
        return 1
    run["quality_gate"]["passed"] = passed
    run["status"] = "succeeded" if passed else "failed"
    run["ended_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    run["summary"] = str(getattr(args, "summary", "")).strip() or f"Run finalizado con {len(steps)} steps"
    _create_run_record(run_id, run)
    _upsert_task_registry(run)
    _append_run_event(run_id, {
        "ts": run["ended_at"],
        "step_id": "close",
        "action": "task-close",
        "command": "",
        "result": run["summary"],
        "exit_code": 0 if run["status"] == "succeeded" else 1,
        "retry_index": 0,
        "evidence_ref": "",
    })
    _log_audit("task-close", f"{run_id}:{run['status']}")
    _update_resume("task-close", f"{run_id}:{run['status']}")
    print(f"[task-close] OK run_id={run_id} status={run['status']}")
    return 0 if run["status"] == "succeeded" else 1


def cmd_task_run(args: argparse.Namespace) -> int:
    goal = str(getattr(args, "goal", "")).strip()
    commands = list(getattr(args, "commands", []) or [])
    if not goal:
        print("[task-run] ERROR: especifica --goal")
        return 1
    start_rc = cmd_task_start(argparse.Namespace(
        goal=goal,
        scope=getattr(args, "scope", "workspace"),
        run_id=getattr(args, "run_id", None),
        ide=getattr(args, "ide", "auto"),
        profile=getattr(args, "profile", "default"),
        appdata_root=getattr(args, "appdata_root", ""),
    ))
    if start_rc != 0:
        return start_rc

    # Recuperar run_id mÃ¡s reciente si no fue explÃ­cito.
    run_id = getattr(args, "run_id", None)
    if not run_id:
        runs = sorted(_runs_dir().glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not runs:
            print("[task-run] ERROR: no se pudo resolver run_id")
            return 1
        run_id = runs[0].stem

    rc = 0
    for command in commands:
        step_rc = cmd_task_step(argparse.Namespace(
            run_id=run_id,
            command=command,
            approve_high_risk=getattr(args, "approve_high_risk", False),
            allow_destructive=getattr(args, "allow_destructive", False),
        ))
        if step_rc != 0:
            rc = step_rc
            break

    close_rc = cmd_task_close(argparse.Namespace(run_id=run_id, summary=getattr(args, "summary", "")))
    return close_rc if rc == 0 else rc


def cmd_task_list(args: argparse.Namespace) -> int:
    status_filter = str(getattr(args, "status", "") or "").strip().lower()
    limit = max(1, int(getattr(args, "limit", 20)))
    payload: list[dict[str, Any]] = []
    for path in sorted(_runs_dir().glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        run = load_json(path, {})
        if not isinstance(run, dict):
            continue
        status = str(run.get("status", "unknown")).lower()
        if status_filter and status != status_filter:
            continue
        payload.append({
            "run_id": str(run.get("run_id", path.stem)),
            "status": status,
            "risk_level": str(run.get("risk_level", "low")),
            "goal": str(run.get("user_goal", "")),
            "started_at": str(run.get("started_at", "")),
            "ended_at": str(run.get("ended_at", "")),
            "steps": len(run.get("steps", []) if isinstance(run.get("steps", []), list) else []),
            "quality_gate_passed": bool(run.get("quality_gate", {}).get("passed", False)),
        })
        if len(payload) >= limit:
            break
    if getattr(args, "json", False):
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0
    print(f"[task-list] total={len(payload)}")
    for item in payload:
        print(
            f" - {item['run_id']} status={item['status']} risk={item['risk_level']} "
            f"steps={item['steps']} qg={item['quality_gate_passed']} goal={item['goal'][:80]}"
        )
    return 0


def cmd_task_checklist(args: argparse.Namespace) -> int:
    run_id = str(getattr(args, "run_id", "")).strip()
    if not run_id:
        print("[task-checklist] ERROR: especifica --run-id")
        return 1
    run = _load_run_record(run_id)
    if not run:
        print(f"[task-checklist] ERROR: run no encontrado: {run_id}")
        return 1
    steps = run.get("steps", []) if isinstance(run.get("steps", []), list) else []
    items: list[dict[str, Any]] = []
    for step in steps:
        code = int(step.get("exit_code", 1))
        items.append({
            "step_id": str(step.get("step_id", "")),
            "ok": code == 0,
            "exit_code": code,
            "action": str(step.get("action", "")),
            "command": str(step.get("command", "")),
        })
    payload = {
        "run_id": run_id,
        "status": str(run.get("status", "unknown")),
        "quality_gate_required": bool(run.get("quality_gate", {}).get("required", True)),
        "quality_gate_passed": bool(run.get("quality_gate", {}).get("passed", False)),
        "steps_total": len(items),
        "steps_ok": sum(1 for item in items if item["ok"]),
        "items": items,
    }
    if getattr(args, "json", False):
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0
    print(
        f"[task-checklist] run_id={run_id} status={payload['status']} "
        f"quality_gate={payload['quality_gate_passed']} steps={payload['steps_ok']}/{payload['steps_total']}"
    )
    for item in items:
        mark = "x" if item["ok"] else " "
        print(f" [{mark}] {item['step_id']} exit={item['exit_code']} action={item['action']} cmd={item['command'][:80]}")
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    strict = bool(getattr(args, "strict", False))
    errors: list[str] = []
    warnings: list[str] = []
    info: list[str] = []

    if not SKILLS_DIR.exists():
        errors.append(f"catÃ¡logo ausente: {SKILLS_DIR}")
    else:
        skill_files = list(SKILLS_DIR.glob("*/SKILL.md"))
        if not skill_files:
            errors.append("no se encontraron SKILL.md en .github/skills")
        else:
            info.append(f"SKILL.md detectados: {len(skill_files)}")

    if INDEX_FILE.exists():
        try:
            index = load_index()
            info.append(f"Ã­ndice principal: {len(index)} entries")
        except Exception as exc:
            errors.append(f"Ã­ndice principal corrupto: {exc}")
            index = []
    else:
        warnings.append("Ã­ndice principal ausente; se requiere rebuild")
        index = []

    if LEGACY_INDEX_FILE.exists():
        info.append("Ã­ndice legado presente (compatibilidad)")
    else:
        warnings.append("Ã­ndice legado ausente (se regenerarÃ¡ en sync/rebuild)")

    if not COPILOT_INSTR.exists():
        errors.append("falta .github/copilot-instructions.md")
    if not _agent_file_path().exists():
        errors.append("falta .github/agents/free-jt7.agent.md")
    if not GH_INSTR_DIR.exists():
        errors.append("falta .github/instructions/")

    active_project = load_json(COPILOT_AGENT / "active-project.json", {})
    resolved_active = _resolve_active_project_record(active_project)
    if not resolved_active.get("path"):
        reason = resolved_active.get("stale_reason") or "missing-path"
        warnings.append(f"active-project.json no resoluble en este host ({reason}); usa set-project")
    elif resolved_active.get("mismatches"):
        mismatch_text = ",".join(resolved_active["mismatches"])
        warnings.append(f"active-project.json con identidad heredada parcial ({mismatch_text})")

    policy = _load_policy()
    policy_errors = _validate_policy(policy)
    if policy_errors:
        errors.extend([f"policy invÃ¡lida: {e}" for e in policy_errors])
    else:
        info.append(f"policy mode: {_load_rollout_mode(policy)}")

    if index:
        missing = [s["id"] for s in index if not (ROOT / s["gh_path"]).exists()]
        if missing:
            errors.append(f"{len(missing)} entries del Ã­ndice apuntan a rutas inexistentes")

    print("[doctor] DiagnÃ³stico del sistema")
    for line in info:
        print(f"  [INFO] {line}")
    for line in warnings:
        print(f"  [WARN] {line}")
    for line in errors:
        print(f"  [ERR ] {line}")

    _log_audit("doctor", f"errors={len(errors)} warnings={len(warnings)} strict={strict}")
    if errors:
        return 1
    return 1 if strict and warnings else 0


def _sync_counts_in_text(path: Path, replacements: list[tuple[str, str]]) -> None:
    if not path.exists():
        return
    content = path.read_text(encoding="utf-8")
    updated = content
    for pattern, repl in replacements:
        updated = re.sub(pattern, repl, updated, flags=re.MULTILINE)
    if updated != content:
        _atomic_write_text(path, updated)


def cmd_release_sync(args: argparse.Namespace) -> int:
    bump = getattr(args, "bump", "patch")
    try:
        skills = _rebuild_index_from_disk()
    except RuntimeError as exc:
        print(f"[release-sync] ERROR: {exc}")
        return 1

    by_cat: dict[str, int] = {}
    for skill in skills:
        by_cat[skill["category"]] = by_cat.get(skill["category"], 0) + 1
    total = len(skills)

    _sync_counts_in_text(
        COPILOT_INSTR,
        [
            (r"\*\*\d+ skills expertos\*\*", f"**{total} skills expertos**"),
            (r"- \*\*CatÃ¡logo completo\*\*: `skills/\.skills_index\.json` â€” \d+ entries",
             f"- **CatÃ¡logo completo**: `.github/skills/.skills_index.json` â€” {total} entries"),
            (r"\*\d+ skills â€” antigravity-awesome-skills v5\.7 \+ (FreeJT7|Free JT7) behaviors\*",
             f"*{total} skills â€” antigravity-awesome-skills v5.7 + Free JT7 behaviors*"),
        ],
    )

    for cat, count in by_cat.items():
        _sync_counts_in_text(
            COPILOT_INSTR,
            [(rf"(\| `{re.escape(cat)}` \|)\s+\d+\s+(\|)", rf"\g<1> {count} \g<2>")],
        )

    _sync_counts_in_text(
        AGENT_FILE,
        [
            (r"acceso a \d+ skills expertos", f"acceso a {total} skills expertos"),
            (r"catÃ¡logo de \d+ skills", f"catÃ¡logo de {total} skills"),
        ],
    )
    _sync_counts_in_text(
        README_MD,
        [
            (r"\b\d+\s+Skills\b", f"{total} Skills"),
            (r"\*\*\d+ skills\*\*", f"**{total} skills**"),
            (r"\*+\d+ skills â€” MIT License\*+", f"*{total} skills â€” MIT License*"),
        ],
    )

    version = VERSION_FILE.read_text(encoding="utf-8").strip() if VERSION_FILE.exists() else "0.0"
    parts = [int(p) for p in version.split(".") if p.isdigit()]
    while len(parts) < 2:
        parts.append(0)
    major, minor = parts[0], parts[1]
    if bump == "minor":
        minor += 1
    else:
        minor += 1
    new_version = f"{major}.{minor}"
    _atomic_write_text(VERSION_FILE, new_version + "\n")

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if CHANGELOG_MD.exists():
        changelog = CHANGELOG_MD.read_text(encoding="utf-8")
        entry = (
            f"\n## [v{new_version}] â€” {ts}\n\n"
            "### Summary\n"
            f"Release sync automÃ¡tico: {total} skills y consistencia de metadatos.\n\n"
        )
        if entry not in changelog:
            _atomic_write_text(CHANGELOG_MD, changelog + entry)

    _mirror_legacy_index(skills)
    _update_resume("release-sync", f"{total} skills | versiÃ³n {new_version}")
    _log_audit("release-sync", f"skills={total} version={new_version}")
    print(f"[release-sync] OK | skills={total} | version={new_version}")
    return 0


def cmd_rebuild(args: argparse.Namespace) -> int:
    del args
    try:
        skills = _rebuild_index_from_disk()
    except RuntimeError as exc:
        print(f"[rebuild] ERROR: {exc}")
        return 1
    print(f"[rebuild] indice reconstruido: {len(skills)}")
    return 0


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# main
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def main() -> int:
    parser = argparse.ArgumentParser(
        prog="skills_manager",
        description="Skills Library Manager para Claude Code",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="cmd", metavar="COMANDO")

    # list
    p_list = sub.add_parser("list", help="Listar skills")
    p_list.add_argument("--category", "-c", help="Filtrar por categoria")
    p_list.add_argument("--active",   "-a", action="store_true", help="Solo activas")
    p_list.add_argument("--json",     "-j", action="store_true", help="Salida JSON")

    # search
    p_search = sub.add_parser("search", help="Buscar skills")
    p_search.add_argument("query", nargs="*", help="Terminos de busqueda")
    p_search.add_argument("--top",      "-n", type=int, default=15, help="Max resultados")
    p_search.add_argument("--category", "-c", help="Filtrar por categoria")

    # activate
    p_act = sub.add_parser("activate", help="Activar skills")
    p_act.add_argument("skill_ids", nargs="+", help="IDs de skills a activar")

    # deactivate
    p_dea = sub.add_parser("deactivate", help="Desactivar skills")
    p_dea.add_argument("skill_ids", nargs="+", help="IDs de skills a desactivar")

    # fetch
    p_fetch = sub.add_parser("fetch", help="Importar skills desde GitHub")
    p_fetch.add_argument("--repo",    default=DEFAULT_REPO,   help="Owner/repo")
    p_fetch.add_argument("--branch",  default=DEFAULT_BRANCH, help="Branch")
    p_fetch.add_argument("--update",  "-u", action="store_true", help="Forzar actualizacion")
    p_fetch.add_argument("--dry-run", "-d", action="store_true", help="Sin descargar")

    # add
    p_add = sub.add_parser("add", help="Agregar skill nueva")
    p_add.add_argument("--name",        "-n", help="Nombre/ID de la skill")
    p_add.add_argument("--description", "-d", default="", help="Descripcion")
    p_add.add_argument("--category",    "-c", help="Categoria")
    p_add.add_argument("--file",        "-f", help="Importar desde archivo local")
    p_add.add_argument("--from-repo",   help="OWNER/REPO/path/SKILL.md en GitHub")

    # github-search
    p_gs = sub.add_parser("github-search", help="Buscar repos de skills en GitHub")
    p_gs.add_argument("query", nargs="*", help="Terminos")
    p_gs.add_argument("--top", "-n", type=int, default=10, help="Max resultados")

    # sync-claude
    sub.add_parser("sync-claude", help="Actualizar CLAUDE.md con skills activas")

    # adapt-copilot
    sub.add_parser("adapt-copilot", help="Regenerar .github/instructions/ para Copilot")

    # rebuild (util interna)
    sub.add_parser("rebuild", help="Reconstruir indice desde archivos locales")
    p_doc = sub.add_parser("doctor", help="Diagnosticar integridad del sistema")
    p_doc.add_argument("--strict", action="store_true", help="Tratar warnings como fallo")
    p_rs = sub.add_parser("release-sync", help="Sincronizar conteos/versionado y metadatos")
    p_rs.add_argument("--bump", choices=["patch", "minor"], default="patch", help="Tipo de bump de versiÃ³n")

    # policy/runtime
    sub.add_parser("policy-validate", help="Validar polÃ­tica operativa Free JT7")
    p_rm = sub.add_parser("rollout-mode", help="Ver o establecer modo rollout")
    p_rm.add_argument("mode", nargs="?", choices=["shadow", "assist", "autonomous"], help="Nuevo modo")
    p_hm = sub.add_parser("host-mode", help="Ver o establecer modo host de ejecucion")
    p_hm.add_argument("mode", nargs="?", choices=["status", "safe", "full"], default="status", help="Modo host")
    p_hm.add_argument("--project", default="", help="Ruta del proyecto objetivo")

    p_sr = sub.add_parser("skill-resolve", help="Resolver skills efÃ­meras para una tarea")
    p_sr.add_argument("--query", required=True, help="Consulta de tarea")
    p_sr.add_argument("--top", type=int, default=3, help="MÃ¡ximo de skills")
    p_sr.add_argument("--json", action="store_true", help="Salida JSON")

    p_ts = sub.add_parser("task-start", help="Crear run de tarea")
    p_ts.add_argument("--goal", required=True, help="Objetivo de la tarea")
    p_ts.add_argument("--scope", default="workspace", help="Ãmbito de ejecuciÃ³n")
    p_ts.add_argument("--run-id", default="", help="ID opcional de run")
    p_ts.add_argument("--ide", default="auto", help="IDE origen para resolver modelo")
    p_ts.add_argument("--profile", default="default", help="Perfil de usuario del IDE")
    p_ts.add_argument("--appdata-root", default="", help=argparse.SUPPRESS)

    p_tstep = sub.add_parser("task-step", help="Ejecutar un step sobre un run")
    p_tstep.add_argument("--run-id", required=True, help="ID de run")
    p_tstep.add_argument("--command", required=True, help="Comando del step")
    p_tstep.add_argument("--approve-high-risk", action="store_true", help="Aprobar step high-risk")
    p_tstep.add_argument("--allow-destructive", action="store_true", help="Permitir comando destructivo")

    p_tc = sub.add_parser("task-close", help="Cerrar run aplicando quality gate")
    p_tc.add_argument("--run-id", required=True, help="ID de run")
    p_tc.add_argument("--summary", default="", help="Resumen final")

    p_tlist = sub.add_parser("task-list", help="Listar runs/tareas recientes")
    p_tlist.add_argument("--status", default="", choices=["", "planned", "running", "succeeded", "failed", "blocked"], help="Filtrar por estado")
    p_tlist.add_argument("--limit", type=int, default=20, help="Maximo de runs")
    p_tlist.add_argument("--json", action="store_true", help="Salida JSON")

    p_tcheck = sub.add_parser("task-checklist", help="Ver checklist de ejecucion por run")
    p_tcheck.add_argument("--run-id", required=True, help="ID de run")
    p_tcheck.add_argument("--json", action="store_true", help="Salida JSON")

    p_tr = sub.add_parser("task-run", help="Orquestar tarea completa end-to-end")
    p_tr.add_argument("--goal", required=True, help="Objetivo de la tarea")
    p_tr.add_argument("--scope", default="workspace", help="Ãmbito de ejecuciÃ³n")
    p_tr.add_argument("--run-id", default="", help="ID opcional de run")
    p_tr.add_argument("--commands", nargs="*", default=[], help="Comandos a ejecutar en orden")
    p_tr.add_argument("--approve-high-risk", action="store_true", help="Aprobar high-risk")
    p_tr.add_argument("--allow-destructive", action="store_true", help="Permitir comandos destructivos")
    p_tr.add_argument("--summary", default="", help="Resumen final")
    p_tr.add_argument("--ide", default="auto", help="IDE origen para resolver modelo")
    p_tr.add_argument("--profile", default="default", help="Perfil de usuario del IDE")
    p_tr.add_argument("--appdata-root", default="", help=argparse.SUPPRESS)

    # set-project
    p_sp = sub.add_parser("set-project", help="Establecer el proyecto activo (donde se aplican los cambios)")
    p_sp.add_argument("path", help="Ruta del proyecto activo")
    p_sp.add_argument("--description", "-d", default="", help="Notas sobre el proyecto")

    # ide-detect
    p_ide = sub.add_parser("ide-detect", help="Detectar perfiles de IDE compatibles")
    p_ide.add_argument("--json", action="store_true", help="Salida JSON")
    p_ide.add_argument("--appdata-root", default="", help=argparse.SUPPRESS)

    # model routing
    p_minit = sub.add_parser("model-profiles-init", help="Inicializar ruteo de modelos por IDE/perfil")
    p_minit.add_argument("--force", "-f", action="store_true", help="Sobrescribir si ya existe")
    p_mresolve = sub.add_parser("model-resolve", help="Resolver proveedor/modelo por IDE y perfil")
    p_mresolve.add_argument("--ide", default="auto", help="IDE objetivo o auto")
    p_mresolve.add_argument("--profile", default="default", help="Perfil de usuario del IDE")
    p_mresolve.add_argument("--json", action="store_true", help="Salida JSON")
    p_mresolve.add_argument("--appdata-root", default="", help=argparse.SUPPRESS)

    # exec allowlist
    p_allow = sub.add_parser("exec-allowlist", help="Gestionar allowlist de binarios para task-step")
    p_allow.add_argument("action", choices=["list", "add", "remove", "enable", "disable"], help="Accion")
    p_allow.add_argument("bins", nargs="*", help="Binarios para add/remove")

    # gateway/bootstrap runtime
    p_gw_boot = sub.add_parser("gateway-bootstrap", help="Preparar runtime OpenClaw para Free JT7")
    p_gw_boot.add_argument("--project", default="", help="Ruta del proyecto objetivo (usa active-project si se omite)")
    p_gw_boot.add_argument("--ide", default="auto", help="IDE para resolver modelo")
    p_gw_boot.add_argument("--profile", default="default", help="Perfil de usuario del IDE")
    p_gw_boot.add_argument("--owner-phone", default="", help="Telefono E.164 permitido por defecto (WhatsApp)")
    p_gw_boot.add_argument("--telegram-bot-token", default="", help="Token Telegram opcional")
    p_gw_boot.add_argument("--appdata-root", default="", help=argparse.SUPPRESS)
    p_gw_boot.add_argument("--force", "-f", action="store_true", help="Sobrescribir config existente")

    p_cred_wizard = sub.add_parser("credentials-wizard", help="Asistente simple para guardar credenciales")
    p_cred_wizard.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_cred_wizard.add_argument("--owner-phone", default="", help="Telefono owner WhatsApp en formato +E164")
    p_cred_wizard.add_argument("--telegram-bot-token", default="", help="Token bot Telegram")
    p_cred_wizard.add_argument("--openai-api-key", default="", help="API key opcional OpenAI")
    p_cred_wizard.add_argument("--anthropic-api-key", default="", help="API key opcional Anthropic")
    p_cred_wizard.add_argument("--gemini-api-key", default="", help="API key opcional Gemini")
    p_cred_wizard.add_argument("--interactive", action="store_true", help="Solicitar datos por consola")

    p_cred_apply = sub.add_parser("credentials-apply", help="Aplicar credenciales al runtime del gateway")
    p_cred_apply.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_cred_apply.add_argument("--owner-phone", default="", help="Telefono owner WhatsApp en formato +E164")
    p_cred_apply.add_argument("--telegram-bot-token", default="", help="Token bot Telegram")
    p_cred_apply.add_argument("--openai-api-key", default="", help="API key opcional OpenAI")
    p_cred_apply.add_argument("--anthropic-api-key", default="", help="API key opcional Anthropic")
    p_cred_apply.add_argument("--gemini-api-key", default="", help="API key opcional Gemini")
    p_cred_apply.add_argument("--interactive", action="store_true", help="Solicitar datos por consola")
    p_cred_apply.add_argument("--ide", default="auto", help="IDE para resolver modelo")
    p_cred_apply.add_argument("--profile", default="default", help="Perfil de usuario del IDE")
    p_cred_apply.add_argument("--appdata-root", default="", help=argparse.SUPPRESS)
    p_cred_apply.add_argument("--force", "-f", action="store_true", help="Sobrescribir config existente")

    p_easy = sub.add_parser("easy-onboard", help="Flujo 1-comando: credenciales + activacion gateway + estado")
    p_easy.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_easy.add_argument("--owner-phone", default="", help="Telefono owner WhatsApp en formato +E164")
    p_easy.add_argument("--telegram-bot-token", default="", help="Token bot Telegram")
    p_easy.add_argument("--openai-api-key", default="", help="API key opcional OpenAI")
    p_easy.add_argument("--anthropic-api-key", default="", help="API key opcional Anthropic")
    p_easy.add_argument("--gemini-api-key", default="", help="API key opcional Gemini")
    p_easy.add_argument("--interactive", action="store_true", help="Solicitar datos por consola")
    p_easy.add_argument("--ide", default="auto", help="IDE para resolver modelo")
    p_easy.add_argument("--profile", default="default", help="Perfil de usuario del IDE")
    p_easy.add_argument("--appdata-root", default="", help=argparse.SUPPRESS)
    p_easy.add_argument("--force", "-f", action="store_true", help="Sobrescribir config existente")
    p_easy.add_argument("--openclaw-repo", default="", help="Ruta repo OpenClaw")
    p_easy.add_argument("--dry-run", action="store_true", help="Solo imprime comandos OpenClaw")
    p_easy.add_argument("--timeout-ms", type=int, default=120000, help="Timeout pasos OpenClaw")
    p_easy.add_argument("--port", type=int, default=18789, help="Puerto gateway")
    p_easy.add_argument("--verbose", action="store_true", help="Iniciar gateway en modo verbose")
    p_easy.add_argument("--skip-start", action="store_true", help="No iniciar gateway")
    p_easy.add_argument("--skip-whatsapp-login", action="store_true", help="No ejecutar login WhatsApp")
    p_easy.add_argument("--strict", action="store_true", help="Fallar si algun paso operativo falla")

    p_gw_exec = sub.add_parser("gateway-exec", help="Ejecutar comando OpenClaw usando config del proyecto")
    p_gw_exec.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_gw_exec.add_argument("--openclaw-repo", default="", help="Ruta repo OpenClaw (si se omite, autodetecta local)")
    p_gw_exec.add_argument("--dry-run", action="store_true", help="Solo imprime comando")
    p_gw_exec.add_argument("--timeout-ms", type=int, default=120000, help="Timeout ejecucion")
    p_gw_exec.add_argument("openclaw_args", nargs=argparse.REMAINDER, help="Argumentos OpenClaw")

    p_gw_start = sub.add_parser("gateway-start", help="Iniciar OpenClaw gateway")
    p_gw_start.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_gw_start.add_argument("--openclaw-repo", default="", help="Ruta repo OpenClaw")
    p_gw_start.add_argument("--dry-run", action="store_true", help="Solo imprime comando")
    p_gw_start.add_argument("--timeout-ms", type=int, default=20000, help="Timeout ejecucion")
    p_gw_start.add_argument("--port", type=int, default=18789, help="Puerto gateway")
    p_gw_start.add_argument("--verbose", action="store_true", help="Modo verbose")

    p_gw_status = sub.add_parser("gateway-status", help="Estado del gateway")
    p_gw_status.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_gw_status.add_argument("--openclaw-repo", default="", help="Ruta repo OpenClaw")
    p_gw_status.add_argument("--dry-run", action="store_true", help="Solo imprime comando")
    p_gw_status.add_argument("--timeout-ms", type=int, default=120000, help="Timeout ejecucion")
    p_gw_status.add_argument("--deep", action="store_true", help="Estado detallado")

    p_ch_status = sub.add_parser("channel-status", help="Estado de canales WhatsApp/Telegram")
    p_ch_status.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_ch_status.add_argument("--openclaw-repo", default="", help="Ruta repo OpenClaw")
    p_ch_status.add_argument("--dry-run", action="store_true", help="Solo imprime comando")
    p_ch_status.add_argument("--timeout-ms", type=int, default=120000, help="Timeout ejecucion")

    p_ch_login = sub.add_parser("channel-login", help="Login de canal (WhatsApp/Telegram)")
    p_ch_login.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_ch_login.add_argument("--openclaw-repo", default="", help="Ruta repo OpenClaw")
    p_ch_login.add_argument("--dry-run", action="store_true", help="Solo imprime comando")
    p_ch_login.add_argument("--timeout-ms", type=int, default=120000, help="Timeout ejecucion")
    p_ch_login.add_argument("--channel", required=True, choices=["whatsapp", "telegram"], help="Canal")
    p_ch_login.add_argument("--account", default="", help="Cuenta opcional")

    p_pair_list = sub.add_parser("pairing-list", help="Listar solicitudes de pairing")
    p_pair_list.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_pair_list.add_argument("--openclaw-repo", default="", help="Ruta repo OpenClaw")
    p_pair_list.add_argument("--dry-run", action="store_true", help="Solo imprime comando")
    p_pair_list.add_argument("--timeout-ms", type=int, default=120000, help="Timeout ejecucion")
    p_pair_list.add_argument("--channel", required=True, choices=["whatsapp", "telegram"], help="Canal")

    p_pair_approve = sub.add_parser("pairing-approve", help="Aprobar pairing de canal")
    p_pair_approve.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_pair_approve.add_argument("--openclaw-repo", default="", help="Ruta repo OpenClaw")
    p_pair_approve.add_argument("--dry-run", action="store_true", help="Solo imprime comando")
    p_pair_approve.add_argument("--timeout-ms", type=int, default=120000, help="Timeout ejecucion")
    p_pair_approve.add_argument("--channel", required=True, choices=["whatsapp", "telegram"], help="Canal")
    p_pair_approve.add_argument("--code", required=True, help="Codigo pairing")

    # plugins (fase 6)
    p_plist = sub.add_parser("plugin-list", help="Listar plugins configurados")
    p_plist.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_plist.add_argument("--json", action="store_true", help="Salida JSON")

    p_penable = sub.add_parser("plugin-enable", help="Habilitar plugin en runtime")
    p_penable.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_penable.add_argument("--id", dest="plugin_id", required=True, help="ID del plugin")
    p_penable.add_argument("--source", default="local", choices=["local", "npm"], help="Origen del plugin")
    p_penable.add_argument("--path", default="", help="Ruta plugin (dir/file) para source=local")
    p_penable.add_argument("--manifest", default="", help="Ruta manifiesto plugin JSON")
    p_penable.add_argument("--package", default="", help="Paquete npm para source=npm")

    p_pdisable = sub.add_parser("plugin-disable", help="Deshabilitar plugin en runtime")
    p_pdisable.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_pdisable.add_argument("--id", dest="plugin_id", required=True, help="ID del plugin")

    p_pvalidate = sub.add_parser("plugin-validate", help="Validar plugins del runtime")
    p_pvalidate.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_pvalidate.add_argument("--id", dest="plugin_id", default="", help="ID plugin opcional")
    p_pvalidate.add_argument("--json", action="store_true", help="Salida JSON")

    # fase 7: smoke e2e + resiliencia
    p_smoke = sub.add_parser("phase7-smoke", help="Smoke E2E de gateway/canales/pairing")
    p_smoke.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_smoke.add_argument("--openclaw-repo", default="", help="Ruta repo OpenClaw")
    p_smoke.add_argument("--timeout-ms", type=int, default=120000, help="Timeout por paso")
    p_smoke.add_argument("--approve-code", default="DEMO-CODE", help="Codigo pairing demo")
    p_smoke.add_argument("--ide", default="auto", help="IDE para resolucion de modelo")
    p_smoke.add_argument("--profile", default="default", help="Perfil de usuario IDE")
    p_smoke.add_argument("--appdata-root", default="", help=argparse.SUPPRESS)
    p_smoke.add_argument("--live", action="store_true", help="Ejecutar real (por defecto dry-run)")

    p_res = sub.add_parser("gateway-resilience", help="Probar resiliencia del gateway")
    p_res.add_argument("--project", default="", help="Ruta del proyecto objetivo")
    p_res.add_argument("--openclaw-repo", default="", help="Ruta repo OpenClaw")
    p_res.add_argument("--attempts", type=int, default=5, help="Cantidad de probes")
    p_res.add_argument("--interval-ms", type=int, default=1000, help="Espera entre probes")
    p_res.add_argument("--timeout-ms", type=int, default=120000, help="Timeout por probe")
    p_res.add_argument("--min-success-ratio", type=float, default=0.8, help="Umbral exito [0..1]")
    p_res.add_argument("--live", action="store_true", help="Ejecutar real (por defecto dry-run)")

    # admin-exec
    p_admin = sub.add_parser("admin-exec", help="Ejecutar comando en PowerShell elevado (RunAs/UAC)")
    p_admin.add_argument("--command", required=True, help="Comando PowerShell a ejecutar como administrador")
    p_admin.add_argument("--wait", action="store_true", help="Esperar finalizacion del proceso elevado")
    p_admin.add_argument("--timeout-ms", type=int, default=600000, help="Timeout de lanzamiento")

    # admin-doctor (1 comando)
    p_admin_doc = sub.add_parser("admin-doctor", help="Diagnostico admin 1-comando (activacion/edicion/OEM)")
    p_admin_doc.add_argument("--reveal-key", action="store_true", help="Mostrar clave OEM completa")
    p_admin_doc.add_argument("--no-elevated", action="store_true", help="Ejecutar sin elevacion")
    p_admin_doc.add_argument("--wait", action="store_true", help="Esperar resultado cuando se lance elevado")
    p_admin_doc.add_argument("--timeout-ms", type=int, default=600000, help="Timeout de lanzamiento/ejecucion")

    # install
    p_inst = sub.add_parser("install", help="Instalar skills (symlinks) en otro proyecto")
    p_inst.add_argument("path", help="Ruta del proyecto destino")
    p_inst.add_argument(
        "--ide",
        default="auto",
        choices=["auto", "all", "vscode", "cursor", "kiro", "antigravity", "codex", "claude-code", "gemini-cli"],
        help="Objetivo IDE para adaptar instalacion",
    )
    p_inst.add_argument(
        "--update-user-settings",
        action="store_true",
        help="Actualizar settings de usuario del IDE objetivo",
    )
    p_inst.add_argument(
        "--user-settings-only",
        action="store_true",
        help="Omitir bootstrap del workspace y actualizar solo settings globales del IDE objetivo",
    )
    p_inst.add_argument("--appdata-root", default="", help=argparse.SUPPRESS)
    p_inst.add_argument("--force", "-f", action="store_true", help="Sobreescribir archivos existentes")

    # add-agent
    p_agent = sub.add_parser("add-agent", help="Crear un agente personalizado")
    p_agent.add_argument("--name", "-n", help="Nombre/ID del agente")
    p_agent.add_argument("--description", "-d", default="", help="DescripciÃ³n breve")
    p_agent.add_argument("--model", "-m", default="claude-sonnet-4-5", help="Modelo base")
    p_agent.add_argument("--tools", "-t", nargs="*", default=["codebase","terminal","search","vscode"], help="Lista de herramientas disponibles")

    args = parser.parse_args()

    if not args.cmd:
        parser.print_help()
        return 0

    dispatch = {
        "list":          cmd_list,
        "search":        cmd_search,
        "activate":      cmd_activate,
        "deactivate":    cmd_deactivate,
        "fetch":         cmd_fetch,
        "add":           cmd_add,
        "github-search": cmd_github_search,
        "sync-claude":   cmd_sync_claude,
        "adapt-copilot": cmd_adapt_copilot,
        "rebuild":       cmd_rebuild,
        "doctor":        cmd_doctor,
        "release-sync":  cmd_release_sync,
        "policy-validate": cmd_policy_validate,
        "rollout-mode":  cmd_rollout_mode,
        "host-mode":     cmd_host_mode,
        "skill-resolve": cmd_skill_resolve,
        "task-start":    cmd_task_start,
        "task-step":     cmd_task_step,
        "task-close":    cmd_task_close,
        "task-list":     cmd_task_list,
        "task-checklist": cmd_task_checklist,
        "task-run":      cmd_task_run,
        "set-project":   cmd_set_project,
        "ide-detect":    cmd_ide_detect,
        "model-profiles-init": cmd_model_profiles_init,
        "model-resolve": cmd_model_resolve,
        "exec-allowlist": cmd_exec_allowlist,
        "gateway-bootstrap": cmd_gateway_bootstrap,
        "credentials-wizard": cmd_credentials_wizard,
        "credentials-apply": cmd_credentials_apply,
        "easy-onboard": cmd_easy_onboard,
        "gateway-exec": cmd_gateway_exec,
        "gateway-start": cmd_gateway_start,
        "gateway-status": cmd_gateway_status,
        "channel-status": cmd_channel_status,
        "channel-login": cmd_channel_login,
        "pairing-list": cmd_pairing_list,
        "pairing-approve": cmd_pairing_approve,
        "plugin-list": cmd_plugin_list,
        "plugin-enable": cmd_plugin_enable,
        "plugin-disable": cmd_plugin_disable,
        "plugin-validate": cmd_plugin_validate,
        "phase7-smoke": cmd_phase7_smoke,
        "gateway-resilience": cmd_gateway_resilience,
        "admin-exec":   cmd_admin_exec,
        "admin-doctor": cmd_admin_doctor,
        "install":       cmd_install,
        "add-agent":    cmd_add_agent,
    }

    fn = dispatch.get(args.cmd)
    if fn is None:
        print(f"Comando desconocido: {args.cmd}")
        return 1

    return fn(args)


if __name__ == "__main__":
    sys.exit(main())
