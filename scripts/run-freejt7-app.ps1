$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$bootstrap = Join-Path $root "scripts\freejt7-app-bootstrap.js"

if (-not (Test-Path -LiteralPath $bootstrap)) {
    throw "No se encontro bootstrap script: $bootstrap"
}

$node = Get-Command node -ErrorAction Stop | Select-Object -ExpandProperty Source
& $node $bootstrap @args
exit $LASTEXITCODE
