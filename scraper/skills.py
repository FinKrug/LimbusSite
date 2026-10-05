"""An identity's three attack skills, from its page source.

Identity pages use the {{IDPage}} template with one {{UptieSkills ...}} per skill:

    |skill1={{UptieSkills
    |slevel=1
    |sin=Envy
    |name=Contemptuous Thing
    |type=Pierce
    |spower=3          base power (max uptie)
    |cpower=+ 4        coin power
    |coin=2            number of coins
    |amt=3             copies of the skill in the identity's deck
    |atkweight=1
    |se=... / |ce1=... skill and coin effects
    }}

Alternate forms of a skill ("skill3-2") are left out: they replace the skill in
combat but don't change the deck. The web app's skill-swap planner uses this to
show what a Skill Replacement (S1 -> S2, S2 -> S3, S1 -> S3) changes.
"""
from __future__ import annotations

import re

from . import wikitext

_SKILL_PARAM = re.compile(r"\|\s*skill([123])\s*=\s*\{\{\s*UptieSkills", re.IGNORECASE)
SINS = ("wrath", "lust", "sloth", "gluttony", "gloom", "pride", "envy")


def _template_body(source: str, start: int) -> str:
    """Text of the {{...}} template that opens at or after `start` (balanced braces)."""
    i = source.find("{{", start)
    if i < 0:
        return ""
    depth, j = 0, i
    while j < len(source):
        two = source[j:j + 2]
        if two == "{{":
            depth += 1
            j += 2
            continue
        if two == "}}":
            depth -= 1
            j += 2
            if depth == 0:
                return source[i + 2:j - 2]
            continue
        j += 1
    return source[i + 2:]


def _params(body: str) -> dict[str, str]:
    """Top-level |key=value parameters of a template body."""
    out: dict[str, str] = {}
    depth, cur = 0, []
    parts: list[str] = []
    i = 0
    while i < len(body):
        two = body[i:i + 2]
        if two in ("{{", "[["):
            depth += 1
            cur.append(two)
            i += 2
            continue
        if two in ("}}", "]]"):
            depth -= 1
            cur.append(two)
            i += 2
            continue
        if body[i] == "|" and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(body[i])
        i += 1
    parts.append("".join(cur))
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            out[k.strip().lower()] = v.strip()
    return out


def _int(value: str | None) -> int | None:
    if not value:
        return None
    m = re.search(r"([+-])?\s*(\d+)", value)
    if not m:
        return None
    n = int(m.group(2))
    return -n if m.group(1) == "-" else n


def identity_skills(source: str) -> list[dict]:
    """[{slot, name, sin, type, base, coin_power, coins, copies, weight, statuses}] for skills 1-3."""
    skills: dict[int, dict] = {}
    for m in _SKILL_PARAM.finditer(source or ""):
        slot = int(m.group(1))
        if slot in skills:
            continue
        p = _params(_template_body(source, m.start()))
        sin = (p.get("sin") or "").strip().lower()
        effects = " ".join(v for k, v in p.items() if k == "se" or re.fullmatch(r"ce\d+", k))
        skills[slot] = {
            "slot": slot,
            "name": wikitext.to_plain(p.get("name", "")).strip(),
            "sin": sin if sin in SINS else None,
            "type": (p.get("type") or "").strip().capitalize() or None,
            "base": _int(p.get("spower")),
            "coin_power": _int(p.get("cpower")),
            "coins": _int(p.get("coin")),
            "copies": _int(p.get("amt")),
            "weight": _int(p.get("atkweight")),
            "statuses": wikitext.status_effects(effects),
        }
    return [skills[k] for k in sorted(skills)]
