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

The defense skill is `|defense={{UptieSkills ...}}` with the same fields. Its `type` is
Guard or Evade (one page says "Defense": a Guard), or an attack type for a Counter. It
isn't in the deck: it can be used in any skill slot instead of a hand skill, and it has a
sin, so it can fill out a Resonance chain (`identity_defense`).
"""
from __future__ import annotations

import re

from . import wikitext

_SKILL_PARAM = re.compile(r"\|\s*skill([123])\s*=\s*\{\{\s*UptieSkills", re.IGNORECASE)
_DEFENSE_PARAM = re.compile(r"\|\s*defense\s*=\s*\{\{\s*UptieSkills", re.IGNORECASE)
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


_VERB = re.compile(r"\b(inflicts?|apply|applies|triggers?|gains?|consumes?|spends?|loses?)\b", re.IGNORECASE)
_SELF_VERB = re.compile(r"^(gains?|consumes?|spends?|loses?)$", re.IGNORECASE)


def status_targets(markup: str) -> tuple[list[str], list[str]]:
    """Statuses a skill puts on (or uses on) the enemy vs. ones it gains or spends itself.

    "Inflict 2 Tremor", "Trigger Tremor Burst", "for every 4 (Burn + Tremor) on the main target" are
    the enemy's; "Gain +3 Tremor Count", "Consume 6 Tremor Count on self", "If this unit has 10+
    Tremor" are the unit's own (Spicebush Yi Sang's Tremor never reaches an enemy)."""
    enemy: dict[str, None] = {}
    own: dict[str, None] = {}
    for clause in re.split(r"<br\s*/?>|(?<=[.;])\s+", markup or "", flags=re.IGNORECASE):
        for m in wikitext._STATUS_RE.finditer(clause):
            name = m.group(1).strip()
            before = wikitext.to_plain(clause[:m.start()])[-90:]
            after = wikitext.to_plain(clause[m.end():])[:30]
            verbs = _VERB.findall(before)
            verb = verbs[-1] if verbs else ""
            if re.search(r"\b(?:on|to) self\b", after, re.IGNORECASE) or (verb and _SELF_VERB.match(verb)):
                own.setdefault(name, None)
            elif verb or re.search(r"\btarget|\benem", before + after, re.IGNORECASE):
                enemy.setdefault(name, None)
            elif re.search(r"\bthis unit\b|\bself\b", before, re.IGNORECASE):
                own.setdefault(name, None)
    return list(enemy), list(own)


def identity_skills(source: str) -> list[dict]:
    """[{slot, name, sin, type, base, coin_power, coins, copies, weight, weight_bonus, statuses}] for skills 1-3.

    weight_bonus: the most "Atk Weight +N" the skill text grants (usually conditional, like
    Dawn Office Fixer Sinclair's Skill 2 in his Volatile E.G.O state), 0 if none."""
    skills: dict[int, dict] = {}
    for m in _SKILL_PARAM.finditer(source or ""):
        slot = int(m.group(1))
        if slot in skills:
            continue
        p = _params(_template_body(source, m.start()))
        sin = (p.get("sin") or "").strip().lower()
        effects = " ".join(v for k, v in p.items() if k == "se" or re.fullmatch(r"ce\d+", k))
        # "Atk Weight +1 (+2 at 45 SP)" in any uptie's skill text: it can hit extra targets.
        all_se = " ".join(v for k, v in p.items() if re.fullmatch(r"\d?se", k))
        bonus = max((int(n) for n in re.findall(r"Atk Weight \+\s*(\d+)", all_se, re.IGNORECASE)), default=0)
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
            "weight_bonus": bonus,
            "statuses": wikitext.status_effects(effects),
        }
        enemy, own = status_targets(effects)
        skills[slot]["enemy"] = enemy
        skills[slot]["self"] = own
    return [skills[k] for k in sorted(skills)]


def identity_defense(source: str) -> dict | None:
    """{name, sin, type, kind (guard | evade | counter), base, coin_power, coins, statuses} or None."""
    m = _DEFENSE_PARAM.search(source or "")
    if not m:
        return None
    p = _params(_template_body(source, m.start()))
    sin = (p.get("sin") or "").strip().lower()
    typ = (p.get("type") or "").strip().capitalize() or None
    kind = "evade" if typ == "Evade" else "guard" if typ in ("Guard", "Defense", None) else "counter"
    effects = " ".join(v for k, v in p.items() if k == "se" or re.fullmatch(r"ce\d+", k))
    return {
        "name": wikitext.to_plain(p.get("name", "")).strip(),
        "sin": sin if sin in SINS else None,
        "type": typ,
        "kind": kind,
        "base": _int(p.get("spower")),
        "coin_power": _int(p.get("cpower")),
        "coins": _int(p.get("coin")),
        "statuses": wikitext.status_effects(effects),
    }
