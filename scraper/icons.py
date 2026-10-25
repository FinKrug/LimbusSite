"""Gift icon atlas for the web app's screenshot import (web/src/lib/screenshot.ts).

    python -m scraper.icons             # fetch icons from the wiki, then build the atlas
    python -m scraper.icons --offline   # build from icons already in data/raw-icons/

Needs Pillow (pip install pillow), unlike the rest of the scraper.

The import tab finds each gift tile in a screenshot and compares the art inside it with
every gift's icon. Browsers can't read pixels of images hot-linked from the wiki, so the
references ship with the app: one small picture per gift (ATLAS_N px square), drawn the
way the art sits inside an in-game tile (on the tile's dark background, slightly
enlarged and shifted, see ART_*), packed into web/src/data/gift_icons.png. Its order and
settings are in web/src/data/gift_icons.json. Rebuild after a patch adds gifts.

The settings were fitted on real screenshots (Enhance, Fuse and E.G.O Gifts screens,
2026-10-22): every tile in them matched, also at 1920, 1280 and 960 px wide as JPEG.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from .wiki_api import DEFAULT_API, WikiClient, WikiError

ATLAS_N = 24          # reference size; 16 mixes up the Pocket Watch types
ATLAS_COLS = 24
ART_SCALE = 1.15      # icon size as a share of the compared region
ART_DX = -0.09        # icon offset (share of the region), up and left
ART_DY = -0.09
TILE_BG = (38, 34, 32)  # the tile's dark background behind the art
THUMB = 128           # icon size fetched from the wiki

OUT_PNG = Path("web/src/data/gift_icons.png")
OUT_JSON = Path("web/src/data/gift_icons.json")


def fetch_icons(client: WikiClient, files: list[str], icon_dir: Path, user_agent: str) -> list[str]:
    """Download each icon's thumbnail into icon_dir (skipping ones already there)."""
    icon_dir.mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []
    missing = [f for f in files if not (icon_dir / safe_name(f)).exists()]
    for i in range(0, len(missing), 50):
        chunk = missing[i:i + 50]
        data = client.get(action="query", prop="imageinfo", iiprop="url", iiurlwidth=THUMB,
                          titles="|".join(f"File:{f}" for f in chunk))
        q = data.get("query", {})
        back = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for p in q.get("pages", []):
            info = (p.get("imageinfo") or [None])[0]
            name = back.get(p["title"], p["title"]).removeprefix("File:")
            if not info:
                warnings.append(f"no icon file on the wiki: {name}")
                continue
            url = info.get("thumburl") or info["url"]
            req = urllib.request.Request(url, headers={"User-Agent": user_agent})
            for attempt in range(3):
                try:
                    with urllib.request.urlopen(req, timeout=60) as r:
                        (icon_dir / safe_name(name)).write_bytes(r.read())
                    break
                except OSError as e:
                    if attempt == 2:
                        warnings.append(f"{name}: {e}")
                    time.sleep(2 ** (attempt + 1))
            time.sleep(0.25)
    return warnings


def safe_name(file: str) -> str:
    return file.replace("/", "_")


def reference(icon_path: Path):
    """The icon as the matcher expects to see it inside a tile: ATLAS_N x ATLAS_N RGB."""
    from PIL import Image

    n = ATLAS_N
    size = max(1, round(ART_SCALE * n))
    canvas = Image.new("RGBA", (n, n), TILE_BG + (255,))
    icon = Image.open(icon_path).convert("RGBA").resize((size, size), Image.BILINEAR)
    canvas.alpha_composite(icon, (round((n - size) / 2 + ART_DX * n), round((n - size) / 2 + ART_DY * n)))
    return canvas.convert("RGB")


def build_atlas(gifts: list[dict], icon_dir: Path, out_png: Path, out_json: Path) -> list[str]:
    from PIL import Image

    warnings: list[str] = []
    rows = []
    for g in gifts:
        path = icon_dir / safe_name(g["icon"])
        if not path.exists():
            warnings.append(f"no icon downloaded for {g['name']} ({g['icon']})")
            continue
        rows.append((g, reference(path)))
    n, cols = ATLAS_N, ATLAS_COLS
    atlas = Image.new("RGB", (cols * n, ((len(rows) + cols - 1) // cols) * n))
    for k, (_, im) in enumerate(rows):
        atlas.paste(im, ((k % cols) * n, (k // cols) * n))
    out_png.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(out_png, optimize=True)
    meta = {"n": n, "cols": cols, "ids": [g["id"] for g, _ in rows]}
    out_json.write_text(json.dumps(meta, ensure_ascii=False) + "\n", encoding="utf-8")
    return warnings


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m scraper.icons", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=Path("data"), help="scraper output folder (default: data)")
    ap.add_argument("--offline", action="store_true", help="use icons already downloaded")
    ap.add_argument("--api", default=DEFAULT_API)
    args = ap.parse_args(argv)
    try:
        import PIL  # noqa: F401
    except ImportError:
        print("This step needs Pillow: pip install pillow", file=sys.stderr)
        return 1
    gifts = json.loads((args.data / "gifts.json").read_text(encoding="utf-8"))
    icon_dir = args.data / "raw-icons"
    warnings: list[str] = []
    if not args.offline:
        client = WikiClient(args.api, cache_dir=args.data / "raw")
        try:
            warnings += fetch_icons(client, sorted({g["icon"] for g in gifts}), icon_dir, client.user_agent)
        except WikiError as e:
            warnings.append(f"icons not fetched: {e}")
    warnings += build_atlas(gifts, icon_dir, OUT_PNG, OUT_JSON)
    print(f"Wrote {OUT_PNG} and {OUT_JSON}")
    for w in warnings:
        print("  warning:", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
