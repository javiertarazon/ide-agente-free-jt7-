from pathlib import Path
from tools.quality.migrate_agent_state_dir import migrate, rollback, LEGACY, MODERN, BACKUP


def test_migrate_and_rollback(tmp_path: Path):
    legacy = tmp_path / LEGACY
    legacy.mkdir()
    (legacy / 'tasks.yaml').write_text('a: 1\n', encoding='utf8')

    modern = tmp_path / MODERN
    modern.mkdir()
    (modern / 'keep.txt').write_text('keep\n', encoding='utf8')

    res = migrate(tmp_path)
    assert res['changed'] is True
    assert not legacy.exists()
    assert (modern / 'tasks.yaml').exists()
    assert (tmp_path / BACKUP).exists()

    rb = rollback(tmp_path)
    assert rb['changed'] is True
    assert legacy.exists()
    assert (legacy / 'tasks.yaml').exists()
