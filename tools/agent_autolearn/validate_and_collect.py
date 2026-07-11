import argparse
import subprocess
from pathlib import Path

from evaluator import (
    DEFAULT_ACCEPTANCE_THRESHOLD,
    append_evaluation_log,
    append_jsonl,
    build_dataset_row,
    evaluate_example,
    load_known_hashes,
)
from regression_packs import refresh_regression_artifacts


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida una solucion y guarda en dataset solo si pasa")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--response-file", required=True)
    parser.add_argument("--validate-cmd", required=True)
    parser.add_argument("--dataset", default=".agent-learning/dataset.jsonl")
    parser.add_argument("--evaluations", default=".agent-learning/logs/evaluations.jsonl")
    parser.add_argument("--regression-packs", default=".agent-learning/regression-packs")
    parser.add_argument("--routing-hints", default=".agent-learning/routing_hints.json")
    parser.add_argument("--attempts", default=".agent-learning/logs/attempts.jsonl")
    parser.add_argument("--source", default="agent")
    parser.add_argument("--tag", default="general")
    parser.add_argument("--stack", default="")
    parser.add_argument("--task-type", default="")
    parser.add_argument("--threshold", type=float, default=DEFAULT_ACCEPTANCE_THRESHOLD)
    args = parser.parse_args()

    response_file = Path(args.response_file)
    response = read_text(response_file)

    proc = subprocess.run(
        args.validate_cmd,
        shell=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    attempt = {
        "prompt": args.prompt,
        "response_file": str(response_file),
        "validate_cmd": args.validate_cmd,
        "return_code": proc.returncode,
        "stdout": proc.stdout[-4000:],
        "stderr": proc.stderr[-4000:],
        "tag": args.tag,
    }
    append_jsonl(Path(args.attempts), attempt)

    if proc.returncode != 0:
        print("VALIDATION_FAILED")
        return proc.returncode

    dataset_path = Path(args.dataset)
    known = load_known_hashes(dataset_path)
    metadata = {
        "source": args.source,
        "tag": args.tag,
        "task_type": args.task_type,
        "stack": args.stack,
        "validator_passed": proc.returncode == 0,
        "validate_cmd": args.validate_cmd,
        "return_code": proc.returncode,
        "response_file": str(response_file),
    }
    evaluation = evaluate_example(args.prompt, response, metadata=metadata, threshold=args.threshold)
    append_evaluation_log(Path(args.evaluations), args.prompt, response, args.source, metadata, evaluation)
    item_hash = build_dataset_row(args.prompt, response, args.source, metadata, evaluation)["hash"]
    if item_hash in known:
        print("SUCCESS_DUPLICATE")
        return 0
    if not evaluation["accepted"]:
        print(f"SUCCESS_REJECTED score={evaluation['score']}")
        return 0

    row = build_dataset_row(args.prompt, response, args.source, metadata, evaluation)
    append_jsonl(dataset_path, row)
    refresh_regression_artifacts(dataset_path, Path(args.regression_packs), Path(args.routing_hints), Path(args.evaluations))
    print("SUCCESS_SAVED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
