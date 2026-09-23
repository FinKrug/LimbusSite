# LimbusSite

A Mirror Dungeon helper for Limbus Company: pick your team and the E.G.O gifts you
already have, and it recommends which gifts to take, which theme packs to enter or
skip, and what to fuse.

## Roadmap

1. **Data scraper** (`scraper/`): pulls gift, theme-pack, fusion and identity data
   from the [Limbus Company Wiki](https://limbuscompany.wiki.gg) into `data/`.
2. **Web app** (`web/`): team picker, owned-gift tracker, and rankings for gifts, theme
   packs and fusions. See [web/README.md](web/README.md).
3. **Desktop overlay**: the same logic in an always-on-top window, optionally reading the screen.

## Quick start

```
python -m scraper          # refresh data/ from the wiki (after a patch)
cd web
npm install                # first time only
npm run dev                # open http://localhost:5173
```

## Running the scraper

Needs Python 3.10+ and no extra packages.

```
python -m scraper                  # fetch from the wiki -> data/
python -m scraper --offline        # rebuild from cached responses (no network)
python -m scraper --skip-identities
python -m unittest discover -s tests -t .
```

Re-run it after each game patch, once the wiki has caught up.

## Where the data comes from

| Output | Wiki source |
|---|---|
| `data/gifts.json` | [Module:EgoGift/data](https://limbuscompany.wiki.gg/wiki/Module:EgoGift/data) for each gift's sin, tier, cost, keyword and effect, plus [Module:EgoGiftList/data](https://limbuscompany.wiki.gg/wiki/Module:EgoGiftList/data) for where it drops |
| `data/theme_packs.json` | [List of Floor Themes](https://limbuscompany.wiki.gg/wiki/List_of_Floor_Themes) and each "<Name> Theme Pack" page (floors, full gift pool), plus exclusives from Module:EgoGiftList/data |
| `data/fusions.json` | Module:EgoGiftList/data (fusion recipes) |
| `data/identities.json` | Pages in [Category:Identities](https://limbuscompany.wiki.gg/wiki/Category:Identities) and their categories |
| `data/meta.json` | Timestamp, wiki revision IDs and counts for this run |
| `data/report.txt` | Warnings: names that didn't match, theme packs with no wiki page, etc. |

`data/raw/` caches every API response so `--offline` works. It's git-ignored.

Only gifts that can drop in a current Mirror Dungeon run are written. Story Dungeon gifts
and retired "(Legacy)" versions are skipped (pass `--include-unobtainable` to keep them).
Full details stay on the wiki: every record has a `wiki_url`, and only the base effect
text is stored, for tooltips and scoring.

### Records

```jsonc
// gifts.json
{
  "id": "hellterfly-s-dream",
  "name": "Hellterfly's Dream",
  "sin": "wrath",               // wrath | lust | sloth | gluttony | gloom | pride | envy
  "tier": 2,                    // 1-5 (6 = EX)
  "cost": 198,
  "keyword": "Burn",            // Burn, Bleed, Tremor, Rupture, Sinking, Poise, Charge, Slash, Pierce, Blunt, or null
  "secondary_keyword": null,
  "status_effects": ["Burn"],   // every status the effect text mentions
  "traits": [],                 // affiliations the effect is built for, e.g. ["The Thumb"]
  "effect": "When applying Burn Potency ...",
  "max_level": 2,               // number of upgrades (+, ++)
  "pools": ["main"],            // main | themed | extreme | cursed | fusion
  "theme_packs": [],            // ids of packs this gift is exclusive to
  "events": [{ "name": "Ardor Blossom Moth", "wiki_url": "..." }],
  "fusion_recipe": null,        // or [ingredient gift ids]
  "wiki_url": "https://limbuscompany.wiki.gg/wiki/List_of_E.G.O_Gifts#:~:text=Hellterfly%27s%20Dream"
}
// theme_packs.json
{ "id": "the-outcast", "name": "The Outcast", "pool": "themed", "group": "Canto Themes",
  "floors": { "normal": [1, 1], "hard": [1, 1] },   // null = not offered / unknown
  "gifts": ["ebony-brooch-md", ...],                 // exclusive to this pack
  "gift_pool": ["hellterfly-s-dream", ...],          // everything it can give
  "wiki_url": "..." }
// fusions.json
{ "result": "soothe-the-dead", "ingredients": ["ashes-to-ashes", "dust-to-dust", "secret-cookbook"] }
// identities.json
{ "id": "lcb-sinner-yi-sang", "name": "LCB Sinner Yi Sang", "sinner": "Yi Sang", "rarity": 1,
  "affinities": ["envy", "gloom", "sloth"], "keywords": ["Sinking"], "status_effects": [...],
  "traits": ["LCB"], "wiki_url": "..." }
```

Gifts have no wiki pages of their own, so `wiki_url` links to the gift list page and
uses a text fragment (`#:~:text=`) to jump to the gift's name. Theme pack links are only
stored after checking the page exists. A pack's `gift_pool` comes from the "E.G.O Gift
Rates" section of its page; the scraper reads the rendered page and matches known gift
names, so it doesn't depend on the wiki's templates. Gift `traits` are found by matching
identity affiliations (with short forms like "Heishou - Wu") followed by "Identities". Identity `keywords` holds only the seven build
keywords; event-only units the wiki gives no rarity or affinity are left out.

## Notes

- The scraper uses the MediaWiki API at about one request per second and sends an
  identifying User-Agent (override it with the `LIMBUS_SCRAPER_UA` environment variable).
  A full run is about 100 requests (mostly theme pack pages), so roughly two minutes.
  `--skip-packs` skips the pack pages.
- Identity data only has sin affinities and status keywords (taken from page categories),
  not per-skill details.
