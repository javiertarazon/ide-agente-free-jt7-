# 🎬 Claude Design + Canva + Remotion — Sistema de Diseño y Video en VS Code

Sistema completo de agentes IA para crear diseños visuales y videos desde VS Code,
integrando **Claude API**, **Canva MCP** y **Remotion**.

---

## 📁 Estructura del Proyecto

```
claude-remotion-vscode/
├── README.md
├── SETUP.md
├── CANVA_GUIDE.md               ← Guía completa de integración Canva
├── agents/
│   ├── claude_design_agent.py   ← Agente de sistema de diseño con Claude
│   ├── canva_agent.py           ← Agente Canva (genera, edita, exporta)
│   ├── remotion_agent.py        ← Agente Remotion (TSX → MP4)
│   ├── video_pipeline_agent.py  ← Pipeline Claude + Remotion
│   └── master_pipeline.py       ← 🌟 Orquestador maestro de los 3 sistemas
├── remotion_project/
│   ├── package.json
│   └── src/
│       ├── Root.tsx
│       └── VideoTemplate.tsx
└── .vscode/
    ├── tasks.json               ← 12 tareas configuradas
    └── launch.json
```

---

## 🚀 Flujos Disponibles

### Modo A — Solo Canva
```
Prompt → Canva IA genera diseño visual → Exporta MP4/PNG/PDF
```

### Modo B — Solo Remotion
```
Prompt → Claude JSON → Código React/TSX → Remotion renderiza MP4
```

### Modo C — Pipeline Maestro (recomendado)
```
Prompt → Claude diseño JSON → Canva asset visual + Remotion video → MP4
```

### Modo D — Canva existente → Remotion
```
Diseño de Canva → Exportar → Usar como asset en video Remotion
```

---

## ⚡ Quick Start

```bash
# 1. Instalar dependencias
pip install anthropic python-dotenv
cd remotion_project && npm install

# 2. Configurar .env
cp .env.example .env  # Agregar ANTHROPIC_API_KEY

# 3. Conectar Canva en claude.ai → Settings → Connections

# 4. Ejecutar pipeline maestro
python agents/master_pipeline.py --mode full \
  --prompt "Video de lanzamiento para app de fitness"

# O modo interactivo
python agents/master_pipeline.py --interactive
```

O desde VS Code: `Ctrl+Shift+B` → **"🌟 Pipeline Maestro: Canva + Remotion"**


Guía completa para configurar agentes de IA con **Claude API** y **Remotion** para edición de videos automatizada directamente desde VS Code.

---

## 📁 Estructura del Proyecto

```
claude-remotion-vscode/
├── README.md                        ← Este archivo
├── SETUP.md                         ← Instalación paso a paso
├── agents/
│   ├── claude_design_agent.py       ← Agente de diseño con Claude
│   ├── remotion_agent.py            ← Agente de generación de video
│   └── video_pipeline_agent.py      ← Pipeline completo (diseño → video)
├── remotion_project/
│   ├── package.json
│   └── src/
│       ├── Root.tsx                 ← Composición principal
│       └── VideoTemplate.tsx        ← Template generado por Claude
├── prompts/
│   ├── design_system_prompt.txt     ← Prompt para Claude Design
│   └── video_structure_prompt.txt   ← Prompt para estructura de video
└── .vscode/
    ├── tasks.json                   ← Tareas de VS Code
    └── launch.json                  ← Configuración de debug
```

---

## 🚀 Flujo de Trabajo

```
Claude Design Agent
      │
      ▼
  Genera JSON con estructura visual
  (colores, tipografía, layout, animaciones)
      │
      ▼
Remotion Agent
      │
      ▼
  Convierte diseño → componentes React/TSX
  Renderiza video MP4 con Remotion
      │
      ▼
Video Pipeline Agent
      │
      ▼
  Orquesta todo el proceso end-to-end
  desde un simple prompt de texto
```

---

## ⚡ Quick Start

```bash
# 1. Instalar dependencias Python
pip install anthropic python-dotenv

# 2. Instalar Remotion
cd remotion_project && npm install

# 3. Configurar API Key
echo "ANTHROPIC_API_KEY=tu_api_key_aqui" > .env

# 4. Ejecutar pipeline completo
python agents/video_pipeline_agent.py \
  --prompt "Crea un video de 10 segundos anunciando un producto tech moderno"
```
