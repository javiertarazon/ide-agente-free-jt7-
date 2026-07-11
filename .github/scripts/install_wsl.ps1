<#
Idempotent PowerShell script to enable WSL and install Ubuntu.
Requires running in an elevated (Administrator) PowerShell session.
Use: Open PowerShell as Administrator and run:
    .\install_wsl.ps1
#>

function Ensure-Administrator {
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Error "Este script debe ejecutarse en una sesión de PowerShell elevada (Administrador)."
        exit 1
    }
}

Ensure-Administrator

try {
    Write-Output "Habilitando característica: Subsistema de Windows para Linux (WSL)..."
    Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart -ErrorAction Stop

    Write-Output "Habilitando característica: Virtual Machine Platform..."
    Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart -ErrorAction Stop

    Write-Output "Reinicia Windows si es necesario y luego vuelve a ejecutar este script para completar la instalación de la distro."

    Write-Output "Intentando instalar WSL y la distro Ubuntu (si el comando 'wsl.exe --install' está disponible)..."
    # Usa wsl.exe --install si está disponible (Windows 10/11 actualizado)
    $wslPath = (Get-Command wsl.exe -ErrorAction SilentlyContinue).Source
    if ($wslPath) {
        Write-Output "Ejecutando: wsl --install -d Ubuntu"
        wsl --install -d Ubuntu
        Write-Output "Si la instalación continua, sigue las instrucciones en pantalla para crear el usuario de Ubuntu."
    } else {
        Write-Warning "No se encontró 'wsl.exe' en PATH; revisa la versión de Windows o instala la actualización necesaria."
    }

    Write-Output "Instalación finalizada (si no hubo errores)."
} catch {
    Write-Error "Error durante la instalación: $_"
    exit 1
}
