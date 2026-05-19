#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, subprocess, time

CRITICAL_SMOKES = [
    ["npm","run","test:router-core-concurrency-smoke"],
    ["npm","run","test:provider-router-failover-smoke"],
    ["npm","run","test:control-panel-script-syntax-smoke"],
]
UNIT_KEY = ["pytest","-q","tests/test_agent_evaluation.py","tests/test_task_run_cross_platform.py"]
BUILD = ["npm","run","build:bundle"]


def run(cmd):
    t0=time.time()
    p=subprocess.run(cmd, text=True, capture_output=True)
    return {"cmd":" ".join(cmd),"code":p.returncode,"seconds":round(time.time()-t0,2),"stdout":p.stdout[-2000:],"stderr":p.stderr[-2000:]}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--flake-runs",type=int,default=3)
    ap.add_argument("--json",action="store_true")
    args=ap.parse_args()

    report={"smokes":[],"unit_runs":[],"build":None,"pass":True}

    for c in CRITICAL_SMOKES:
        r=run(c); report["smokes"].append(r)
        if r["code"]!=0: report["pass"]=False

    for _ in range(args.flake_runs):
        r=run(UNIT_KEY); report["unit_runs"].append(r)
        if r["code"]!=0: report["pass"]=False

    report["build"]=run(BUILD)
    if report["build"]["code"]!=0: report["pass"]=False

    total=len(report["smokes"])+len(report["unit_runs"])+1
    ok=sum(1 for r in report["smokes"] if r["code"]==0)+sum(1 for r in report["unit_runs"] if r["code"]==0)+(1 if report["build"]["code"]==0 else 0)
    report["metrics"]={"checks_total":total,"checks_ok":ok,"pass_rate":round((ok/total)*100,2),"flake_runs":args.flake_runs}

    if args.json:
        print(json.dumps(report,indent=2,ensure_ascii=False))
    else:
        print(f"quality_gate pass={report['pass']} pass_rate={report['metrics']['pass_rate']}%")
    return 0 if report["pass"] else 1

if __name__=='__main__':
    raise SystemExit(main())
