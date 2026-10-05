"""E.G.O (the sinners' E.G.O skills, not E.G.O gifts), from the wiki.

Most of what the app needs comes from each E.G.O page's categories, the same
way identities work:

    E.G.O, Yi Sang E.G.O, ZAYIN Level E.G.O, Sloth E.G.O, E.G.O with Bind

Resource cost, Sanity cost and the skill's numbers are only in the page source.
The page template is {{EGPage}}, but `ego_details` reads it loosely so small
template changes don't break it: any parameter that names a sin and holds a small number is a cost
("|wrath=1", "|costwrath=1", "|cost={{Wrath}} x1 {{Sloth}} x3"), a parameter
named like "sanity" is the Sanity cost, and the first template with spower /
cpower / coin is the skill. Anything it can't find stays None and the web app
falls back to typical values for the E.G.O's grade (see web/src/lib/ego.ts).
"""
from __future__ import annotations

import re

from . import wikitext
from .skills import SINS, _int, _params, _template_body

GRADES = ("ZAYIN", "TETH", "HE", "WAW", "ALEPH")
# Sin resistances also name sins ("|wrathres=Endured"); those aren't costs.
_NOT_COST = re.compile(r"res|weak|fatal|ineff|endur|normal|resist|mod", re.IGNORECASE)
_SANITY_KEY = re.compile(r"^(?:asanity|sanity|sanitycost|sanity cost|spcost|sp cost|sp)$", re.IGNORECASE)
_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_SIN_TIMES = re.compile(r"(Wrath|Lust|Sloth|Gluttony|Gloom|Pride|Envy)[^0-9|]{0,40}?[x×]\s*(\d+)", re.IGNORECASE)


def parse_ego(title: str, categories: list[str], sinners: list[str], fold) -> dict | None:
    """Sinner, grade, sin and statuses from an E.G.O page's categories; None if it isn't one."""
    by_fold = {fold(s): s for s in sinners}
    by_fold.setdefault("ryoshu", next((s for s in sinners if fold(s) == "ryoshu"), "Ryōshū"))
    sinner = grade = sin = None
    statuses: list[str] = []
    for c in categories:
        m = re.fullmatch(r"(.+?) E\.G\.O", c)
        if not m:
            m2 = re.fullmatch(r"E\.G\.O with (.+)", c)
            if m2:
                statuses.append(m2.group(1))
            continue
        head = m.group(1)
        if fold(head) in by_fold:
            sinner = by_fold[fold(head)]
        elif (g := re.fullmatch(r"(ZAYIN|TETH|HE|WAW|ALEPH) Level", head)):
            grade = g.group(1)
        elif head.lower() in SINS:
            sin = head.lower()
    if not sinner or not grade:
        return None
    name = title
    for suffix in (f" {sinner}", " Ryoshu", " Ryōshū"):
        if name.endswith(suffix) and len(name) > len(suffix):
            name = name[: -len(suffix)]
            break
    return {
        "title": title,
        "name": name,
        "sinner": sinner,
        "grade": grade,
        "sin": sin,
        "statuses": statuses,
    }


def ego_details(source: str) -> dict:
    """{cost: {sin: n} | None, sanity, skill: {...} | None, base} from an E.G.O page's wikitext.

    The page template is {{EGPage}}: |wrathcost= ... |envycost=, |asanity= (Sanity cost of the
    Awakening skill), |baseego=1 for each sinner's starting E.G.O, |askill={{Skill ...}}."""
    # Comments sit between parameters ("|envycost=4\n<!--Resistances-->") and would stick to values.
    source = _COMMENT.sub("", source or "")
    cost: dict[str, int] = {}
    base = False
    sanity = None
    skill = None
    # Every template on the page, outermost first.
    for m in re.finditer(r"\{\{", source):
        body = _template_body(source, m.start())
        p = _params(body)
        for k, v in p.items():
            plain = re.sub(r"\s+", "", k)
            if k.strip() == "baseego" and v.strip() == "1":
                base = True
            if _SANITY_KEY.match(k.strip()) and sanity is None:
                sanity = _int(v)
            if "cost" in plain and not re.search("|".join(SINS), plain):
                for sin, n in _SIN_TIMES.findall(wikitext.to_plain(v) + " " + v):
                    cost.setdefault(sin.lower(), int(n))
            sins = [s for s in SINS if s in plain.lower()]
            if len(sins) == 1 and not _NOT_COST.search(plain.replace(sins[0], "")):
                n = v.strip()
                if re.fullmatch(r"\d{1,2}", n) and 0 < int(n) <= 20:
                    cost.setdefault(sins[0], int(n))
        if skill is None and ("spower" in p or "cpower" in p) and "coin" in p:
            effects = " ".join(v for k, v in p.items() if k == "se" or re.fullmatch(r"ce\d+", k))
            skill = {
                "type": (p.get("type") or "").strip().capitalize() or None,
                "base": _int(p.get("spower")),
                "coin_power": _int(p.get("cpower")),
                "coins": _int(p.get("coin")),
                "weight": _int(p.get("atkweight")),
                "statuses": wikitext.status_effects(effects),
            }
    return {"cost": cost or None, "sanity": sanity, "skill": skill, "base": base}


def build_egos(page_cats: dict[str, list[str]], sources: dict[str, dict], sinners: list[str], fold, slugify,
               wiki_url) -> tuple[list[dict], list[str]]:
    warnings: list[str] = []
    out: list[dict] = []
    for title, cats in page_cats.items():
        e = parse_ego(title, cats, sinners, fold)
        if e is None:
            continue
        d = ego_details(sources.get(title, {}).get("content", ""))
        out.append({
            "id": slugify(title),
            "name": e["name"],
            "sinner": e["sinner"],
            "grade": e["grade"],
            "sin": e["sin"],
            "cost": d["cost"],
            "sanity": d["sanity"],
            "base": d["base"],
            "skill": d["skill"],
            "statuses": sorted(set(e["statuses"]) | set((d["skill"] or {}).get("statuses", []))),
            "wiki_url": wiki_url(title),
        })
    no_cost = [e["name"] for e in out if not e["cost"]]
    if no_cost:
        warnings.append(f"E.G.O: no resource cost found for {len(no_cost)}/{len(out)}, e.g. {no_cost[:5]} "
                        "(the app uses typical costs for their grade)")
    if out and all(e["sanity"] is None for e in out):
        warnings.append("E.G.O: no Sanity costs found (check the E.G.O page template in scraper/egos.py)")
    order = {s: i for i, s in enumerate(sinners)}
    out.sort(key=lambda e: (order.get(e["sinner"], 99), GRADES.index(e["grade"]), e["name"]))
    return out, warnings
