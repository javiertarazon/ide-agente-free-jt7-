# Agente Free JT7 Extension Funcional

Version: `4.2.11`

Repositorio funcional del runtime Free JT7 para VS Code y otros IDE compatibles:
- ejecutable por CLI (`skills_manager.py`)
- instalable en proyectos (`scripts/setup-project.ps1`, `scripts/add-free-jt7-agent.ps1`)
- empaquetable como extension VS Code (`.vsix`)

## Estado actual

- Runtime migrado desde la linea v3.1.
- Catalogo de skills disponible en `.github/skills`.
- Configuracion de agente, policy y model routing incluida.
- Extension VS Code incluida (`package.json` + `extension.js`).
- Variante Linux documentada y validada en la rama `feature/linux-v4.2.3`.

## Origen y trazabilidad

- Repositorio fuente: `https://github.com/javiertarazon/agente-copilot.git`
- Rama de transicion previa: `feature/agente-free-extension-v3.1`
- Commit base de referencia: `1e4e6a3`

Documentacion:
- `docs/00-TRAYECTORIA-ORIGEN.md`
- `docs/01-MODIFICACIONES-VSCODE-EXTENSION.md`
- `docs/02-ERRORES-RESUELTOS.md`

## Requisitos

### Organización de scripts
Todos los helpers de instalación y pruebas residen en `scripts/`.
- `scripts/setup-project.ps1` es la herramienta principal para instalar el agente en proyectos y actualizar settings de usuario.
- `scripts/add-free-jt7-agent.ps1` permanece por compatibilidad, pero ahora delega en `scripts/setup-project.ps1` para evitar duplicidad operativa.
- `scripts/openclaw-start.cmd` es el wrapper común para resolver OpenClaw local o en PATH; sin argumentos arranca el gateway por defecto.
- `scripts/test-wrappers.ps1` comprueba los wrappers CLI.

La carpeta `legacy-vscode-free-jt7-agent` y los registros en
`copilot-agent\admin-runs` han sido eliminados para reducir el desorden.


- Linux y Windows 10/11
- Python 3.11+ (`python` en PATH)
- Node.js 20+ para generar `.vsix` y reconstruir la extension
- Node.js 22.14+ para ejecutar OpenClaw actual si usas gateway y canales
- VS Code 1.90+

## Capas de instalacion

La instalacion operativa del proyecto queda separada en tres capas:

### 1. Extension base + router Copilot

Incluye:

- extension VS Code (`package.json`, `extension.js`, `dist/extension.cjs`)
- runtime JS en `src-js/`
- bootstrap del workspace mediante `skills_manager.py`
- router Copilot con participante `@freejt7`

Requisitos minimos:

- Python 3.11+
- VS Code 1.90+
- GitHub Copilot Chat instalado para que aparezca `@freejt7` en el panel de chat de VS Code
- `copilot` CLI autenticado o token valido para Copilot
- Node 20+ solo si quieres reconstruir el bundle o empaquetar el VSIX

### 2. Servicios fundamentales: MCP + OpenClaw

Esta capa forma parte del funcionamiento completo que espera Free JT7:

- `servidor mpc free jt7/` como servidor MCP local complementario
- OpenClaw como runtime del gateway y de los comandos de canales

Estado operativo esperado:

- `servidor mpc free jt7` debe pasar `npm run smoke`
- `openclaw` debe existir en PATH
- OpenClaw actual exige Node 22.14+

### 3. Integraciones opcionales: MT5

`mcp-servers/mt5/` no es requisito base de la extension. Solo hace falta si quieres automatizacion o consulta de MetaTrader 5.

## Uso CLI rapido

```bash
python3 skills_manager.py policy-validate
python3 skills_manager.py ide-detect --json
python3 skills_manager.py install "/ruta/mi-proyecto" --ide all --update-user-settings
```

## Modo app standalone (sin dependencia de Copilot/Claude/Codex)

Para usar Free JT7 como una app aislada (perfil propio, VSIX propia y panel como interfaz principal):

```bash
npm run app:standalone
```

Esto prepara un perfil en `~/.freejt7-app/profiles/default`, instala la VSIX activa en ese perfil y abre la IDE con extensiones Copilot/Claude deshabilitadas para ese entorno.

Opciones utiles:

```bash
npm run app:standalone:setup   # prepara perfil e instala VSIX, sin abrir la IDE
npm run app:standalone:dry-run # simula comandos y rutas, sin ejecutar binarios externos
```

Wrappers directos:

- Linux/macOS: `scripts/run-freejt7-app.sh`
- Windows: `scripts/run-freejt7-app.ps1`

### Modo IDE propio (Free JT7 Desktop con VSCodium portable)

Para avanzar hacia IDE propia sin depender de `code` del sistema, Free JT7 incluye un bootstrap que instala runtime VSCodium portable en `~/.freejt7-app/runtime/vscodium` y lo usa como host del perfil aislado:

```bash
npm run app:own-ide:setup   # descarga/prepara IDE propia + instala VSIX (sin abrir)
npm run app:own-ide         # idem, y abre ventana nueva sobre IDE propia
```

Diagnóstico en seco:

```bash
npm run app:own-ide:dry-run
```

### Instalador nativo `.deb` (Linux)

Construir paquete Debian:

```bash
npm run package:deb
```

Instalar:

```bash
npm run install:deb
```

Notas:
- Si hay permisos root/sudo non-interactive, instala con `dpkg -i` del sistema.
- Si no hay permisos root, aplica fallback local en `~/.local/freejt7-desktop` y crea launcher `~/.local/bin/freejt7-desktop`.

## Router real con Copilot SDK

La extension ahora incluye un router local con Copilot SDK en `copilot_router.js`.

- Planifica con `gpt-5.4`.
- Ejecuta subtareas con modelos baratos configurables como `claude-haiku-4.5` y `gemini-3-flash`.
- Puede usar un modelo experimental para codigo rapido si configuras `freejt7.copilotRouter.experimentalCodeModel`.
- Registra evidencia en `copilot-agent/runs/` dentro del workspace.

Uso directo por CLI local:

```powershell
node copilot_router.js --goal "describe y resuelve la tarea" --workspace . --json
```

Uso desde la extension:

- comando `Free JT7: Routed Copilot Task`
- participante nativo `@freejt7` en Copilot Chat

El participante `@freejt7` es una capacidad propia de VS Code con GitHub Copilot Chat. La integración multi-IDE fuera de VS Code se hace mediante `skills_manager.py` y los bridges que instala en el proyecto y en los settings globales de cada IDE.

Requisito operativo:

- tener instalado GitHub Copilot Chat para el participante `@freejt7` en VS Code.
- tener instalado y autenticado `copilot` CLI.
- si falta login, ejecuta `copilot login`, o configura `COPILOT_GITHUB_TOKEN`, `GH_TOKEN` o `GITHUB_TOKEN`.

### Si `@freejt7` no aparece en Copilot Chat

Las causas mas comunes ya verificadas en Linux son estas:

- GitHub Copilot Chat no esta instalado en el perfil actual de VS Code.
- La sesion actual del IDE no expone `vscode.chat.createChatParticipant`.
- La extension esta instalada, pero el usuario no tiene disponible la infraestructura de chat en ese IDE/perfil.

Compruebalo con:

```bash
code --list-extensions --show-versions | grep -i copilot
```

Y dentro de la extension con:

```text
Free JT7: Validar runtime
```

## Generar extension VS Code (.vsix)

```bash
npm install
npm run package
```

Esto genera un archivo `.vsix` en la raiz del repo.

En este repositorio el build de la extension y el runtime de OpenClaw pueden convivir con versiones distintas de Node:

- Node 20 para `npm run build:bundle` y `npm run package:local`
- Node 22 para `openclaw`

### Verificar e instalar

Después de crear el paquete puedes confirmar la instalación ejecutando
`code --list-extensions` y buscando `freejt7`.

Para instalar manualmente usa el menú de extensiones de VS Code o:

```bash
code --install-extension agente-freejt7-extension-funcional-4.2.11.vsix
```

### Probar wrappers

Un nuevo script `scripts\test-wrappers.ps1` ofrece tests básicos para los
wrappers y el helper `runOpenClaw` exportado desde `extension.js`.  Ejecuta
desde la raíz del workspace:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-wrappers.ps1
```

El script imprimirá los comandos que intenta ejecutar y fallará con
`ENOENT` si no se encuentra el binario `openclaw`, lo cual es el comportamiento
esperado en un entorno de desarrollo.

La ruta de autostart del gateway reutiliza el mismo wrapper común para evitar que PowerShell y CMD mantengan lógica duplicada al descubrir OpenClaw.

## Comparativa entre agentes

La matriz propuesta de métricas y escenarios para comparar Free JT7 frente a OpenClaw, Codex y Claude Code está en `docs/10-MATRIZ-COMPARATIVA-AGENTES.md`.

## Instalar extension en VS Code

1. VS Code -> Extensions
2. Menu `...` -> `Install from VSIX...`
3. Seleccionar el archivo `.vsix` generado
4. Ejecutar el comando:
   - `Free JT7: Instalar en workspace actual`
  - `Free JT7: Aplicar configuracion global multi-IDE`
  - `Free JT7: Aplicar configuracion global en VS Code` (alias legacy, solo VS Code)

En Linux o Windows tambien puedes abrir Copilot Chat y usar:

- `@freejt7 /doctor`
- `@freejt7 /install`
- `@freejt7 /global`
- `@freejt7 /route analiza este proyecto y aplica la solucion`

### Uso con proveedores externos

Free JT7 puede trabajar con `OpenRouter`, `HuggingFace` y `ZAI` ademas de Copilot.

Dentro de VS Code puedes usar:

- `Free JT7: Seleccionar Proveedor de API`
- `Free JT7: Configurar API Key de Proveedor`
- `Free JT7: Seleccionar Modelo Gratuito`
- `Free JT7: Actualizar Catálogo de Modelos Gratuitos`

Las credenciales no deben guardarse en el repositorio. La extension usa `SecretStorage` de VS Code y tambien puede leer variables de entorno o archivos locales ignorados por git como `env api` o `.env`.

### Configuracion global dentro de VS Code

Si quieres que Free JT7 quede operativo desde la extensión para uno o varios IDEs soportados, usa:

- comando `Free JT7: Aplicar configuracion global multi-IDE`
- o en Copilot Chat: `@freejt7 /global`

Ese flujo te deja elegir `Auto`, `Todos los IDE soportados` o un IDE concreto (`VS Code`, `Cursor`, `Kiro`, `Antigravity`, `Codex`, `Claude Code`, `Gemini CLI`).

- Si hay un workspace abierto, además de los settings globales se sincronizan los bridges locales del proyecto.
- Si no hay un workspace abierto, se actualizan solo los settings globales del IDE seleccionado.
- El comando legacy `Free JT7: Aplicar configuracion global en VS Code` se mantiene por compatibilidad y fuerza únicamente el target `vscode`.

## Servicios fundamentales despues de instalar la extension

### Servidor MCP local

```bash
cd "servidor mpc free jt7"
npm install
npm run smoke
```

### Gateway OpenClaw

Free JT7 puede resolver OpenClaw de tres formas: `FREE_JT7_OPENCLAW_CMD`, un repo local `OPEN CLAW` ya construido, o el binario `openclaw` en PATH. El wrapper `scripts/openclaw-start.cmd` unifica esa resolución y, si se ejecuta sin argumentos, arranca el gateway por defecto.

Comandos utiles desde la raiz del repo:

```bash
python3 skills_manager.py gateway-bootstrap --project . --ide vscode --profile default
python3 skills_manager.py gateway-start --dry-run
python3 skills_manager.py gateway-status
```

## Linux y multi-IDE

La guia operativa completa para Linux y los IDEs soportados por el runtime esta en:

- `docs/06-RELEASE-4.2.4.md`
- `docs/07-INSTALACION-LINUX-MULTI-IDE.md`

## Comandos de la extension

- `Free JT7: Instalar en workspace actual`
- `Free JT7: Aplicar configuracion global multi-IDE`
- `Free JT7: Aplicar configuracion global en VS Code`
- `Free JT7: Validar runtime`
- `Free JT7: Abrir documentacion`

### Wrappers OpenClaw
Si el binario `openclaw` se encuentra en el PATH o dentro de
`OPEN CLAW/node_modules/.bin/`, la extensión habilita comandos
adicionales que ejecutan directamente el CLI:

- `Free JT7: OpenClaw Gateway Status` – muestra salida de
  `openclaw gateway status`.
- `Free JT7: Run OpenClaw CLI` – solicita argumentos libres
  para enviarlos al comando `openclaw`.

Estos comandos son parte de la capa operativa del gateway. Si `openclaw`
no existe en PATH, la extension queda instalada pero el flujo completo de
gateway y canales no queda funcional.

## Archivos clave

- `skills_manager.py`
- `setup-project.ps1`
- `add-free-jt7-agent.ps1`
- `.github/copilot-instructions.md`
- `.github/agents/free-jt7.agent.md`
- `.github/free-jt7-policy.yaml`
- `.github/free-jt7-model-routing.json`

## Comandos adicionales para OpenClaw

Además de los wrappers básicos, la extensión ahora expone comandos que ayudan
con el servidor OpenClaw:

- `Free JT7: Start OpenClaw Gateway` – ejecuta `openclaw gateway --port 18789`.
- `Free JT7: Edit OpenClaw Config` – abre `~/.openclaw/openclaw.json` en el
  editor para su edición.
- `Free JT7: Install OpenClaw Service` – corre `openclaw onboard --install-daemon` para
  crear/actualizar el servicio del gateway.
- `Free JT7: OpenClaw ACP` – lanza `openclaw acp` con argumentos interactivos,
  útil para conectar IDEs que hablen ACP.
- `Free JT7: OpenClaw Channels Login` – ejecuta `openclaw channels login` para
  emparejar un canal desde VS Code.

Estos comandos facilitan el uso del CLI desde VS Code, pero el servidor no se
autogestiona por completo; sigue siendo responsabilidad del usuario validar el
estado del gateway y su configuracion local.
