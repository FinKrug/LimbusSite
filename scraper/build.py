"""Turn parsed wiki data into the app's JSON datasets.

Pure functions only (no network), so they can be unit tested with fixtures.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from . import wikitext

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
                    _add_unique(g["events"], src["text"])
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
    for c in categories:
        m = re.fullmatch(r"(.+?) Identities", c)
        if m and fold(m.group(1)) in _SINNER_BY_FOLD:
            sinner = _SINNER_BY_FOLD[fold(m.group(1))]
            continue
        m = re.fullmatch(r"(\d)-Star Identities", c)
        if m:
            rarity = int(m.group(1))
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
        # Some event-only units have no rarity/affinity categories on the wiki.
        "incomplete": rarity is None or not affinities,
        "categories": categories,
    }


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
