import argparse
import json
from collections import defaultdict
from pathlib import Path

from evaluator import DEFAULT_REGRESSION_THRESHOLD, read_jsonl, read_json


def _slug(value: str) -> str:
    return "-".join(part for part in "".join(ch if ch.isalnum() else "-" for ch in value.lower()).split("-") if part) or "general"


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def build_regression_packs(dataset_path: Path, output_dir: Path, min_score: float = DEFAULT_REGRESSION_THRESHOLD, max_cases_per_pack: int = 25) -> dict:
    _ensure_dir(output_dir)
    accepted_rows = []
    for row in read_jsonl(dataset_path):
        evaluation = row.get("evaluation") or {}
        score = float(evaluation.get("score", row.get("score", 0.0)))
        if not evaluation.get("accepted", score >= min_score):
            continue
        if score < min_score:
            continue
        accepted_rows.append(row)

    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in accepted_rows:
        task_type = row.get("task_type") or (row.get("evaluation") or {}).get("task_type") or "general"
        stacks = row.get("stack") or (row.get("evaluation") or {}).get("stacks") or ["general"]
        if isinstance(stacks, str):
            stacks = [stacks]
        group_key = f"{_slug(task_type)}__{'-'.join(_slug(stack) for stack in stacks[:2])}"
        grouped[group_key].append(row)

    index = {
        "generated_at": None,
        "total_packs": 0,
        "total_cases": 0,
        "packs": [],
    }

    for pack_id, rows in sorted(grouped.items()):
        rows.sort(key=lambda item: float((item.get("evaluation") or {}).get("score", item.get("score", 0.0))), reverse=True)
        trimmed = rows[:max_cases_per_pack]
        pack = {
            "pack_id": pack_id,
            "created_from": "dataset",
            "case_count": len(trimmed),
            "cases": [
                {
                    "hash": row.get("hash"),
                    "prompt": row.get("prompt", ""),
                    "response": row.get("response", ""),
                    "task_type": row.get("task_type"),
                    "stack": row.get("stack"),
                    "tags": row.get("tags", []),
                    "score": float((row.get("evaluation") or {}).get("score", row.get("score", 0.0))),
                    "metadata": row.get("metadata", {}),
                }
                for row in trimmed
            ],
        }
        pack_path = output_dir / f"{pack_id}.json"
        pack_path.write_text(json.dumps(pack, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
        index["packs"].append({
            "pack_id": pack_id,
            "path": str(pack_path),
            "case_count": len(trimmed),
        })
        index["total_cases"] += len(trimmed)

    index["total_packs"] = len(index["packs"])
    index_path = output_dir / "index.json"
    index_path.write_text(json.dumps(index, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    return index


def build_routing_hints(evaluations_path: Path, output_path: Path, dataset_path: Path | None = None) -> dict:
    evaluations = read_jsonl(evaluations_path)
    accepted_lookup = {}
    if dataset_path is not None:
        accepted_lookup = {row.get("hash"): row for row in read_jsonl(dataset_path)}

    by_task: dict[str, dict] = defaultdict(lambda: {"evaluated": 0, "accepted": 0, "accepted_scores": [], "stacks": defaultdict(int)})
    by_stack: dict[str, dict] = defaultdict(lambda: {"evaluated": 0, "accepted": 0, "accepted_scores": []})

    for row in evaluations:
        evaluation = row.get("evaluation") or {}
        task_type = evaluation.get("task_type") or "general"
        stacks = evaluation.get("stacks") or ["general"]
        accepted = bool(evaluation.get("accepted"))
        score = float(evaluation.get("score", 0.0))
        by_task[task_type]["evaluated"] += 1
        if accepted:
            by_task[task_type]["accepted"] += 1
            by_task[task_type]["accepted_scores"].append(score)
        for stack in stacks:
            by_task[task_type]["stacks"][stack] += 1
            by_stack[stack]["evaluated"] += 1
            if accepted:
                by_stack[stack]["accepted"] += 1
                by_stack[stack]["accepted_scores"].append(score)

    hints = {
        "generated_at": None,
        "summary": {
            "evaluated": len(evaluations),
            "accepted": sum(1 for row in evaluations if (row.get("evaluation") or {}).get("accepted")),
            "accepted_examples_available": len(accepted_lookup),
        },
        "by_task_type": {},
        "by_stack": {},
        "recommendations": [],
    }

    for task_type, stats in sorted(by_task.items()):
        accepted_scores = stats["accepted_scores"]
        acceptance_rate = round(stats["accepted"] / stats["evaluated"], 4) if stats["evaluated"] else 0.0
        avg_score = round(sum(accepted_scores) / len(accepted_scores), 4) if accepted_scores else 0.0
        top_stacks = sorted(stats["stacks"].items(), key=lambda item: item[1], reverse=True)
        hints["by_task_type"][task_type] = {
            "evaluated": stats["evaluated"],
            "accepted": stats["accepted"],
            "acceptance_rate": acceptance_rate,
            "avg_accepted_score": avg_score,
            "top_stacks": [name for name, _ in top_stacks[:3]],
        }
        hints["recommendations"].append({
            "task_type": task_type,
            "acceptance_rate": acceptance_rate,
            "preferred_stacks": [name for name, _ in top_stacks[:2]],
            "avg_accepted_score": avg_score,
        })

    hints["recommendations"].sort(key=lambda item: (item["acceptance_rate"], item["avg_accepted_score"]), reverse=True)
    hints["recommendations"] = hints["recommendations"][:5]

    for stack, stats in sorted(by_stack.items()):
        accepted_scores = stats["accepted_scores"]
        hints["by_stack"][stack] = {
            "evaluated": stats["evaluated"],
            "accepted": stats["accepted"],
            "acceptance_rate": round(stats["accepted"] / stats["evaluated"], 4) if stats["evaluated"] else 0.0,
            "avg_accepted_score": round(sum(accepted_scores) / len(accepted_scores), 4) if accepted_scores else 0.0,
        }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(hints, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    return hints


def refresh_regression_artifacts(dataset_path: Path, output_dir: Path, routing_hints_path: Path, evaluations_path: Path) -> dict:
    packs = build_regression_packs(dataset_path, output_dir)
    hints = build_routing_hints(evaluations_path, routing_hints_path, dataset_path=dataset_path)
    return {
        "packs": packs,
        "routing_hints": hints,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera regression packs e hints de routing desde el dataset validado")
    parser.add_argument("--dataset", default=".agent-learning/dataset.jsonl")
    parser.add_argument("--evaluations", default=".agent-learning/logs/evaluations.jsonl")
    parser.add_argument("--output-dir", default=".agent-learning/regression-packs")
    parser.add_argument("--routing-hints", default=".agent-learning/routing_hints.json")
    args = parser.parse_args()

    result = refresh_regression_artifacts(
        Path(args.dataset),
        Path(args.output_dir),
        Path(args.routing_hints),
        Path(args.evaluations),
    )
    print(json.dumps({
        "packs": result["packs"]["total_packs"],
        "cases": result["packs"]["total_cases"],
        "recommendations": len(result["routing_hints"]["recommendations"]),
    }, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())