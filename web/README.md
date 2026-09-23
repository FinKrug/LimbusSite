# LimbusSite web app

A Vite + React + TypeScript app. All game data is static JSON from `../data` (made by
the scraper), bundled at build time, so there's no server or database. Your team,
owned gifts and offered packs are saved in the browser (localStorage).

## Commands

Run these from the `web` folder (needs Node.js 20.19+ or 22.12+):

```
npm install        # first time only
npm run dev        # dev server at http://localhost:5173
npm run dev:lan    # same, plus a Network link for other devices on your Wi-Fi
npm test           # scoring unit tests (Vitest)
npm run build      # production build -> dist/
npm run build:single  # one self-contained file -> dist/LimbusSite.html (to send to someone)
npm run preview    # serve the production build locally
```

## Sharing the site

- **Send a file:** `npm run build:single` packs the whole site, data included, into
  `dist/LimbusSite.html` (about 1 MB). Your friend double-clicks it; there's nothing to install
  and it works offline. Their team and gifts are saved in their own browser. Rebuild and resend
  it after a scrape or an update. (`scripts/single-file.mjs` inlines the build's JS and CSS,
  because browsers won't load separate module scripts from a file opened off disk.)
- **Same Wi-Fi:** `npm run dev:lan` and send the Network link it prints. Your PC has to stay on.

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
    lineup.ts        slot-limited gifts ("#1, #2 Deployed")
    teambuilder.ts   Build (pick a team) and Suggest order
    strength.ts      identity tiers (how good a unit is on its own)
    traitparts.ts    how much of an affiliation gift only works for that affiliation
    holder.ts        conditions on the unit in a slot (Family Hierarch Candidate at #6, ...)
  data/
    combos.json          hand-picked gift combos
    identity_tiers.json  community tier list used as the default identity ratings
    storage.ts       usePersistentState (localStorage with a fallback)
  components/
    TeamPicker.tsx   pick one identity per sinner, lineup panel
    LineupList.tsx   drag-and-drop lineup (rows and the Backups divider)
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
  tier II gift made for your team can beat a generic tier IV.
- **Affiliation-only effects** (`src/lib/traitparts.ts`): an affiliation gift is split into
  the part anyone can use and the part only that affiliation's identities get, by how much
  of the effect text mentions the affiliation. Bloodflame Sword is about 60% You Branch:
  its "5 Burn and 8 SP" part is scored as a normal Burn gift, and the rest (and the flat
  bonus) scales with how many You Branch identities you deploy, weighted by their tier.
  Benched members don't count. With You Heathcliff and You Sinclair deployed it ranks around
  #25; on a Burn team with no You Branch it's around #237.
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
- **Lineup:** the team is an ordered lineup. The first N (5–7, default 7 as in Mirror Dungeon, so backups start at #8) are deployed and
  decide the team focus; the rest are backups. Gifts limited to slots ("[Effects apply only
  to #1, #2 Deployed Identities]", read from the effect text in `src/lib/lineup.ts`) are
  judged on the sinners in those slots.
  Reorder it by dragging rows (the ⠿ handle on touch screens), and drag the Backups divider
  to change how many are deployed. The handles also take ↑/↓ keys.
- **Who's in the slot** (`src/lib/holder.ts`): many slot-limited gifts only pay off for
  certain units. The effect text is read for conditions on the unit in the slot: an
  affiliation ("If this unit is a Family Hierarch Candidate" on Cultivation and the Virtue
  gifts at #6), skill counts ("2+ Pierce Attack Skills", "# of Slash Base Attack Skills"),
  a status the unit uses ("a Skill that spends Ammo" on For the Capo, "At 3+ Haste"), or a
  sin ("Pride Pierce Skills"). Each condition gates a share of the gift, by how much of the
  text depends on it. The gift scores lower when the unit in the slot misses it and says
  who to move there if someone on your team meets it. Suggest order uses the same check,
  so a Family Hierarch Candidate lands in #6 when you have Cultivation. Skill counts come
  from the scraper (`attack_counts` on each identity). Also read as slots: "the Identity
  with the earliest Deployment order" (#1), "The ally highest in the Deployment order"
  and "#5 Deployed ally" (part of the gift).
- **Identity strength** (`src/lib/strength.ts`): each identity has a tier (SSS, SS, S+, S,
  A, B, C, D). The defaults come from `src/data/identity_tiers.json`, the top of a community
  tier list (general endgame, not MD-specific). Unlisted identities are rated by rarity. You
  can set your own tier for any identity in the team editor (shown with a `*`), and yours wins.
- **Build / Suggest order** (`src/lib/teambuilder.ts`): Build picks the best identity per
  sinner for a keyword or an affiliation (branches count partly for their parent faction),
  preferring stronger units when the fit is equal or close. Strength never beats fit: an SSS
  unit that doesn't fit the focus isn't picked over one that does. Suggest order deploys the
  most central identities (strength breaks near-ties), then finds the best placement:
  slot-limited gifts go to sinners who can use them (gifts you own count double), scaled up
  for stronger units so the buffs land on the carries, and strong units lean toward the
  most-buffed slots (#1–#2 carry the most slot-limited gifts). On a Heishou team this puts
  Heishou Mao Faust (SSS) in #2 and You Heathcliff (SS) in #1. It doesn't know which
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
