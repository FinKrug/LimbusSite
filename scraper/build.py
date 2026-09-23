"""Turn parsed wiki data into the app's JSON datasets.

Pure functions only (no network), so they can be unit tested with fixtures.
"""

from __future__ import annotations

import re
import unicodedata
import urllib.parse
from typing import Any

from . import effects, wikitext

TIERS = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "EX": 6}
SINS = ["wrath", "lust", "sloth", "gluttony", "gloom", "pride", "envy"]
SINNERS = [
    "Yi Sang", "Faust", "Don Quixote", "Ryōshū", "Meursault", "Hong Lu",
    "Heathcliff", "Ishmael", "Rodion", "Sinclair", "Outis", "Gregor",
]
POOLS = {
    "MainGifts": "main",
    "ThemedGifts": "themed",
    "ExtremeGifts": "extreme",
    "CursedGifts": "cursed",
    "FusionGifts": "fusion",
    "StoryGifts": "story",
}
MD_POOLS = {"main", "themed", "extreme", "cursed", "fusion"}
# Status keywords that Mirror Dungeon gift builds revolve around.
CORE_KEYWORDS = ["Burn", "Bleed", "Tremor", "Rupture", "Sinking", "Poise", "Charge"]


# -- names -------------------------------------------------------------------
def fold(s: str) -> str:
    """Case/accents/quote-insensitive key for matching names across pages."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("’", "'").replace("‘", "'").replace("`", "'")
    return re.sub(r"\s+", " ", s).strip().lower()


def slugify(s: str) -> str:
    s = fold(s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def split_level(key: str) -> tuple[str, int]:
    """"Hellterfly's Dream++" -> ("Hellterfly's Dream", 2)"""
    m = re.match(r"^(.*?)(\++)$", key)
    if m:
        return m.group(1).rstrip(), len(m.group(2))
    return key, 0


def section_comments(lua_src: str) -> dict[str, str]:
    """Map each ["key"] in a data module to the last `-- comment` above it."""
    out: dict[str, str] = {}
    current = None
    for line in lua_src.splitlines():
        s = line.strip()
        if s.startswith("--") and not s.startswith("--[["):
            text = s.lstrip("-").strip()
            if text:
                current = text
            continue
        m = re.match(r'^\[\s*"((?:[^"\\]|\\.)*)"\s*\]\s*=', s) or re.match(
            r"^\[\s*'((?:[^'\\]|\\.)*)'\s*\]\s*=", s
        )
        if m and current:
            out[m.group(1).replace('\\"', '"').replace("\\'", "'")] = current
    return out


# -- gifts ---------------------------------------------------------------------
class GiftIndex:
    """Resolves the many spellings of a gift name to one gift id."""

    def __init__(self) -> None:
        self._by_fold: dict[str, str] = {}
        self.names: list[str] = []

    def add(self, gift_id: str, *names: str) -> None:
        for n in names:
            if not n:
                continue
            for variant in (n, re.sub(r"\s*\((?:MD|Mirror Dungeon)\)\s*$", "", n)):
                self._by_fold.setdefault(fold(variant), gift_id)
                self.names.append(variant)

    def resolve(self, name: str) -> str | None:
        f = fold(name)
        if f in self._by_fold:
            return self._by_fold[f]
        f2 = fold(re.sub(r"\s*\((?:MD|Mirror Dungeon)\)\s*$", "", name))
        return self._by_fold.get(f2)


def build_gifts(
    gift_data: dict[str, dict],
    gift_list: dict[str, Any],
    sections: dict[str, str] | None = None,
) -> tuple[list[dict], list[dict], list[dict], list[str]]:
    """Returns (gifts, theme_packs, fusions, warnings)."""
    sections = sections or {}
    warnings: list[str] = []

    # 1. Group "X", "X+", "X++" into one gift with levels.
    groups: dict[str, dict[int, tuple[str, dict]]] = {}
    for key, entry in gift_data.items():
        if not isinstance(entry, dict):
            warnings.append(f"EgoGift/data: entry {key!r} is not a table, skipped")
            continue
        base, level = split_level(key)
        groups.setdefault(base, {})[level] = (key, entry)

    gifts: dict[str, dict] = {}
    index = GiftIndex()
    used_ids: set[str] = set()
    for base, levels in groups.items():
        if 0 not in levels:
            warnings.append(f"gift {base!r} has upgrades but no base entry; using lowest level")
        lowest = min(levels)
        key0, e0 = levels[lowest]
        gift_id = slugify(base) or slugify(key0)
        while gift_id in used_ids:
            gift_id += "-x"
        used_ids.add(gift_id)

        tier_label = str(e0.get("tier", "")).strip()
        if tier_label and tier_label not in TIERS:
            warnings.append(f"gift {base!r}: unknown tier {tier_label!r}")
        sin = (e0.get("sin") or "").strip().lower() or None
        if sin and sin not in SINS:
            warnings.append(f"gift {base!r}: unknown sin {sin!r}")

        level_list = []
        statuses: dict[str, None] = {}
        for lvl in sorted(levels):
            _, e = levels[lvl]
            markup = e.get("desc") or ""
            for s in wikitext.status_effects(markup):
                statuses.setdefault(s, None)
            level_list.append({
                "level": lvl,
                "desc": wikitext.to_plain(markup),
                "desc_markup": markup,
            })
        declared_upgrades = e0.get("upgrade")
        max_level = max(max(levels), int(declared_upgrades or 0))

        gifts[gift_id] = {
            "id": gift_id,
            "key": key0,
            "name": e0.get("name") or base,
            "sin": sin,
            "tier": TIERS.get(tier_label),
            "tier_label": tier_label or None,
            "cost": e0.get("cost"),
            "keyword": e0.get("category") or None,
            "secondary_keyword": e0.get("status2") or None,
            "status_effects": list(statuses),
            "max_level": max_level,
            "enhanceable": max_level > 0,
            "levels": level_list,
            "image": e0.get("imgname") or base,
            "section": sections.get(key0),
            "pools": [],
            "theme_packs": [],
            "events": [],
            "other_sources": [],
            "fusion_recipe": None,
        }
        index.add(gift_id, base, key0, e0.get("name") or "")

    # 2. Where each gift comes from (EgoGiftList/data).
    packs: dict[tuple[str, str], dict] = {}
    fusions: list[dict] = []
    for table_name, entries in gift_list.items():
        if table_name == "EnchancableGifts":
            for name in _as_list(entries):
                gid = index.resolve(name) if isinstance(name, str) else None
                if gid:
                    gifts[gid]["enhanceable"] = True
                    gifts[gid]["max_level"] = max(gifts[gid]["max_level"], 1)
                else:
                    warnings.append(f"EnchancableGifts: unknown gift {name!r}")
            continue
        pool = POOLS.get(table_name)
        if pool is None:
            warnings.append(f"EgoGiftList: unknown table {table_name!r} (ignored)")
            continue
        for entry in _as_list(entries):
            if not isinstance(entry, dict) or "gift" not in entry:
                continue
            name = entry["gift"]
            gid = index.resolve(name)
            if gid is None:
                warnings.append(f"{table_name}: {name!r} has no entry in EgoGift/data")
                # Keep the theme pack itself so it still shows up in the app.
                if pool in ("themed", "extreme", "cursed"):
                    for src in wikitext.split_sources(entry.get("event") or ""):
                        if wikitext.is_fusion_header(src["text"]):
                            break  # the rest is a recipe, not a source
                        if not src["linked"]:
                            pack = _pack(packs, src["text"], pool)
                            _add_unique(pack["unknown_gifts"], name)
                continue
            g = gifts[gid]
            if pool not in g["pools"]:
                g["pools"].append(pool)
            sources = wikitext.split_sources(entry.get("event") or "")
            i = 0
            while i < len(sources):
                src = sources[i]
                if wikitext.is_fusion_header(src["text"]):
                    recipe_text = " ".join(s["text"] for s in sources[i + 1:])
                    names = wikitext.split_ingredients(recipe_text, index.names)
                    ids, unresolved = [], []
                    for n in names:
                        rid = index.resolve(n)
                        (ids.append(rid) if rid else unresolved.append(n))
                    if unresolved:
                        warnings.append(
                            f"fusion {g['name']!r}: unknown ingredient(s) {unresolved}"
                        )
                    g["fusion_recipe"] = {"ingredients": ids, "unresolved": unresolved}
                    fusions.append({
                        "result": gid,
                        "ingredients": ids,
                        "unresolved": unresolved,
                    })
                    break
                if src["linked"]:
                    _add_unique(g["events"], {"name": src["text"], "page": src["target"]})
                elif pool in ("themed", "extreme", "cursed"):
                    _add_unique(g["theme_packs"], src["text"])
                    _add_unique(_pack(packs, src["text"], pool)["gifts"], gid)
                else:
                    _add_unique(g["other_sources"], src["text"])
                i += 1

    for g in gifts.values():
        if not g["pools"]:
            g["pools"].append("unlisted")
        # EgoGift/data also holds retired versions ("X (Legacy)") and gifts from
        # Story Dungeons etc. Only gifts EgoGiftList places in a Mirror Dungeon
        # pool can actually show up in a current run.
        g["legacy"] = "(legacy" in g["key"].lower() or "(legacy)" in (g["section"] or "").lower()
        g["mirror_dungeon"] = not g["legacy"] and any(p in MD_POOLS for p in g["pools"])

    gift_list_out = sorted(gifts.values(), key=lambda g: (g["tier"] or 99, g["name"].lower()))
    pack_list = sorted(packs.values(), key=lambda p: (p["pool"], p["name"].lower()))
    return gift_list_out, pack_list, fusions, warnings


# -- identities -------------------------------------------------------------------
_SINNER_BY_FOLD = {fold(s): s for s in SINNERS}
_SINNER_BY_FOLD["ryoshu"] = "Ryōshū"


def parse_identity(title: str, categories: list[str]) -> dict:
    sinner = rarity = None
    affinities: list[str] = []
    statuses: list[str] = []
    traits: list[str] = []
    for c in categories:
        m = re.fullmatch(r"(.+?) Identities", c)
        if m and fold(m.group(1)) in _SINNER_BY_FOLD:
            sinner = _SINNER_BY_FOLD[fold(m.group(1))]
            continue
        m = re.fullmatch(r"(\d)-Star Identities", c)
        if m:
            rarity = int(m.group(1))
            continue
        # Affiliations ("traits"), e.g. "The Thumb Identities", "Heishou Pack - Mao Branch Identities"
        m = re.fullmatch(r"(.+) Identities", c)
        if m and not c.startswith("Identities") and m.group(1) not in NOT_TRAITS:
            traits.append(m.group(1))
            continue
        m = re.fullmatch(r"(\w+) Affinity", c)
        if m and m.group(1).lower() in SINS:
            affinities.append(m.group(1).lower())
            continue
        m = re.fullmatch(r"Identities with (.+)", c)
        if m:
            statuses.append(m.group(1))
    return {
        "id": slugify(title),
        "name": title,
        "sinner": sinner,
        "rarity": rarity,
        "affinities": affinities,
        "keywords": [k for k in CORE_KEYWORDS if k in statuses],
        "status_effects": statuses,
        "traits": traits,
        # Some event-only units have no rarity/affinity categories on the wiki.
        "incomplete": rarity is None or not affinities,
        "categories": categories,
    }


_ATK_PARAM = re.compile(r"\|\s*([^=|{}\n]{1,40}?)\s*=\s*(Slash|Pierce|Blunt)\s*(?=\||\n|}})", re.IGNORECASE)
_ATK_ICON = re.compile(r"\b(Slash|Pierce|Blunt)\.png|\{\{\s*(Slash|Pierce|Blunt)\s*[|}]", re.IGNORECASE)
_RESIST_NAME = re.compile(r"res|weak|fatal|ineff|endur|normal|resist", re.IGNORECASE)


def identity_attack_types(wikitext: str) -> dict[str, int]:
    """How many of an identity's skills use each attack type, from its page source.

    Tries template parameters first (``|s1type = Slash``), skipping resistance
    parameters, then falls back to Slash/Pierce/Blunt icons in the page.
    """
    counts: dict[str, int] = {}
    for name, value in _ATK_PARAM.findall(wikitext or ""):
        if _RESIST_NAME.search(name):
            continue
        counts[value.capitalize()] = counts.get(value.capitalize(), 0) + 1
    if not counts:
        for a, b in _ATK_ICON.findall(wikitext or ""):
            t = (a or b).capitalize()
            counts[t] = counts.get(t, 0) + 1
    return counts


def build_identities(page_cats: dict[str, list[str]]) -> tuple[list[dict], list[str]]:
    warnings: list[str] = []
    out = []
    for title, cats in page_cats.items():
        ident = parse_identity(title, cats)
        if ident["sinner"] is None:
            if title != "Identities":  # the overview page sits in its own category
                warnings.append(f"identity {title!r}: no sinner category, skipped")
            continue
        if ident["incomplete"]:
            warnings.append(f"identity {title!r}: missing rarity or affinity categories")
        out.append(ident)
    order = {s: i for i, s in enumerate(SINNERS)}
    out.sort(key=lambda i: (order[i["sinner"]], i["rarity"] or 0, i["name"]))
    return out, warnings


# -- traits (affiliations) in gift effects ------------------------------------------
# "<X> Identities" categories that are bookkeeping rather than affiliations.
NOT_TRAITS = {"Event Reward Identities and E.G.O", "Limbus Company"}

# A trait only counts as mentioned when a word like "Identities" follows soon
# after, e.g. '"The Thumb" Identities gain ...' or 'prioritizes Heishou - Wu Identities'.
_TRAIT_CONTEXT = re.compile(r"^[\s\"'’”)\]]*(?:[\w.’'-]+\s+){0,3}?(?:Identit|units?\b|allies\b)", re.IGNORECASE)


def trait_aliases(trait: str) -> list[str]:
    """Ways gift text refers to a trait: "Heishou Pack - Mao Branch" is also
    written "Heishou Pack - Mao" and "Heishou - Mao"."""
    out = [trait]
    m = re.fullmatch(r"(.+?) Pack - (.+?) Branch", trait)
    if m:
        out += [f"{m.group(1)} Pack - {m.group(2)}", f"{m.group(1)} - {m.group(2)}"]
    return out


def find_trait_mentions(text: str, traits: list[str]) -> list[str]:
    """Traits a gift's effect text refers to, most specific first.

    Longer names are matched first and blanked out, so "Heishou Pack - Mao
    Branch Identities" counts for the Mao Branch but not also for "Heishou Pack".
    """
    pairs = sorted(
        {(alias, t) for t in traits for alias in trait_aliases(t)},
        key=lambda p: (-len(p[0]), p[0], p[1]),  # ties by name, so runs are repeatable
    )
    found: list[str] = []
    buf = text
    for alias, trait in pairs:
        for m in re.finditer(r"(?<![\w-])" + re.escape(alias) + r"(?![\w])", buf):
            if _TRAIT_CONTEXT.match(buf[m.end():m.end() + 60]):
                if trait not in found:
                    found.append(trait)
                buf = buf[:m.start()] + " " * len(alias) + buf[m.end():]
    return found


def gift_effects(g: dict) -> dict:
    """What the gift needs/provides (see effects.py). Base level decides
    needs/applies; attack types and sins referenced at any level count."""
    levels = g.get("levels") or []
    base = effects.analyze(levels[0]["desc_markup"] if levels else "")
    attack_types, sins = list(base["attack_types"]), list(base["sins"])
    for lvl in levels[1:]:
        more = effects.analyze(lvl["desc_markup"])
        attack_types += [a for a in more["attack_types"] if a not in attack_types]
        sins += [x for x in more["sins"] if x not in sins]
    return {
        "needs": base["needs"],
        "applies": base["applies"],
        "attack_types": attack_types,
        "affinities": [x.lower() for x in sins],
        "team_gate": base["team_gate"],
    }


# -- app export -------------------------------------------------------------------
WIKI_BASE = "https://limbuscompany.wiki.gg/wiki/"
GIFT_LIST_PAGE = "List_of_E.G.O_Gifts"


def wiki_url(title: str) -> str:
    return WIKI_BASE + urllib.parse.quote(title.replace(" ", "_"), safe="()'!,:;@*$/.")


def gift_list_url(name: str) -> str:
    """Gifts have no pages of their own, so link to the gift list and let the
    browser jump to the name (a URL text fragment: #:~:text=...)."""
    frag = urllib.parse.quote(name, safe="").replace("-", "%2D")
    return f"{WIKI_BASE}{GIFT_LIST_PAGE}#:~:text={frag}"


def pack_page_candidates(name: str) -> list[str]:
    """Wiki titles a theme pack's page might have, best guess first."""
    return [f"{name} Theme Pack", name]


def export_for_app(
    gifts: list[dict],
    packs: list[dict],
    fusions: list[dict],
    identities: list[dict],
    pack_info: dict[str, dict] | None = None,
    include_unobtainable: bool = False,
) -> tuple[dict[str, list[dict]], list[str]]:
    """Slim the full build down to what the web app needs.

    Only Mirror Dungeon gifts are kept (unless include_unobtainable), long
    descriptions are left on the wiki (we keep the base effect text for
    tooltips and scoring) and every record gets a wiki link instead.

    pack_info maps a theme pack name to what its wiki page says:
    {"title", "group", "floors", "gift_pool", "unique"} (title None = no page).
    Packs found only there (no exclusive gifts) are added too. If pack_info is
    None, pack pages weren't fetched and packs only list their exclusives.
    """
    warnings: list[str] = []
    keep = {g["id"] for g in gifts if include_unobtainable or g["mirror_dungeon"]}

    # Theme pack ids: unique per (name, pool).
    pack_id: dict[tuple[str, str], str] = {}
    used: set[str] = set()
    for p in packs:
        pid = p["id"]
        if pid in used:
            pid = f"{pid}-{p['pool']}"
        used.add(pid)
        pack_id[(p["name"], p["pool"])] = pid
    pack_by_name: dict[str, list[str]] = {}
    for (name, _pool), pid in pack_id.items():
        pack_by_name.setdefault(name, []).append(pid)

    all_traits = sorted({t for i in identities if not i["incomplete"] for t in i.get("traits", [])})

    out_gifts = []
    for g in gifts:
        if g["id"] not in keep:
            continue
        recipe = g["fusion_recipe"]
        ingredients = None
        if recipe:
            ingredients = [i for i in recipe["ingredients"] if i in keep]
            if len(ingredients) != len(recipe["ingredients"]) or recipe["unresolved"]:
                warnings.append(f"fusion {g['name']!r}: some ingredients can't drop in Mirror Dungeon")
        out = {
            "id": g["id"],
            "name": wikitext.to_plain(g["name"]),
            "sin": g["sin"],
            "tier": g["tier"],
            "cost": g["cost"],
            "keyword": g["keyword"],
            "secondary_keyword": g["secondary_keyword"],
            "status_effects": g["status_effects"],
            # Affiliations the effect is built around (e.g. "The Thumb").
            "traits": find_trait_mentions(" ".join(l["desc"] for l in g["levels"]), all_traits),
            **gift_effects(g),
            "effect": g["levels"][0]["desc"] if g["levels"] else "",
            "max_level": g["max_level"],
            "pools": [p for p in g["pools"] if p in MD_POOLS] or g["pools"],
            "theme_packs": [pid for n in g["theme_packs"] for pid in pack_by_name.get(n, [])],
            "events": [
                {"name": e["name"], "wiki_url": wiki_url(e["page"]) if e.get("page") else None}
                for e in g["events"]
            ],
            "fusion_recipe": ingredients,
            "wiki_url": gift_list_url(g["name"]),
        }
        if include_unobtainable:
            out["mirror_dungeon"] = g["mirror_dungeon"]
            out["legacy"] = g["legacy"]
        out_gifts.append(out)

    info_by_fold = {fold(n): (n, i) for n, i in (pack_info or {}).items()}
    used_info: set[str] = set()
    out_packs = []

    def pack_record(pid, name, pool, exclusives, info):
        pool_ids = [gid for gid in (info or {}).get("gift_pool", []) if gid in keep]
        for gid in exclusives:
            if gid not in pool_ids:
                pool_ids.append(gid)
        title = (info or {}).get("title")
        return {
            "id": pid,
            "name": name,
            "pool": pool,
            "group": (info or {}).get("group"),
            "floors": (info or {}).get("floors"),
            "gifts": exclusives,        # exclusive to this pack
            "gift_pool": pool_ids,      # everything it can give, exclusives included
            "wiki_url": wiki_url(title) if title else None,
        }

    for p in packs:
        members = [gid for gid in p["gifts"] if gid in keep]
        if not members and not include_unobtainable:
            continue
        key = fold(p["name"])
        info = info_by_fold[key][1] if key in info_by_fold else None
        if info is not None:
            used_info.add(key)
        if pack_info is not None and not (info and info.get("title")):
            warnings.append(f"theme pack {p['name']!r}: no wiki page found")
        out_packs.append(pack_record(pack_id[(p["name"], p["pool"])], p["name"], p["pool"], members, info))

    # Packs with no exclusive gifts only show up on the wiki's list of floor themes.
    for key, (name, info) in sorted(info_by_fold.items()):
        if key in used_info:
            continue
        pool = "extreme" if "EXTREME" in (info.get("group") or "").upper() else "themed"
        rec = pack_record(slugify(name), name, pool, [g for g in info.get("unique", []) if g in keep], info)
        while rec["id"] in used:
            rec["id"] += "-x"
        used.add(rec["id"])
        if rec["gift_pool"]:
            out_packs.append(rec)
    out_packs.sort(key=lambda p: (p["pool"] != "themed", p["name"].lower()))

    out_fusions = [
        {"result": f["result"], "ingredients": f["ingredients"]}
        for f in fusions
        if f["result"] in keep and all(i in keep for i in f["ingredients"]) and not f["unresolved"]
    ]

    out_ids = [
        {
            "id": i["id"],
            "name": i["name"],
            "sinner": i["sinner"],
            "rarity": i["rarity"],
            "affinities": i["affinities"],
            "keywords": i["keywords"],
            "status_effects": i["status_effects"],
            "traits": i["traits"],
            "attack_types": i.get("attack_types", []),
            # Skills per attack type (all skills on the page, defense included);
            # for gifts like "If this unit has 2+ Pierce Attack Skills".
            "attack_counts": i.get("attack_counts", {}),
            "wiki_url": wiki_url(i["name"]),
        }
        for i in identities
        if not i["incomplete"]  # event-only units can't be taken into Mirror Dungeon
    ]
    return {
        "gifts": out_gifts,
        "theme_packs": out_packs,
        "fusions": out_fusions,
        "identities": out_ids,
    }, warnings


# -- utils -----------------------------------------------------------------------
def _pack(packs: dict, name: str, pool: str) -> dict:
    return packs.setdefault((name, pool), {
        "id": slugify(name),
        "name": name,
        "pool": pool,
        "gifts": [],
        "unknown_gifts": [],
    })


def _as_list(v: Any) -> list:
    if isinstance(v, list):
        return v
    if isinstance(v, dict):
        # a Lua table with mixed keys; keep numeric keys in order
        return [v[k] for k in sorted(k for k in v if isinstance(k, int))]
    return []


def _add_unique(lst: list, item: Any) -> None:
    if item not in lst:
        lst.append(item)
