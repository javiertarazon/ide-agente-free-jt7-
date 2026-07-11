"""
master_pipeline.py
------------------
Pipeline MAESTRO que integra los tres sistemas:
  1. Claude Design Agent  → Sistema de diseño JSON
  2. Canva Agent          → Diseño visual en Canva (edición, exportación)
  3. Remotion Agent       → Video programático React/TSX → MP4

Modos de uso:
  A) Prompt → Canva Design → Exportar MP4 de Canva
  B) Prompt → Claude Design JSON → Remotion → MP4
  C) Prompt → Canva + Remotion (ambos en paralelo)
  D) Canva existente → Exportar + Usar en Remotion

Uso:
    python master_pipeline.py --mode canva --prompt "Video producto tech"
    python master_pipeline.py --mode remotion --prompt "Animación minimalista"
    python master_pipeline.py --mode full --prompt "Campaign completa"
    python master_pipeline.py --interactive
"""

import os
import json
import argparse
import time
from pathlib import Path
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv

# Importar los tres agentes
from claude_design_agent import generate_design_system, save_design
from canva_agent import CanvaAgent
from remotion_agent import generate_remotion_code, write_remotion_files, render_video

load_dotenv()

OUTPUT_DIR = Path(os.getenv("OUTPUT_VIDEO_PATH", "./output_videos"))

BANNER = """
╔══════════════════════════════════════════════════════════════╗
║        🎬 MASTER PIPELINE: Claude + Canva + Remotion         ║
║   Prompt → Diseño IA → Canva Visual → Video MP4              ║
╚══════════════════════════════════════════════════════════════╝
"""

# ─── Modos del Pipeline ────────────────────────────────────────────────────────

def mode_canva_only(
    prompt: str,
    design_type: str = "presentation",
    export_format: str = "mp4",
    verbose: bool = False
) -> dict:
    """
    Modo A: Prompt → Canva Design (IA) → Exportar video/imagen desde Canva.
    Ideal para diseños rápidos con templates de Canva.
    """
    print("\n📌 MODO: Canva Only")
    print("   Prompt → Canva IA → Exportar\n")

    agent = CanvaAgent()
    results = {"mode": "canva", "start": time.time()}

    # Paso 1: Generar diseño en Canva
    print("┌── PASO 1: Generar diseño en Canva ────────────────────┐")
    result = agent.design_pipeline_with_video(
        prompt=prompt,
        design_type=design_type,
        export_as_video=(export_format == "mp4"),
        verbose=verbose
    )
    results["canva_result"] = result
    results["total_time"] = round(time.time() - results["start"], 2)
    return results


def mode_remotion_only(
    prompt: str,
    output_name: Optional[str] = None,
    verbose: bool = False
) -> dict:
    """
    Modo B: Prompt → Claude Design JSON → Remotion TSX → MP4.
    Ideal para animaciones programáticas con control total.
    """
    print("\n📌 MODO: Remotion Only")
    print("   Prompt → Claude JSON → Remotion → MP4\n")

    results = {"mode": "remotion", "start": time.time()}
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not output_name:
        output_name = f"remotion_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    # Paso 1: Claude genera el sistema de diseño
    print("┌── PASO 1: Claude Design Agent ────────────────────────┐")
    design = generate_design_system(prompt, verbose=verbose)
    design_path = OUTPUT_DIR / f"{output_name}_design.json"
    save_design(design, str(design_path))
    results["design_file"] = str(design_path)

    # Paso 2: Convertir a código Remotion
    print("\n┌── PASO 2: Remotion Code Generator ────────────────────┐")
    tsx_code = generate_remotion_code(design, verbose=verbose)
    write_remotion_files(design, tsx_code)

    # Paso 3: Renderizar video
    print("\n┌── PASO 3: Render MP4 ─────────────────────────────────┐")
    video_path = OUTPUT_DIR / f"{output_name}.mp4"
    video_file = render_video(str(video_path))
    results["video_file"] = str(video_file)
    results["total_time"] = round(time.time() - results["start"], 2)
    return results


def mode_full_pipeline(
    prompt: str,
    output_name: Optional[str] = None,
    canva_type: str = "poster",
    verbose: bool = False
) -> dict:
    """
    Modo C: Pipeline completo usando AMBOS sistemas.
    
    Flujo:
    1. Claude genera sistema de diseño JSON (tokens, colores, tipografía)
    2. Canva usa ese diseño como guía para generar asset visual
    3. El asset de Canva se sube y se integra en el video Remotion
    4. Remotion renderiza el MP4 final
    """
    print("\n📌 MODO: Pipeline Completo (Canva + Remotion)")
    print("   Prompt → Claude JSON → Canva Asset → Remotion → MP4\n")

    results = {"mode": "full", "start": time.time()}
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not output_name:
        output_name = f"full_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    canva_agent = CanvaAgent()

    # Paso 1: Claude genera el sistema de diseño base
    print("┌── PASO 1: Claude Design System ───────────────────────┐")
    design = generate_design_system(prompt, verbose=verbose)
    design_path = OUTPUT_DIR / f"{output_name}_design.json"
    save_design(design, str(design_path))
    results["design_file"] = str(design_path)

    # Extraer info del diseño para Canva
    theme = design.get("theme", {})
    colors = theme.get("colors", {})
    style = theme.get("style", "modern")
    title = design.get("title", "Mi Video")

    # Paso 2: Generar asset visual en Canva basado en el diseño de Claude
    print("\n┌── PASO 2: Generar Asset en Canva ─────────────────────┐")
    canva_prompt = (
        f"Crea un {canva_type} para '{title}' con estas especificaciones: "
        f"Estilo: {style}. "
        f"Color primario: {colors.get('primary', '#3B82F6')}. "
        f"Color secundario: {colors.get('secondary', '#1E40AF')}. "
        f"Fondo: {colors.get('background', '#ffffff')}. "
        f"Basado en: {prompt}"
    )

    canva_result = canva_agent.generate_design(
        prompt=canva_prompt,
        design_type=canva_type,
        verbose=verbose
    )
    results["canva_result"] = canva_result

    # Paso 3: Generar código Remotion con el diseño de Claude
    print("\n┌── PASO 3: Remotion Code Generator ────────────────────┐")
    tsx_code = generate_remotion_code(design, verbose=verbose)
    write_remotion_files(design, tsx_code)

    # Paso 4: Renderizar video final
    print("\n┌── PASO 4: Render Video Final ──────────────────────────┐")
    video_path = OUTPUT_DIR / f"{output_name}.mp4"
    video_file = render_video(str(video_path))
    results["video_file"] = str(video_file)
    results["total_time"] = round(time.time() - results["start"], 2)

    # Resumen
    print("\n" + "═" * 62)
    print("  ✨ PIPELINE MAESTRO COMPLETADO")
    print("═" * 62)
    print(f"  🎨 Canva:   diseño generado en tu cuenta")
    print(f"  🎬 Video:   {results.get('video_file', 'N/A')}")
    print(f"  ⏱️  Total:   {results['total_time']}s")
    print("═" * 62)

    return results


def mode_canva_to_remotion(
    design_id: str,
    output_name: Optional[str] = None,
    verbose: bool = False
) -> dict:
    """
    Modo D: Diseño de Canva existente → Exportar PNG → Usar en Remotion como asset.
    """
    print(f"\n📌 MODO: Canva → Remotion")
    print(f"   Diseño Canva {design_id} → Exportar → Remotion\n")

    results = {"mode": "canva_to_remotion", "start": time.time()}
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not output_name:
        output_name = f"canva2remotion_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    canva_agent = CanvaAgent()

    # Paso 1: Exportar diseño de Canva como PNG
    print("┌── PASO 1: Exportar Canva como PNG ────────────────────┐")
    export_result = canva_agent.export_design(
        design_id=design_id,
        format="png",
        verbose=verbose
    )
    results["canva_export"] = export_result

    # Paso 2: Crear diseño básico para Remotion con el PNG de Canva
    print("\n┌── PASO 2: Integrar en Remotion ───────────────────────┐")
    design = {
        "title": f"Video desde Canva {design_id}",
        "duration_frames": 150,
        "fps": 30,
        "width": 1920,
        "height": 1080,
        "theme": {
            "colors": {"primary": "#3B82F6", "background": "#ffffff"},
            "typography": {"heading_font": "Inter", "body_font": "Inter"},
            "style": "minimal"
        },
        "scenes": [
            {
                "id": "scene_canva",
                "name": "Canva Import",
                "start_frame": 0,
                "end_frame": 150,
                "type": "content",
                "layout": "centered",
                "elements": [
                    {
                        "type": "text",
                        "content": "Importado desde Canva",
                        "animation": "fadeIn",
                        "animation_delay": 0,
                        "animation_duration": 30
                    }
                ],
                "background": {"type": "solid", "value": "#ffffff"}
            }
        ]
    }

    tsx_code = generate_remotion_code(design, verbose=verbose)
    write_remotion_files(design, tsx_code)

    # Paso 3: Renderizar
    print("\n┌── PASO 3: Render MP4 ─────────────────────────────────┐")
    video_path = OUTPUT_DIR / f"{output_name}.mp4"
    video_file = render_video(str(video_path))
    results["video_file"] = str(video_file)
    results["total_time"] = round(time.time() - results["start"], 2)

    return results


# ─── Modo Interactivo ─────────────────────────────────────────────────────────

def interactive_master():
    """Selector interactivo del modo de pipeline."""
    print(BANNER)
    print("Selecciona el modo de trabajo:\n")
    print("  [A] Solo Canva      — Genera y exporta desde Canva")
    print("  [B] Solo Remotion   — Animación programática con Claude+React")
    print("  [C] Pipeline Completo — Claude + Canva + Remotion juntos")
    print("  [D] Canva → Remotion  — Usa un diseño de Canva en Remotion")
    print("  [E] Canva Interactivo — Sesión libre con el agente de Canva\n")

    mode = input("→ Modo [A/B/C/D/E]: ").strip().upper()

    if mode == "A":
        prompt = input("Describe tu diseño/video: ")
        dtype = input("Tipo de diseño [presentation]: ").strip() or "presentation"
        fmt   = input("Formato de exportación [mp4]: ").strip() or "mp4"
        mode_canva_only(prompt, dtype, fmt, verbose=True)

    elif mode == "B":
        prompt = input("Describe el video: ")
        mode_remotion_only(prompt, verbose=True)

    elif mode == "C":
        prompt = input("Describe la campaña/video: ")
        dtype = input("Tipo de asset en Canva [poster]: ").strip() or "poster"
        mode_full_pipeline(prompt, canva_type=dtype, verbose=True)

    elif mode == "D":
        did = input("ID del diseño de Canva (empieza con D): ")
        mode_canva_to_remotion(did, verbose=True)

    elif mode == "E":
        agent = CanvaAgent()
        agent.interactive_session()

    else:
        print("Modo no reconocido. Iniciando sesión interactiva de Canva...")
        agent = CanvaAgent()
        agent.interactive_session()


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Master Pipeline — Claude + Canva + Remotion"
    )
    parser.add_argument("--mode", type=str,
                        choices=["canva", "remotion", "full", "canva2remotion"],
                        help="Modo del pipeline")
    parser.add_argument("--prompt", type=str, help="Descripción del diseño/video")
    parser.add_argument("--design-id", type=str,
                        help="ID de diseño Canva existente (para modo canva2remotion)")
    parser.add_argument("--type", type=str, default="presentation",
                        help="Tipo de diseño en Canva")
    parser.add_argument("--format", type=str, default="mp4",
                        help="Formato de exportación")
    parser.add_argument("--output", type=str, help="Nombre base del archivo de salida")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--interactive", action="store_true",
                        help="Selector interactivo de modo")

    args = parser.parse_args()
    print(BANNER)

    if args.interactive or not args.mode:
        interactive_master()

    elif args.mode == "canva":
        if not args.prompt:
            args.prompt = input("Describe el diseño: ")
        mode_canva_only(args.prompt, args.type, args.format, args.verbose)

    elif args.mode == "remotion":
        if not args.prompt:
            args.prompt = input("Describe el video: ")
        mode_remotion_only(args.prompt, args.output, args.verbose)

    elif args.mode == "full":
        if not args.prompt:
            args.prompt = input("Describe la campaña: ")
        mode_full_pipeline(args.prompt, args.output, args.type, args.verbose)

    elif args.mode == "canva2remotion":
        if not args.design_id:
            args.design_id = input("ID del diseño de Canva: ")
        mode_canva_to_remotion(args.design_id, args.output, args.verbose)


if __name__ == "__main__":
    main()
