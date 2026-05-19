#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, os, shutil, time
from pathlib import Path

LEGACY='copilot-agent'
MODERN='freejt7-agent'
BACKUP='.freejt7-agent-migration-backup'


def copy_merge(src: Path, dst: Path):
    dst.mkdir(parents=True, exist_ok=True)
    for root, dirs, files in os.walk(src):
        rel=Path(root).relative_to(src)
        target_dir=dst/rel
        target_dir.mkdir(parents=True, exist_ok=True)
        for f in files:
            s=Path(root)/f
            d=target_dir/f
            if d.exists():
                # conservar destino si ya existe
                continue
            shutil.copy2(s,d)


def migrate(root: Path):
    legacy=root/LEGACY
    modern=root/MODERN
    backup=root/BACKUP
    out={"action":"migrate","changed":False,"steps":[]}
    if not legacy.exists():
        out["steps"].append("legacy_missing")
        return out
    if backup.exists():
        shutil.rmtree(backup)
    shutil.copytree(legacy, backup)
    out["steps"].append("backup_created")
    copy_merge(legacy, modern)
    out["steps"].append("merged_to_modern")
    shutil.rmtree(legacy)
    out["steps"].append("legacy_removed")
    out["changed"]=True
    return out


def rollback(root: Path):
    legacy=root/LEGACY
    modern=root/MODERN
    backup=root/BACKUP
    out={"action":"rollback","changed":False,"steps":[]}
    if not backup.exists():
        out["steps"].append("backup_missing")
        return out
    if legacy.exists():
        shutil.rmtree(legacy)
    shutil.copytree(backup, legacy)
    out["steps"].append("legacy_restored_from_backup")
    out["changed"]=True
    # mantener modern, solo restaura legado
    return out


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--root', default='.')
    ap.add_argument('--rollback', action='store_true')
    ap.add_argument('--json', action='store_true')
    args=ap.parse_args()
    root=Path(args.root).resolve()
    t0=time.time()
    res=rollback(root) if args.rollback else migrate(root)
    res['seconds']=round(time.time()-t0,3)
    if args.json:
        print(json.dumps(res, indent=2, ensure_ascii=False))
    else:
        print(res)
    return 0

if __name__=='__main__':
    raise SystemExit(main())
