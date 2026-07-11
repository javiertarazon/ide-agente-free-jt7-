---
name: free-jt7-global-runtime-audit
description: Audit and enforce Free JT7 global runtime behavior across IDEs (Copilot, Codex, Claude, Gemini), including filesystem/process/network execution, policy and host mode, task traceability, and skill activation proof. Use when the user asks for full autonomy checks, global setup, missing permissions/capabilities, checklist/task-list validation, or end-to-end operational evidence.
---

# Free JT7 Global Runtime Audit

## Overview

Use this skill to run a deterministic audit and hardening flow for Free JT7 runtime behavior.
Focus on executable evidence, not assumptions.

## Workflow

1. Validate core runtime policy and health.
2. Validate local execution capabilities (filesystem, processes, network).
3. Validate cross-IDE resolution and bridge files.
4. Validate traceability artifacts and checklist status.
5. Apply fixes, rerun checks, and produce evidence paths.

## Mandatory Commands

Run these commands in order:

```powershell
python skills_manager.py policy-validate
python skills_manager.py doctor --strict
python skills_manager.py rollout-mode
python skills_manager.py host-mode status
python skills_manager.py ide-detect --json
```

Then execute one audited run:

```powershell
python skills_manager.py task-run --goal "runtime-audit" --commands "Get-ChildItem" "python --version"
python skills_manager.py task-list --limit 10
python skills_manager.py task-checklist --run-id <run_id>
```

## Fix Rules

- If `task-list` or `task-checklist` is missing, implement those commands before closing.
- If task runs are not reflected in `copilot-agent/tasks.yaml`, implement upsert/update logic.
- If Codex user settings are not updated by `install --update-user-settings`, add support in settings updater.
- If docs contain hardcoded old paths, replace with relative runtime commands.

## Evidence

Always provide:

- Latest run JSON path in `copilot-agent/runs/`.
- Latest checklist output for the validated run.
- Files changed to fix missing behavior.

## Reference

For a full command matrix and expected outputs, read:
`references/runtime-checklist.md`
