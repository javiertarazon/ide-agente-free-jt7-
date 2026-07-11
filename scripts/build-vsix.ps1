param(
    [switch]$InstallDeps
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    if ($InstallDeps) {
        Write-Host "[build-vsix] npm install"
        & npm.cmd install
        if ($LASTEXITCODE -ne 0) { throw "npm install fallo con codigo $LASTEXITCODE" }
    }

    Write-Host "[build-vsix] npm run package"
    & npm.cmd run package
    if ($LASTEXITCODE -ne 0) { throw "npm run package fallo con codigo $LASTEXITCODE" }
}
finally {
    Pop-Location
}
