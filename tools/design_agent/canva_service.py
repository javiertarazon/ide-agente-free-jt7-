from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import canva_mcp.auth as canva_auth_module
from canva_mcp.auth import CanvaAuth
from canva_mcp.client import CanvaClient, DesignType, ExportFormat

from .config import CanvaSettings


CANVA_MCP_AUTH_URL = "https://mcp.canva.com/authorize"
CANVA_MCP_TOKEN_URL = "https://mcp.canva.com/token"


@dataclass
class CanvaArtifacts:
    authenticated: bool = False
    folder_id: str | None = None
    asset_id: str | None = None
    design_id: str | None = None
    export_path: Path | None = None
    warnings: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


def _extract_id(payload: Any, preferred_keys: tuple[str, ...] = ("design", "asset", "folder", "job")) -> str | None:
    if isinstance(payload, dict):
        for key in preferred_keys:
            nested = payload.get(key)
            if isinstance(nested, dict) and nested.get("id"):
                return str(nested["id"])
        if payload.get("id"):
            return str(payload["id"])
        for value in payload.values():
            found = _extract_id(value, preferred_keys)
            if found:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = _extract_id(item, preferred_keys)
            if found:
                return found
    return None


def _extract_first_url(payload: Any) -> str | None:
    if isinstance(payload, dict):
        for key in ("url", "download_url"):
            value = payload.get(key)
            if isinstance(value, str) and value.startswith("http"):
                return value
        for value in payload.values():
            found = _extract_first_url(value)
            if found:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = _extract_first_url(item)
            if found:
                return found
    return None


class CanvaService:
    def __init__(self, settings: CanvaSettings):
        self.settings = settings

    def _build_auth(self) -> CanvaAuth:
        canva_auth_module.CANVA_AUTH_URL = CANVA_MCP_AUTH_URL
        canva_auth_module.CANVA_TOKEN_URL = CANVA_MCP_TOKEN_URL
        return CanvaAuth(
            client_id=self.settings.client_id,
            client_secret=self.settings.client_secret,
            redirect_uri=self.settings.redirect_uri,
            token_file=self.settings.token_file,
            scopes=self.settings.scopes,
        )

    def authenticate(self, interactive: bool = False) -> CanvaAuth:
        auth = self._build_auth()
        if auth.is_token_valid():
            return auth
        if interactive and self.settings.is_configured:
            auth.authenticate_interactive(port=8765)
            return auth
        raise ValueError("No hay token válido de Canva. Ejecuta auth-canva o configura las credenciales primero.")

    def create_design_artifacts(
        self,
        title: str,
        run_dir: Path,
        source_file: Path | None = None,
        interactive_auth: bool = False,
    ) -> CanvaArtifacts:
        artifacts = CanvaArtifacts()
        if not self.settings.is_configured:
            artifacts.warnings.append(
                "Canva quedó en modo omitido: faltan CANVA_CLIENT_ID/CANVA_CLIENT_SECRET para autenticar contra Canva Developer App."
            )
            return artifacts

        try:
            auth = self.authenticate(interactive=interactive_auth)
            artifacts.authenticated = True
        except Exception as error:
            artifacts.warnings.append(str(error))
            return artifacts

        with CanvaClient(auth) as client:
            folder = client.create_folder(title)
            artifacts.raw["folder"] = folder
            artifacts.folder_id = _extract_id(folder, ("folder",))

            if source_file:
                uploaded = client.upload_asset(file_path=str(source_file), name=source_file.name)
                artifacts.raw["asset"] = uploaded
                artifacts.asset_id = _extract_id(uploaded, ("asset", "job"))

            try:
                design = client.create_design(
                    DesignType.PRESENTATION,
                    title=title,
                    asset_id=artifacts.asset_id,
                )
            except Exception as error:
                artifacts.warnings.append(
                    f"Canva creó el proyecto sin asset inicial: {error}"
                )
                design = client.create_design(DesignType.PRESENTATION, title=title)

            artifacts.raw["design"] = design
            artifacts.design_id = _extract_id(design, ("design",))

            if artifacts.design_id:
                try:
                    export_job = client.export_design(artifacts.design_id, format=ExportFormat.PNG)
                    artifacts.raw["export_job"] = export_job
                    export_url = _extract_first_url(export_job)
                    if export_url:
                        export_path = run_dir / "canva-export.png"
                        client.download_export(export_url, str(export_path))
                        artifacts.export_path = export_path
                    else:
                        artifacts.warnings.append("Canva completó el export, pero no devolvió una URL de descarga reconocible.")
                except Exception as error:
                    artifacts.warnings.append(f"No se pudo exportar el diseño Canva a PNG: {error}")

        return artifacts
