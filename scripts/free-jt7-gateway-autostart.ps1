param(
    [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

function Resolve-ProjectRoot {
    param([string]$InputRoot)
    if ([string]::IsNullOrWhiteSpace($InputRoot)) {
        return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    }
    return (Resolve-Path $InputRoot).Path
}

function Import-EnvFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    foreach ($raw in Get-Content $Path) {
        $line = "$raw".Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { continue }
        $parts = $line.Split("=", 2)
        $key = $parts[0].Trim().Trim([char]0xFEFF)
        $value = $parts[1]
        if ($key) {
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

function Is-GatewayListening {
    param([int]$Port)
    try {
        $match = netstat -ano | Select-String (":" + $Port + ".*LISTENING")
        return [bool]$match
    } catch {
        return $false
    }
}

$root = Resolve-ProjectRoot -InputRoot $ProjectRoot
$configPath = Join-Path $root ".openclaw\openclaw.json"
$stateDir = Join-Path $root ".openclaw\state"
$credPath = Join-Path $root ".secrets\free-jt7.env"
$logDir = Join-Path $root ".openclaw\logs"
$wrapperPath = Join-Path $root "scripts\openclaw-start.cmd"

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Import-EnvFile -Path $credPath
[Environment]::SetEnvironmentVariable("OPENCLAW_CONFIG_PATH", $configPath, "Process")
[Environment]::SetEnvironmentVariable("OPENCLAW_STATE_DIR", $stateDir, "Process")

if (Is-GatewayListening -Port 18789) {
    Write-Output "[free-jt7-autostart] gateway ya escuchando en 18789, no se relanza."
    exit 0
}

if (-not (Test-Path -LiteralPath $wrapperPath)) {
    throw "No se encontro el wrapper comun de OpenClaw: $wrapperPath"
}

Set-Location $root
& $wrapperPath gateway --port 18789 --verbose
