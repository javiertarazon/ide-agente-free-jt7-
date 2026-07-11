@echo off
REM wrapper generico para resolver OpenClaw desde el workspace o desde PATH.
REM Si no recibe argumentos, arranca el gateway local por defecto.
SETLOCAL
set "WORKSPACE=%~dp0..\"
set "OPENCLAW_ENTRY=%WORKSPACE%OPEN CLAW\openclaw.mjs"
set "OPENCLAW_BIN=%WORKSPACE%OPEN CLAW\node_modules\.bin\openclaw"
set "OPENCLAW_ARGS=%*"

if "%~1"=="" (
  set "OPENCLAW_ARGS=gateway --port 18789"
)

if defined FREE_JT7_OPENCLAW_CMD (
  call %FREE_JT7_OPENCLAW_CMD% %OPENCLAW_ARGS%
  exit /b %ERRORLEVEL%
)

if exist "%OPENCLAW_BIN%" (
  call "%OPENCLAW_BIN%" %OPENCLAW_ARGS%
  exit /b %ERRORLEVEL%
)

if exist "%OPENCLAW_ENTRY%" (
  for /f "delims=" %%N in ('where node 2^>nul') do (
    set "NODE_EXE=%%N"
    goto :node_found
  )
  echo [free-jt7-openclaw] ERROR: Node.js no encontrado en PATH.
  exit /b 1
)

where openclaw >nul 2>nul
if %ERRORLEVEL%==0 (
  call openclaw %OPENCLAW_ARGS%
  exit /b %ERRORLEVEL%
)

echo [free-jt7-openclaw] ERROR: no se encontro OpenClaw ni local ni en PATH.
exit /b 1

:node_found
call "%NODE_EXE%" "%OPENCLAW_ENTRY%" %OPENCLAW_ARGS%
exit /b %ERRORLEVEL%
