"""Scrape the Limbus Company wiki into JSON datasets.

    python -m scraper                 # fetch live data -> data/
    python -m scraper --offline       # rebuild from cached responses only
    python -m scraper --skip-identities
    python -m scraper --include-unobtainable   # keep non-Mirror-Dungeon gifts too
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from . import build, packs as packmod
from .lua_table import LuaParseError, parse_module
from .wiki_api import DEFAULT_API, WikiClient, WikiError

GIFT_DATA = "Module:EgoGift/data"
GIFT_LIST = "Module:EgoGiftList/data"
IDENTITY_CATEGORY = "Category:Identities"
FLOOR_THEMES = "List of Floor Themes"
# Theme pack pages rarely change; reuse ones fetched in the last day, so a run
# that fails partway can simply be started again.
PACK_CACHE_AGE = 24 * 3600


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m scraper", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=Path("data"), help="output folder (default: data)")
    ap.add_argument("--offline", action="store_true", help="use cached API responses only")
    ap.add_argument("--skip-identities", action="store_true", help="only scrape E.G.O gifts")
    ap.add_argument("--include-unobtainable", action="store_true",
                    help="also keep Story Dungeon and Legacy gifts (default: Mirror Dungeon only)")
    ap.add_argument("--skip-packs", action="store_true",
                    help="don't fetch theme pack pages (gift pools, floors)")
    ap.add_argument("--api", default=DEFAULT_API, help="MediaWiki api.php URL")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between requests (default 1)")
    args = ap.parse_args(argv)

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    client = WikiClient(args.api, cache_dir=out / "raw", offline=args.offline,
                        min_interval=args.delay)
    started = time.monotonic()
    warnings: list[str] = []

    # -- gifts --------------------------------------------------------------
    print(f"Fetching {GIFT_DATA} and {GIFT_LIST} ...")
    try:
        pages = client.page_sources([GIFT_DATA, GIFT_LIST])
    except WikiError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    for title in (GIFT_DATA, GIFT_LIST):
        if pages.get(title, {}).get("missing", title not in pages):
            print(f"error: wiki page {title} not found (was it renamed?)", file=sys.stderr)
            return 1
    try:
        gift_data = parse_module(pages[GIFT_DATA]["content"])
        gift_list = parse_module(pages[GIFT_LIST]["content"])
    except LuaParseError as e:
        print(f"error: could not parse a wiki data module: {e}", file=sys.stderr)
        return 1
    if not isinstance(gift_data, dict) or not isinstance(gift_list, dict):
        print("error: data modules did not return tables of the expected shape", file=sys.stderr)
        return 1

    sections = build.section_comments(pages[GIFT_DATA]["content"])
    gifts, packs, fusions, w = build.build_gifts(gift_data, gift_list, sections)
    warnings += w

    # -- identities ------------------------------------------------------------
    identities: list[dict] = []
    if not args.skip_identities:
        print(f"Fetching {IDENTITY_CATEGORY} and each identity's categories ...")
        try:
            titles = client.category_members(IDENTITY_CATEGORY)
            cats = client.page_categories(titles)
        except WikiError as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
        identities, w = build.build_identities(cats)
        warnings += w
        # Attack types (Slash/Pierce/Blunt) are only on each identity's own page.
        print(f"Fetching {len(identities)} identity pages (50 per request) ...")
        try:
            sources = client.page_sources([i["name"] for i in identities])
            for i in identities:
                counts = build.identity_attack_types(sources.get(i["name"], {}).get("content", ""))
                i["attack_types"] = sorted(counts, key=lambda t: -counts[t])
            missing = [i["name"] for i in identities if not i["attack_types"] and not i["incomplete"]]
            if missing:
                warnings.append(f"no attack types found for {len(missing)} identities, e.g. {missing[:5]}")
        except WikiError as e:
            warnings.append(f"identity pages not fetched, so no attack types ({_why(e, client)})")

    # -- theme pack pages -------------------------------------------------------
    pack_info, w = fetch_pack_info(client, gifts, packs, skip=args.skip_packs)
    warnings += w

    # -- write -------------------------------------------------------------------
    data, w = build.export_for_app(
        gifts, packs, fusions, identities, pack_info,
        include_unobtainable=args.include_unobtainable,
    )
    warnings += w
    for name, rows in data.items():
        if name == "identities" and args.skip_identities:
            continue
        _write(out / f"{name}.json", rows)
    print(f"  {len(data['gifts'])} gifts"
          f"{'' if args.include_unobtainable else ' (Mirror Dungeon only)'}, "
          f"{len(data['theme_packs'])} theme packs, {len(data['fusions'])} fusion recipes, "
          f"{len(data['identities'])} identities")

    # -- meta + report ---------------------------------------------------------------
    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": args.api,
        "offline": args.offline,
        "pages": {t: {k: v for k, v in p.items() if k != "content"} for t, p in pages.items()},
        "include_unobtainable": args.include_unobtainable,
        "counts": {name: len(rows) for name, rows in data.items()},
        "warnings": len(warnings),
    }
    _write(out / "meta.json", meta)
    (out / "report.txt").write_text("\n".join(warnings) + "\n", encoding="utf-8")
    print(f"Done in {time.monotonic() - started:.1f}s "
          f"({client.requests_made} requests). {len(warnings)} warnings -> {out / 'report.txt'}")
    return 0


def fetch_pack_info(client: WikiClient, gifts: list[dict], packs: list[dict], skip: bool):
    """Theme pack name -> {title, group, floors, gift_pool, unique}; None if not fetched."""
    if skip:
        return None, []
    warnings: list[str] = []
    print(f"Fetching {FLOOR_THEMES} ...")
    try:
        listed = packmod.parse_floor_theme_list(_parse_html(client, FLOOR_THEMES))
    except WikiError as e:
        warnings.append(f"{FLOOR_THEMES}: {_why(e, client)}; only packs with exclusive gifts are included")
        listed = []
    if not listed and client.offline is False:
        warnings.append(f"{FLOOR_THEMES}: no theme pack links found")
    titles = {packmod.pack_name(t): (t, group) for t, group in listed}
    # The gift list and the pack list don't always agree on capitalisation
    # ("LCB Regular Check-Up" vs "Check-up"); use the gift list's spelling.
    by_fold = {build.fold(n): n for n in titles}
    for p in packs:
        listed_name = by_fold.get(build.fold(p["name"]))
        if listed_name and listed_name != p["name"]:
            titles[p["name"]] = titles.pop(listed_name)
            by_fold[build.fold(p["name"])] = p["name"]

    # Packs from the gift list that the floor-theme list didn't link to.
    missing = [p["name"] for p in packs if p["name"] not in titles]
    if missing:
        try:
            found = client.existing_titles([t for n in missing for t in build.pack_page_candidates(n)])
            for n in missing:
                page = next((found[t] for t in build.pack_page_candidates(n) if found.get(t)), None)
                titles[n] = (page, None)
        except WikiError as e:
            warnings.append(f"theme pack pages not checked ({_why(e, client)})")
            if not listed:
                return None, warnings

    # Match against every current gift, not only the ones the gift list places in
    # Mirror Dungeon: a pack page listing a gift is proof it can drop there.
    current = sorted((g for g in gifts if not g["legacy"]), key=lambda g: not g["mirror_dungeon"])
    by_id = {g["id"]: g for g in current}
    names = {}
    for g in current:
        names.setdefault(build.wikitext.to_plain(g["name"]), g["id"])
    for g in current:  # icons may use the data key ("Ebony Brooch (MD)") or the image name
        for alt in (g["key"], g.get("image")):
            if alt:
                names.setdefault(alt, g["id"])
    finder = packmod.NameFinder(names)
    unresolved: set[str] = set()
    with_pages = [(n, t, grp) for n, (t, grp) in titles.items() if t]
    print(f"Fetching {len(with_pages)} theme pack pages ...")
    info: dict[str, dict] = {}
    for i, (name, title, group) in enumerate(sorted(with_pages), 1):
        entry: dict = {"title": title, "group": group, "floors": None, "gift_pool": [], "unique": []}
        try:
            page = packmod.parse_pack_page(title, _parse_html(client, title, PACK_CACHE_AGE), finder)
            entry.update(floors=page.floors, gift_pool=page.gift_pool, unique=page.unique)
            warnings += page.warnings
            unresolved.update(page.unresolved)
        except WikiError as e:
            warnings.append(f"{title}: {_why(e, client)}")
            if "missingtitle" in str(e):
                entry["title"] = None  # linked from the list, but the page doesn't exist
        info[name] = entry
        if i % 20 == 0:
            print(f"  {i}/{len(with_pages)}")
    if unresolved:
        warnings.append(f"gifts in theme pack pools with no entry in {GIFT_DATA}: {sorted(unresolved)}")
    promoted = sorted({by_id[gid]["name"] for e in info.values() for gid in e["gift_pool"]
                       if not by_id[gid]["mirror_dungeon"]})
    for e in info.values():
        for gid in e["gift_pool"]:
            g = by_id[gid]
            if not g["mirror_dungeon"]:
                g["mirror_dungeon"] = True
                g["pools"] = [p for p in g["pools"] if p != "unlisted"] + ["themed"]
    if promoted:
        warnings.append(f"added {len(promoted)} gifts that only pack pages list as Mirror Dungeon drops: {promoted}")
    for name, (title, group) in titles.items():
        if not title:
            info.setdefault(name, {"title": None, "group": group, "floors": None, "gift_pool": [], "unique": []})
    return info, warnings


def _parse_html(client: WikiClient, title: str, max_age: float | None = None) -> str:
    data = client.get(max_age=max_age, action="parse", page=title, prop="text", redirects=1,
                      disableeditsection=1, disablelimitreport=1)
    text = data.get("parse", {}).get("text", "")
    return text["*"] if isinstance(text, dict) else text


def _why(e: WikiError, client: WikiClient) -> str:
    return "not cached; run once without --offline" if client.offline else str(e)


def _write(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
