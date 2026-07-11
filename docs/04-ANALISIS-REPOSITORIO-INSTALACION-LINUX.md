# Analisis tecnico del repositorio e instalacion en Linux

Fecha de analisis: 2026-04-15
Repositorio: `agente-freejt7-extension-funcional`
Version revisada: `4.2.3`

## 1. Resumen ejecutivo

El repositorio no contiene una sola pieza de software; combina varias capas que hoy deben leerse asi:

1. Una extension de VS Code empaquetable como VSIX.
2. Un runtime local en JavaScript para comandos, chat participant y router Copilot.
3. Una CLI en Python (`skills_manager.py`) que hace bootstrap del workspace y validaciones.
4. Servicios fundamentales para la operacion completa: servidor MCP Node y gateway OpenClaw.
5. Integraciones opcionales: MT5 y herramientas de autoaprendizaje.

La extension puede activarse con su runtime JS y delegar la instalacion del workspace a `skills_manager.py`. Sin embargo, el funcionamiento completo que espera este repositorio no se agota en la extension: el router depende del CLI de Copilot autenticado y el plano de gateway depende de OpenClaw; el servidor MCP local tambien forma parte del stack operativo principal. MT5, en cambio, sigue siendo opcional.

En este equipo Linux, el estado actualizado despues de la validacion practica es:

- Node 20 y npm ya instalados en espacio de usuario para build del VSIX.
- Git instalado en espacio de usuario.
- VSIX regenerado y extension instalada en VS Code.
- Servidor MCP local validado con `npm run smoke`.
- OpenClaw funcional mediante wrapper en `~/.local/bin/openclaw` ejecutado sobre Node 22.
- MT5 no instalado ni requerido para el flujo base.

## 2. Mapa de arquitectura

### 2.1 Extension VS Code

- El punto de entrada publicado es [package.json](../package.json), con `main` apuntando a `./dist/extension.cjs`.
- El shim de carga en [extension.js](../extension.js) intenta usar el bundle publicado y, si falla, cae al runtime fuente en `src-js/extension.runtime.js`.
- El archivo [bundle-entry.js](../bundle-entry.js) reexporta el runtime de extension y el router, lo que permite empaquetar una sola salida CommonJS.

Interpretacion: el proyecto soporta dos modos.

- Modo distribuido: VSIX con `dist/extension.cjs`.
- Modo desarrollo o fallback: carga directa desde `src-js/extension.runtime.js`.

### 2.2 Runtime JS de la extension

En [src-js/extension.runtime.js](../src-js/extension.runtime.js) se concentran las funciones operativas de VS Code:

- Instalacion del workspace mediante `skills_manager.py install`.
- Diagnostico con `policy-validate` e `ide-detect`.
- Participante nativo `@freejt7` para Copilot Chat.
- Registro de comandos de paleta para instalacion, doctor, documentacion, router y wrappers OpenClaw.

La compatibilidad Linux real de la extension se apoya aqui, no en los wrappers PowerShell. El runtime resuelve Python con candidatos multiplataforma (`.venv/bin/python`, `python3`, `python`) y ejecuta `skills_manager.py` directamente.

### 2.3 Router Copilot

El router vive en [src-js/copilot_router.runtime.js](../src-js/copilot_router.runtime.js). Sus responsabilidades principales son:

- Resolver configuracion de modelos desde `.github/free-jt7-model-routing.json` y settings `freejt7.*` del editor.
- Localizar el binario `copilot`, priorizando binario empaquetado y usando PATH como fallback.
- Registrar evidencia de ejecucion en `copilot-agent/runs/`.
- Aplicar un filtro minimo a shells destructivas cuando la autoaprobacion esta activa.

Consecuencia practica: la extension puede instalarse sin problemas, pero la funcionalidad central del router queda degradada o inutilizable si `copilot` no existe o no esta autenticado.

### 2.4 CLI Python y bootstrap del workspace

La pieza que realmente adapta el workspace es [skills_manager.py](../skills_manager.py). Desde la extension y desde los scripts se invocan comandos como:

- `install`
- `policy-validate`
- `ide-detect`
- `doctor`
- `task-run`

Esto confirma que la extension es principalmente una capa de integracion con VS Code sobre una CLI Python ya existente.

### 2.5 Servicios fundamentales y componentes opcionales

#### Servidor MCP Node

- Ubicado en [servidor mpc free jt7/package.json](../servidor%20mpc%20free%20jt7/package.json) y [servidor mpc free jt7/src/index.js](../servidor%20mpc%20free%20jt7/src/index.js).
- Tiene ciclo de vida propio: `npm install`, `npm run smoke`, `npm start` segun [servidor mpc free jt7/RUNBOOK.md](../servidor%20mpc%20free%20jt7/RUNBOOK.md).
- Aunque el runbook hable de integracion futura a nivel de lifecycle desde la extension, el servidor MCP si forma parte del stack operativo que el repo mantiene en paralelo.

Conclusion: es fundamental para el plano MCP del proyecto, aunque no sea requisito tecnico para abrir la extension.

#### OpenClaw

- La extension registra wrappers a CLI en [src-js/extension.runtime.js](../src-js/extension.runtime.js).
- `skills_manager.py` resuelve `openclaw` desde PATH, `FREE_JT7_OPENCLAW_CMD`, `FREE_JT7_OPENCLAW_REPO` o un repo local `OPEN CLAW`.
- OpenClaw actual exige Node 22.14+ y no debe confundirse con el runtime Node 20 usado para empaquetar la extension.

Conclusion: es fundamental para gateway, canales y flujo OpenClaw; si `openclaw` no existe en PATH, esa parte del producto queda rota.

#### Servidor MT5 Python

- Ubicado en [mcp-servers/mt5/mt5_server.py](../mcp-servers/mt5/mt5_server.py), con dependencias en [mcp-servers/mt5/requirements.txt](../mcp-servers/mt5/requirements.txt).
- La documentacion de [mcp-servers/mt5/README.md](../mcp-servers/mt5/README.md) lo presenta como servidor MCP aparte, con credenciales y runtime propios.

Conclusion: sigue siendo opcional respecto a la extension y al stack base MCP/OpenClaw.

## 3. Flujo real de build y empaquetado

El flujo publicado en [package.json](../package.json) es:

1. `npm install`
2. `postinstall` ejecuta `scripts/fix-copilot-sdk-install.js` y `scripts/build-extension-bundle.js`
3. `npm run build:bundle` genera `dist/extension.cjs`
4. `npm run package` o `npm run package:local` crea el VSIX con `@vscode/vsce`

El bundling se define en [scripts/build-extension-bundle.js](../scripts/build-extension-bundle.js) usando `esbuild`, `platform: node`, `format: cjs` y `target: node20`.

Interpretacion operativa:

- Node.js y npm no son opcionales si quieres reconstruir o empaquetar la extension.
- Python es necesario para instalar el workspace desde la extension, pero no para generar el VSIX.
- VS Code 1.90+ es requisito declarado por el manifiesto de extension.

## 4. Instalacion base en Linux: que si y que no

### 4.1 Ruta base soportada por la extension

La documentacion de [README.md](../README.md) y [CHANGELOG.md](../CHANGELOG.md) afirma soporte Linux en 4.2.3. Esa afirmacion es coherente con el runtime actual porque:

- `Free JT7: Instalar en workspace actual` ya no llama a PowerShell; usa Python multiplataforma.
- `@freejt7 /install` y `@freejt7 /doctor` se resuelven dentro del runtime JS.
- La extension declara comandos y participante chat directamente en `package.json`.

Por tanto, la ruta base soportada en Linux es:

1. Obtener o construir un `.vsix`.
2. Instalar la extension en VS Code.
3. Abrir un workspace.
4. Ejecutar `Free JT7: Instalar en workspace actual` o usar `@freejt7 /install`.

### 4.2 Ruta heredada y sesgo Windows

Aunque la extension ya es multiplataforma, el script [scripts/setup-project.ps1](../scripts/setup-project.ps1) sigue mostrando un sesgo claro a Windows:

- Es PowerShell.
- Autodetecta rutas `D:\...` y `E:\...`.
- Usa `$env:USERPROFILE` como base de clonado.
- No existe un wrapper bash equivalente en `scripts/`.

Esto no rompe la extension, pero si rompe la idea de una experiencia de instalacion uniforme entre documentacion y tooling auxiliar.

### 4.3 Estado real en este Linux

Comprobaciones locales sobre este equipo:

- `package.json`: presente.
- `.vsix` en raiz: generado y validado.
- `node` para build: disponible en espacio de usuario (`v20.20.2`).
- `npm` para build: disponible en espacio de usuario (`10.8.2`).
- `node` para OpenClaw: disponible en espacio de usuario (`v22.22.2`).
- `git`: disponible en espacio de usuario.
- `python3`: disponible, version `3.12.3`.
- `python`: no disponible como alias.
- `code`: disponible, version `1.116.0`.
- `copilot`: disponible en `~/.config/Code/User/globalStorage/github.copilot-chat/copilotCli/copilot`.
- `dist/extension.cjs`: presente.
- extension instalada en VS Code: `javiertarazon.agente-freejt7-extension-funcional@4.2.3`.
- `servidor mpc free jt7`: dependencias resueltas y `npm run smoke` exitoso.
- `openclaw`: accesible desde `~/.local/bin/openclaw` mediante wrapper a Node 22.

Lectura de impacto:

- El entorno local ya cumple build de extension, instalacion del VSIX y validacion MCP.
- OpenClaw queda funcional, pero exige un runtime separado de Node 22 para no chocar con el Node 20 del build.
- El punto pendiente del gateway no era el binario, sino una configuracion generada sin `gateway.mode`, que debe corregirse en el bootstrap.

## 5. Hallazgos principales

### 5.1 La extension y el setup de proyecto ya no son la misma cosa

La extension funciona como interfaz de VS Code sobre `skills_manager.py`. El script PowerShell sigue existiendo, pero ya no debe considerarse la ruta principal en Linux.

### 5.2 El router es una dependencia funcional, no solo una feature adicional

El valor diferencial del proyecto esta en el router Copilot y en el participante `@freejt7`. Si falta autenticacion o resolucion del CLI `copilot`, la extension puede seguir instalada pero el caso de uso principal queda incompleto.

### 5.3 MCP y OpenClaw si deben entrar en la arquitectura operativa base

El repo contiene varias capas, pero para este proyecto concreto conviene distinguir entre base minima de la extension y base operativa real. MCP y OpenClaw forman parte del funcionamiento que el repositorio espera para gateway, canales y automatizacion local. MT5 no.

### 5.4 La documentacion de Linux es verdadera, pero incompleta

Es correcto afirmar que la extension puede instalar el workspace sin PowerShell. No es correcto sugerir una experiencia Linux cerrada de punta a punta mientras sigan faltando:

- wrapper bash o script POSIX equivalente a `setup-project.ps1`
- distincion explicita entre Node 20 para build y Node 22 para OpenClaw
- distincion mas fuerte entre stack base extension+MCP+OpenClaw y el bloque opcional MT5

## 6. Riesgos e inconsistencias

### Riesgo alto

1. Dependencia del CLI `copilot` para el flujo principal del router. Si no hay login o token, la extension parece instalada pero su feature central queda inutilizable.

### Riesgo medio

2. Doble modo de carga entre [extension.js](../extension.js) y [src-js/extension.runtime.js](../src-js/extension.runtime.js). Esto facilita el desarrollo, pero obliga a distinguir claramente entre codigo fuente y bundle publicado.
3. Documentacion con mezcla de rutas base y herramientas heredadas. [README.md](../README.md) presenta Linux como soportado, pero sigue destacando scripts PowerShell como herramienta principal para anadir el agente a un proyecto.
4. Separacion difusa entre extension, MCP/OpenClaw y MT5. No todos pertenecen al mismo nivel operativo.
5. El bootstrap del gateway estaba generando una configuracion incompatible con OpenClaw 2026.4.14 al omitir `gateway.mode`.

### Riesgo bajo

6. En este Linux, `python` no esta enlazado a `python3`. El runtime intenta `python3` antes que `python`, asi que la extension base no queda bloqueada por esto.

## 7. Recomendaciones priorizadas

1. Separar formalmente en la documentacion tres niveles de instalacion:
   - extension VS Code base
   - stack operativo base: router Copilot + MCP + OpenClaw
   - integraciones opcionales: MT5
2. Anadir un script POSIX para bootstrap de proyecto que refleje el flujo ya implementado en `extension.runtime.js`.
3. Documentar de forma visible que OpenClaw actual requiere Node 22.14+ aunque la extension se empaquete con Node 20.
4. Publicar un VSIX firmado o al menos un artefacto precompilado por release para evitar que usuarios Linux dependan de Node/npm solo para instalar.
5. Documentar de forma mas visible que `copilot` autenticado no es opcional si se quiere usar el router.
6. Si se mantiene el bundle dual, anadir una nota de mantenimiento indicando cuando regenerar `dist/extension.cjs`.

## 8. Conclusion

El repositorio esta bien encaminado como extension de VS Code con runtime local y soporte Linux real. El punto mas fuerte es haber movido la instalacion desde PowerShell a Python dentro del runtime de la extension. El principal problema ya no es la compatibilidad general, sino la coordinacion entre dos runtimes Node distintos, la autenticacion de Copilot y la separacion documental entre stack base y extensiones opcionales.

En este equipo concreto, el stack base ya puede considerarse validado: VSIX construido, extension instalada, MCP verificado y OpenClaw resuelto. MT5 sigue fuera del flujo base.