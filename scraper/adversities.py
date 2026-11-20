"""Mounting Adversities (Parallel Superposition EXTREME): the optional debuffs offered after
clearing floors 10 to 14, each worth some Adversity Score.

They're listed in one table on the wiki's "Mirror Dungeon" page, under "Mounting Adversities":
a "Floor N" row, then one row per adversity: `|Name||Effect||Score`. Every floor offers its
whole list; Level Boost and Frailness come back on every floor (so they stack up to 5 times),
and a few come in two tiers ("Mark of Fire I" on floor 10, "Mark of Fire II" on floor 13),
where the higher tier replaces the lower one's effect.
"""

from __future__ import annotations

import re

from .wikitext import to_plain

PAGE = "Mirror Dungeon"
HEADING = "Mounting Adversities"

_HEADING_RE = re.compile(r"^(=+)\s*(.+?)\s*\1\s*$", re.MULTILINE)
_FLOOR_RE = re.compile(r"'''\s*Floor\s+(\d+)\s*'''", re.IGNORECASE)
_TIER_RE = re.compile(r"^(.*?)\s+(I{1,3}|IV|V)$")
_ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}
_OVERWRITE_RE = re.compile(r"※\s*If a lower tier Adversity already exists, overwrite that effect\.?", re.IGNORECASE)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _section(content: str, heading: str) -> str:
    """Text under the first heading named `heading` (up to the next heading of the same or a
    higher level)."""
    for m in _HEADING_RE.finditer(content):
        if m.group(2).strip().lower() != heading.lower():
            continue
        level = len(m.group(1))
        rest = content[m.end():]
        for n in _HEADING_RE.finditer(rest):
            if len(n.group(1)) <= level:
                return rest[:n.start()]
        return rest
    return ""


def _first_table(text: str) -> str:
    start = text.find("{|")
    if start < 0:
        return ""
    end = text.find("\n|}", start)
    return text[start:end if end >= 0 else len(text)]


def parse_adversities(content: str) -> tuple[list[dict], list[str]]:
    """The adversity table on the Mirror Dungeon page -> rows, warnings.

    Each row: {id, name, family, tier, floor, effect, score, replaces_lower}.
    `family` is the name without its tier numeral ("Mark of Fire"); `tier` is 1, 2… or None for
    adversities without tiers; `id` is the slug of the full name (the same adversity on several
    floors keeps one id, with a row per floor)."""
    warnings: list[str] = []
    table = _first_table(_section(content, HEADING))
    if not table:
        return [], [f"{PAGE}: no '{HEADING}' table found"]
    rows: list[dict] = []
    floor: int | None = None
    for line in table.splitlines():
        line = line.strip()
        fm = _FLOOR_RE.search(line)
        if fm and line.startswith("|") and "colspan" in line:
            floor = int(fm.group(1))
            continue
        if not line.startswith("|") or line.startswith(("|-", "|}", "|+")) or "||" not in line:
            continue
        cells = [c.strip() for c in line[1:].split("||")]
        if len(cells) < 3:
            continue
        name = to_plain(cells[0])
        score_text = to_plain(cells[-1])
        effect_markup = "||".join(cells[1:-1])
        if not name or not re.fullmatch(r"\d+", score_text):
            warnings.append(f"{PAGE}: adversity row not understood: {line[:80]}")
            continue
        if floor is None:
            warnings.append(f"{PAGE}: adversity {name} before any Floor row")
            continue
        replaces = bool(_OVERWRITE_RE.search(to_plain(effect_markup)))
        effect = _OVERWRITE_RE.sub("", to_plain(effect_markup)).strip()
        tm = _TIER_RE.match(name)
        family, tier = (tm.group(1), _ROMAN[tm.group(2)]) if tm else (name, None)
        rows.append({
            "id": slug(name),
            "name": name,
            "family": family,
            "family_id": slug(family),
            "tier": tier,
            "floor": floor,
            "effect": effect,
            "score": int(score_text),
            "replaces_lower": replaces,
        })
    if not rows:
        warnings.append(f"{PAGE}: the '{HEADING}' table had no adversities")
    return rows, warnings
