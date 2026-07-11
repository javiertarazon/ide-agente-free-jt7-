"""Scan copilot-agent/runs, evaluate each run and append only accepted examples.

Usage:
    python collect_from_runs.py [--runs-dir PATH] [--dataset PATH] [--state PATH]

The script keeps a state file recording which run_ids have been processed, so
it can be run repeatedly (e.g. from a scheduled task or as a post-run hook).
Every new run is evaluated and logged; only accepted examples are appended to
dataset.jsonl. Regression packs and routing hints are refreshed afterwards.
"""

import argparse
import json
from pathlib import Path

from evaluator import (
    DEFAULT_ACCEPTANCE_THRESHOLD,
    append_evaluation_log,
    append_jsonl,
    build_dataset_row,
    evaluate_example,
    fingerprint,
)
from regression_packs import refresh_regression_artifacts


def load_json(path: Path):
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def append_jsonl(path: Path, row: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=True) + "\n")


def _commands_from_steps(steps: list[dict]) -> list[str]:
    commands = []
    for step in steps or []:
        command = step.get("command") or step.get("normalized_command")
        if isinstance(command, str) and command.strip():
            commands.append(command.strip())
    return commands


def _primary_stack_from_steps(steps: list[dict]) -> list[str]:
    joined = "\n".join(_commands_from_steps(steps)).lower()
    stacks = []
    if any(token in joined for token in ("pytest", "python", ".py", "pip ")):
        stacks.append("python")
    if any(token in joined for token in ("node", "npm", ".js")):
        stacks.append("javascript")
    if any(token in joined for token in ("pwd", "grep", "cat ", "ls ", "bash", "sh ")):
        stacks.append("shell")
    return stacks or ["general"]


def collect_runs(
    runs_path: Path,
    dataset_path: Path,
    state_path: Path,
    evaluations_path: Path,
    regression_packs_path: Path,
    routing_hints_path: Path,
    threshold: float = DEFAULT_ACCEPTANCE_THRESHOLD,
) -> dict:
    processed = set(load_json(state_path).get("processed", []))

    hashes = set()
    if dataset_path.exists():
        for line in dataset_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue
            h = row.get("hash")
            if h:
                hashes.add(h)

    updated = False
    new_processed = []
    evaluated = 0
    accepted = 0

    for runfile in runs_path.glob("*.json"):
        try:
            run = json.loads(runfile.read_text(encoding="utf-8"))
        except Exception:
            continue
        rid = run.get("run_id")
        if not rid:
            continue
        if rid in processed:
            continue
        new_processed.append(rid)

        status = run.get("status")
        gate = run.get("quality_gate", {})
        prompt = run.get("user_goal", "")
        response = run.get("summary", "")
        steps = run.get("steps") or []
        commands = _commands_from_steps(steps)
        return_codes = [step.get("exit_code") for step in steps if isinstance(step.get("exit_code"), int)]
        metadata = {
            "source": "run-automation",
            "status": status,
            "quality_gate_passed": bool(gate.get("passed")),
            "steps_count": len(steps),
            "commands": commands,
            "stacks": _primary_stack_from_steps(steps),
            "selected_skills": [item.get("id") for item in run.get("skills_selected") or [] if isinstance(item, dict)],
            "return_code": max(return_codes) if return_codes else 0,
            "run_id": rid,
            "risk_level": run.get("risk_level", "low"),
            "ended_at": run.get("ended_at", ""),
        }
        evaluation = evaluate_example(prompt, response, metadata=metadata, threshold=threshold)
        append_evaluation_log(evaluations_path, prompt, response, "run-automation", metadata, evaluation)
        evaluated += 1
        fhash = fingerprint(prompt, response)
        if fhash in hashes:
            continue
        if not evaluation["accepted"]:
            continue
        hashes.add(fhash)
        row = build_dataset_row(prompt, response, "run-automation", metadata, evaluation)
        row["ts"] = run.get("ended_at") or row["ts"]
        append_jsonl(dataset_path, row)
        updated = True
        accepted += 1
    if new_processed:
        processed.update(new_processed)
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps({"processed": list(processed)}), encoding="utf-8")

    refresh_result = refresh_regression_artifacts(dataset_path, regression_packs_path, routing_hints_path, evaluations_path)
    return {
        "processed": len(new_processed),
        "evaluated": evaluated,
        "accepted": accepted,
        "updated": updated,
        "packs": refresh_result["packs"]["total_packs"],
        "cases": refresh_result["packs"]["total_cases"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs-dir", default="copilot-agent/runs")
    parser.add_argument("--dataset", default=".agent-learning/dataset.jsonl")
    parser.add_argument("--state", default=".agent-learning/logs/processed_runs.json")
    parser.add_argument("--evaluations", default=".agent-learning/logs/evaluations.jsonl")
    parser.add_argument("--regression-packs", default=".agent-learning/regression-packs")
    parser.add_argument("--routing-hints", default=".agent-learning/routing_hints.json")
    parser.add_argument("--threshold", type=float, default=DEFAULT_ACCEPTANCE_THRESHOLD)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    result = collect_runs(
        Path(args.runs_dir),
        Path(args.dataset),
        Path(args.state),
        Path(args.evaluations),
        Path(args.regression_packs),
        Path(args.routing_hints),
        threshold=args.threshold,
    )
    if args.json:
        print(json.dumps(result, ensure_ascii=True))
    elif result["updated"]:
        print(f"Appended accepted examples from runs: {result['accepted']} / {result['evaluated']}")
    else:
        print(f"No new accepted runs found: {result['accepted']} / {result['evaluated']}")


if __name__ == "__main__":
    main()
