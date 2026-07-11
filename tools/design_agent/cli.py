from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .canva_service import CanvaService
from .config import create_run_dir, load_canva_settings, resolve_runtime_paths
from .pipeline import (
    build_render_payload,
    copy_assets_to_remotion_public,
    ensure_remotion_dependencies,
    postprocess_with_mcp_video,
    render_remotion_video,
    split_supported_assets,
    write_generated_props,
)
from .storyboard import generate_storyboard


def _print_json(payload: dict, pretty: bool = True) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2 if pretty else None))
    sys.stdout.write("\n")


def cmd_doctor(args: argparse.Namespace) -> int:
    settings = load_canva_settings(strict=False)
    paths = resolve_runtime_paths()
    payload = {
        "ok": True,
        "canvaConfigured": settings.is_configured,
        "canvaTokenFile": str(settings.token_file),
        "canvaTokenPresent": settings.token_file.exists(),
        "providerBridge": str(paths.provider_bridge),
        "remotionProject": str(paths.remotion_project_dir),
        "remotionNodeModules": (paths.remotion_project_dir / "node_modules").exists(),
    }
    _print_json(payload, pretty=args.json)
    return 0


def cmd_auth_canva(args: argparse.Namespace) -> int:
    settings = load_canva_settings(strict=True)
    service = CanvaService(settings)
    auth = service.authenticate(interactive=True)
    payload = {
        "ok": True,
        "tokenFile": str(settings.token_file),
        "tokenValid": auth.is_token_valid(),
    }
    _print_json(payload, pretty=args.json)
    return 0


def cmd_generate_video(args: argparse.Namespace) -> int:
    workspace_root = Path(args.workspace_root).resolve()
    paths = resolve_runtime_paths()
    run_dir = create_run_dir(args.output_name)
    warnings: list[str] = []

    storyboard, storyboard_meta = generate_storyboard(
        prompt=args.prompt,
        provider=args.provider,
        model=args.model or "",
        workspace_root=workspace_root,
        bridge_path=paths.provider_bridge,
    )
    if storyboard_meta.get("error"):
        warnings.append(f"Provider storyboard fallback: {storyboard_meta['error']}")

    settings = load_canva_settings(strict=False)
    canva_result = CanvaService(settings).create_design_artifacts(
        title=args.output_name,
        run_dir=run_dir,
        source_file=Path(args.source_file).resolve() if args.source_file else None,
        interactive_auth=args.interactive_canva_auth,
    )
    warnings.extend(canva_result.warnings)

    source_visuals, source_audio = split_supported_assets(
        Path(args.source_file).resolve() if args.source_file else None
    )

    public_visuals = copy_assets_to_remotion_public(
        run_dir.name,
        [asset for asset in source_visuals if asset.exists()],
    )
    public_audio_assets = copy_assets_to_remotion_public(
        run_dir.name,
        [source_audio] if source_audio else [],
    )
    public_canva_export = None
    if canva_result.export_path:
        copied = copy_assets_to_remotion_public(run_dir.name, [canva_result.export_path])
        public_canva_export = copied[0] if copied else None

    payload = build_render_payload(
        storyboard=storyboard,
        output_name=args.output_name,
        remotion_public_assets=public_visuals,
        canva_export_asset=public_canva_export,
        audio_asset=public_audio_assets[0] if public_audio_assets else None,
    )
    write_generated_props(paths, payload)
    ensure_remotion_dependencies(paths)

    raw_video = render_remotion_video(paths, run_dir / f"{args.output_name}-raw.mp4")
    final_video = postprocess_with_mcp_video(raw_video, run_dir / f"{args.output_name}-final.mp4", storyboard["title"])

    response = {
        "ok": True,
        "runDir": str(run_dir),
        "rawVideo": str(raw_video),
        "finalVideo": str(final_video),
        "storyboard": storyboard,
        "storyboardMeta": storyboard_meta,
        "canva": {
            "authenticated": canva_result.authenticated,
            "folderId": canva_result.folder_id,
            "assetId": canva_result.asset_id,
            "designId": canva_result.design_id,
            "exportPath": str(canva_result.export_path) if canva_result.export_path else None,
        },
        "warnings": warnings,
    }
    _print_json(response, pretty=args.json)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Free JT7 design agent CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor = subparsers.add_parser("doctor", help="Diagnóstico rápido del agente de diseño")
    doctor.add_argument("--json", action="store_true")
    doctor.set_defaults(func=cmd_doctor)

    auth = subparsers.add_parser("auth-canva", help="Autenticar Canva vía OAuth PKCE")
    auth.add_argument("--json", action="store_true")
    auth.set_defaults(func=cmd_auth_canva)

    generate = subparsers.add_parser("generate-video", help="Generar video con Canva, Remotion y mcp-video")
    generate.add_argument("--workspace-root", required=True)
    generate.add_argument("--prompt", required=True)
    generate.add_argument("--output-name", required=True)
    generate.add_argument("--provider", default="copilot")
    generate.add_argument("--model", default="")
    generate.add_argument("--source-file", default="")
    generate.add_argument("--interactive-canva-auth", action="store_true")
    generate.add_argument("--json", action="store_true")
    generate.set_defaults(func=cmd_generate_video)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return int(args.func(args))
    except Exception as error:
        if getattr(args, "json", False):
            _print_json({"ok": False, "error": str(error)})
        else:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
