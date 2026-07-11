import argparse
import json
from datetime import datetime
from pathlib import Path


def utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def count_lines(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8") as f:
        return sum(1 for _ in f if _.strip())


def main() -> int:
    parser = argparse.ArgumentParser(description="Entrenador LoRA (stub listo para integrar Unsloth/PEFT)")
    parser.add_argument("--train-file", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--base-model", default="unsloth/Meta-Llama-3.1-8B-Instruct")
    args = parser.parse_args()

    train_file = Path(args.train_file)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Stub seguro: deja trazabilidad y valida datos. Sustituye por entrenamiento real con Unsloth/PEFT.
    metadata = {
        "ts": utc_now(),
        "mode": "stub",
        "base_model": args.base_model,
        "train_file": str(train_file),
        "examples": count_lines(train_file),
        "next_step": "Reemplazar este stub por pipeline real de Unsloth/PEFT con CUDA.",
    }
    (output_dir / "training_metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )

    print("LORA_STUB_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
