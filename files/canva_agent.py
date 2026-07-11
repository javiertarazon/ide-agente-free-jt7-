"""
canva_agent.py
--------------
Agente que conecta con Canva vía Anthropic API + MCP Server.
Permite generar, editar, exportar y gestionar diseños en Canva
directamente desde VS Code usando Claude como orquestador.

Uso:
    python canva_agent.py --action generate --prompt "Poster tech moderno"
    python canva_agent.py --action edit --design-id DABCxyz1234
    python canva_agent.py --action export --design-id DABCxyz1234 --format mp4
    python canva_agent.py --interactive
"""

import os
import json
import argparse
import time
from pathlib import Path
from typing import Optional
import anthropic
from dotenv import load_dotenv

load_dotenv()

CLIENT = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL  = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

# URL del MCP Server de Canva (conectado en claude.ai)
CANVA_MCP_URL = "https://mcp.canva.com/mcp"

# ─── Configuración del MCP Server ─────────────────────────────────────────────

MCP_SERVERS = [
    {
        "type": "url",
        "url": CANVA_MCP_URL,
        "name": "canva-mcp"
    }
]

# ─── Prompts del Sistema ───────────────────────────────────────────────────────

CANVA_SYSTEM_PROMPT = """
Eres un agente experto en diseño con acceso completo a Canva vía MCP.

Tienes acceso a las siguientes capacidades de Canva:
- Buscar y listar diseños existentes (search-designs)
- Generar nuevos diseños con IA (generate-design)
- Editar diseños: texto, imágenes, layout (start-editing-transaction → perform-editing-operations → commit)
- Exportar a PDF, PNG, JPG, MP4, PPTX, GIF (export-design)
- Subir assets desde URL (upload-asset-from-url)
- Obtener brand kits del usuario (list-brand-kits)
- Redimensionar diseños (resize-design)
- Combinar y reorganizar páginas (merge-designs)

FLUJO DE TRABAJO:
1. Para GENERAR un diseño: usa generate-design con el tipo y descripción apropiados
2. Para EDITAR: start-editing-transaction → perform-editing-operations → commit-editing-transaction
3. Para EXPORTAR: get-export-formats → export-design
4. Para BUSCAR: search-designs con palabras clave relevantes

REGLAS IMPORTANTES:
- Siempre confirma con el usuario antes de hacer commits o cambios destructivos
- Muestra thumbnails/previews cuando estén disponibles
- Para videos, usa el tipo 'mp4' en export-design
- Los IDs de diseño siempre empiezan con 'D' y tienen 11 caracteres

Responde en español. Sé preciso y eficiente con las herramientas.
"""

# ─── Clase Principal del Agente ───────────────────────────────────────────────

class CanvaAgent:
    """Agente completo de Canva para VS Code."""

    def __init__(self):
        self.conversation_history = []
        self.last_design_id = None
        self.last_transaction_id = None

    def _call_with_mcp(self, user_message: str, verbose: bool = False) -> str:
        """
        Llama a Claude con el MCP de Canva conectado.
        Maneja el loop de tool_use automáticamente.
        """
        self.conversation_history.append({
            "role": "user",
            "content": user_message
        })

        if verbose:
            print(f"\n🤖 Claude procesando: {user_message[:80]}...")

        # Loop hasta que Claude no llame más herramientas
        while True:
            response = CLIENT.messages.create(
                model=MODEL,
                max_tokens=4096,
                system=CANVA_SYSTEM_PROMPT,
                messages=self.conversation_history,
                mcp_servers=MCP_SERVERS,
            )

            # Agregar respuesta al historial
            assistant_content = response.content
            self.conversation_history.append({
                "role": "assistant",
                "content": assistant_content
            })

            # Verificar si hay tool_use
            has_tool_use = any(
                block.type == "tool_use"
                for block in assistant_content
                if hasattr(block, "type")
            )

            if verbose and has_tool_use:
                for block in assistant_content:
                    if hasattr(block, "type") and block.type == "tool_use":
                        print(f"   🔧 Llamando herramienta: {block.name}")
                        if hasattr(block, "input") and block.input:
                            # Mostrar parámetros relevantes
                            for key in ["design_id", "query", "type", "format"]:
                                if key in block.input:
                                    print(f"      {key}: {block.input[key]}")

            # Si Claude terminó (no más tool_use), extraer texto final
            if response.stop_reason != "tool_use":
                final_text = ""
                for block in assistant_content:
                    if hasattr(block, "type") and block.type == "text":
                        final_text += block.text
                return final_text

            # Procesar resultados de herramientas para continuar el loop
            tool_results = []
            for block in assistant_content:
                if hasattr(block, "type") and block.type == "tool_use":
                    # Capturar IDs importantes de los inputs
                    if hasattr(block, "input"):
                        if "design_id" in block.input:
                            self.last_design_id = block.input["design_id"]
                        if "transaction_id" in block.input:
                            self.last_transaction_id = block.input["transaction_id"]

                    # El MCP maneja la ejecución real; aquí Claude ya procesó los resultados
                    # En el SDK de Anthropic con MCP, las herramientas se ejecutan automáticamente
                    # Este loop es para cuando hay tool_use en la respuesta
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": "Tool executed via MCP"
                    })

            if tool_results:
                self.conversation_history.append({
                    "role": "user",
                    "content": tool_results
                })

    # ─── Acciones Principales ─────────────────────────────────────────────────

    def generate_design(
        self,
        prompt: str,
        design_type: str = "poster",
        use_brand_kit: bool = False,
        verbose: bool = False
    ) -> str:
        """
        Genera un nuevo diseño en Canva usando IA.

        Args:
            prompt: Descripción del diseño deseado
            design_type: Tipo de diseño (poster, presentation, instagram_post, etc.)
            use_brand_kit: Si usar el brand kit del usuario
            verbose: Mostrar detalles del proceso
        """
        print(f"\n🎨 Generando diseño en Canva...")
        print(f"   Tipo: {design_type}")
        print(f"   Prompt: {prompt}")

        brand_instruction = ""
        if use_brand_kit:
            brand_instruction = "Primero lista los brand kits disponibles con list-brand-kits y usa el primero disponible."

        message = (
            f"{brand_instruction}"
            f"Genera un diseño de tipo '{design_type}' en Canva con esta descripción: {prompt}. "
            f"Usa la herramienta generate-design. "
            f"Después de generar, crea el diseño con create-design-from-candidate para hacerlo editable. "
            f"Muestra el resultado y el link para editar en Canva."
        )

        result = self._call_with_mcp(message, verbose=verbose)
        print(f"\n✅ Resultado:\n{result}")
        return result

    def search_designs(self, query: str, verbose: bool = False) -> str:
        """Busca diseños existentes en Canva."""
        print(f"\n🔍 Buscando diseños: '{query}'")

        message = (
            f"Busca diseños en Canva con la consulta '{query}' usando search-designs. "
            f"Muestra los resultados con sus IDs, títulos y links de edición."
        )

        result = self._call_with_mcp(message, verbose=verbose)
        print(f"\n✅ Resultados:\n{result}")
        return result

    def edit_design(
        self,
        design_id: str,
        edit_instructions: str,
        verbose: bool = False
    ) -> str:
        """
        Edita un diseño existente en Canva.

        Operaciones soportadas:
        - Reemplazar texto
        - Cambiar imágenes/videos
        - Actualizar título
        - Formatear texto (color, tamaño, alineación)
        - Eliminar elementos
        """
        print(f"\n✏️  Editando diseño: {design_id}")
        print(f"   Instrucciones: {edit_instructions}")

        message = (
            f"Edita el diseño de Canva con ID '{design_id}'. "
            f"Instrucciones de edición: {edit_instructions}. "
            f"Sigue el flujo completo: start-editing-transaction → perform-editing-operations → "
            f"confirma con el usuario → commit-editing-transaction. "
            f"Muestra preview antes de confirmar."
        )

        result = self._call_with_mcp(message, verbose=verbose)
        print(f"\n✅ Resultado:\n{result}")
        return result

    def export_design(
        self,
        design_id: str,
        format: str = "mp4",
        output_path: Optional[str] = None,
        pages: Optional[list] = None,
        verbose: bool = False
    ) -> str:
        """
        Exporta un diseño de Canva en el formato especificado.

        Formatos: pdf, png, jpg, gif, pptx, mp4
        """
        print(f"\n📤 Exportando diseño {design_id} como {format.upper()}...")

        pages_instruction = f"Solo páginas: {pages}" if pages else "Todas las páginas"
        output_instruction = f"El archivo se guardará en: {output_path}" if output_path else ""

        message = (
            f"Exporta el diseño '{design_id}' de Canva. "
            f"Primero verifica los formatos disponibles con get-export-formats. "
            f"Luego exporta como '{format}' con alta calidad. "
            f"{pages_instruction}. {output_instruction}. "
            f"Proporciona el link de descarga directo."
        )

        result = self._call_with_mcp(message, verbose=verbose)
        print(f"\n✅ Exportación:\n{result}")
        return result

    def get_brand_kits(self, verbose: bool = False) -> str:
        """Lista los brand kits disponibles en la cuenta de Canva."""
        print("\n🎯 Obteniendo brand kits...")

        message = (
            "Lista todos los brand kits disponibles con list-brand-kits. "
            "Muestra nombre, ID y descripción de cada uno."
        )

        result = self._call_with_mcp(message, verbose=verbose)
        print(f"\n✅ Brand Kits:\n{result}")
        return result

    def resize_design(
        self,
        design_id: str,
        width: Optional[int] = None,
        height: Optional[int] = None,
        preset: Optional[str] = None,
        verbose: bool = False
    ) -> str:
        """Redimensiona un diseño (custom o preset: presentation, whiteboard)."""
        print(f"\n📐 Redimensionando diseño {design_id}...")

        if preset:
            size_instruction = f"al preset '{preset}'"
        elif width and height:
            size_instruction = f"a dimensiones personalizadas de {width}x{height} píxeles"
        else:
            size_instruction = "al tamaño de presentación estándar"

        message = (
            f"Redimensiona el diseño '{design_id}' de Canva {size_instruction} "
            f"usando la herramienta resize-design. "
            f"Muestra el resultado con el nuevo tamaño y link de edición."
        )

        result = self._call_with_mcp(message, verbose=verbose)
        print(f"\n✅ Resultado:\n{result}")
        return result

    def upload_asset(self, url: str, name: str, verbose: bool = False) -> str:
        """Sube un asset (imagen/video) a Canva desde una URL."""
        print(f"\n⬆️  Subiendo asset: {name}")
        print(f"   URL: {url}")

        message = (
            f"Sube el asset llamado '{name}' desde esta URL: {url} "
            f"usando upload-asset-from-url. "
            f"Muestra el ID del asset subido para poder usarlo en diseños."
        )

        result = self._call_with_mcp(message, verbose=verbose)
        print(f"\n✅ Asset subido:\n{result}")
        return result

    def design_pipeline_with_video(
        self,
        prompt: str,
        design_type: str = "presentation",
        export_as_video: bool = True,
        verbose: bool = False
    ) -> str:
        """
        Pipeline completo: Generar diseño en Canva → Exportar como video MP4.
        Integra con el pipeline Claude+Remotion existente.
        """
        print("\n" + "═" * 60)
        print("  🎨 PIPELINE CANVA → VIDEO")
        print("═" * 60)

        message = (
            f"Ejecuta un pipeline completo en Canva:\n"
            f"1. Genera un diseño de tipo '{design_type}' con este prompt: {prompt}\n"
            f"2. Crea el diseño editable con create-design-from-candidate\n"
            f"3. Obtén información del diseño con get-design\n"
            f"{'4. Exporta como MP4 de alta calidad con export-design' if export_as_video else '4. Exporta como PDF'}\n"
            f"5. Proporciona todos los links relevantes (edición y descarga)\n\n"
            f"Sé conciso y eficiente. Muestra el progreso en cada paso."
        )

        result = self._call_with_mcp(message, verbose=verbose)
        print(f"\n✅ Pipeline completado:\n{result}")
        return result

    def interactive_session(self):
        """Sesión interactiva de diseño con Canva."""
        print("\n" + "═" * 60)
        print("  🎨 CANVA DESIGN AGENT — Sesión Interactiva")
        print("═" * 60)
        print("  Comandos rápidos:")
        print("  /generar <tipo> <prompt>  - Genera un diseño")
        print("  /buscar <query>           - Busca diseños")
        print("  /editar <design_id>       - Edita un diseño")
        print("  /exportar <id> <formato>  - Exporta diseño")
        print("  /brandkits               - Lista brand kits")
        print("  /salir                   - Terminar sesión")
        print("  O escribe cualquier instrucción en lenguaje natural\n")

        while True:
            try:
                user_input = input("🎨 Canva Agent → ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\n👋 Sesión terminada.")
                break

            if not user_input:
                continue

            if user_input.lower() == "/salir":
                print("👋 ¡Hasta luego!")
                break

            # Comandos rápidos
            if user_input.startswith("/generar "):
                parts = user_input[9:].split(" ", 1)
                dtype = parts[0] if len(parts) > 1 else "poster"
                prompt = parts[1] if len(parts) > 1 else parts[0]
                self.generate_design(prompt, dtype, verbose=True)

            elif user_input.startswith("/buscar "):
                self.search_designs(user_input[8:], verbose=True)

            elif user_input.startswith("/editar "):
                design_id = user_input[8:].split()[0]
                instrs = input("   ¿Qué cambios quieres hacer? ").strip()
                self.edit_design(design_id, instrs, verbose=True)

            elif user_input.startswith("/exportar "):
                parts = user_input[10:].split()
                did = parts[0]
                fmt = parts[1] if len(parts) > 1 else "mp4"
                self.export_design(did, fmt, verbose=True)

            elif user_input == "/brandkits":
                self.get_brand_kits(verbose=True)

            else:
                # Instrucción en lenguaje natural
                result = self._call_with_mcp(user_input, verbose=True)
                print(f"\n{result}")


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Canva Agent — Diseño y video desde VS Code con Claude + Canva MCP"
    )
    parser.add_argument("--action", type=str,
                        choices=["generate", "search", "edit", "export",
                                 "brandkits", "resize", "upload", "pipeline"],
                        help="Acción a ejecutar")
    parser.add_argument("--prompt", type=str, help="Descripción del diseño")
    parser.add_argument("--design-id", type=str, help="ID del diseño de Canva (empieza con D)")
    parser.add_argument("--type", type=str, default="poster",
                        help="Tipo de diseño: poster, presentation, instagram_post, etc.")
    parser.add_argument("--format", type=str, default="mp4",
                        choices=["pdf", "png", "jpg", "gif", "pptx", "mp4"],
                        help="Formato de exportación")
    parser.add_argument("--width", type=int, help="Ancho para resize personalizado")
    parser.add_argument("--height", type=int, help="Alto para resize personalizado")
    parser.add_argument("--url", type=str, help="URL del asset a subir")
    parser.add_argument("--name", type=str, help="Nombre del asset")
    parser.add_argument("--brand-kit", action="store_true",
                        help="Usar brand kit en la generación")
    parser.add_argument("--verbose", action="store_true",
                        help="Mostrar detalle de herramientas")
    parser.add_argument("--interactive", action="store_true",
                        help="Modo interactivo")

    args = parser.parse_args()
    agent = CanvaAgent()

    if args.interactive:
        agent.interactive_session()

    elif args.action == "generate":
        if not args.prompt:
            args.prompt = input("Describe el diseño: ")
        agent.generate_design(args.prompt, args.type, args.brand_kit, args.verbose)

    elif args.action == "search":
        if not args.prompt:
            args.prompt = input("Término de búsqueda: ")
        agent.search_designs(args.prompt, args.verbose)

    elif args.action == "edit":
        if not args.design_id:
            args.design_id = input("ID del diseño: ")
        if not args.prompt:
            args.prompt = input("¿Qué cambios quieres hacer? ")
        agent.edit_design(args.design_id, args.prompt, args.verbose)

    elif args.action == "export":
        if not args.design_id:
            args.design_id = input("ID del diseño: ")
        agent.export_design(args.design_id, args.format, verbose=args.verbose)

    elif args.action == "brandkits":
        agent.get_brand_kits(args.verbose)

    elif args.action == "resize":
        if not args.design_id:
            args.design_id = input("ID del diseño: ")
        agent.resize_design(args.design_id, args.width, args.height, verbose=args.verbose)

    elif args.action == "upload":
        if not args.url:
            args.url = input("URL del asset: ")
        if not args.name:
            args.name = input("Nombre del asset: ")
        agent.upload_asset(args.url, args.name, args.verbose)

    elif args.action == "pipeline":
        if not args.prompt:
            args.prompt = input("Describe el video/diseño: ")
        agent.design_pipeline_with_video(args.prompt, args.type, verbose=args.verbose)

    else:
        # Sin argumentos → modo interactivo
        agent.interactive_session()


if __name__ == "__main__":
    main()
