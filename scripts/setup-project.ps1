<#
.SYNOPSIS
    Instala Agente Free JT7 en un proyecto y adapta la configuracion por IDE.
    (script ubicado en scripts/ junto con otros utilitarios)

.DESCRIPTION
    Wrapper de instalacion que delega en skills_manager.py:
      python skills_manager.py install <ProjectPath> --ide <target>

    Este es el script preferido; `add-free-jt7-agent.ps1` es una versión
    simplificada que persiste sólo por compatibilidad.

.PARAMETER ProjectPath
    Ruta del proyecto destino. Por defecto: carpeta actual.

.PARAMETER AgentPath
    Ruta del repositorio Agente Free JT7. Si se omite, intenta autodeteccion.

.PARAMETER Ide
    IDE objetivo: auto, all, vscode, cursor, kiro, antigravity, codex, claude-code, gemini-cli.

.PARAMETER UpdateUserSettings
    Si se activa, actualiza settings de usuario del IDE seleccionado.

.PARAMETER Force
    Sobrescribe archivos de integracion existentes.
#>

param(
    [string]$ProjectPath = (Get-Location).Path,
    [string]$AgentPath = "",
    [ValidateSet("auto", "all", "vscode", "cursor", "kiro", "antigravity", "codex", "claude-code", "gemini-cli")]
    [string]$Ide = "all",
    [switch]$UpdateUserSettings,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$repoUrl = "https://github.com/javiertarazon/agente-freejt7-extension-funcional.git"

function Write-Step([string]$msg) { Write-Host "`n[setup] $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg) { Write-Host "[ok] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "[warn] $msg" -ForegroundColor Yellow }
function Write-Err([string]$msg) { Write-Host "[error] $msg" -ForegroundColor Red }

function Resolve-Python([string]$RepoRoot) {
    $candidates = @(
        (Join-Path $RepoRoot ".venv\Scripts\python.exe"),
        "python",
        "py -3"
    )
    foreach ($candidate in $candidates) {
        try {
            if ($candidate -like "* *") {
                $parts = $candidate.Split(" ", 2)
                & $parts[0] $parts[1] -c "import sys" *> $null
            } else {
                if ((Test-Path $candidate) -or ($candidate -eq "python")) {
                    & $candidate -c "import sys" *> $null
                } else {
                    continue
                }
            }
            if ($LASTEXITCODE -eq 0) {
                return $candidate
            }
        } catch {
        }
    }
    return "python"
}

function Resolve-AgentPath {
    param([string]$RequestedPath)

    if ($RequestedPath) {
        if (Test-Path (Join-Path $RequestedPath "skills_manager.py")) {
            return (Resolve-Path -LiteralPath $RequestedPath).Path
        }
        throw "AgentPath invalido: no existe skills_manager.py en $RequestedPath"
    }

    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $candidates = @(
        $scriptDir,
        "D:\agente-freejt7-extension-funcional",
        "E:\javie\agente-freejt7-extension-funcional",
        "$env:USERPROFILE\agente-freejt7-extension-funcional",
        "$env:USERPROFILE\Documents\agente-freejt7-extension-funcional"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path (Join-Path $candidate "skills_manager.py")) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    Write-Warn "No se detecto repositorio local Agente Free JT7."
    $clone = Read-Host "Clonar desde GitHub en '$env:USERPROFILE\agente-freejt7-extension-funcional'? [S/n]"
    if ($clone -eq "n") {
        throw "Instalacion cancelada."
    }
    $destination = "$env:USERPROFILE\agente-freejt7-extension-funcional"
    git clone $repoUrl $destination | Out-Null
    if (-not (Test-Path (Join-Path $destination "skills_manager.py"))) {
        throw "No se pudo clonar el repositorio."
    }
    return (Resolve-Path -LiteralPath $destination).Path
}

try {
    if (-not $PSBoundParameters.ContainsKey("UpdateUserSettings")) {
        $UpdateUserSettings = $true
    }

    Write-Step "Detectando repositorio Agente Free JT7"
    $resolvedAgentPath = Resolve-AgentPath -RequestedPath $AgentPath
    Write-Ok "Repositorio: $resolvedAgentPath"

    $manager = Join-Path $resolvedAgentPath "skills_manager.py"
    $pythonExe = Resolve-Python $resolvedAgentPath

    if (-not (Test-Path -LiteralPath $ProjectPath)) {
        Write-Step "Creando proyecto destino: $ProjectPath"
        New-Item -ItemType Directory -Path $ProjectPath -Force | Out-Null
    }
    $resolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path

    $cmdArgs = @($manager, "install", $resolvedProjectPath, "--ide", $Ide)
    if ($UpdateUserSettings) { $cmdArgs += "--update-user-settings" }
    if ($Force) { $cmdArgs += "--force" }

    Write-Step "Ejecutando instalacion"
    Write-Host "$pythonExe $($cmdArgs -join ' ')"
    if ($pythonExe -eq "py -3") {
        & py -3 @cmdArgs
    } else {
        & $pythonExe @cmdArgs
    }
    if ($LASTEXITCODE -ne 0) {
        throw "skills_manager.py devolvio codigo $LASTEXITCODE"
    }

    Write-Ok "Instalacion completada"
    Write-Host "Proyecto: $resolvedProjectPath"
    Write-Host "IDE: $Ide"
    if ($UpdateUserSettings) {
        Write-Host "Settings de usuario: actualizados"
    }
    exit 0
}
catch {
    Write-Err $_
    exit 1
}
