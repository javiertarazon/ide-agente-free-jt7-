---
name: agent-safety-governance
description: "Safety and governance framework for autonomous AI agents. Validates agent actions before execution, enforces permission boundaries, detects dangerous patterns (file deletion, env modification, network calls), and maintains audit trails. Use before deploying autonomous agents or when reviewing agent-generated code."
risk: low
source: github/awesome-copilot
---

# Agent Safety & Governance Framework

Validate, constrain, and audit autonomous agent actions before they affect production systems. Based on the **Agent Safety Reviewer** and **Devil's Advocate** agents from github/awesome-copilot.

## Core Principle

> "An autonomous agent that can't be stopped is not an asset â€” it's a liability."

Safety governance answers: **What can this agent do? What should it NOT do? Who reviews what it did?**

---

## Risk Classification

### Action Risk Levels

| Risk Level | Examples | Approval Required |
|-----------|---------|------------------|
| ðŸŸ¢ **LOW** | Read files, search codebase, generate code suggestions | None â€” auto-execute |
| ðŸŸ¡ **MEDIUM** | Write/edit files, install packages, run tests | Log + continue |
| ðŸŸ  **HIGH** | Delete files, modify config, commit/push | Human review checkpoint |
| ðŸ”´ **CRITICAL** | Drop database, modify secrets, external API calls with side effects | Explicit confirmation + audit |

---

## Pre-Execution Checklist

Before any autonomous task, validate:

### 1. Scope Validation
```
âœ… Does the task stay within the defined scope?
âœ… Are the files to be modified listed in the task manifest?
âœ… Is the agent working in the correct project directory?
âœ… Is there a git checkpoint to rollback to?
```

### 2. Dangerous Pattern Detection

Scan planned actions for:

```python
DANGEROUS_PATTERNS = [
    # File operations
    "rm -rf", "shutil.rmtree", "fs.rmSync", "os.remove",
    
    # Environment modification  
    ".env", "process.env", "os.environ", "secrets",
    
    # Network with side effects
    "POST /production", "DELETE /api", "PUT /prod",
    
    # Database
    "DROP TABLE", "DELETE FROM", "TRUNCATE",
    
    # Shell injection risks
    "subprocess.call", "exec(", "eval(", "shell=True",
    
    # Credential exposure
    "password", "api_key", "token", "secret" + "print|log|console"
]
```

If any pattern detected â†’ **PAUSE and require human review**.

### 3. Resource Limits

```yaml
agent_limits:
  max_files_modified: 20          # Per task
  max_file_size_kb: 500           # Max file to write
  max_test_iterations: 10         # TDD fix loops
  max_orchestration_depth: 5      # Nested sub-agents
  timeout_minutes: 30             # Hard stop
  allowed_directories:
    - "src/"
    - "tests/"
    - "docs/"
  forbidden_directories:
    - ".env*"
    - "*.secret"
    - "infra/"
    - ".ssh/"
```

---

## Devil's Advocate Review

Before completing any significant change, apply adversarial review:

### Questions to challenge the solution:

**Correctness:**
- What happens if the input is null/empty/negative?
- What's the worst-case performance (time + memory)?
- Are all error paths handled?

**Security:**
- Does this introduce any SQL injection vectors?
- Could an attacker exploit this change?
- Are secrets ever logged or exposed?

**Reliability:**
- What happens if the database is down?
- What if the external API returns 500?
- Is this idempotent (safe to call twice)?

**Maintainability:**
- Will the next developer understand this in 6 months?
- Are the test names descriptive enough?
- Is there hidden coupling?

**Completeness:**
- Were any edge cases missed?
- Are migrations backwards-compatible?
- Is the documentation updated?

---

## Audit Trail Format

Every agent action should be logged:

```jsonl
{"ts":"2026-02-23T14:30:00Z","agent":"gem-orchestrator","action":"write_file","path":"src/services/user.ts","risk":"medium","outcome":"success","lines_changed":47}
{"ts":"2026-02-23T14:30:15Z","agent":"polyglot-test-pipeline","action":"run_tests","framework":"jest","outcome":"8_pass_0_fail","coverage":"87%"}
{"ts":"2026-02-23T14:31:00Z","agent":"context-architect","action":"multi_file_change","files_affected":5,"risk":"high","human_reviewed":true,"outcome":"success"}
```

Log location: `copilot-agent/audit-log.jsonl`

---

## Rollback Protocol

### Automatic rollback triggers:
- Test failure rate > 20% after agent changes
- TypeScript/compile errors introduced
- File deletion detected outside whitelist
- Timeout exceeded

### Rollback commands:
```bash
# Git rollback
git stash  # undo uncommitted changes
git reset --hard HEAD~1  # undo last commit

# PowerShell equivalent
git checkout -- .  # discard all unstaged changes
```

### Checkpoint strategy:
```
Before starting:    git commit -m "checkpoint: pre-agent-task"
After each phase:   git commit -m "checkpoint: post-research-phase"
After completion:   git commit -m "feat: <description> [agent-assisted]"
```

---

## Governance Checklist (for Agent Task Review)

Use this checklist when reviewing agent-proposed changes:

```
SCOPE
[ ] Changes are confined to listed files
[ ] No unauthorized external API calls
[ ] No credential or secret access

CODE QUALITY  
[ ] Tests written or updated
[ ] No obvious security vulnerabilities
[ ] Error handling present
[ ] No dead code introduced

SAFETY
[ ] No irreversible operations (unguarded deletes)
[ ] Rollback is possible at any point
[ ] Audit log entry created

COMPLETENESS
[ ] All acceptance criteria met
[ ] Documentation updated if public API changed
[ ] Migration scripts included if schema changed
```

---

## Integration with Free JT7

- Use with `agent-orchestration` to add safety gates between sub-agent calls
- Apply **Devil's Advocate** review before `context-multi-file` commits
- Combine with `verification-before-completion` for final checks
- Log to `copilot-agent/audit-log.jsonl` (already used by Free JT7 agent system)

