"""Deployment-order mechanics in identity skills and passives.

Some identities care where they, or their allies, sit in the lineup:
  "When the ally with the earliest Deployment order hits Critically using a Slash Skill ..."
  "Gain 3 Bloodflame in the same turn it Substitutes or Returns in"
  "apply +2 Charge Count next turn on allies with earlier Deployment order than this unit"
This pulls those lines out of an identity page's source, tagged by kind, so the
web app can suggest lineup moves and quote the reason.

Kinds:
  first        affects the #1 / earliest-deployed ally (n = how many from the front)
  last         affects the ally deployed last / lattermost
  before_self  affects allies earlier in the order than this unit
  in_order     affects allies "in Deployment order" (the front ones first)
  sub_self     this unit gains something when it Substitutes (or Returns) in
  sub_ally     allies that Substitute in gain something
"""
from __future__ import annotations

import re

from . import wikitext

_PASSIVE_START = re.compile(r"\{\{\s*Passive\s*\|")
_PARAM = re.compile(r"^\s*(?:sin|req)\d*\s*=", re.I)
_SKILL_NAME = re.compile(r"^\|\s*(?:s\d)?name\s*=\s*(.+)$")
_EFFECT = re.compile(r"^\|\s*(se|ce\d+)\s*=\s*(.*)$")

_FIRST = re.compile(
    r"earliest Deployment [Oo]rders?|#1 (?:and #2 )?(?:Deployed|Sinner to be Deployed)|#1 Deployed", re.I)
_LAST = re.compile(r"lattermost Deployment [Oo]rder|deployed last|reverse Deployment [Oo]rder", re.I)
_BEFORE_SELF = re.compile(r"earlier Deployment [Oo]rder than this unit", re.I)
_IN_ORDER = re.compile(r"\bin (?:their )?Deployment [Oo]rder\b", re.I)
_SUB = re.compile(r"Substitut|Returns? (?:in|to the battlefield)", re.I)
_SUB_SELF = re.compile(
    r"(?:\bit|this unit)\s+(?:is\s+)?(?:Substitut|Returns?\b)|(?:\bit|this unit) Substitutes or Returns", re.I)
_TWO = re.compile(r"#1 and #2|2 allies with the earliest", re.I)


def _lines(text: str) -> list[str]:
    plain = wikitext.to_plain(text)
    out = []
    for line in re.split(r"\n+", plain):
        line = line.strip(" -\t")
        if line and not line.startswith(("*", "'''")) and "'''" not in line:
            out.append(re.sub(r"\s+", " ", line))
    return out


def _templates(source: str) -> list[list[str]]:
    """Top-level parameters of every {{Passive|...}}, respecting nested {{ }} and [[ ]]."""
    out = []
    for m in _PASSIVE_START.finditer(source):
        i, depth, parts, cur = m.end(), 1, [], []
        while i < len(source) and depth:
            two = source[i:i + 2]
            if two in ("{{", "[["):
                depth += 1
                cur.append(two)
                i += 2
                continue
            if two in ("}}", "]]"):
                depth -= 1
                if depth:
                    cur.append(two)
                i += 2
                continue
            if source[i] == "|" and depth == 1:
                parts.append("".join(cur))
                cur = []
            else:
                cur.append(source[i])
            i += 1
        parts.append("".join(cur))
        out.append(parts)
    return out


def _classify(line: str) -> tuple[str, int] | None:
    if _SUB.search(line):
        if re.search(r"frontmost place in the Backup", line, re.I):
            return None  # a unit's own retreat rule, not a lineup preference
        return ("sub_self", 1) if _SUB_SELF.search(line) else ("sub_ally", 1)
    if _BEFORE_SELF.search(line):
        return "before_self", 1
    if _LAST.search(line):
        return "last", 1
    if _FIRST.search(line):
        return "first", 2 if _TWO.search(line) else 1
    if _IN_ORDER.search(line):
        return "in_order", 1
    return None


def order_notes(source: str) -> list[dict]:
    """Order-related lines from an identity page: [{kind, n, text, source}]."""
    notes: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def add(line: str, where: str) -> None:
        # One note per (kind, skill/passive): pages list some passives at two uptie
        # levels, and the first (highest) version is the one that counts.
        kind = _classify(line)
        if not kind or (kind[0], where) in seen:
            return
        seen.add((kind[0], where))
        note = {"kind": kind[0], "text": line[:400], "source": where}
        if kind[1] > 1:
            note["n"] = kind[1]
        notes.append(note)

    for parts in _templates(source or ""):
        # Support passives carry sin/req params: the name is the first other part, the text the last.
        positional = [p for p in parts if not _PARAM.match(p)]
        if len(positional) < 2:
            continue
        name = wikitext.to_plain(positional[0]).strip()
        for line in _lines(positional[-1]):
            add(line, name)

    skill = None
    for raw in (source or "").splitlines():
        n = _SKILL_NAME.match(raw)
        if n:
            skill = wikitext.to_plain(n.group(1)).split("[")[0].strip()
            continue
        e = _EFFECT.match(raw)
        if e and skill:
            for line in _lines(e.group(2)):
                add(line, skill)
    return notes
