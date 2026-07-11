param(
    [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $ProjectRoot = (Resolve-Path $ProjectRoot).Path
}

$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$startupCmd = Join-Path $startupDir "free-jt7-gateway.cmd"
$runner = Join-Path $ProjectRoot "scripts\free-jt7-gateway-autostart.ps1"

if (-not (Test-Path $runner)) {
    throw "No existe script runner: $runner"
}

New-Item -ItemType Directory -Force -Path $startupDir | Out-Null

$cmdLines = @(
    "@echo off",
    "setlocal",
    "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`" -ProjectRoot `"$ProjectRoot`"",
    "endlocal"
)

$cmdLines -join "`r`n" | Set-Content -Path $startupCmd -Encoding ASCII
Write-Output "[free-jt7-autostart] Startup instalado: $startupCmd"

# Intento opcional: Scheduled Task por usuario (si politica lo permite).
try {
    $taskName = "FreeJT7 Gateway"
    $userId = "$env:USERDOMAIN\$env:USERNAME"
    $taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`" -ProjectRoot `"$ProjectRoot`""
    $taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId $userId -RunLevel Limited -LogonType InteractiveToken
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Force | Out-Null
    Write-Output "[free-jt7-autostart] Task Scheduler instalado: $taskName"
} catch {
    Write-Output "[free-jt7-autostart] Task Scheduler no disponible; Startup de usuario queda activo."
}

Write-Output "[free-jt7-autostart] OK"
