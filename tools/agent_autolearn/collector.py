import argparse
from pathlib import Path

from evaluator import (
    DEFAULT_ACCEPTANCE_THRESHOLD,
    append_evaluation_log,
    append_jsonl,
    build_dataset_row,
    evaluate_example,
    fingerprint,
    load_known_hashes,
)
from regression_packs import refresh_regression_artifacts

def main() -> int:
    parser = argparse.ArgumentParser(description="Guarda solo ejemplos exitosos en dataset.jsonl")
    parser.add_argument("--dataset", default=".agent-learning/dataset.jsonl")
    parser.add_argument("--evaluations", default=".agent-learning/logs/evaluations.jsonl")
    parser.add_argument("--regression-packs", default=".agent-learning/regression-packs")
    parser.add_argument("--routing-hints", default=".agent-learning/routing_hints.json")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--response", required=True)
    parser.add_argument("--source", default="manual")
    parser.add_argument("--tag", default="general")
    parser.add_argument("--score", type=float, default=1.0)
    parser.add_argument("--stack", default="")
    parser.add_argument("--task-type", default="")
    parser.add_argument("--error-type", default="")
    parser.add_argument("--threshold", type=float, default=DEFAULT_ACCEPTANCE_THRESHOLD)
    args = parser.parse_args()

    dataset_path = Path(args.dataset)
    evaluations_path = Path(args.evaluations)
    example_hash = fingerprint(args.prompt, args.response)
    known_hashes = load_known_hashes(dataset_path)

    if example_hash in known_hashes:
        print("SKIP_DUPLICATE")
        return 0

    metadata = {
        "source": args.source,
        "tag": args.tag,
        "provided_score": args.score,
        "stack": args.stack,
        "task_type": args.task_type,
        "error_type": args.error_type,
    }
    evaluation = evaluate_example(args.prompt, args.response, metadata=metadata, threshold=args.threshold)
    append_evaluation_log(evaluations_path, args.prompt, args.response, args.source, metadata, evaluation)
    if not evaluation["accepted"]:
        print(f"SKIP_REJECTED score={evaluation['score']}")
        return 0

    row = build_dataset_row(args.prompt, args.response, args.source, metadata, evaluation)
    append_jsonl(dataset_path, row)
    refresh_regression_artifacts(dataset_path, Path(args.regression_packs), Path(args.routing_hints), evaluations_path)
    print("APPENDED_SUCCESS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
