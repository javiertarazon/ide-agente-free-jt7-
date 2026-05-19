#!/usr/bin/env python3
from __future__ import annotations
import json, subprocess, time

CHECKS = [
    ["node", "tests/swarm_orchestrator_smoke.js"],
    ["node", "tests/capability_activation_smoke.js"],
    ["node", "tests/provider_core_smoke.js"],
    ["node", "tests/agent_search_smoke.js"],
    ["node", "tests/semantic_memory_smoke.js"],
    ["node", "tests/context_compaction_smoke.js"],
    ["node", "tests/chat_context_smoke.js"],
    ["npm", "run", "test:provider-router-failover-smoke"],
    ["npm", "run", "test:provider-model-catalog-smoke"],
    ["npm", "run", "test:policy-engine-profiles-smoke"],
    ["npm", "run", "test:session-engine-subagent-tools-smoke"],
    ["npm", "run", "test:session-engine-verification-smoke"],
    ["npm", "run", "test:mcp-documents-tools-smoke"],
    ["npm", "run", "test:mcp-security-smoke"],
    ["npm", "run", "test:freejt7-own-ide-bootstrap-smoke"],
    ["pytest", "-q", "tests/test_agent_evaluation.py", "tests/test_migrate_agent_state_dir.py", "tests/test_task_run_cross_platform.py"],
    ["python", "tools/quality/run_quality_gate.py", "--flake-runs", "3", "--json"],
    ["npm", "run", "build:bundle"],
    ["npm", "run", "package:local"],
]


def run(cmd):
    t0 = time.time()
    p = subprocess.run(cmd, text=True, capture_output=True)
    return {
        "cmd": " ".join(cmd),
        "code": p.returncode,
        "seconds": round(time.time() - t0, 2),
        "stdout": p.stdout[-3000:],
        "stderr": p.stderr[-3000:],
    }


def main():
    report = {"checks": [], "pass": True}
    for cmd in CHECKS:
        result = run(cmd)
        report["checks"].append(result)
        if result["code"] != 0:
            report["pass"] = False
            break

    total = len(report["checks"])
    ok = sum(1 for item in report["checks"] if item["code"] == 0)
    report["metrics"] = {"checks_executed": total, "checks_ok": ok, "pass_rate": round((ok / max(1, total)) * 100, 2)}
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["pass"] else 1

if __name__ == '__main__':
    raise SystemExit(main())
