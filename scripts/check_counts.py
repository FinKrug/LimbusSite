"""Guard for the automatic data update: fail if a scrape lost a lot of data.

A wiki outage or a page that changed shape could make the scraper return far fewer gifts or
identities than before; publishing that would break the site. Compares data/meta.json "counts"
before (the committed copy, passed as a file) and after the scrape.

    python scripts/check_counts.py OLD_META NEW_META [--max-drop 0.05]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def drops(old: dict[str, int], new: dict[str, int], max_drop: float) -> list[str]:
    bad = []
    for key, before in old.items():
        after = new.get(key, 0)
        if before and after < before * (1 - max_drop):
            bad.append(f"{key}: {before} -> {after}")
    return bad


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("old", type=Path)
    ap.add_argument("new", type=Path)
    ap.add_argument("--max-drop", type=float, default=0.05)
    args = ap.parse_args(argv)
    old = json.loads(args.old.read_text(encoding="utf-8")).get("counts", {})
    new = json.loads(args.new.read_text(encoding="utf-8")).get("counts", {})
    bad = drops(old, new, args.max_drop)
    for k in sorted(set(old) | set(new)):
        print(f"{k}: {old.get(k)} -> {new.get(k)}")
    if bad:
        print("Too much data disappeared, not publishing:", "; ".join(bad), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
