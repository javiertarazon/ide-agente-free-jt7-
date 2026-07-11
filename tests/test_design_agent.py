from pathlib import Path

import canva_mcp.auth as canva_auth_module

from tools.design_agent import config as design_config
from tools.design_agent.canva_service import CANVA_MCP_AUTH_URL, CANVA_MCP_TOKEN_URL, CanvaService
from tools.design_agent.pipeline import build_render_payload
from tools.design_agent.storyboard import heuristic_storyboard


def test_load_canva_settings_from_environment(monkeypatch, tmp_path):
    token_file = tmp_path / "canva_tokens.json"
    monkeypatch.setenv("CANVA_CLIENT_ID", "client-123")
    monkeypatch.setenv("CANVA_CLIENT_SECRET", "secret-456")
    monkeypatch.setenv("CANVA_REDIRECT_URI", "http://localhost:8765/callback")
    monkeypatch.setenv("CANVA_TOKEN_FILE", str(token_file))

    settings = design_config.load_canva_settings(strict=True)

    assert settings.client_id == "client-123"
    assert settings.client_secret == "secret-456"
    assert settings.redirect_uri == "http://localhost:8765/callback"
    assert settings.token_file == token_file


def test_load_canva_settings_from_env_file(monkeypatch, tmp_path):
    env_file = tmp_path / ".env.free-jt7"
    token_file = tmp_path / "file-canva-tokens.json"
    env_file.write_text(
        "\n".join(
            [
                "CANVA_CLIENT_ID=file-client",
                "CANVA_CLIENT_SECRET=file-secret",
                "CANVA_REDIRECT_URI=http://localhost:9988/callback",
                f"CANVA_TOKEN_FILE={token_file}",
            ]
        ),
        encoding="utf-8",
    )

    for key in design_config.CANVA_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(design_config, "repo_root", lambda: tmp_path)

    settings = design_config.load_canva_settings(strict=True)

    assert settings.client_id == "file-client"
    assert settings.client_secret == "file-secret"
    assert settings.redirect_uri == "http://localhost:9988/callback"
    assert settings.token_file == token_file


def test_canva_service_forces_mcp_oauth_endpoints(monkeypatch, tmp_path):
    monkeypatch.setattr(canva_auth_module, "CANVA_AUTH_URL", "https://www.canva.com/api/oauth/authorize")
    monkeypatch.setattr(canva_auth_module, "CANVA_TOKEN_URL", "https://www.canva.com/api/oauth/token")
    settings = design_config.CanvaSettings(
        client_id="client-123",
        client_secret="secret-456",
        redirect_uri="http://localhost:8765/callback",
        token_file=tmp_path / "canva_tokens.json",
    )

    auth = CanvaService(settings)._build_auth()

    assert canva_auth_module.CANVA_AUTH_URL == CANVA_MCP_AUTH_URL
    assert canva_auth_module.CANVA_TOKEN_URL == CANVA_MCP_TOKEN_URL
    assert auth.get_authorization_url().startswith(f"{CANVA_MCP_AUTH_URL}?")


def test_heuristic_storyboard_returns_three_coherent_scenes():
    storyboard = heuristic_storyboard("Crear un video de lanzamiento para Free JT7")

    assert storyboard["title"]
    assert storyboard["duration_sec"] >= 9
    assert len(storyboard["scenes"]) == 3
    assert storyboard["scenes"][0]["headline"]
    assert storyboard["scenes"][1]["body"]
    assert storyboard["call_to_action"]


def test_build_render_payload_uses_canva_export_as_primary_visual(tmp_path):
    paths = design_config.resolve_runtime_paths()
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    canva_export = Path("generated/run-1/canva-export.png")
    asset_image = Path("generated/run-1/supporting.png")
    storyboard = {
        "title": "Free JT7 Demo",
        "subtitle": "Automatización con Canva y video",
        "duration_sec": 12,
        "call_to_action": "Prueba el flujo completo",
        "scenes": [
            {
                "headline": "Escena 1",
                "body": "Intro",
                "duration_sec": 4,
                "background": "#101820",
                "bullets": ["uno", "dos"],
            },
            {
                "headline": "Escena 2",
                "body": "Detalle",
                "duration_sec": 4,
                "background": "#203040",
                "bullets": [],
            },
            {
                "headline": "Escena 3",
                "body": "Cierre",
                "duration_sec": 4,
                "background": "#304050",
                "bullets": [],
            },
        ],
    }

    payload = build_render_payload(
        storyboard=storyboard,
        output_name="demo-video",
        remotion_public_assets=[asset_image],
        canva_export_asset=canva_export,
        audio_asset=None,
    )

    assert payload["title"] == "Free JT7 Demo"
    assert payload["compositionId"] == "FreeJT7DesignVideo"
    assert payload["scenes"][0]["imagePath"] == canva_export.as_posix()
    assert payload["scenes"][1]["imagePath"] == asset_image.as_posix()
    assert payload["outputName"] == "demo-video"
    assert payload["durationInFrames"] == 360
    assert payload["fps"] == paths.default_fps