"""E.G.O art atlas for the web app's My E.G.O tab and E.G.O screenshot import (web/src/lib/egoscreenshot.ts).

    python -m scraper.ego_art             # fetch the round E.G.O art from the wiki, then build the atlas
    python -m scraper.ego_art --offline   # build from art already in data/raw-ego-art/

Needs Pillow (pip install pillow), like scraper.icons.

The game's E.G.O list (Sinners > E.G.O) shows each E.G.O as its round art ("<Name> <Sinner>.png"
on the wiki) inside an orange ring, with the sinner's emblem on top, a grade label and name plate
over the bottom, and a "SELECTED" banner across the middle when it's equipped. The art fills the
ring at the same size, shifted right by PLACE dx. The matcher compares REGION (in units of the
ring radius, around its centre) with the emblem, banner and plate masked, in grey (equipped
E.G.O are tinted yellow). Each reference is that region of the art placed the same way, shrunk to
G x G RGB, packed into web/src/data/ego_art.png; ids and wiki file names in ego_art.json (the tab
also uses the file names to show the art).
Fitted on Finley's screenshots (2026-11-15): all 30 readable cards matched at 2560, 1920, 1280, 960 px.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from .icons import fetch_icons, safe_name
from .wiki_api import DEFAULT_API, WikiClient, WikiError

G = 24
REGION = (-0.7, -0.85, 0.7, 0.55)   # x0, y0, x1, y1 in ring radii around the ring centre
PLACE = (1.0, 0.05, 0.0)            # art radius, centre dx, dy (ring radii)
COLS = 24
ART_WIDTH = 256
OUT_PNG = Path("web/src/data/ego_art.png")
OUT_JSON = Path("web/src/data/ego_art.json")


def candidates(ego: dict) -> list[str]:
    """Wiki file names the round art may have. The wiki drops ':' from most file names
    ("Command : Meltdown" -> "Command Meltdown") but writes '9:2' as '9-2'."""
    full = f"{ego['name']} {ego['sinner']}"
    out = []
    for name in (re.sub(r"[:【】]+", " ", full), full.replace(" : ", " - ").replace(":", "-"), full):
        f = re.sub(r"\s+", " ", name).strip() + ".png"
        if f not in out:
            out.append(f)
    return out


def reference(path: Path):
    """The art placed in a ring of radius R as in game, cut to REGION, G x G RGB (area average)."""
    from PIL import Image

    r = 100.0
    size = int(2.6 * r)
    canvas = Image.new("RGB", (size, size), (0, 0, 0))
    art = Image.open(path).convert("RGBA")
    flat = Image.new("RGBA", art.size, (0, 0, 0, 255))
    flat.alpha_composite(art)
    k, dx, dy = PLACE
    d = int(round(2 * k * r))
    c = size / 2
    canvas.paste(flat.convert("RGB").resize((d, d), Image.BILINEAR), (int(round(c + dx * r - d / 2)), int(round(c + dy * r - d / 2))))
    box = tuple(int(round(v)) for v in (c + REGION[0] * r, c + REGION[1] * r, c + REGION[2] * r, c + REGION[3] * r))
    return canvas.crop(box).resize((G, G), Image.BOX)


def resolve_redirects(client: WikiClient, files: list[str]) -> dict[str, str]:
    """Some art files are wiki redirects ("Ryōshū" -> "Ryoshu"); browsers can't follow those for
    thumbnails, so the tab links the target. Returns file -> target for the ones that redirect."""
    out: dict[str, str] = {}
    for i in range(0, len(files), 50):
        chunk = files[i:i + 50]
        q = client.get(action="query", redirects=1, titles="|".join(f"File:{f}" for f in chunk)).get("query", {})
        back = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for r in q.get("redirects", []):
            src = back.get(r["from"], r["from"]).removeprefix("File:")
            out[src] = r["to"].removeprefix("File:")
    return out


def build_atlas(egos: list[dict], art_dir: Path, out_png: Path, out_json: Path,
                redirects: dict[str, str] | None = None) -> list[str]:
    from PIL import Image

    warnings: list[str] = []
    rows = []
    for e in egos:
        file = next((f for f in candidates(e) if (art_dir / safe_name(f)).exists()), None)
        if file is None:
            warnings.append(f"no art downloaded for {e['name']} ({e['sinner']})")
            continue
        rows.append((e["id"], file, reference(art_dir / safe_name(file))))
    atlas = Image.new("RGB", (COLS * G, max(1, (len(rows) + COLS - 1) // COLS) * G))
    for k, (_, _, im) in enumerate(rows):
        atlas.paste(im, ((k % COLS) * G, (k // COLS) * G))
    out_png.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(out_png, optimize=True)
    meta = {"g": G, "cols": COLS, "region": list(REGION), "place": list(PLACE),
            "refs": [[eid, (redirects or {}).get(file, file)] for eid, file, _ in rows]}
    out_json.write_text(json.dumps(meta, ensure_ascii=False) + "\n", encoding="utf-8")
    return warnings


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m scraper.ego_art", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=Path("data"), help="scraper output folder (default: data)")
    ap.add_argument("--offline", action="store_true", help="use art already downloaded")
    ap.add_argument("--api", default=DEFAULT_API)
    args = ap.parse_args(argv)
    try:
        import PIL  # noqa: F401
    except ImportError:
        print("This step needs Pillow: pip install pillow", file=sys.stderr)
        return 1
    egos = json.loads((args.data / "egos.json").read_text(encoding="utf-8"))
    art_dir = args.data / "raw-ego-art"
    warnings: list[str] = []
    if not args.offline:
        client = WikiClient(args.api, cache_dir=args.data / "raw")
        files = sorted({f for e in egos for f in candidates(e)})
        try:
            # Most candidates don't exist (only one spelling does); only E.G.O left without art are reported below.
            fetch_icons(client, files, art_dir, client.user_agent, width=ART_WIDTH)
        except WikiError as e:
            warnings.append(f"E.G.O art not fetched: {e}")
    found = [f for e in egos for f in candidates(e) if (art_dir / safe_name(f)).exists()]
    try:
        # Uses the response cache in data/raw, so --offline works once this has run online.
        redirects = resolve_redirects(WikiClient(args.api, cache_dir=args.data / "raw", offline=args.offline), sorted(set(found)))
    except WikiError as e:
        redirects = {}
        warnings.append(f"redirects not checked: {e}")
    warnings += build_atlas(egos, art_dir, OUT_PNG, OUT_JSON, redirects)
    print(f"Wrote {OUT_PNG} and {OUT_JSON}")
    for w in warnings:
        print("  warning:", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
