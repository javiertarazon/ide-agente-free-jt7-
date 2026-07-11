---
name: agent-orchestration
description: "Multi-agent orchestration patterns using Gem/RUG Orchestrator style: decompose goals, delegate to sub-agents, validate and repeat until complete. Use when coordinating multiple specialized agents for complex autonomous tasks."
risk: medium
source: github/awesome-copilot
---

# Agent Orchestration â€” Gem/RUG Pattern

Orchestrate multiple specialized sub-agents to accomplish complex goals autonomously. Based on the **Gem Orchestrator** and **RUG Orchestrator** patterns from github/awesome-copilot.

## When to Use

- Task requires multiple domains of expertise (research + code + testing + review)
- Work can be parallelized into independent sub-tasks
- Goal is too large for a single context window
- You need autonomous execution with validation loops

## Core Orchestration Loop

```
GOAL â†’ DECOMPOSE â†’ DELEGATE â†’ COLLECT â†’ VALIDATE â†’ DONE?
                                                  â†’ repeat if not
```

### 1. Goal Decomposition

Break the goal into independent tasks with clear outputs:

```
Goal: "Build a FastAPI endpoint with tests and docs"
â†’ Task A: Research existing patterns in codebase
â†’ Task B: Implement the endpoint
â†’ Task C: Write unit + integration tests
â†’ Task D: Generate OpenAPI documentation
```

### 2. Sub-agent Delegation

Delegate each task with full context:

```
AgentTask {
  id: "task-b-implement",
  role: "Senior Backend Developer",
  context: <codebase patterns from Task A>,
  instruction: "Implement FastAPI endpoint for /users/{id}...",
  output_format: "Python file with type hints",
  validation: "must pass pytest"
}
```

### 3. Result Collection & Validation

After each sub-agent completes:
- Verify output matches expected format
- Check acceptance criteria
- If failed â†’ retry with corrected context
- If passed â†’ pass result as context to next task

### 4. Synthesis

Combine sub-agent outputs into final coherent result. Resolve conflicts between sub-agents if any.

---

## RUG Pattern (Pure Orchestration)

The RUG Orchestrator never writes code directly â€” it only:
1. **Reads** the current state (files, errors, requirements)
2. **Understands** what tasks are needed
3. **Gets** the right sub-agent to do each task

```
while not goal_complete:
    state = read_current_state()
    next_task = determine_next_task(state, goal)
    if next_task:
        result = delegate_to_subagent(next_task)
        update_state(result)
    else:
        goal_complete = True
```

---

## Sub-agent Roster

| Sub-agent | Specialization | When to call |
|-----------|---------------|--------------|
| **Gem Researcher** | Codebase analysis, pattern discovery | Before implementation |
| **Gem Planner** | Architecture, task breakdown | Complex features |
| **Gem Implementer** | Code writing, refactoring | Writing code |
| **QA Subagent** | Test generation, coverage | After implementation |
| **SWE Subagent** | Full-stack debugging | Error fixing |
| **Devil's Advocate** | Critique, edge cases | Before finalization |

---

## Orchestrator Prompt Template

```
You are an orchestrator agent. Your goal: {GOAL}

Current state:
- Files modified: {FILE_LIST}
- Tests passing: {TEST_STATUS}
- Completed tasks: {COMPLETED}
- Remaining: {REMAINING}

Next action: Determine the single next task that unblocks progress toward the goal.
Delegate it to the appropriate sub-agent with full context.
Do NOT implement anything yourself.
```

---

## Safety Rules

1. **Validate before proceeding** â€” never pass unvalidated output downstream
2. **Idempotency** â€” sub-agents should be re-runnable without side effects
3. **Context isolation** â€” each sub-agent gets only what it needs
4. **Rollback plan** â€” maintain git checkpoint before starting orchestration
5. **Max iterations** â€” set a hard limit (e.g., 10 cycles) to prevent infinite loops

---

## Integration with Free JT7

Combine with other skills:
- `dispatching-parallel-agents` â€” for truly independent parallel tasks
- `context-multi-file` â€” when sub-agents need cross-file context
- `polyglot-testing-pipeline` â€” for autonomous testing sub-tasks
- `tdd-full-cycle` â€” when implementation follows TDD
- `agent-safety-governance` â€” to validate agent actions before execution

