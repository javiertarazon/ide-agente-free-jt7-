import json
import os
import sys


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUTOLEARN_DIR = os.path.join(ROOT, "tools", "agent_autolearn")
sys.path.insert(0, AUTOLEARN_DIR)

from evaluator import evaluate_example, read_jsonl
from collect_from_runs import collect_runs


def test_evaluate_example_accepts_validated_python_fix():
    evaluation = evaluate_example(
        "Corrige el fallo de pytest",
        "Se añade validación en el collector y se actualizan las pruebas.",
        metadata={
            "source": "run-automation",
            "status": "succeeded",
            "quality_gate_passed": True,
            "validator_passed": True,
            "steps_count": 3,
            "commands": ["pytest tests/test_autolearn_evaluator.py -q", "python tools/agent_autolearn/collect_from_runs.py"],
        },
    )

    assert evaluation["accepted"] is True
    assert evaluation["regression_candidate"] is True
    assert evaluation["task_type"] == "validation"
    assert "stack:python" in evaluation["tags"]


def test_evaluate_example_rejects_failed_quality_gate():
    evaluation = evaluate_example(
        "runtime-audit",
        "Bloqueado por quality gate",
        metadata={
            "source": "run-automation",
            "status": "blocked",
            "quality_gate_passed": False,
            "steps_count": 1,
            "commands": ["node smoke.js"],
        },
    )

    assert evaluation["accepted"] is False
    assert evaluation["error_type"] == "quality-gate"
    assert "quality:blocked" in evaluation["tags"]


def test_collect_runs_generates_dataset_evaluations_packs_and_hints(tmp_path):
    runs_dir = tmp_path / "runs"
    runs_dir.mkdir()
    dataset = tmp_path / "dataset.jsonl"
    state = tmp_path / "processed_runs.json"
    evaluations = tmp_path / "evaluations.jsonl"
    regression_dir = tmp_path / "regression-packs"
    routing_hints = tmp_path / "routing_hints.json"

    successful_run = {
        "run_id": "run-success",
        "user_goal": "Corrige pytest roto",
        "summary": "Se corrigio el pipeline de pytest y se anadieron tests.",
        "status": "succeeded",
        "risk_level": "medium",
        "quality_gate": {"passed": True},
        "steps": [
            {"command": "pytest tests/test_autolearn_evaluator.py -q", "exit_code": 0},
            {"command": "python tools/agent_autolearn/collect_from_runs.py", "exit_code": 0},
        ],
        "skills_selected": [{"id": "python-testing-patterns"}],
        "ended_at": "2026-04-19T15:20:00Z",
    }
    failed_run = {
        "run_id": "run-failed",
        "user_goal": "runtime-audit",
        "summary": "Bloqueado por quality gate",
        "status": "blocked",
        "risk_level": "low",
        "quality_gate": {"passed": False},
        "steps": [
            {"command": "node smoke.js", "exit_code": 1},
        ],
        "skills_selected": [{"id": "free-jt7-global-runtime-audit"}],
        "ended_at": "2026-04-19T15:21:00Z",
    }

    (runs_dir / "run-success.json").write_text(json.dumps(successful_run), encoding="utf-8")
    (runs_dir / "run-failed.json").write_text(json.dumps(failed_run), encoding="utf-8")

    result = collect_runs(runs_dir, dataset, state, evaluations, regression_dir, routing_hints)

    assert result["processed"] == 2
    assert result["evaluated"] == 2
    assert result["accepted"] == 1

    dataset_rows = read_jsonl(dataset)
    assert len(dataset_rows) == 1
    assert dataset_rows[0]["task_type"] == "validation"
    assert dataset_rows[0]["evaluation"]["regression_candidate"] is True

    evaluation_rows = read_jsonl(evaluations)
    assert len(evaluation_rows) == 2
    assert any(row["evaluation"]["accepted"] is False for row in evaluation_rows)

    index = json.loads((regression_dir / "index.json").read_text(encoding="utf-8"))
    assert index["total_packs"] >= 1
    assert index["total_cases"] == 1

    hints = json.loads(routing_hints.read_text(encoding="utf-8"))
    assert hints["summary"]["evaluated"] == 2
    assert hints["summary"]["accepted"] == 1
    assert hints["recommendations"][0]["task_type"] == "validation"