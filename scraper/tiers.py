"""Build the identity ranking the web app uses (web/src/data/identity_tiers.json).

No Mirror Dungeon-specific tier list covers every identity, so this combines the
two community lists that do cover them all, both kept as text in data/tiers/:

  prydwen.txt  Prydwen.gg, "Generic - Endgame" view (tier + role)
  gll.txt      Great Limbus Library (tier; says Mirror Dungeon isn't a criterion)

Each tier becomes points, the two are averaged, then nudged for Mirror Dungeon:
Status Specialists get +0.5, because MD's keyword E.G.O gifts multiply status
damage (Burn, Tremor, Rupture, ...) far more than Refraction Railway does. The
result is turned back into a tier. Identities on neither list fall back to
rarity in the app.

Update the lists by pasting fresh copies into data/tiers/*.txt, then run:
    python -m scraper.tiers
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TIER_DIR = ROOT / "data" / "tiers"
OUT = ROOT / "web" / "src" / "data" / "identity_tiers.json"

POINTS = {"SSS": 10.0, "SS": 9.0, "S+": 8.5, "S": 8.0, "A": 7.0, "B": 5.5, "C": 4.0, "D": 2.5}
# Lowest score for each tier when converting back (score >= threshold).
THRESHOLDS = [("SSS", 9.5), ("SS", 8.75), ("S+", 8.25), ("S", 7.5), ("A", 6.25), ("B", 4.75), ("C", 3.25), ("D", 0.0)]
STATUS_BONUS = 0.5
ROLES = {"DAMAGE DEALER": "Damage", "STATUS SPECIALIST": "Status", "SUPPORT": "Support", "TANK": "Tank"}


def norm(text: str) -> str:
    """Loose key for matching names across sites ("Zwei. Assoc." vs "Zwei Association")."""
    text = text.replace("ß", "ss").replace("ẞ", "ss")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = re.sub(r"\bassociation\b|\bassoc\b", " ", text)
    text = text.replace("harpooner", "harpooneer").replace("night awl ", "night awls ")
    return re.sub(r"[^a-z0-9]", "", text)


def read_list(path: Path, with_role: bool) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("|")
        if with_role:
            tier, role, name, sinner = parts
        else:
            (tier, name, sinner), role = parts, None
        rows.append({"tier": tier.strip(), "role": role and ROLES.get(role.strip()), "name": name.strip(), "sinner": sinner.strip()})
    return rows


def match(rows: list[dict], identities: list[dict]) -> tuple[dict[str, dict], list[str]]:
    """identity id -> row. Exact loose-name match first, then the closest name for the same sinner."""
    by_key = {norm(i["name"]): i for i in identities}
    out: dict[str, dict] = {}
    notes: list[str] = []
    for r in rows:
        ident = by_key.get(norm(f"{r['name']} {r['sinner']}"))
        if ident is None:
            same = [i for i in identities if norm(i["sinner"]) == norm(r["sinner"]) and i["id"] not in out]
            names = {norm(i["name"]): i for i in same}
            close = difflib.get_close_matches(norm(f"{r['name']} {r['sinner']}"), list(names), n=1, cutoff=0.85)
            if close:
                ident = names[close[0]]
                notes.append(f"  fuzzy: {r['name']} ({r['sinner']}) -> {ident['name']}")
        if ident is None:
            notes.append(f"  no match: {r['name']} ({r['sinner']})")
            continue
        if ident["id"] in out:
            notes.append(f"  duplicate: {r['name']} ({r['sinner']})")
            continue
        out[ident["id"]] = r
    return out, notes


def to_tier(score: float) -> str:
    return next(t for t, low in THRESHOLDS if score >= low)


def build(identities: list[dict], prydwen: list[dict], gll: list[dict]) -> tuple[dict, list[str]]:
    p, p_notes = match(prydwen, identities)
    g, g_notes = match(gll, identities)
    report = ["Prydwen:", *p_notes, "Great Limbus Library:", *g_notes]
    tiers = {}
    for ident in identities:
        rows = [r for r in (p.get(ident["id"]), g.get(ident["id"])) if r]
        if not rows:
            report.append(f"  unrated (on neither list): {ident['name']}")
            continue
        role = p[ident["id"]]["role"] if ident["id"] in p else None
        score = sum(POINTS[r["tier"]] for r in rows) / len(rows)
        if role == "Status":
            score += STATUS_BONUS
        score = round(min(score, 10.0), 2)
        entry = {"tier": to_tier(score), "score": score}
        if role:
            entry["role"] = role
        if ident["id"] in p:
            entry["prydwen"] = p[ident["id"]]["tier"]
        if ident["id"] in g:
            entry["gll"] = g[ident["id"]]["tier"]
        tiers[ident["id"]] = entry
    return tiers, report


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--identities", type=Path, default=ROOT / "data" / "identities.json")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args(argv)

    identities = json.loads(args.identities.read_text(encoding="utf-8"))
    prydwen = read_list(TIER_DIR / "prydwen.txt", with_role=True)
    gll = read_list(TIER_DIR / "gll.txt", with_role=False)
    tiers, report = build(identities, prydwen, gll)
    data = {
        "about": "Mirror Dungeon ranking: the average of Prydwen.gg (endgame) and Great Limbus Library tiers, "
                 "+0.5 for Status Specialists because MD keyword gifts multiply status damage. "
                 "Built by scraper/tiers.py from data/tiers/*.txt. Your ratings in the app override it.",
        "sources": [
            "https://www.prydwen.gg/limbus-company/tier-list",
            "https://gll-fun.com/limbus/en/tierlist/identities/",
        ],
        "updated": "2026-09-23",
        "tiers": dict(sorted(tiers.items(), key=lambda kv: (-kv[1]["score"], kv[0]))),
    }
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts: dict[str, int] = {}
    for e in tiers.values():
        counts[e["tier"]] = counts.get(e["tier"], 0) + 1
    print(f"Ranked {len(tiers)} of {len(identities)} identities -> {args.out}")
    print("  " + ", ".join(f"{t} {counts.get(t, 0)}" for t, _ in THRESHOLDS))
    print("\n".join(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
