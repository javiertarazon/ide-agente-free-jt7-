<#
.SYNOPSIS
    Wrapper de compatibilidad para instalaciones heredadas de Free JT7.

.DESCRIPTION
    Este script ya no mantiene lógica propia. Delegará siempre en
    `scripts/setup-project.ps1` para evitar duplicidad y mantener un único
    flujo soportado de instalación.
#>

param(
    [string]$Path = ".",
    [ValidateSet("auto", "all", "vscode", "cursor", "kiro", "antigravity", "codex", "claude-code", "gemini-cli")]
    [string]$Ide = "all",
    [switch]$UpdateUserSettings,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$delegate = Join-Path $scriptDir "setup-project.ps1"

if (-not (Test-Path -LiteralPath $delegate)) {
    Write-Error "[add-free-jt7-agent] no se encontro el instalador principal en $delegate"
    exit 1
}

$forwardArgs = @{
    ProjectPath = $Path
    Ide = $Ide
}

if ($PSBoundParameters.ContainsKey("UpdateUserSettings") -and $UpdateUserSettings) {
    $forwardArgs["UpdateUserSettings"] = $true
}
if ($Force) {
    $forwardArgs["Force"] = $true
}

Write-Host "[add-free-jt7-agent] wrapper heredado: delegando en scripts/setup-project.ps1" -ForegroundColor Yellow

& $delegate @forwardArgs
exit $LASTEXITCODE
