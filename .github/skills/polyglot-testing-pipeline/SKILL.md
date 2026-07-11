---
name: polyglot-testing-pipeline
description: "Autonomous multi-agent testing pipeline that generates comprehensive tests for any language (Python, TypeScript, Go, Rust, Java, C#). Orchestrates Researcher → Planner → Implementer → Tester → Fixer → Linter agents. Use when asked to generate tests, add test coverage, or test a codebase autonomously."
risk: low
source: github/awesome-copilot
---

# Polyglot Testing Pipeline

Autonomous 6-agent pipeline for comprehensive test generation across any programming language. Based on the **Polyglot Test Generator** pattern from github/awesome-copilot.

## Supported Languages

Python · TypeScript · JavaScript · Go · Rust · Java · C# · Ruby · PHP · Swift · Kotlin

## Pipeline Architecture

```
Polyglot Test Generator (Orchestrator)
  │
  ├─► 1. Researcher     — Analyzes existing code and test patterns
  ├─► 2. Planner        — Designs test strategy and coverage goals
  ├─► 3. Implementer    — Writes the actual test code
  ├─► 4. Tester         — Runs tests and captures failures
  ├─► 5. Fixer          — Diagnoses and fixes failing tests
  └─► 6. Linter         — Enforces style and test quality standards
```

---

## Stage Descriptions

### Stage 1 — Researcher

**Input**: Source file(s) to test  
**Output**: Analysis report

Tasks:
- Identify functions, classes, methods to test
- Detect existing test patterns/frameworks in the project
- Find edge cases from type signatures and docstrings
- Map dependencies that need mocking

```
Detected framework: pytest (Python)
Test coverage: 23% (needs: 80%+)
Functions to test: 12 (5 pure, 7 with side effects)
Mocks needed: database.users, external_api.fetch
```

### Stage 2 — Planner

**Input**: Researcher report  
**Output**: Test plan with priorities

```yaml
test_plan:
  - id: "test_user_create"
    priority: high
    type: unit
    inputs: [valid_data, invalid_email, duplicate_username]
    expected: [201, 422, 409]
    mocks: [db.users.insert]
    
  - id: "test_auth_flow"
    priority: critical
    type: integration
    steps: [register → login → access_protected → logout]
```

### Stage 3 — Implementer

**Input**: Test plan  
**Output**: Complete test file(s)

Writes tests following project conventions:
- Uses correct assertion style for the framework
- Implements fixtures/factories for test data
- Applies proper mocking patterns
- Groups tests logically (describe/context blocks)

### Stage 4 — Tester

**Input**: Generated tests  
**Output**: Test run results + failure report

- Executes the test suite
- Captures stdout/stderr
- Identifies flaky vs consistently failing tests
- Categorizes failures: assertion error, import error, timeout, etc.

### Stage 5 — Fixer

**Input**: Failure report  
**Output**: Fixed test file(s)

Fix strategies by error type:
| Error Type | Fix Strategy |
|-----------|-------------|
| ImportError | Add missing imports, check module path |
| AssertionError | Correct expected values from actual behavior |
| MockError | Fix mock setup, verify call signatures |
| TimeoutError | Add async handling, increase timeout |
| FixtureError | Fix fixture scope, add missing yields |

### Stage 6 — Linter

**Input**: Fixed tests  
**Output**: Final polished test file(s)

Enforces:
- Test naming conventions (`test_<action>_<condition>_<expected>`)
- No duplicate test logic
- Each test has exactly one assertion (where possible)
- All tests have docstrings
- Coverage target met (default 80%)

---

## Framework Detection Rules

| Language | Frameworks (in priority order) |
|----------|-------------------------------|
| Python | pytest → unittest → nose2 |
| TypeScript/JS | Jest → Vitest → Mocha → Jasmine |
| Go | testing (std) → testify → ginkgo |
| Rust | cargo test → rstest |
| Java | JUnit 5 → TestNG |
| C# | xUnit → NUnit → MSTest |
| Ruby | RSpec → minitest |

---

## Usage

### Invoke full pipeline:
```
@workspace Run the polyglot testing pipeline on src/services/user.service.ts
Target coverage: 85%
Framework: Jest (TypeScript)
```

### Invoke specific stage:
```
@workspace Run only Stage 3 (Implementer) using the attached test plan.
```

### Add tests to existing suite:
```
@workspace The test file tests/test_auth.py exists. 
Add coverage for the new password reset flow in src/auth/reset.py
```

---

## Output Format

```
📦 Polyglot Test Pipeline — Complete
Language: Python | Framework: pytest
Source: src/services/user_service.py

📋 Plan: 8 test functions across 3 test classes
✅ Tests written: tests/test_user_service.py
🧪 Run results: 8 passed, 0 failed
🎯 Coverage: 87% (target: 80%) ✅
🔍 Lint: 0 warnings
```

---

## Integration

- Use with `tdd-full-cycle` when building new features
- Use with `agent-orchestration` as the testing sub-agent
- Use with `context-multi-file` for integration tests spanning multiple files
