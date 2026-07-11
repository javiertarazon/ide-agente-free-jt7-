# Script para deshabilitar Windows Update
$ErrorActionPreference = "Stop"

Write-Host "[Windows Update] Deteniendo servicio wuauserv..." -ForegroundColor Yellow

# Detener el servicio
Stop-Service -Name wuauserv -Force -ErrorAction SilentlyContinue
Write-Host "[Windows Update] Servicio detenido" -ForegroundColor Green

# Deshabilitar el servicio (no se inicie automáticamente)
Write-Host "[Windows Update] Deshabilitando servicio..." -ForegroundColor Yellow
Set-Service -Name wuauserv -StartupType Disabled
Write-Host "[Windows Update] Servicio deshabilitado" -ForegroundColor Green

# Mostrar estado actual
Write-Host "`n[Windows Update] Estado actual:" -ForegroundColor Cyan
Get-Service -Name wuauserv | Select-Object Name, StartupType, Status

Write-Host "`n✓ Windows Update está deshabilitado" -ForegroundColor Green
Write-Host "Las actualizaciones de Windows no se ejecutarán automáticamente" -ForegroundColor Gray

Read-Host "Presiona Enter para salir"
