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
    teambuilder.ts   Build (pick a team and a starting order)
    ordering.ts      lineup suggestions (single moves with reasons, never automatic)
    acquire.ts       "How to get" for a gift
    explain.ts       "Why this rank" text (what a score is made of, why A beats B)
    strength.ts      identity tiers from the Mirror Dungeon ranking (how good a unit is on its own)
    images.ts        identity art and gift icon URLs on the wiki
    format.ts        small display helpers
    traitparts.ts    how much of an affiliation gift only works for that affiliation
    holder.ts        conditions on the unit in a slot (Family Hierarch Candidate at #6, ...)
    fusion.ts        fusion rules (tier points, keyword chance, recipes, random pools) and suggestions
    evaluate.ts      the Evaluate tab's pros and cons for one gift or theme pack
    skillswap.ts     the Skill swaps planner (plays each swap out with battle.ts)
    battle.ts        battle model: decks, hands, (Absolute) Resonance, Offense Level, E.G.O resources
    costplan.ts      Cost to have at each floor's shop (Your run panel)
    ego.ts           E.G.O loadout, E.G.O lean, E.G.O / resource / Resonance-trigger gifts
    giftsearch.ts    Best gifts search (theme pack, sin, keyword, tier or text)
    vestiges.ts      vestiges and duplicates
    storage.ts       usePersistentState (localStorage with a fallback)
  data/
    combos.json          hand-picked gift combos
    identity_tiers.json  Mirror Dungeon identity ranking (built by scraper/tiers.py; not shown in the app)
    order_tips.json      player tips about lineup order the skill text doesn't spell out
  components/
    TeamTab.tsx      "Team" tab: the formation screen (cards, identity picker, Build)
    EgoLoadout.tsx   E.G.O loadout per deployed sinner (Team tab), E.G.O lean and Resonance odds
    FormationBar.tsx the lineup strip shown on every tab (drag to reorder)
    Portrait.tsx     identity art (threadspun or base) with an offline fallback; the wiki has no
                     threadspun square portrait, so small ones are a face crop of the card art
    GiftIcon.tsx     gift icon with an offline fallback (Best gifts, Theme packs)
    HowToGet.tsx     "How to get" disclosure on gift cards and theme pack gift rows
    WhyRank.tsx      "Why this rank" breakdown on gift and theme pack cards
    RunPanel.tsx     "Your run": difficulty, length, floor and the floor's theme pack
    OwnedGifts.tsx   "Gifts you have": search, icons, vestige counters
    GiftList.tsx     "Best gifts" tab
    PackList.tsx     "Theme packs" tab (packs on your floor, or compare the packs you're offered)
    FusionTab.tsx    "Fusion" tab, styled after the in-game Fuse E.G.O Gift screen
    EvaluateTab.tsx  "Evaluate" tab (pros and cons of one gift or pack)
    SkillsTab.tsx    "Skill swaps" tab
    bits.tsx         small shared pieces (tier badge, keyword chip, rating bar, ...)
  App.tsx            layout and state
```

## How recommendations work

See the comment at the top of `src/lib/scoring.ts`. In short:

- **Team profile:** what share of your identities use each keyword (Burn, Bleed, Tremor,
  Rupture, Sinking, Poise, Charge) and each sin affinity.
- **Gift value:** tier × fit. Fit is mostly the share of your deployed team using the gift's
  keyword, so a gift for one unit counts less than one for seven. General gifts get a fixed
  middle value (a bit less in a 5-floor run). Slot gifts ("#1 Deployed") are judged on the units
  in those slots and count ×(0.45 + 0.55 × share of the deployed team they help). There are smaller bonuses for sin
  affinity, other statuses your team applies, and gifts of the same keyword you already have.
- **Built for your team:** a flat bonus when a gift names one of your team's affiliations
  (e.g. Heishou Bolus - Mao for Heishou Pack - Mao Branch, Tributary Cigar for The Thumb)
  or uses a signature status your team applies (e.g. Tremor - Scorch). A status is
  signature if 8 or fewer identities have it and it isn't a generic buff. Full credit needs 3
  users (or the whole team, if smaller); one of seven gets a third.
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
  For a keyword gift, these other routes count ×(0.3 + 0.4 × the share of your team using its
  keyword): "7/7 use Slash skills" no longer makes a Rupture gift as good as a Burn gift for a
  Burn team with one Rupture unit.
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
  capture (Midwinter Nightmare + Broken Compass drain SP together). They're automatic: own one
  piece and the rest rank higher with "Combos with Midwinter Nightmare, which you have". The
  Fusion tab won't suggest fusing away a combo piece.
- **The run** (side panel): difficulty, length (5, 10 or 15 floors; defaults Normal 5, Hard 10,
  EXTREME 15), the floor you're on and its theme pack. Cost gifts (Golden Urn, Prestige Card,
  Wealth…) are worth more with more floors left; "survive a lethal hit" gifts (Emergency
  Investigator Badge, Swishing Fuel Tank) are worth most on the last 5 floors of a long run.
- **Stagger:** you want enemies staggered and your units never staggered. Gifts that un-stagger
  enemies (White Gossypium) count ×0.35, or ×0.85 for a team that's half Bleed; gifts that
  stagger your own units count ×0.5.
- **Gifts for one identity:** a section marked "[Effects apply only to Blade of the House of
  Spiders Ryōshū]" only counts if that identity is on your team (backups included); an
  affiliation named only there (The House of Spiders) earns no "Built for your team" credit.
- **Ally deaths:** effects that pay off when your own units die (Spiderweb Entangled in Red,
  Value Disposal, Devouring Cube, The Unchosen) count ×(1 − 0.7 × the share of the text that's
  about it), unless your team has the identity the gift is built around.
- **Fusions:** an ingredient gets extra value when you already hold other parts of its
  recipe.
- **Fusion tab** (`src/lib/fusion.ts`), following the wiki's rules: pick a keyword, put 2-3
  gifts in (5 in a Super Shop, Hard floors only), and it forecasts the tier (points: I 3, II 6,
  III 10, IV 15, V 30; ≥25 is Tier IV, ≥22 in a Super Shop) and the keyword chance (60/90/99%
  for 2/3/4+ gifts), or the recipe result. It lists the gifts a random fusion can give, including
  your current pack's exclusives. Fuse removes the ingredients from your gifts and adds what you
  got. Below: suggested fusions from the gifts you'd miss least (vestiges first; never recipe or
  combo pieces), recipes you've started (Lunar Memory: the three Memories + any 2 Sin Fragments,
  Super Shop only), and gifts to sell or fuse.
- **Vestiges:** a duplicate of a gift you own becomes a Vestige of its tier, like in game; the
  side panel counts them and fusing uses them up.
- **Evaluate tab:** type a gift or pack for its pros, cons and a verdict for your team and run:
  where it ranks, better picks of the same keyword, fusions it's part of, combos, where to find
  it on your floor.
- **Battle model** (`src/lib/battle.ts`): plays the deployed team's decks (6 cards, 2 in hand, use
  one, draw one) and each turn picks the skills worth most, with same-sin skills placed together.
  Resonance follows the wiki: index = same-sin skills to the left, or the block size for 3+ in a
  row (Absolute Resonance); index → Offense Level 1/3/3/5/5/7/7/9/9/11/13; Offense Level x adds
  x/(|x|+25) damage and 1 Clash Power per 3. Each skill used gives 1 E.G.O resource of its sin.
- **E.G.O** (`src/lib/ego.ts`, `data/egos.json`): pick each deployed sinner's E.G.O per grade on the
  Team tab (`limbussite.egos.v1`). Resources from skills (and owned resource gifts) pay for them;
  the model works out how often they come out and what they add. **E.G.O lean** (0–1) goes up
  with affordable E.G.O, owned E.G.O gifts, and a team that can't line up Absolute Resonance.
- **Gifts and E.G.O / Resonance:** parts of a gift that only work with E.G.O skills (the seven
  Fragments, Chance & Choice) or give E.G.O resources count ×(0.3 + 0.9 × lean); resource gifts
  for sins your E.G.O don't use count less. "When activating X Absolute Resonance" parts count
  by how often the team lines up X Absolute Resonance. "(including E.G.O Skills)" gifts are
  normal gifts.
- **Team gates:** "activates when 5 or more Identities have Attack Skills that apply X" counts your
  deployed identities with X on a skill (or tagged X); short of that, the gift (or that part of
  it) counts ×0.12 and says "Stays off: needs 5 …, you have 3".
- **Fusion paths you haven't started:** a gift also gets credit for the best recipe it starts when the
  result is worth ≥1.3× the gift to your team (result value × 0.5 × 0.5 ÷ pieces, halved for Super
  Shop recipes). So an off-keyword piece can rank for a payoff your team uses; recipes you've
  started count more, as before.
- **Your plan** (Best gifts, `src/lib/plan.ts`, `PlanPanel.tsx`): for the floor you're on, **Get
  now** (best gifts you can get here: main pool from shops/rewards, theme-pack gifts only when one
  of their packs can show up on this floor, your picked pack first), **Later this run** (top gifts
  from later floors' packs), **Fusions to work toward** (result worth ≥0.45× what it uses up,
  pieces reachable this run; progress and pieces on this floor first; Lunar Memory's "any 2 Sin
  Fragments" and Super Shop rule included) and **Gift sets to build** (combos.json plus your own
  sets, added with "+ Add a gift set", stored in `limbussite.combos.v1`). Pieces show ✓ have, ●
  this floor, ○ later floor, ◇ fuse first. The list below has a "Fits my team, on this floor" filter.
- **Upgrades (+/++):** gifts that can be enhanced are also scored at each upgrade level, as if
  the upgraded text were the gift (so "#6 Deployed" → "#4, #6 Deployed" counts the extra unit), ×
  how much the numbers grow (median of matching numbers; new sentences count as an extra effect).
  The gain counts × 0.8 × price / (price + enhance Cost) (I 50/100, II 60/120, III 75/150,
  IV 100/200) and less with under 3 floors left. Cards show the + and ++ text.
- **Cost to have at the shop** (`src/lib/costplan.ts`, Your run panel): minimum = your best-value
  shop gift for that floor (most score per Cost among your top 10 main-pool Tier I–IV gifts) + 2
  refreshes (45) + a heal (100) from floor 3; "comfortable" also covers your #1 shop gift. The
  current floor uses the Best gifts ranking; "Every floor" ranks each floor on request.
- **Skill swaps tab** (`src/lib/skillswap.ts`): each swap is played out with and without it (same
  draws). The gain covers the stronger skill (one swap = 1 turn in 5 on the better skill), the
  Resonance it gains or loses (Absolute Resonance odds per sin shown) and what the equipped
  E.G.O can afford. Worth it at ≥ 1.3% team damage per 100 Cost, weighted by floors left (full at
  8+). Press Did it to record a swap; decks update.
- **Removed content:** `scraper/removed.py` drops the Pilgrimage of Compassion pack and its gifts,
  which are gone from the game.
- **Theme packs:** a pack is worth the best gifts in its pool, weighted by how rare each gift
  is across packs: an exclusive counts ×1.5, while a gift in 60 packs counts ×0.25 (it's no
  reason to pick any one of them). Gifts built for your team add a bonus. Go, Maybe and Skip
  are relative to the best pack in view: the packs on your run's floor, or the packs you're
  being offered. "Picking this" sets your current pack (Fusion uses it).
- **Best gifts search:** type a theme pack ("spring cultivation"), sin ("wrath"), keyword
  ("rupture") or tier ("tier 4") to see those gifts ranked for your team; anything else searches
  names and effects.
- **Team tab:** works like the in-game formation screen. Every sinner has a card showing
  their equipped identity (art from the wiki, threadspun by default; the Base art / Threadspun
  art switch applies on every tab, including the lineup strip and the identity picker), rarity,
  role and keywords. Click cards in the order you want them deployed and each gets the next
  number; click again to take it out. The Swap strip across the top of a card changes the
  identity; the picker lists 000, then 00, then 0 identities, A–Z. The side panel has lineup
  suggestions, affinity counts for the deployed sinners, total participants, the deployed count
  (5–7, default 7 as in Mirror Dungeon, so backups start at #8), Clear selection, Select all and
  Build. Tiers aren't shown anywhere: order depends on more than how strong a unit is.
- **Lineup suggestions** (`src/lib/ordering.ts`): single moves with a reason ("Make Sinclair the
  first backup (#8)"). Press Move to accept one or Dismiss to hide it; nothing is reordered on its
  own, and the list updates as you pick up gifts or swap identities. They come from, in order:
  slot-limited gifts you own (put a unit that can use it in its slots); player tips in
  `src/data/order_tips.json` (The Lord of Hongyuan wants your best Heishou units right after him
  for Exalted Command; You Branch Sinclair wants to be the first backup); and identity skills and
  passives that mention the lineup, pulled out by `scraper/order.py` ("earliest Deployment order",
  "#1 Deployed ally", "in the same turn it Substitutes in", "allies with earlier Deployment order
  than this unit"). A rule that's already met keeps its unit and slot, so suggestions don't undo
  each other. Position effects with no clear best unit are listed under "Position effects on your
  team".
- **Formation bar:** the selection as a strip of portraits, on every tab. Drag portraits to
  reorder, and drag the Backups divider to change how many are deployed; ←/→ keys work too.
  Only deployed sinners decide the team focus. Gifts limited to slots ("[Effects apply only
  to #1, #2 Deployed Identities]", read from the effect text in `src/lib/lineup.ts`) are
  judged on the sinners in those slots.
- **Who's in the slot** (`src/lib/holder.ts`): many slot-limited gifts only pay off for
  certain units. The effect text is read for conditions on the unit in the slot: an
  affiliation ("If this unit is a Family Hierarch Candidate" on Cultivation and the Virtue
  gifts at #6), skill counts ("2+ Pierce Attack Skills", "# of Slash Base Attack Skills"),
  a status the unit uses ("a Skill that spends Ammo" on For the Capo, "At 3+ Haste"), or a
  sin ("Pride Pierce Skills"). Each condition gates a share of the gift, by how much of the
  text depends on it. The gift scores lower when the unit in the slot misses it and says
  who to move there if someone on your team meets it. Build's starting order uses the same check,
  so a Family Hierarch Candidate lands in #6 when you have Cultivation. Skill counts come
  from the scraper (`attack_counts` on each identity). Also read as slots: "the Identity
  with the earliest Deployment order" (#1), "The ally highest in the Deployment order"
  and "#5 Deployed ally" (part of the gift).
- **Mirror Dungeon ranking** (`src/data/identity_tiers.json`, built by `scraper/tiers.py`): no
  MD-specific tier list covers every identity, so it combines the two that do, Prydwen.gg
  (endgame) and the Great Limbus Library. Their tiers are averaged, and Status Specialists get
  +0.5 because MD's keyword gifts multiply status damage. The lists are kept as text in
  `data/tiers/`; paste in fresh copies and run `python -m scraper.tiers` to update. Identities
  on neither list (brand-new ones) are rated by rarity. The ranking is never shown in the app;
  it only weighs Build, affiliation gifts and lineup suggestions.
- **Build** (`src/lib/teambuilder.ts`): picks the best identity per sinner for a keyword or an
  affiliation (branches count partly for their parent faction), preferring stronger units when the
  fit is equal or close, and gives the new team a starting order: mostly by the ranking, with slot
  gifts you own placed on units that can use them. After that, only suggestions change the order.
  It doesn't know which identities you own.
- **How to get** (`src/lib/acquire.ts`): every gift card and theme pack gift row has a "How to
  get" section: its fusion recipe (with ✓ on ingredients you own), the theme packs it's exclusive
  to or featured in (with floors), abnormality events, whether it's in the general pool (battle
  rewards and shops on any floor), Extreme-only or cursed, and other notes from the wiki.
- **Theme pack gift lists** show a pack's first 5 gifts (the best for
  your team), then "Show 30 more" at a time (5, 35, 65, …) and "Show less". Each row has the
  gift's icon and its top reason.
- **Why this rank** (`src/lib/explain.ts`): theme pack cards say why they're ranked above the
  next pack ("its best gift for you, X (only in this pack), beats Y's best"); gift cards don't
  compare gifts with each other. Open "Why this rank" for the full breakdown: each part of a gift's
  score (tier × fit, affiliation or signature-status synergy, fusion and combo progress, small
  extras) as a share of the total, or for a pack, how much each of its gifts adds and why (only
  in this pack ×1.5, in 54 packs ×0.25, #2 best ×0.6, built for your team). The
  parts come from `parts` on each score in `scoring.ts`, and add up to the score exactly.

Every weight is in `WEIGHTS` at the top of `scoring.ts`. Tune them there.

## Known limits

- Identity attack types come from each identity page's source. The parser was written
  without seeing a real page, so check `data/report.txt` after a scrape.
- Effect parsing is heuristic: unusual wording can be misread. It never removes a gift, it
  only changes how high the gift ranks.
- Floor ranges come from each pack page's "Featured Floors" table. It doesn't know which
  packs are in the current Mirror Dungeon rotation, so use the offered-pack comparison
  during a run.
- Identity art and gift icons are hot-linked from the wiki, so they need an internet
  connection (including in the single-file build). Without one, cards show the sinner's
  initials and gifts show a plain tile with their sin colour. Gift icons use the direct
  thumbnail first, then `Special:FilePath` (which follows the two icons that are file redirects).
- The ranking is built from endgame tier lists plus one Mirror Dungeon adjustment, not from an
  MD-specific list. It's never shown; it only weighs Build, affiliation gifts and suggestions.
- Lineup suggestions read skill text with patterns, so unusual wording can be missed. Player tips
  (`src/data/order_tips.json`) cover what the text doesn't say; add your own there.
- Skill swap values are a rough power estimate (base + half the coin power per coin, plus the
  team's statuses the skill applies). They compare an identity's own skills well, but know
  nothing about special effects like "activates X instead".
- A random fusion's result isn't knowable in advance, so after you press Fuse you pick what you
  actually got (from the possible results, or by search).
- The fusion tier table and keyword chances are from the wiki's Mirror Dungeon page (Sept 2026).
