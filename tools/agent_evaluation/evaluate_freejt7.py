#!/usr/bin/env python3
"""Evaluacion pragmatica del agente Free JT7 frente a agentes autonomos profesionales.

Uso:
  python tools/agent_evaluation/evaluate_freejt7.py --json
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict


@dataclass
class AxisScore:
    axis: str
    free_jt7: int
    profesional_referencia: int
    observacion: str


def build_scores() -> list[AxisScore]:
    """Matriz simple, explicita y verificable sin depender de APIs externas."""
    return [
        AxisScore(
            axis="Autonomia operativa local",
            free_jt7=8,
            profesional_referencia=8,
            observacion="Tiene runtime propio, fallback local y continuidad por sesion.",
        ),
        AxisScore(
            axis="Integracion multi-proveedor",
            free_jt7=8,
            profesional_referencia=9,
            observacion="Soporta proveedores variados; falta un benchmark automatizado continuo por proveedor.",
        ),
        AxisScore(
            axis="Calidad de trazabilidad",
            free_jt7=9,
            profesional_referencia=8,
            observacion="Mantiene TASKS/MEMORY/STRATEGY y auditoria operativa persistente.",
        ),
        AxisScore(
            axis="Confiabilidad de testing",
            free_jt7=7,
            profesional_referencia=9,
            observacion="Tiene muchos smokes; aun hay huecos de dependencias opcionales y claims no siempre reproducibles.",
        ),
        AxisScore(
            axis="Higiene estructural del repo",
            free_jt7=7,
            profesional_referencia=9,
            observacion="Mejoro tras limpieza de duplicados; aun conviene automatizar deteccion en CI.",
        ),
    ]


def summarize(scores: list[AxisScore]) -> dict:
    free_avg = round(sum(s.free_jt7 for s in scores) / len(scores), 2)
    pro_avg = round(sum(s.profesional_referencia for s in scores) / len(scores), 2)
    gap = round(pro_avg - free_avg, 2)
    status = "competitivo" if gap <= 1.0 else "en mejora"
    return {
        "free_jt7_promedio": free_avg,
        "referencia_promedio": pro_avg,
        "brecha": gap,
        "estado": status,
    }


def build_gap_closure_plan(scores: list[AxisScore]) -> list[dict]:
    """Plan priorizado para cerrar brecha respecto a referencia profesional."""
    actions = []
    for score in scores:
        delta = score.profesional_referencia - score.free_jt7
        if delta <= 0:
            continue
        if score.axis == "Confiabilidad de testing":
            actions.append({
                "eje": score.axis,
                "prioridad": "P0",
                "objetivo_30_dias": "Aumentar confiabilidad de pruebas y reducir huecos opcionales.",
                "acciones": [
                    "Crear matriz de dependencias opcionales y activar fallback de tests por entorno.",
                    "Agregar suite nightly multi-proveedor con reporte de tasa de fallo/flakes.",
                    "Definir gate minimo: smokes criticos + unit tests evaluador en PR.",
                ],
                "kpi": ["flake_rate < 2%", "pass_rate >= 98% en smokes criticos"],
            })
        elif score.axis == "Higiene estructural del repo":
            actions.append({
                "eje": score.axis,
                "prioridad": "P1",
                "objetivo_30_dias": "Evitar reintroduccion de duplicados y artefactos huerfanos.",
                "acciones": [
                    "Automatizar deteccion de duplicados por hash en CI.",
                    "Crear politica de snapshots temporales con TTL y limpieza automatica.",
                    "Añadir verificacion de rutas no referenciadas en auditoria semanal.",
                ],
                "kpi": ["duplicados_no_referenciados = 0", "auditoria_estructural_semanal = OK"],
            })
        elif score.axis == "Integracion multi-proveedor":
            actions.append({
                "eje": score.axis,
                "prioridad": "P1",
                "objetivo_30_dias": "Subir robustez y comparabilidad entre proveedores.",
                "acciones": [
                    "Ejecutar benchmark uniforme por proveedor con prompts/casos canonicos.",
                    "Registrar latencia, costo y tasa de exito por proveedor/modelo.",
                    "Activar failover con umbrales medibles por SLA interno.",
                ],
                "kpi": ["success_rate_por_proveedor >= 97%", "failover_recovery < 5s"],
            })
    return actions


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Emitir salida JSON")
    parser.add_argument("--roadmap", action="store_true", help="Incluir plan de cierre de brecha")
    args = parser.parse_args()

    scores = build_scores()
    summary = summarize(scores)

    payload = {"axes": [asdict(s) for s in scores], "summary": summary}
    if args.roadmap:
        payload["roadmap"] = build_gap_closure_plan(scores)

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0

    print("Evaluación Free JT7 vs agentes autónomos profesionales")
    print("=" * 62)
    for s in scores:
        print(f"- {s.axis}: Free JT7 {s.free_jt7}/10 | Referencia {s.profesional_referencia}/10")
        print(f"  {s.observacion}")
    print("-" * 62)
    print(
        f"Promedio Free JT7: {summary['free_jt7_promedio']}/10 | "
        f"Referencia: {summary['referencia_promedio']}/10 | "
        f"Brecha: {summary['brecha']} ({summary['estado']})"
    )
    if args.roadmap:
        print("\nRoadmap de cierre de brecha:")
        for item in build_gap_closure_plan(scores):
            print(f"- [{item['prioridad']}] {item['eje']}: {item['objetivo_30_dias']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
