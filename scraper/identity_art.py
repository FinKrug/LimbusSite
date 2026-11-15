"""Identity card-art atlas for the web app's identity screenshot import (web/src/lib/idscreenshot.ts).

    python -m scraper.identity_art             # fetch card art from the wiki, then build the atlas
    python -m scraper.identity_art --offline   # build from art already in data/raw-identity-art/

Needs Pillow (pip install pillow), like scraper.icons.

The game's identity list (Sinners > Identities) shows each identity as a card: the wiki's
card art ("<Name>.png", or "<Name> Uptied.png" at Uptie III and up) with a frame, the
rarity, the affiliation emblem, the level and the name drawn on top. The matcher compares
the upper part of the art (REGION, clear of the name and the "SELECTED" banner), so each
reference is that part of the art, shrunk to GX x GY, packed into
web/src/data/identity_art.png; the order is in web/src/data/identity_art.json.
Base and Uptie III art are both kept, since a card shows whichever its uptie level has.
Fitted on Finley's screenshots (2026-11-15): every readable card matched, at 2560, 1920 and 1280 px.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from .icons import fetch_icons, safe_name
from .wiki_api import DEFAULT_API, WikiClient, WikiError
from .pngsave import save_png_if_changed

GX, GY = 24, 16             # reference size
REGION = (0.07, 0.10, 0.93, 0.46)  # x0, y0, x1, y1 as a share of the card
COLS = 24
ART_WIDTH = 200             # card art width fetched from the wiki (source is 537)
OUT_PNG = Path("web/src/data/identity_art.png")
OUT_JSON = Path("web/src/data/identity_art.json")


def wiki_file(name: str) -> str:
    """The wiki drops ':', '【' and '】' from file names (web/src/lib/images.ts wikiFileName)."""
    return re.sub(r"\s+", " ", re.sub(r"[:【】]+", " ", name)).strip()


def art_files(identity: dict) -> list[tuple[str, str]]:
    """(variant, file) for an identity's card art; base LCB Sinners have no Uptie III art."""
    base = wiki_file(identity["name"])
    out = [("base", f"{base}.png")]
    if identity.get("rarity") != 1:
        out.append(("uptie", f"{base} Uptied.png"))
    return out


def reference(path: Path):
    """The art's REGION as the matcher samples it from a card: GX x GY RGB, area-averaged."""
    from PIL import Image

    im = Image.open(path).convert("RGB")
    w, h = im.size
    box = (round(REGION[0] * w), round(REGION[1] * h), round(REGION[2] * w), round(REGION[3] * h))
    return im.crop(box).resize((GX, GY), Image.BOX)


def build_atlas(identities: list[dict], art_dir: Path, out_png: Path, out_json: Path) -> list[str]:
    from PIL import Image

    warnings: list[str] = []
    rows = []
    for i in identities:
        for variant, file in art_files(i):
            path = art_dir / safe_name(file)
            if path.exists():
                rows.append((i["id"], variant, reference(path)))
            elif variant == "base":
                warnings.append(f"no card art downloaded for {i['name']} ({file})")
    atlas = Image.new("RGB", (COLS * GX, ((len(rows) + COLS - 1) // COLS) * GY))
    for k, (_, _, im) in enumerate(rows):
        atlas.paste(im, ((k % COLS) * GX, (k // COLS) * GY))
    out_png.parent.mkdir(parents=True, exist_ok=True)
    save_png_if_changed(atlas, out_png)
    meta = {"gx": GX, "gy": GY, "cols": COLS, "region": list(REGION),
            "refs": [[iid, variant] for iid, variant, _ in rows]}
    out_json.write_text(json.dumps(meta, ensure_ascii=False) + "\n", encoding="utf-8")
    return warnings


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m scraper.identity_art", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=Path("data"), help="scraper output folder (default: data)")
    ap.add_argument("--offline", action="store_true", help="use card art already downloaded")
    ap.add_argument("--api", default=DEFAULT_API)
    args = ap.parse_args(argv)
    try:
        import PIL  # noqa: F401
    except ImportError:
        print("This step needs Pillow: pip install pillow", file=sys.stderr)
        return 1
    identities = json.loads((args.data / "identities.json").read_text(encoding="utf-8"))
    art_dir = args.data / "raw-identity-art"
    warnings: list[str] = []
    if not args.offline:
        client = WikiClient(args.api, cache_dir=args.data / "raw")
        files = sorted({f for i in identities for _, f in art_files(i)})
        try:
            # Missing Uptie III art is normal (identities without one); only base art is checked below.
            fetch_icons(client, files, art_dir, client.user_agent, width=ART_WIDTH)
        except WikiError as e:
            warnings.append(f"card art not fetched: {e}")
    warnings += build_atlas(identities, art_dir, OUT_PNG, OUT_JSON)
    print(f"Wrote {OUT_PNG} and {OUT_JSON}")
    for w in warnings:
        print("  warning:", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
