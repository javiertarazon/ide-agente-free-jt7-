import argparse
import json
import subprocess
from datetime import datetime
from pathlib import Path


def utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def read_json(path: Path, default: dict) -> dict:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path):
    if not path.exists():
        return []
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def append_jsonl(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=True) + "\n")


def run_cmd(cmd: str) -> tuple[int, str, str]:
    if not cmd.strip():
        return 0, "", ""
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return p.returncode, p.stdout, p.stderr


def main() -> int:
    parser = argparse.ArgumentParser(description="Entrenamiento nocturno por lotes con nuevos exitos")
    parser.add_argument("--config", default="tools/agent_autolearn/config.json")
    parser.add_argument("--min-new", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cfg_path = Path(args.config)
    cfg = read_json(cfg_path, {})

    dataset_path = Path(cfg.get("dataset_path", ".agent-learning/dataset.jsonl"))
    state_path = Path(cfg.get("state_path", ".agent-learning/state.json"))
    history_path = Path(cfg.get("train_history_path", ".agent-learning/logs/train_history.jsonl"))
    checkpoints_dir = Path(cfg.get("checkpoints_dir", ".agent-learning/checkpoints"))
    min_new = args.min_new if args.min_new is not None else int(cfg.get("min_new_examples", 50))

    state = read_json(state_path, {"last_trained_line": 0})
    all_rows = read_jsonl(dataset_path)
    total = len(all_rows)
    last = int(state.get("last_trained_line", 0))
    new_count = max(0, total - last)

    if new_count < min_new:
        print(f"SKIP_NOT_ENOUGH_DATA new={new_count} min={min_new}")
        return 0

    batch_rows = all_rows[last:]
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    train_file = Path(f".agent-learning/train_batch_{ts}.jsonl")
    train_file.parent.mkdir(parents=True, exist_ok=True)
    with train_file.open("w", encoding="utf-8") as f:
        for row in batch_rows:
            f.write(json.dumps({"prompt": row.get("prompt", ""), "response": row.get("response", "")}, ensure_ascii=True) + "\n")

    output_dir = checkpoints_dir / f"lora_{ts}"
    output_dir.mkdir(parents=True, exist_ok=True)

    stop_cmd = cfg.get("stop_agent_command", "")
    start_cmd = cfg.get("start_agent_command", "")
    trainer_template = cfg.get("trainer_command_template", "")
    merge_template = cfg.get("merge_command_template", "")

    trainer_cmd = trainer_template.format(train_file=str(train_file), output_dir=str(output_dir))
    merge_cmd = merge_template.format(output_dir=str(output_dir)) if merge_template else ""

    event = {
        "ts": utc_now(),
        "train_file": str(train_file),
        "new_examples": new_count,
        "dry_run": bool(args.dry_run),
        "trainer_cmd": trainer_cmd,
    }

    if args.dry_run:
        event["status"] = "DRY_RUN_READY"
        append_jsonl(history_path, event)
        print("DRY_RUN_READY")
        return 0

    code, out, err = run_cmd(stop_cmd)
    if code != 0:
        event["status"] = "FAILED_STOP_AGENT"
        event["stderr"] = err[-4000:]
        append_jsonl(history_path, event)
        print("FAILED_STOP_AGENT")
        return code

    code, out, err = run_cmd(trainer_cmd)
    if code != 0:
        event["status"] = "FAILED_TRAIN"
        event["stdout"] = out[-4000:]
        event["stderr"] = err[-4000:]
        append_jsonl(history_path, event)
        run_cmd(start_cmd)
        print("FAILED_TRAIN")
        return code

    if merge_cmd:
        m_code, m_out, m_err = run_cmd(merge_cmd)
        if m_code != 0:
            event["status"] = "FAILED_MERGE"
            event["stdout"] = m_out[-4000:]
            event["stderr"] = m_err[-4000:]
            append_jsonl(history_path, event)
            run_cmd(start_cmd)
            print("FAILED_MERGE")
            return m_code

    run_cmd(start_cmd)

    state["last_trained_line"] = total
    state["last_train_ts"] = utc_now()
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")

    event["status"] = "TRAIN_OK"
    append_jsonl(history_path, event)
    print("TRAIN_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
