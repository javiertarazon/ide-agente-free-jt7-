# Runtime Checklist

## Base Validation

```powershell
python skills_manager.py policy-validate
python skills_manager.py doctor --strict
python skills_manager.py rollout-mode
python skills_manager.py host-mode status
```

Expected:
- policy validates with no errors
- doctor exits 0 in strict mode
- rollout mode is explicit
- host-mode status reports policy and gateway exec state

## Capability Probes

```powershell
python skills_manager.py task-run --goal "capability-probe" --commands "New-Item -ItemType Directory -Path tests/runtime-probe -Force | Out-Null" "Set-Content tests/runtime-probe/probe.txt ok" "Get-Content tests/runtime-probe/probe.txt" "Get-Process | Select-Object -First 3 -ExpandProperty ProcessName" "(Invoke-WebRequest -UseBasicParsing -Uri https://example.com).StatusCode" "Remove-Item -Recurse -Force tests/runtime-probe"
```

Expected:
- all steps exit 0
- task-close status is succeeded
- run events persisted

## Traceability

```powershell
python skills_manager.py task-list --limit 20
python skills_manager.py task-checklist --run-id <run_id>
```

Expected:
- run visible in list with final status
- checklist shows each step and exit code
- tasks.yaml contains/upserts the run id and completion state

## Cross-IDE

```powershell
python skills_manager.py ide-detect --json
python skills_manager.py model-resolve --ide codex --profile default --json
python skills_manager.py model-resolve --ide claude-code --profile default --json
python skills_manager.py model-resolve --ide gemini-cli --profile default --json
```

Expected:
- each requested IDE resolves with provider/model/auth_mode
- bridge files exist under .codex/.claude/.gemini in workspace when installed
