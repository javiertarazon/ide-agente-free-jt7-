# Instalacion Linux y Multi-IDE

Fecha: 2026-04-15
Version objetivo: `4.2.4`

## Alcance

Esta guia separa lo que esta soportado hoy en el codigo de lo que sigue siendo manual o no verificado.

## Matriz de soporte

### Soportados por el runtime actual

- VS Code
- Cursor
- Kiro
- Antigravity
- Codex
- Claude Code
- Gemini CLI

### No implementados de forma nativa en este repo

- Trae

Para Trae no existe hoy un perfil dedicado en `skills_manager.py`. Si el IDE es compatible con settings estilo VS Code, la integracion seria manual y no queda validada por esta release.

## Requisitos por capa

### Capa 1: Extension VS Code + router Copilot

- Python 3.11+
- VS Code 1.90+
- `github.copilot-chat` instalado para usar `@freejt7`
- `copilot` CLI autenticado o token valido (`COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`)
- Node 20+ si se va a reconstruir el bundle o generar el VSIX

### Capa 2: Stack operativo base

- Git instalado
- servidor MCP local en `servidor mpc free jt7/`
- OpenClaw en PATH
- Node 22.14+ para OpenClaw actual

### Capa 3: Integraciones opcionales

- MT5 solo si se necesita MetaTrader 5

## Instalacion recomendada en Linux

### 1. Runtime de build para la extension

Usar Node 20 para empaquetar:

```bash
export PATH="$HOME/.local/bin:$HOME/.local/nodejs/current/bin:$PATH"
node --version
npm --version
```

### 2. Runtime de OpenClaw

OpenClaw actual requiere Node 22.14+ o superior. Si convive con Node 20, usar wrapper:

```bash
~/.local/bin/openclaw
```

El wrapper debe ejecutar OpenClaw con Node 22.

### 3. Generar e instalar la extension

```bash
npm run build:bundle
npm run package:local
code --install-extension agente-freejt7-extension-funcional-4.2.4.vsix --force
```

### 4. Verificar Copilot Chat

```bash
code --list-extensions --show-versions | grep -i copilot
```

Si falta `github.copilot-chat`, `@freejt7` no aparecera en el panel de chat.

### 5. Preparar stack base

Servidor MCP:

```bash
cd "servidor mpc free jt7"
npm install
npm run smoke
```

Gateway OpenClaw:

```bash
cd /ruta/agente-freejt7-extension-funcional
python3 skills_manager.py gateway-bootstrap --project . --ide vscode --profile default
python3 skills_manager.py gateway-start --dry-run
python3 skills_manager.py gateway-status
```

### 6. Instalar el bridge en un workspace o IDE

Si quieres dejar VS Code preparado a nivel global de usuario desde la propia extension, usa el comando:

```text
Free JT7: Aplicar configuracion global en VS Code
```

o en Copilot Chat:

```text
@freejt7 /global
```

VS Code:

```bash
python3 skills_manager.py install "/ruta/proyecto" --ide vscode --update-user-settings
```

Cursor:

```bash
python3 skills_manager.py install "/ruta/proyecto" --ide cursor --update-user-settings
```

Kiro:

```bash
python3 skills_manager.py install "/ruta/proyecto" --ide kiro --update-user-settings
```

Antigravity:

```bash
python3 skills_manager.py install "/ruta/proyecto" --ide antigravity --update-user-settings
```

Codex:

```bash
python3 skills_manager.py install "/ruta/proyecto" --ide codex --update-user-settings
```

Claude Code:

```bash
python3 skills_manager.py install "/ruta/proyecto" --ide claude-code --update-user-settings
```

Gemini CLI:

```bash
python3 skills_manager.py install "/ruta/proyecto" --ide gemini-cli --update-user-settings
```

## Verificaciones recomendadas

```bash
python3 skills_manager.py policy-validate
python3 skills_manager.py ide-detect --json
python3 skills_manager.py gateway-status
node copilot_router.js --goal "diagnostica el proyecto" --workspace . --json
```

## Diagnostico rapido

### `@freejt7` no aparece en Copilot Chat

- falta `github.copilot-chat`
- el IDE actual no expone `vscode.chat`
- la extension no se instalo en el perfil correcto

### `gateway-status` falla

- `openclaw` no esta en PATH
- OpenClaw se esta ejecutando con Node 20 en vez de Node 22
- no se ejecuto `gateway-bootstrap`

### MCP no responde

- faltan dependencias en `servidor mpc free jt7/node_modules`
- no paso `npm run smoke`

## Notas de compatibilidad

- La extension VS Code y el runtime OpenClaw usan requisitos de Node distintos hoy.
- El soporte multi-IDE fuera de VS Code no depende del participante de chat; depende de los bridges y archivos que instala `skills_manager.py`.
- MT5 debe instalarse por separado y no forma parte del setup minimo.