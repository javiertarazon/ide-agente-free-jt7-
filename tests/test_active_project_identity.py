import json

import skills_manager


def test_resolve_active_project_record_rejects_windows_path_on_linux():
    record = {
        "path": r"E:\\javie\\agente-freejt7-extension-funcional",
        "platform": "windows",
        "host_fingerprint": "deadbeefdeadbeef",
    }

    result = skills_manager._resolve_active_project_record(record, platform_family="linux")

    assert result["path"] is None
    assert result["stale_reason"] == "foreign-windows-path"


def test_resolve_active_project_record_marks_missing_cross_host(tmp_path):
    record = {
        "path": str(tmp_path / "missing-project"),
        "platform": "linux",
        "host_fingerprint": "ffffffffffffffff",
    }

    result = skills_manager._resolve_active_project_record(record, platform_family="linux")

    assert result["path"] is None
    assert result["stale_reason"] == "host-mismatch"


def test_resolve_active_project_record_accepts_existing_path(tmp_path):
    project = tmp_path / "workspace"
    project.mkdir()
    record = {
        "path": str(project),
        **skills_manager._build_active_project_identity(project, platform_family="linux"),
    }

    result = skills_manager._resolve_active_project_record(record, platform_family="linux")

    assert result["path"] == project.resolve()
    assert result["stale_reason"] == ""
    assert result["identity"]["project_id"] == record["project_id"]


def test_active_project_path_ignores_stale_windows_record(tmp_path, monkeypatch):
    copilot_agent = tmp_path / "copilot-agent"
    copilot_agent.mkdir()
    (copilot_agent / "active-project.json").write_text(
        json.dumps({"path": r"E:\\javie\\agente-freejt7-extension-funcional"}),
        encoding="utf-8",
    )
    monkeypatch.setattr(skills_manager, "COPILOT_AGENT", copilot_agent)

    assert skills_manager._active_project_path() is None