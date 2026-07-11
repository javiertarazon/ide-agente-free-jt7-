import hashlib
import json
import re
from datetime import datetime
from pathlib import Path


DEFAULT_ACCEPTANCE_THRESHOLD = 0.65
DEFAULT_REGRESSION_THRESHOLD = 0.85


def utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def read_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path):
    if not path.exists():
        return []
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def append_jsonl(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=True) + "\n")


def fingerprint(prompt: str, response: str) -> str:
    payload = (prompt + "\n---\n" + response).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def load_known_hashes(dataset_path: Path) -> set[str]:
    hashes: set[str] = set()
    for row in read_jsonl(dataset_path):
        row_hash = row.get("hash")
        if row_hash:
            hashes.add(row_hash)
    return hashes


def _slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower())
    return normalized.strip("-") or "general"


def _flatten_text(prompt: str, response: str, metadata: dict) -> str:
    parts = [prompt or "", response or ""]
    for key in ("user_goal", "summary", "tag", "source", "validate_cmd"):
        value = metadata.get(key)
        if isinstance(value, str):
            parts.append(value)
    for command in metadata.get("commands", []):
        if isinstance(command, str):
            parts.append(command)
    return "\n".join(parts).lower()


def infer_task_type(prompt: str, response: str, metadata: dict | None = None) -> str:
    metadata = metadata or {}
    text = _flatten_text(prompt, response, metadata)
    explicit = metadata.get("task_type") or metadata.get("tag")
    if isinstance(explicit, str) and explicit.strip():
        return _slug(explicit)
    if any(token in text for token in ("audit", "auditoria", "doctor --strict", "runtime-audit")):
        return "audit"
    if any(token in text for token in ("readme", "docs/", "document", "documentacion", "release")):
        return "documentation"
    if any(token in text for token in ("pytest", "test", "smoke", "validate", "validar", "compila", "compile")):
        return "validation"
    if any(token in text for token in ("fix", "corrige", "error", "bug", "traceback", "exception", "failed")):
        return "bugfix"
    if any(token in text for token in ("plugin", "manifest", "integration", "capability pack")):
        return "integration"
    return "general"


def infer_stack(prompt: str, response: str, metadata: dict | None = None) -> list[str]:
    metadata = metadata or {}
    text = _flatten_text(prompt, response, metadata)
    stacks: list[str] = []
    if any(token in text for token in ("python", "pytest", ".py", "traceback", "pip ")):
        stacks.append("python")
    if any(token in text for token in ("node", "npm", ".js", "javascript", "package.json")):
        stacks.append("javascript")
    if any(token in text for token in ("bash", "shell", "pwd", "grep", "cat ", "ls ", "sh ")):
        stacks.append("shell")
    if any(token in text for token in ("markdown", ".md", "docs/", "readme")):
        stacks.append("docs")
    explicit = metadata.get("stack")
    if isinstance(explicit, str) and explicit.strip():
        stacks.append(_slug(explicit))
    for item in metadata.get("stacks", []):
        if isinstance(item, str) and item.strip():
            stacks.append(_slug(item))
    deduped: list[str] = []
    for stack in stacks:
        if stack not in deduped:
            deduped.append(stack)
    return deduped or ["general"]


def infer_error_type(metadata: dict | None = None) -> str:
    metadata = metadata or {}
    if metadata.get("error_type"):
        return _slug(str(metadata["error_type"]))
    if metadata.get("validator_passed") is False:
        return "validation-failed"
    if metadata.get("quality_gate_passed") is False:
        return "quality-gate"
    return_code = metadata.get("return_code")
    if isinstance(return_code, int) and return_code != 0:
        return "nonzero-exit"
    status = str(metadata.get("status") or "").lower()
    if status in {"failed", "blocked", "error"}:
        return status
    return "none"


def build_tags(task_type: str, stacks: list[str], error_type: str, metadata: dict | None = None) -> list[str]:
    metadata = metadata or {}
    tags = [f"task:{task_type}"]
    tags.extend(f"stack:{stack}" for stack in stacks)
    tags.append(f"error:{error_type}")
    if metadata.get("quality_gate_passed") is True:
        tags.append("quality:passed")
    elif metadata.get("quality_gate_passed") is False:
        tags.append("quality:blocked")
    if metadata.get("validator_passed") is True:
        tags.append("validator:passed")
    elif metadata.get("validator_passed") is False:
        tags.append("validator:failed")
    source = metadata.get("source")
    if isinstance(source, str) and source.strip():
        tags.append(f"source:{_slug(source)}")
    manual_tag = metadata.get("tag")
    if isinstance(manual_tag, str) and manual_tag.strip():
        tags.append(f"hint:{_slug(manual_tag)}")
    deduped: list[str] = []
    for tag in tags:
        if tag not in deduped:
            deduped.append(tag)
    return deduped


def evaluate_example(prompt: str, response: str, metadata: dict | None = None, threshold: float = DEFAULT_ACCEPTANCE_THRESHOLD) -> dict:
    metadata = dict(metadata or {})
    response_text = (response or "").strip()
    prompt_text = (prompt or "").strip()
    task_type = infer_task_type(prompt_text, response_text, metadata)
    stacks = infer_stack(prompt_text, response_text, metadata)
    error_type = infer_error_type(metadata)
    reasons: list[str] = []

    provided_score = metadata.get("provided_score")
    score = float(provided_score) if provided_score is not None else 0.0
    if provided_score is None:
        if prompt_text:
            score += 0.15
        else:
            reasons.append("missing-prompt")
        if response_text:
            score += 0.15
            if len(response_text) >= 24:
                score += 0.1
        else:
            reasons.append("missing-response")
        if metadata.get("validator_passed") is True:
            score += 0.35
            reasons.append("validator-passed")
        if metadata.get("quality_gate_passed") is True:
            score += 0.3
            reasons.append("quality-gate-passed")
        status = str(metadata.get("status") or "").lower()
        if status == "succeeded":
            score += 0.15
            reasons.append("status-succeeded")
        elif status in {"failed", "blocked", "error"}:
            score -= 0.35
            reasons.append(f"status-{status}")
        steps_count = int(metadata.get("steps_count") or 0)
        if steps_count > 0:
            score += min(0.1, steps_count * 0.02)
        if error_type == "none":
            score += 0.05
        elif error_type in {"quality-gate", "validation-failed", "nonzero-exit", "failed", "blocked", "error"}:
            score -= 0.3
            reasons.append(f"error-{error_type}")
        if metadata.get("source") == "manual":
            score += 0.1
        if not stacks or stacks == ["general"]:
            score -= 0.05
    else:
        reasons.append("provided-score")

    score = max(0.0, min(1.0, round(score, 4)))
    accepted = bool(response_text) and score >= threshold and error_type not in {"validation-failed", "nonzero-exit", "failed", "blocked", "error"}
    regression_candidate = accepted and score >= DEFAULT_REGRESSION_THRESHOLD and (metadata.get("validator_passed") is True or metadata.get("quality_gate_passed") is True)
    tags = build_tags(task_type, stacks, error_type, metadata)

    return {
        "accepted": accepted,
        "score": score,
        "threshold": threshold,
        "task_type": task_type,
        "stacks": stacks,
        "error_type": error_type,
        "tags": tags,
        "primary_tag": tags[0],
        "regression_candidate": regression_candidate,
        "reasons": reasons,
    }


def build_dataset_row(prompt: str, response: str, source: str, metadata: dict, evaluation: dict) -> dict:
    return {
        "ts": metadata.get("ts") or utc_now(),
        "prompt": prompt,
        "response": response,
        "source": source,
        "tag": metadata.get("tag") or evaluation["task_type"],
        "tags": evaluation["tags"],
        "task_type": evaluation["task_type"],
        "stack": evaluation["stacks"],
        "error_type": evaluation["error_type"],
        "score": evaluation["score"],
        "evaluation": evaluation,
        "metadata": metadata,
        "hash": fingerprint(prompt, response),
    }


def append_evaluation_log(path: Path, prompt: str, response: str, source: str, metadata: dict, evaluation: dict) -> dict:
    row = {
        "ts": metadata.get("ts") or utc_now(),
        "prompt": prompt,
        "response": response,
        "source": source,
        "metadata": metadata,
        "evaluation": evaluation,
        "hash": fingerprint(prompt, response),
    }
    append_jsonl(path, row)
    return row