# LimbusSite

A Mirror Dungeon helper for Limbus Company: pick your team and the E.G.O gifts you
already have, and it recommends which gifts to take, which theme packs to enter or
skip, and what to fuse.

## Roadmap

1. **Data scraper** (this folder): pulls gift, theme-pack, fusion and identity data
   from the [Limbus Company Wiki](https://limbuscompany.wiki.gg) into JSON.
2. **Web app**: team picker, owned-gift tracker, and rankings for gifts, theme packs and fusions.
3. **Desktop overlay**: the same logic in an always-on-top window, optionally reading the screen.

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
| `data/gifts.json` | [Module:EgoGift/data](https://limbuscompany.wiki.gg/wiki/Module:EgoGift/data): name, sin, tier, cost, keyword and effect text for each upgrade level |
| `data/theme_packs.json`, `data/fusions.json`, gift `pools`/`events` | [Module:EgoGiftList/data](https://limbuscompany.wiki.gg/wiki/Module:EgoGiftList/data): where each gift drops, and fusion recipes |
| `data/identities.json` | Pages in [Category:Identities](https://limbuscompany.wiki.gg/wiki/Category:Identities) and their categories (sinner, rarity, `X Affinity`, `Identities with X`) |
| `data/meta.json` | Timestamp, wiki revision IDs and counts for this run |
| `data/report.txt` | Warnings: names that didn't match, unknown fusion ingredients, etc. |

`data/raw/` caches every API response so `--offline` works. It's git-ignored.

### Gift record (`gifts.json`)

```jsonc
{
  "id": "hellterfly-s-dream",
  "name": "Hellterfly's Dream",
  "sin": "wrath",               // wrath | lust | sloth | gluttony | gloom | pride | envy
  "tier": 2, "tier_label": "II",
  "cost": 198,
  "keyword": "Burn",            // Burn, Bleed, Tremor, Rupture, Sinking, Poise, Charge, Slash, Pierce, Blunt, or null
  "secondary_keyword": null,
  "status_effects": ["Burn"],   // every status the effect text mentions
  "max_level": 2, "enhanceable": true,
  "levels": [{ "level": 0, "desc": "...", "desc_markup": "..." }, ...],
  "mirror_dungeon": true,       // obtainable in a current Mirror Dungeon run (use this to filter)
  "legacy": false,              // retired version, e.g. "Hellterfly's Dream (Legacy)"
  "pools": ["main"],            // main | themed | extreme | cursed | unlisted
  "theme_packs": [],            // packs this gift is exclusive to
  "events": ["Ardor Blossom Moth"],
  "fusion_recipe": null,        // or { "ingredients": [ids], "unresolved": [names] }
  "section": "MD1 / Mirror of the Beginning"
}
```

The wiki's gift module also includes Story Dungeon gifts and retired "(Legacy)"
versions. Filter on `mirror_dungeon` to get only what can drop in a current run.

Each identity in `identities.json` has `sinner`, `rarity`, `affinities` (sins),
`keywords` (just Burn, Bleed, Tremor, Rupture, Sinking, Poise and Charge) and
`status_effects` (everything else the wiki tags). `incomplete: true` marks event-only
units that the wiki hasn't given rarity or affinity categories.

## Notes

- The scraper uses the MediaWiki API at about one request per second and sends an
  identifying User-Agent (override it with the `LIMBUS_SCRAPER_UA` environment variable).
  A full run is roughly 10–20 requests.
- Identity data only has sin affinities and status keywords (taken from page categories),
  not per-skill details. That should be enough for team keyword weighting in Phase 2.
