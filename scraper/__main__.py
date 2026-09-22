"""Scrape the Limbus Company wiki into JSON datasets.

    python -m scraper                 # fetch live data -> data/
    python -m scraper --offline       # rebuild from cached responses only
    python -m scraper --skip-identities
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from . import build
from .lua_table import LuaParseError, parse_module
from .wiki_api import DEFAULT_API, WikiClient, WikiError

GIFT_DATA = "Module:EgoGift/data"
GIFT_LIST = "Module:EgoGiftList/data"
IDENTITY_CATEGORY = "Category:Identities"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m scraper", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=Path("data"), help="output folder (default: data)")
    ap.add_argument("--offline", action="store_true", help="use cached API responses only")
    ap.add_argument("--skip-identities", action="store_true", help="only scrape E.G.O gifts")
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
    _write(out / "gifts.json", gifts)
    _write(out / "theme_packs.json", packs)
    _write(out / "fusions.json", fusions)
    md = sum(g["mirror_dungeon"] for g in gifts)
    print(f"  {len(gifts)} gifts ({md} obtainable in Mirror Dungeon), "
          f"{len(packs)} theme packs, {len(fusions)} fusion recipes")

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
        _write(out / "identities.json", identities)
        print(f"  {len(identities)} identities")

    # -- meta + report ---------------------------------------------------------------
    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": args.api,
        "offline": args.offline,
        "pages": {t: {k: v for k, v in p.items() if k != "content"} for t, p in pages.items()},
        "counts": {
            "gifts": len(gifts),
            "mirror_dungeon_gifts": sum(g["mirror_dungeon"] for g in gifts),
            "theme_packs": len(packs),
            "fusions": len(fusions), "identities": len(identities),
        },
        "warnings": len(warnings),
    }
    _write(out / "meta.json", meta)
    (out / "report.txt").write_text("\n".join(warnings) + "\n", encoding="utf-8")
    print(f"Done in {time.monotonic() - started:.1f}s "
          f"({client.requests_made} requests). {len(warnings)} warnings -> {out / 'report.txt'}")
    return 0


def _write(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
