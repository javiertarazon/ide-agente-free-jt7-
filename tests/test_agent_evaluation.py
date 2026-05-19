from tools.agent_evaluation.evaluate_freejt7 import build_gap_closure_plan, build_scores, summarize


def test_build_scores_shape():
    scores = build_scores()
    assert len(scores) >= 5
    assert all(0 <= s.free_jt7 <= 10 for s in scores)
    assert all(0 <= s.profesional_referencia <= 10 for s in scores)


def test_summary_values():
    summary = summarize(build_scores())
    assert set(summary.keys()) == {"free_jt7_promedio", "referencia_promedio", "brecha", "estado"}
    assert summary["referencia_promedio"] >= summary["free_jt7_promedio"]


def test_gap_closure_plan_has_prioritized_actions():
    plan = build_gap_closure_plan(build_scores())
    assert len(plan) >= 1
    priorities = {item["prioridad"] for item in plan}
    assert "P0" in priorities or "P1" in priorities
    assert all("kpi" in item and item["kpi"] for item in plan)
