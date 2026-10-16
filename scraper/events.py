"""Mirror Dungeon events (the "?" Abnormality encounters), from the wiki.

Each page in Category:Mirror Dungeon Events has one or more {{AbEvent}} templates:

    {{AbEvent |eventname=... |story=...
     |choice1={{Choice|id=1 |choice=I do. |desc=...
                |story={{SkillCheck |sin1=Sloth|sin2=Gluttony |adv=11|disadv=22
                         |passresult=... |failresult=...}} }}
     |choice2={{Choice|id=2 |choice=I don't. |result=E.G.O Gift {{StatCon|giftsloth|Blood, Sweat, and Tears}} obtained!}}
    }}

The first one is the regular Mirror Dungeon event; later ones are variants tied to
a theme pack (the line before them says which). Results are kept as plain text plus
what the web app needs to judge them: gifts gained (as gift ids), Cost, whether it's
a fight, and whether it hurts (damage, SP loss, lasting penalties).

A check ({{SkillCheck}}) names one or two sins and two thresholds: `adv` when the
sinner you send has a skill of that sin, `disadv` without. Some add bonuses for
certain identities (`specidentityN` / `specmodN`).
"""
from __future__ import annotations

import re

from . import wikitext

CATEGORY = "Category:Mirror Dungeon Events"
_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)


# -- template parsing ------------------------------------------------------------

def find_templates(text: str, name: str) -> list[tuple[int, int, str]]:
    """(start, end, inner) of each top-level {{name ...}} in text, braces balanced."""
    out = []
    i = 0
    pat = re.compile(r"\{\{\s*" + re.escape(name) + r"\s*[|}\n]")
    while True:
        m = pat.search(text, i)
        if not m:
            return out
        start = m.start()
        depth = 0
        j = start
        while j < len(text):
            if text.startswith("{{", j):
                depth += 1
                j += 2
            elif text.startswith("}}", j):
                depth -= 1
                j += 2
                if depth == 0:
                    break
            else:
                j += 1
        out.append((start, j, text[start + 2:j - 2]))
        i = j


def params(inner: str) -> dict[str, str]:
    """Named parameters of a template body, splitting only on top-level pipes."""
    parts: list[str] = []
    depth_t = depth_l = 0
    cur = []
    k = 0
    while k < len(inner):
        two = inner[k:k + 2]
        if two == "{{":
            depth_t += 1; cur.append(two); k += 2; continue
        if two == "}}":
            depth_t -= 1; cur.append(two); k += 2; continue
        if two == "[[":
            depth_l += 1; cur.append(two); k += 2; continue
        if two == "]]":
            depth_l -= 1; cur.append(two); k += 2; continue
        ch = inner[k]
        if ch == "|" and depth_t == 0 and depth_l == 0:
            parts.append("".join(cur)); cur = []
        else:
            cur.append(ch)
        k += 1
    parts.append("".join(cur))
    out: dict[str, str] = {}
    for p in parts[1:]:
        if "=" in p:
            key, val = p.split("=", 1)
            out[key.strip().lower()] = val.strip()
    return out


# -- results ------------------------------------------------------------------------

_STATCON = re.compile(r"\{\{\s*StatCon\s*\|([^{}]*)\}\}", re.IGNORECASE)
_GIFT = re.compile(r"\{\{\s*StatCon\s*\|\s*gift\w*\s*\|\s*([^|{}]+?)\s*\}\}", re.IGNORECASE)
_GIFT_TT = re.compile(r"\{\{\s*GiftTT\s*\|\s*([^|{}]+?)\s*[|}]", re.IGNORECASE)
_COST = re.compile(r"(?:Cost\s*\+?\s*(\d+)\s*(?:gained|obtained)|(\d+)\s*Cost\s*(?:gained|obtained))", re.IGNORECASE)
_LOSE_COST = re.compile(r"(?:Cost\s*-?\s*(\d+)\s*(?:lost|spent|consumed)|(?:lose|lost|spend|spent|consume)\s*(\d+)\s*Cost)", re.IGNORECASE)
_HURT = re.compile(r"\b(damage|lose|loses|lost|hplose|alllose|splose|panic|Panic|corrosion|Fragile|Bind|Paralyze|take \d+|Sinking|Burn|Bleed)\b")
_LASTING = re.compile(r"start of (?:the |each )?(?:combat|turn|encounter|next)|for the rest|next \d* ?(?:encounter|battle|floor)|until the end|this floor", re.IGNORECASE)
_NOTHING = re.compile(r"^\s*nothing happen", re.IGNORECASE)


def _statcon_text(m: re.Match) -> str:
    args = [a.strip() for a in m.group(1).split("|")]
    kind = args[0].lower() if args else ""
    if kind.startswith("gift") and len(args) > 1:
        return args[1]
    if kind.startswith("sin") and len(kind) > 3:
        return kind[3:].capitalize()
    if kind == "combat":
        return "Battle!"
    if len(args) > 1:
        return args[-1]
    return args[0] if args else ""


def plain(markup: str) -> str:
    text = _COMMENT.sub("", markup or "")
    text = _STATCON.sub(_statcon_text, text)
    text = re.sub(r"\{\{\s*EnBox\s*\|[^{}]*\}\}", "", text, flags=re.IGNORECASE)
    return wikitext.to_plain(text)


def outcome(markup: str, gift_ids: dict[str, str], fold) -> dict:
    """What a result gives: plain text, gifts (ids), Cost, fight, harm."""
    markup = _COMMENT.sub("", markup or "")
    names = [m.group(1) for m in _GIFT.finditer(markup)] + [m.group(1) for m in _GIFT_TT.finditer(markup)]
    gifts, unknown = [], []
    for n in dict.fromkeys(names):
        gid = gift_ids.get(fold(n))
        (gifts if gid else unknown).append(gid or n)
    text = plain(markup)
    cost = sum(int(a or b) for a, b in _COST.findall(text))
    cost -= sum(int(a or b) for a, b in _LOSE_COST.findall(text))
    combat = bool(re.search(r"StatCon\s*\|\s*combat", markup, re.IGNORECASE)) or bool(re.search(r"\b(?:win|lose) the battle\b", text, re.IGNORECASE))
    return {
        "text": text,
        "gifts": gifts,
        "unknown_gifts": unknown,
        "cost": cost,
        "combat": combat,
        "hurts": bool(_HURT.search(text)) and not combat or bool(re.search(r"take[s]? \d+|damage!", text)),
        "lasting": bool(_LASTING.search(text)),
        "nothing": bool(_NOTHING.match(text)),
    }


def check(inner: str) -> dict:
    p = params(inner)
    sins = [p[k].strip().lower() for k in ("sin1", "sin2", "sin3") if p.get(k)]
    bonuses = []
    for n in range(1, 6):
        who, mod = p.get(f"specidentity{n}"), p.get(f"specmod{n}")
        if who and mod:
            m = re.search(r"[-+]?\d+", mod)
            if m:
                bonuses.append({"who": plain(who), "mod": int(m.group(0))})
    def num(k):
        m = re.search(r"\d+", p.get(k, ""))
        return int(m.group(0)) if m else None
    return {"sins": sins, "adv": num("adv"), "disadv": num("disadv"), "bonuses": bonuses, "_p": p}


def choice(inner: str, gift_ids, fold) -> dict:
    p = params(inner)
    out: dict = {"label": plain(p.get("choice", "")), "desc": plain(p.get("desc", "")),
                 "_id": p.get("id", "").strip(), "_prev": p.get("prev", "").strip()}
    story = p.get("story", "")
    checks = find_templates(story, "SkillCheck")
    if checks:
        c = check(checks[0][2])
        cp = c.pop("_p")
        out["check"] = c
        out["pass"] = outcome(cp.get("passresult", ""), gift_ids, fold)
        out["fail"] = outcome(cp.get("failresult", ""), gift_ids, fold)
    else:
        out["check"] = None
        out["result"] = outcome(p.get("result", ""), gift_ids, fold)
    # Follow-up choices (multi-step events): choiceN inside a Choice.
    nxt = []
    for k in sorted((k for k in p if re.fullmatch(r"choice\d+", k)), key=lambda k: int(k[6:])):
        for _, _, sub in find_templates(p[k], "Choice")[:1]:
            nxt.append(choice(sub, gift_ids, fold))
    if nxt:
        out["next"] = nxt
    return out


def nest(flat: list[dict]) -> list[dict]:
    """Follow-up choices are listed flat with |prev=<id of the choice they follow>."""
    by_id = {c["_id"]: c for c in flat if c["_id"]}
    top = []
    for c in flat:
        parent = by_id.get(c["_prev"]) if c["_prev"] else None
        if parent is not None and parent is not c:
            parent.setdefault("next", []).append(c)
        else:
            top.append(c)
    for c in flat:
        c.pop("_id", None)
        c.pop("_prev", None)
    return top


def parse_event_page(title: str, source: str, gift_ids: dict[str, str], fold, slugify, wiki_url) -> dict | None:
    src = _COMMENT.sub("", source or "")
    events = find_templates(src, "AbEvent")
    if not events:
        return None
    info = find_templates(src, "AbnoInfo")
    info_p = params(info[0][2]) if info else {}
    page_gifts = [gift_ids.get(fold(v)) for k, v in info_p.items() if re.fullmatch(r"egogift\d*", k)]
    variants = []
    prev_end = 0
    for start, end, inner in events:
        p = params(inner)
        before = plain(src[prev_end:start]).strip().split("\n")
        note = before[-1].strip() if before and re.search(r"only|available|Theme Pack|Story Dungeon", before[-1]) else ""
        prev_end = end
        flat = []
        for k in sorted((k for k in p if re.fullmatch(r"choice\d+", k)), key=lambda k: int(k[6:])):
            for _, _, sub in find_templates(p[k], "Choice")[:1]:
                flat.append(choice(sub, gift_ids, fold))
        choices = nest(flat)
        if not choices:
            continue
        story = plain(p.get("story", ""))
        variants.append({
            "name": plain(p.get("eventname", "")) or "Mirror Dungeon Event",
            "note": note[:300],
            "story": story[:400],
            "choices": choices,
        })
    if not variants:
        return None
    return {
        "id": slugify(title),
        "name": title,
        "gifts": [g for g in page_gifts if g],
        "variants": variants,
        "wiki_url": wiki_url(title),
    }


def build_events(sources: dict[str, dict], gifts: list[dict], fold, slugify, wiki_url) -> tuple[list[dict], list[str]]:
    gift_ids = {fold(g["name"]): g["id"] for g in gifts}
    out, warnings = [], []
    for title in sorted(sources):
        s = sources[title]
        if s.get("missing"):
            continue
        try:
            ev = parse_event_page(title, s.get("content", ""), gift_ids, fold, slugify, wiki_url)
        except Exception as e:  # one odd page shouldn't stop the run
            warnings.append(f"event {title}: could not parse ({e})")
            continue
        if ev:
            out.append(ev)
        else:
            warnings.append(f"event {title}: no choices found")
    unknown = sorted({n for e in out for v in e["variants"] for c in _all_choices(v["choices"])
                      for o in _outcomes(c) for n in o["unknown_gifts"]})
    if unknown:
        warnings.append(f"events: {len(unknown)} gifts not in gifts.json (story-only?), e.g. {unknown[:6]}")
    return out, warnings


def _all_choices(choices):
    for c in choices:
        yield c
        yield from _all_choices(c.get("next", []))


def _outcomes(c):
    return [c[k] for k in ("result", "pass", "fail") if c.get(k)]
