# Modificaciones para VS Code Extension/Integracion

Este documento lista los cambios clave heredados de la linea v3.x para operar Free JT7 como integracion funcional en VS Code.

## Nucleo de integracion

1. Instrucciones de Copilot:
   - Archivo: `.github/copilot-instructions.md`
   - Funcion: protocolo operativo, comandos canonicos y reglas de ejecucion.

2. Definicion de agente:
   - Archivo: `.github/agents/free-jt7.agent.md`
   - Funcion: agente invocable en chat con flujo de plan, ejecucion y reporte.

3. Politica de ejecucion:
   - Archivo: `.github/free-jt7-policy.yaml`
   - Funcion: control de autonomia, riesgo, privilegios y checklist de salida.

4. Ruteo de modelos:
   - Archivo: `.github/free-jt7-model-routing.json`
   - Funcion: resolucion de modelo por IDE/perfil.

5. Configuracion VS Code:
   - Archivo: `.vscode/settings.json`
   - Funcion: activar `chat.agent.enabled`, ubicacion de agentes y archivo de instrucciones con rutas relativas.

## Runtime y automatizacion

1. Gestor principal:
   - Archivo: `skills_manager.py`
   - Funcion: instalacion, activacion de skills, operacion autonoma y utilidades admin.

2. Instalacion rapida por proyecto:
   - Scripts: `setup-project.ps1`, `add-free-jt7-agent.ps1`
   - Funcion: bootstrap de integracion en proyectos de usuario.

3. Extension instalable:
   - Archivos: `package.json`, `extension.js`, `.vscodeignore`
   - Funcion: empaquetar `.vsix` y exponer comandos para instalar/validar Free JT7 desde VS Code.

## Estado de v4.0

- Documentacion consolidada: completada.
- Importacion de runtime/codigo desde v3.1: completada.
- Extension VS Code instalable: completada.
