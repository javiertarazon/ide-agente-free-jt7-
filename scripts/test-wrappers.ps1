# smoke tests para wrappers CLI y helper JS
$ErrorActionPreference = 'Stop'

Write-Host '[test] running openclaw-start.cmd --version'
try {
    & "$PSScriptRoot\openclaw-start.cmd" --version
} catch {
    Write-Host "[test] openclaw-start.cmd failed: $_"
}

# test runOpenClaw via node
Write-Host '[test] running runOpenClaw helper from extension.js'
$node = 'node'
$cwd = Get-Location
Push-Location $PSScriptRoot\..\
$code = @"
const {runOpenClaw}=require('./extension.js');
(async()=>{
  await runOpenClaw(['--version'],{
    append:console.log,appendLine:console.log
  });
})();
"@

try {
    & $node -e $code
} catch {
    Write-Host "[test] node helper failed: $_"
}
Pop-Location

Write-Host '[test] done'
