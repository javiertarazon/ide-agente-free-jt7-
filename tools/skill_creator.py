#!/usr/bin/env python3
"""
skill_creator.py — CLI para crear y activar skills en Free JT7 / OpenClaw.

Modos de entrada:
  --from-url URL        Descarga el SKILL.md desde una URL
  --from-repo OWNER/REPO  Busca SKILL.md en un repositorio de GitHub
  --from-prompt TEXTO   Genera el SKILL.md usando el modelo local

Opciones comunes:
  --name ID             Nombre/ID del skill (directorio en .github/skills/)
  --output DIR          Directorio destino (default: .github/skills/<name>/)
  --activate            Activa el skill en skills_manager.py tras crearlo
  --dry-run             Muestra lo que se haría sin escribir nada

Ejemplos:
  python tools/skill_creator.py --from-url https://raw.githubusercontent.com/owner/repo/main/SKILL.md --name mi-skill --activate
  python tools/skill_creator.py --from-repo anthropics/skill-library --name rag-engineer --activate
  python tools/skill_creator.py --from-prompt "Crea un skill de análisis de riesgo para trading" --name risk-analyst --activate
"""

import argparse
import json
import os
import subprocess
import sys
import textwrap
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

WORKSPACE_ROOT = Path(__file__).parent.parent
SKILLS_DIR = WORKSPACE_ROOT / ".github" / "skills"
SKILLS_MANAGER = WORKSPACE_ROOT / "skills_manager.py"
GITHUB_API_BASE = "https://api.github.com"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _github_token() -> str | None:
    for var in ("GH_TOKEN", "GITHUB_TOKEN"):
        if os.environ.get(var):
            return os.environ[var]
    try:
        result = subprocess.run(
            ["gh", "auth", "token"], capture_output=True, text=True, check=True
        )
        token = result.stdout.strip()
        return token if token else None
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None


def _http_get(url: str, headers: dict | None = None) -> bytes:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def _ensure_skills_dir(name: str, output: str | None = None) -> Path:
    if output:
        target = Path(output)
    else:
        target = SKILLS_DIR / name
    target.mkdir(parents=True, exist_ok=True)
    return target


# ---------------------------------------------------------------------------
# Fuentes de contenido
# ---------------------------------------------------------------------------


def fetch_from_url(url: str) -> str:
    print(f"[skill_creator] Descargando desde URL: {url}")
    data = _http_get(url)
    return data.decode("utf-8")


def fetch_from_repo(repo: str, name: str) -> str:
    """
    Busca SKILL.md en el repositorio de GitHub.
    Rutas intentadas (en orden):
      1. .github/skills/<name>/SKILL.md
      2. SKILL.md (raíz)
      3. skills/<name>/SKILL.md
    """
    token = _github_token()
    headers = {"Accept": "application/vnd.github.v3.raw"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    candidates = [
        f"https://raw.githubusercontent.com/{repo}/main/.github/skills/{name}/SKILL.md",
        f"https://raw.githubusercontent.com/{repo}/main/SKILL.md",
        f"https://raw.githubusercontent.com/{repo}/main/skills/{name}/SKILL.md",
        f"https://raw.githubusercontent.com/{repo}/master/.github/skills/{name}/SKILL.md",
        f"https://raw.githubusercontent.com/{repo}/master/SKILL.md",
    ]

    for url in candidates:
        print(f"[skill_creator] Probando: {url}")
        try:
            data = _http_get(url, headers=headers)
            print(f"[skill_creator] Encontrado en: {url}")
            return data.decode("utf-8")
        except Exception:
            continue

    raise FileNotFoundError(
        f"No se encontró SKILL.md en ninguna ruta del repositorio '{repo}' para el skill '{name}'."
    )


def generate_from_prompt(prompt: str, name: str) -> str:
    """
    Genera el contenido de un SKILL.md a partir de un prompt.
    Intenta usar el proxy local de GitHub Models; si no está disponible,
    construye un template básico.
    """
    print(f"[skill_creator] Generando skill '{name}' desde prompt...")

    # Intentar el proxy local
    try:
        import urllib.request as _ur
        import json as _json

        payload = _json.dumps(
            {
                "model": "gpt-4o",
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Eres un experto en diseño de skills para agentes de IA. "
                            "Genera un archivo SKILL.md completo y profesional en Markdown. "
                            "El SKILL.md debe incluir: descripción, cuándo usar el skill, "
                            "metodología, ejemplos de uso, y mejores prácticas. "
                            "Responde SOLO con el contenido Markdown, sin bloques de código externos."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Crea un SKILL.md para el skill llamado '{name}'. Descripción: {prompt}",
                    },
                ],
                "max_tokens": 2000,
            }
        ).encode()

        req = _ur.Request(
            "http://127.0.0.1:8787/v1/chat/completions",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with _ur.urlopen(req, timeout=15) as resp:
            result = _json.loads(resp.read())
            content = result["choices"][0]["message"]["content"]
            print("[skill_creator] Generado con éxito via proxy local.")
            return content
    except Exception as e:
        print(f"[skill_creator] Proxy local no disponible ({e}). Usando template básico.")

    # Fallback: template básico
    return textwrap.dedent(f"""\
        # {name}

        ## Descripción
        {prompt}

        ## Cuándo usar este skill
        - Cuando necesites capacidades relacionadas con: {prompt}

        ## Metodología
        1. Analiza el contexto y los requisitos.
        2. Aplica las mejores prácticas del dominio.
        3. Valida el resultado antes de entregar.

        ## Ejemplos de uso
        ```
        # Ejemplo básico de uso del skill {name}
        # Adaptar según el contexto del proyecto
        ```

        ## Mejores prácticas
        - Mantén el skill actualizado con el estado del arte.
        - Documenta casos de uso específicos a medida que se descubran.
        - Combina con otros skills cuando la tarea lo requiera.

        ## Referencias
        - Generado automáticamente por `tools/skill_creator.py`
        - Actualiza este archivo con referencias reales al dominio.
    """)


# ---------------------------------------------------------------------------
# Activación del skill
# ---------------------------------------------------------------------------


def activate_skill(name: str) -> bool:
    if not SKILLS_MANAGER.exists():
        print(f"[skill_creator] ADVERTENCIA: {SKILLS_MANAGER} no encontrado. Skill no activado.")
        return False
    try:
        result = subprocess.run(
            [sys.executable, str(SKILLS_MANAGER), "activate", name],
            capture_output=True,
            text=True,
            cwd=str(WORKSPACE_ROOT),
        )
        if result.returncode == 0:
            print(f"[skill_creator] Skill '{name}' activado correctamente.")
            return True
        else:
            print(f"[skill_creator] Error al activar skill: {result.stderr.strip()}")
            return False
    except Exception as e:
        print(f"[skill_creator] Fallo al ejecutar skills_manager.py: {e}")
        return False


# ---------------------------------------------------------------------------
# Comando principal
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Crea y activa skills para Free JT7 / OpenClaw",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--from-url", metavar="URL", help="URL directa al SKILL.md")
    source.add_argument(
        "--from-repo",
        metavar="OWNER/REPO",
        help="Repositorio de GitHub (busca SKILL.md automáticamente)",
    )
    source.add_argument(
        "--from-prompt",
        metavar="TEXTO",
        help="Genera el SKILL.md usando el modelo de lenguaje",
    )

    parser.add_argument("--name", required=True, help="ID/nombre del skill")
    parser.add_argument(
        "--output",
        default=None,
        help="Directorio destino (default: .github/skills/<name>/)",
    )
    parser.add_argument(
        "--activate",
        action="store_true",
        help="Activa el skill con skills_manager.py tras crearlo",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Muestra lo que se haría sin escribir archivos",
    )

    args = parser.parse_args()

    # 1. Obtener contenido
    try:
        if args.from_url:
            content = fetch_from_url(args.from_url)
        elif args.from_repo:
            content = fetch_from_repo(args.from_repo, args.name)
        else:
            content = generate_from_prompt(args.from_prompt, args.name)
    except Exception as e:
        print(f"[skill_creator] ERROR obteniendo contenido: {e}", file=sys.stderr)
        sys.exit(1)

    # 2. Determinar ruta destino
    target_dir = _ensure_skills_dir(args.name, args.output) if not args.dry_run else None
    skill_file = (target_dir / "SKILL.md") if target_dir else Path(f"[dry-run] .github/skills/{args.name}/SKILL.md")

    # 3. Escribir o simular
    if args.dry_run:
        print(f"\n[dry-run] Se escribiría en: {skill_file}")
        print(f"[dry-run] Contenido ({len(content)} chars):")
        print("-" * 60)
        print(content[:500] + ("..." if len(content) > 500 else ""))
        print("-" * 60)
        if args.activate:
            print(f"[dry-run] Se activaría el skill '{args.name}' con skills_manager.py")
        return

    skill_file.write_text(content, encoding="utf-8")
    print(f"[skill_creator] SKILL.md escrito en: {skill_file}")

    # 4. Activar si se solicitó
    if args.activate:
        activate_skill(args.name)

    print(f"[skill_creator] Skill '{args.name}' creado exitosamente.")


if __name__ == "__main__":
    main()
