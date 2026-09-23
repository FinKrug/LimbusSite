# LimbusSite web app

A Vite + React + TypeScript app. All game data is static JSON from `../data` (made by
the scraper), bundled at build time, so there's no server or database. Your team,
owned gifts and offered packs are saved in the browser (localStorage).

## Commands

Run these from the `web` folder (needs Node.js 20.19+ or 22.12+):

```
npm install        # first time only
npm run dev        # dev server at http://localhost:5173
npm test           # scoring unit tests (Vitest)
npm run build      # production build -> dist/
npm run preview    # serve the production build locally
```

Re-run the scraper (`python -m scraper` in the repo root) after a game patch. The app picks
up the new JSON on the next dev reload or build.

## Layout

```
src/
  lib/
    types.ts         shapes of the scraped JSON
    data.ts          loads ../data/*.json (the only place that touches the data)
    scoring.ts       all recommendation logic, pure functions (shared with a future overlay)
    scoring.test.ts  unit tests plus sanity checks against the real data
    storage.ts       usePersistentState (localStorage with a fallback)
  components/
    TeamPicker.tsx   pick one identity per sinner
    OwnedGifts.tsx   searchable "gifts you have" list
    GiftList.tsx     "Best gifts" tab
    PackList.tsx     "Theme packs" tab (browse all, or compare the packs you're offered)
    FusionList.tsx   "Fusions" tab (fuse or keep the ingredients)
    bits.tsx         small shared pieces (tier badge, keyword chip, rating bar, ...)
  App.tsx            layout and state
```

## How recommendations work

See the comment at the top of `src/lib/scoring.ts`. In short:

- **Team profile:** what share of your identities use each keyword (Burn, Bleed, Tremor,
  Rupture, Sinking, Poise, Charge) and each sin affinity.
- **Gift value:** tier × fit. Fit is mostly the share of your team using the gift's
  keyword. General gifts get a fixed middle value. There are smaller bonuses for sin
  affinity, other statuses your team applies, and gifts of the same keyword you already have.
- **Built for your team:** a flat bonus when a gift names one of your team's affiliations
  (e.g. Heishou Bolus - Mao for Heishou Pack - Mao Branch, Tributary Cigar for The Thumb)
  or uses a signature status your team applies (e.g. Tremor - Scorch). A status is
  signature if 8 or fewer identities have it and it isn't a generic buff. It's flat, so a
  tier II gift made for your team can beat a generic tier IV. Gifts built for an
  affiliation you don't have are marked down.
- **Beyond the keyword:** fit is the best of several routes, not just the keyword:
  - *Attack type:* the gift's effect is about Blunt/Slash/Pierce skills (e.g. Oil-gunked
    Spanner is a Tremor gift, but it's really a Blunt gift). Fit = share of your team with
    those skills. Needs identity attack types from the scraper; skipped if unknown.
  - *Affinity:* the effect is about a sin affinity ("Gloom Affinity Skill").
  - *Works on its own:* the gift inflicts its status itself, with no team condition
    (Downpour, Thrill, Broken Compass), so it helps any team.
  - *Combos:* a gift that **needs** a status on enemies (Bell of Truth needs Tremor Burst)
    is written off until your team or a gift you own provides it. Once you own Downpour, Bell
    of Truth ranks as "Works with Downpour", and Downpour ranks higher as "Makes Bell of
    Truth work" if you own Bell of Truth first.
  The scraper derives `needs` / `applies` / `attack_types` / `affinities` / `team_gate` for each
  gift from its effect text (`scraper/effects.py`). It's a heuristic, so check odd cases there.
- **Hand-picked combos:** `src/data/combos.json` lists combos that the effect text can't
  capture (e.g. two Sinking gifts that drain SP together). You can also make your own on the
  Fusions & combos tab; they're saved in your browser. Owning one piece boosts the rest.
- **Fusions:** an ingredient gets extra value when you already hold other parts of its
  recipe. "Fuse" means the result is worth more to your team than what you'd give up.
- **Targets:** star (☆) the gifts you want. Theme packs are ranked by how many targets
  their gift pool contains first, then by how good the rest of the pool is for your team.
  Exclusive gifts count a little extra. A pack with a target is never marked Skip.
- **Theme packs:** a pack is worth the best gifts in its pool, weighted by how rare each gift
  is across packs: an exclusive counts ×1.5, while a gift in 60 packs counts ×0.25 (it's no
  reason to pick any one of them). Gifts built for your team add a bonus. Go, Maybe and Skip
  are relative to the best pack in view. Narrow the view to a floor and difficulty, or to the
  packs you're being offered.
- **Lineup:** the team is an ordered lineup. The first N (5–7, default 6) are deployed and
  decide the team focus; the rest are backups. Gifts limited to slots ("[Effects apply only
  to #1, #2 Deployed Identities]", read from the effect text in `src/lib/lineup.ts`) are
  judged on the sinners in those slots.
- **Build / Suggest order** (`src/lib/teambuilder.ts`): Build picks the best identity per
  sinner for a keyword or an affiliation (branches count partly for their parent faction).
  Suggest order deploys the most central identities, then places them so slot-limited gifts
  land on sinners who can use them (gifts you own count double). It doesn't know which
  identities you own.

Every weight is in `WEIGHTS` at the top of `scoring.ts`. Tune them there.

## Known limits

- Identity attack types come from each identity page's source. The parser was written
  without seeing a real page, so check `data/report.txt` after a scrape.
- Effect parsing is heuristic: unusual wording can be misread. It never removes a gift, it
  only changes how high the gift ranks.
- Floor ranges come from each pack page's "Featured Floors" table. It doesn't know which
  packs are in the current Mirror Dungeon rotation, so use the offered-pack comparison
  during a run.
