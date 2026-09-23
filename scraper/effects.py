"""Read what a gift's effect *needs* and what it *provides*, from its wiki markup.

This is what lets the app see combos: Bell of Truth needs enemies hit by
Tremor Burst; Downpour triggers Tremor Burst on its own every turn. So Bell of
Truth is dead weight for a team without Tremor, until you own Downpour.

It's a heuristic over the wiki's fairly regular phrasing. Each effect is split
into clauses, and every `{{StatusEffect|X}}` in a clause is classified:

  needs    X must already be on the enemy ("enemies affected by X",
           "if the target has 10+ X", "Skill that triggers X")
  applies  the gift inflicts/triggers X itself, under a condition:
             always        "Turn Start: inflict 3 Rupture ... on all enemies"
             keyword:K     "hitting with a Skill that inflicts Bleed, inflict 4 Bleed"
                           (only works if your team already inflicts K)
             attack:T      "Final Coin of Blunt Skills inflict 2 Tremor"
             sin:S         "If the Skill's Affinity was Gluttony, inflict 5 Sinking"

Plus which attack types (Slash/Pierce/Blunt) and sin affinities the effect
refers to, so e.g. Oil-gunked Spanner counts for a Blunt team.
"""

from __future__ import annotations

import re

SINS = ["Wrath", "Lust", "Sloth", "Gluttony", "Gloom", "Pride", "Envy"]
ATTACK_TYPES = ["Slash", "Pierce", "Blunt"]
# Statuses a gift can inflict/need that matter for combos. Buffs on allies
# (Haste, Damage Up...) are ignored: they don't enable anything.
ENEMY_STATUSES = {
    "Burn", "Bleed", "Tremor", "Rupture", "Sinking", "Poise", "Charge",
    "Tremor Burst", "Fragile", "Bind", "Paralyze", "Defense Level Down",
    "Offense Level Down", "Attack Power Down", "Defense Power Down",
}

_STATUS = re.compile(r"\{\{\s*StatusEffect\s*\|\s*([^|}]+?)\s*(?:\|[^}]*)?\}\}")
_SPLIT = re.compile(r"<br\s*/?>|(?<=[.!?])\s+(?=[A-Z\[(])|\n", re.IGNORECASE)
_UNIQUE = re.compile(r"'Unique (\w+)'")

# "enemies affected by X", "enemy with X", "target has 10+ X", "against enemies with X",
# "enemies that have X", "Skill that triggers X", "if ... X is triggered"
_NEEDS_BEFORE = re.compile(
    r"(affected by|(?:enem(?:y|ies)|targets?|parts?|foe)\s+(?:with|that ha(?:s|ve))|"
    r"(?:target|enemy|it)\s+(?:has|have|had)|against enem(?:y|ies) with|"
    r"that triggers?|triggering|when triggering|on)\s*(?:\d+\+?\s*|at least \d+\s*|(?:or more|\d+ or more)\s*)?$",
    re.IGNORECASE,
)
_INFLICT_BEFORE = re.compile(
    r"(inflicts?|inflicting|apply|applies|trigger|triggers)\b[^.]{0,60}$", re.IGNORECASE,
)
_SKILL_INFLICTS = re.compile(r"Skills?\s+(?:that|which)\s+(?:inflicts?|gains?|apply|applies|consumes?)\b(?:(?!inflict|apply|trigger)[^.]){0,40}$", re.IGNORECASE)
# "Whenever an ally inflicts X", "upon inflicting X", "If the said Skill applies X"
_TEAM_INFLICTS = re.compile(
    r"(?:\b(?:ally|allies|unit|units|Identit(?:y|ies)|Skill|Skills)\s+(?:inflicts?|applies|apply)|"
    r"\b(?:upon|when|whenever|after)\s+(?:inflicting|applying))\b(?:(?!inflict|apply|trigger)[^.]){0,30}$",
    re.IGNORECASE,
)
_GRANTED = re.compile(
    r"\b(?:Slash|Pierce|Blunt|Wrath|Lust|Sloth|Gluttony|Gloom|Pride|Envy)\s+(?:Affinity\s+)?(?:Attack\s+)?"
    r"Skills?\s+(?:additionally\s+)?inflicts?\b(?:(?!inflict|apply|trigger)[^.]){0,30}$",
    re.IGNORECASE,
)
_GATE = re.compile(r"activates?\b[^.]{0,60}\bwhen (?:there are )?\d+\s*(?:or more|\+)\s", re.IGNORECASE)
_ATTACK = re.compile(r"\b(Slash|Pierce|Blunt)\s+(?:Attack\s+)?(?:Skills?|damage|type)\b", re.IGNORECASE)
_SIN = re.compile(r"\b(Wrath|Lust|Sloth|Gluttony|Gloom|Pride|Envy)(?:\s+Affinity|(?=\s+(?:Absolute\s+)?Reson)|(?=\s+(?:Attack\s+)?Skills?\b)|(?=\s+or\s+\w+\s+Affinity))", re.IGNORECASE)
_SIN_WAS = re.compile(r"Affinity was (Wrath|Lust|Sloth|Gluttony|Gloom|Pride|Envy)", re.IGNORECASE)
_TIMED = re.compile(r"^\s*(?:\[[^\]]*\]\s*)?(First\s+)?(Turn Start|Turn End|Combat Start|Encounter Start|"
                    r"At the start of|Wave Start|Start of each|On each|Every turn)", re.IGNORECASE)


def _statuses(markup: str) -> list[tuple[int, int, str]]:
    return [(m.start(), m.end(), m.group(1).strip()) for m in _STATUS.finditer(markup)]


def analyze(markup: str) -> dict:
    """{"needs", "applies": [{"status", "when"}], "attack_types", "sins", "team_gate"}"""
    needs: list[str] = []
    applies: list[dict] = []
    attack_types: list[str] = []
    sins: list[str] = []

    def add(lst, item):
        if item not in lst:
            lst.append(item)

    for clause in _SPLIT.split(markup or ""):
        if not clause.strip():
            continue
        plain = _STATUS.sub(lambda m: m.group(1), clause)
        clause_attacks = [a.capitalize() for a in _ATTACK.findall(plain)]
        clause_sins = [s.capitalize() for s in _SIN.findall(plain)] + [s.capitalize() for s in _SIN_WAS.findall(plain)]
        if re.search(r"\baffinit(?:y|ies)\b", plain, re.IGNORECASE):
            # "Envy, Wrath, and Gloom affinity Skills": every sin named in the clause counts
            clause_sins += [s.capitalize() for s in re.findall(r"\b(" + "|".join(SINS) + r")\b", plain, re.IGNORECASE)]
        clause_sins = list(dict.fromkeys(clause_sins))
        for a in clause_attacks:
            add(attack_types, a)
        for s in clause_sins:
            add(sins, s)
        # What makes an "inflict" in this clause conditional?
        skill_keyword = None
        m = re.search(
            r"(?:Skills?\s+(?:that|which)\s+(?:inflicts?|gains?|apply|applies)|"
            r"\b(?:ally|allies)\s+(?:inflicts?|applies)|\b(?:when|whenever|upon|after)\s+(?:applying|inflicting))"
            r"\s+(?:[^{.]{0,20})?\{\{\s*StatusEffect\s*\|\s*([^|}]+)", clause, re.IGNORECASE)
        if m:
            skill_keyword = m.group(1).strip()
        else:
            u = re.search(r"Skills?\s+(?:that|which)\s+inflicts?[^.]{0,40}'Unique (\w+)'", plain, re.IGNORECASE)
            if u:
                skill_keyword = u.group(1)

        for start, end, status in _statuses(clause):
            if status not in ENEMY_STATUSES:
                continue
            before = _STATUS.sub(lambda mm: mm.group(1), clause[:start])
            tail = before[-80:]
            granted = _GRANTED.search(tail)  # "Blunt Skills inflict X": the gift adds X to those skills
            if not granted and (_SKILL_INFLICTS.search(tail) or _TEAM_INFLICTS.search(tail)):
                continue  # "Skills that inflict Bleed" / "an ally inflicts Sinking": a team condition
            if re.search(r"(?:Skills?\s+)?that\s+triggers?\s*$|\btriggering\s*$", tail, re.IGNORECASE):
                add(needs, status)  # "Attack Skill that triggers Tremor Burst": your skills must trigger it
                continue
            if _NEEDS_BEFORE.search(tail.rstrip()) and not _INFLICT_BEFORE.search(tail[-25:]):
                add(needs, status)
                continue
            if not _INFLICT_BEFORE.search(tail):
                # e.g. "if the enemy has 15+ X" phrased differently, or a mention
                if re.search(r"\b(has|have|with)\b[^,]{0,25}$", tail, re.IGNORECASE):
                    add(needs, status)
                continue
            # It's inflicted/triggered: under what condition?
            if skill_keyword and skill_keyword != status:
                when = f"keyword:{skill_keyword}"
            elif skill_keyword == status:
                when = f"keyword:{status}"
            elif clause_attacks:
                when = f"attack:{clause_attacks[0]}"
            elif _SIN_WAS.search(plain) or (clause_sins and not _TIMED.search(plain)):
                when = f"sin:{clause_sins[0]}" if clause_sins else "always"
            else:
                when = "always"
            add(applies, {"status": status, "when": when})

    # A status the gift itself reliably applies isn't something it "needs",
    # unless the need is about your own skills triggering it (Bell of Truth).
    always = {a["status"] for a in applies if a["when"] == "always"}
    needs = [n for n in needs if n not in always or n == "Tremor Burst" and not any(
        a["status"] == "Tremor Burst" and a["when"] == "always" for a in applies)]
    # "This Gift activates ... when 5 or more Identities have ..." / "when there are 3 or more X Identities"
    gated = bool(_GATE.search(_STATUS.sub(lambda m: m.group(1), markup or "")))
    return {"needs": needs, "applies": applies, "attack_types": attack_types, "sins": sins, "team_gate": gated}
