# 🎨 Guía de Integración con Canva

Cómo usar el agente de Canva integrado en el sistema Claude + Remotion + VS Code.

---

## Requisitos de Configuración

### 1. Conectar tu cuenta de Canva

El agente usa el **MCP Server de Canva** a través de la API de Anthropic.
Tienes dos opciones:

**Opción A — Desde Claude.ai (recomendado):**
1. Ve a claude.ai → Settings → Connections
2. Haz clic en **"Connect Canva"**
3. Autoriza el acceso a tu cuenta de Canva
4. El token queda disponible automáticamente para el MCP

**Opción B — Token manual en `.env`:**
```env
CANVA_ACCESS_TOKEN=tu_token_aqui
```
> Para obtener el token: https://www.canva.com/developers/

### 2. Instalar dependencia adicional

```bash
pip install anthropic python-dotenv
# El MCP de Canva se conecta automáticamente vía la API de Anthropic
# No necesita instalación adicional de paquetes
```

---

## Comandos Disponibles del Agente

### Generar diseño nuevo en Canva

```bash
python agents/canva_agent.py --action generate \
  --prompt "Poster moderno para lanzamiento de app" \
  --type poster

# Con brand kit de tu cuenta:
python agents/canva_agent.py --action generate \
  --prompt "Presentación corporativa Q4" \
  --type presentation \
  --brand-kit
```

**Tipos de diseño disponibles:**
`poster`, `presentation`, `instagram_post`, `facebook_post`, `youtube_thumbnail`,
`flyer`, `infographic`, `resume`, `business_card`, `email`, `doc`, `report`, `logo`

---

### Buscar diseños existentes

```bash
python agents/canva_agent.py --action search \
  --prompt "campaña verano 2025"
```

---

### Editar un diseño existente

```bash
python agents/canva_agent.py --action edit \
  --design-id DABCxyz1234 \
  --prompt "Cambia el título a 'Nuevo Producto 2026' y el color de fondo a azul oscuro"
```

**Tipos de edición soportados:**
- Reemplazar texto completo o parcial
- Cambiar imágenes/videos
- Actualizar título del diseño
- Formatear texto (color, tamaño, alineación, negrita, cursiva)
- Eliminar elementos
- Posicionar y redimensionar elementos

---

### Exportar diseño

```bash
# Exportar como MP4 (video)
python agents/canva_agent.py --action export \
  --design-id DABCxyz1234 \
  --format mp4

# Exportar como PDF
python agents/canva_agent.py --action export \
  --design-id DABCxyz1234 \
  --format pdf

# Exportar como PNG (alta resolución)
python agents/canva_agent.py --action export \
  --design-id DABCxyz1234 \
  --format png
```

**Formatos disponibles:** `mp4`, `pdf`, `png`, `jpg`, `gif`, `pptx`

---

### Listar Brand Kits

```bash
python agents/canva_agent.py --action brandkits
```

---

### Redimensionar diseño

```bash
# A dimensiones personalizadas
python agents/canva_agent.py --action resize \
  --design-id DABCxyz1234 \
  --width 1920 --height 1080

# A preset
python agents/canva_agent.py --action resize \
  --design-id DABCxyz1234 \
  --preset presentation
```

---

### Subir asset desde URL

```bash
python agents/canva_agent.py --action upload \
  --url "https://mi-sitio.com/logo.png" \
  --name "Logo Principal"
```

---

### Modo Interactivo

```bash
python agents/canva_agent.py --interactive
```

En el modo interactivo puedes escribir instrucciones en **lenguaje natural**:

```
🎨 Canva Agent → Crea una presentación de 10 slides sobre IA generativa
🎨 Canva Agent → Cambia el título de la slide 3 a "Resultados Q1 2026"
🎨 Canva Agent → Exporta el diseño DABCxyz1234 como video MP4
🎨 Canva Agent → Busca todos mis diseños de marketing
🎨 Canva Agent → Redimensiona el diseño D1234xyz para Instagram
```

---

## Pipelines Maestros

### Pipeline A — Solo Canva

```bash
python agents/master_pipeline.py --mode canva \
  --prompt "Video animado de producto para Instagram" \
  --type instagram_post \
  --format mp4
```

**Flujo:** Prompt → Canva IA genera diseño → Exporta MP4 directo de Canva

---

### Pipeline B — Solo Remotion

```bash
python agents/master_pipeline.py --mode remotion \
  --prompt "Intro animada estilo motion graphics minimalista"
```

**Flujo:** Prompt → Claude JSON → Código React/TSX → Remotion renderiza MP4

---

### Pipeline C — Completo (Canva + Remotion)

```bash
python agents/master_pipeline.py --mode full \
  --prompt "Campaign de lanzamiento para app de fitness" \
  --type poster
```

**Flujo:**
1. Claude genera sistema de diseño JSON (colores, tipografía, estructura)
2. Canva genera asset visual usando las especificaciones de Claude
3. Remotion usa el diseño JSON para crear video programático
4. Resultado: diseño en Canva + video MP4

---

### Pipeline D — Canva → Remotion

```bash
python agents/master_pipeline.py --mode canva2remotion \
  --design-id DABCxyz1234
```

**Flujo:** Diseño existente en Canva → Exportar PNG → Usar como asset en Remotion

---

### Pipeline Interactivo (selector de modo)

```bash
python agents/master_pipeline.py --interactive
```

---

## Tasks de VS Code (Ctrl+Shift+B)

Las tareas disponibles en VS Code incluyen:

| Task | Descripción |
|------|-------------|
| 🎨 Generar Diseño en Canva | Genera nuevo diseño desde prompt |
| 🔍 Buscar Diseños Canva | Busca diseños en tu cuenta |
| 📤 Exportar Canva como MP4 | Exporta diseño específico |
| 🎬 Pipeline Completo | Claude + Canva + Remotion |
| 🎨 Solo Canva | Canva IA → MP4 |
| ⚛️ Solo Remotion | Claude JSON → MP4 |
| 🔄 Canva Interactivo | Sesión libre con el agente |

---

## Estructura del Flujo de Edición en Canva

```
Usuario: "Cambia el título a X"
         ↓
Claude llama: start-editing-transaction(design_id)
         ↓
Claude llama: perform-editing-operations([replace_text, ...])
         ↓
Claude muestra: preview del diseño editado
         ↓
Usuario confirma: "Sí, guarda los cambios"
         ↓
Claude llama: commit-editing-transaction(transaction_id)
         ↓
✅ Cambios guardados en Canva
```

> **Importante:** Los cambios en Canva son en modo DRAFT hasta hacer commit.
> Si cancelas o cierras sin confirmar, los cambios se pierden.

---

## Ejemplos de Prompts Efectivos

```bash
# Video producto
"Video de 30 segundos mostrando las 3 características principales de una app
de meditación, estilo minimalista, colores azul marino y blanco"

# Presentación corporativa
"Presentación ejecutiva de 15 slides para Q1 2026, datos financieros,
estilo formal y elegante, usando brand kit de la empresa"

# Contenido para redes
"Pack de 5 posts para Instagram sobre tips de productividad,
paleta terracota y beige, tipografía moderna, formato cuadrado"

# Thumbnail YouTube
"Thumbnail llamativo para video sobre ChatGPT vs Claude,
fondo oscuro, texto grande blanco, expresión de sorpresa"
```

---

## Troubleshooting

**Error: "Missing scopes: [asset:write]"**
→ Desconecta y reconecta Canva en Settings → Connections

**Error: "Design ID not found"**
→ Verifica que el ID empiece con 'D' y tenga 11 caracteres

**Error: MCP server no responde**
→ Verifica que Canva esté conectado en tu cuenta de claude.ai
→ Comprueba tu conexión a internet

**Las ediciones no se guardan**
→ Asegúrate de llamar `commit-editing-transaction` después de editar
→ El agente siempre pide confirmación antes de guardar
