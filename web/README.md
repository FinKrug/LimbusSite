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
    packroute.ts     Pack route (internal): which pack to aim for on each floor; orders the Theme packs tab
    evaluate.ts      the Evaluate tab's pros and cons for one gift or theme pack
    skillswap.ts     the Skill swaps planner (plays each swap out with battle.ts)
    battle.ts        battle model: decks, hands, (Absolute) Resonance, Offense Level, E.G.O resources
    costplan.ts      Cost to have at each floor's shop (Your run panel)
    ego.ts           E.G.O loadout, E.G.O lean, E.G.O / resource / Resonance-trigger gifts
    giftsearch.ts    Best gifts search (theme pack, sin, keyword, tier or text)
    vestiges.ts      vestiges and duplicates
    storage.ts       usePersistentState (localStorage with a fallback)
    presets.ts       team presets: saved identities and lineup order (Team tab)
    egorec.ts        Suggested E.G.O per deployed sinner and grade (Team tab)
    events.ts        Events tab: value each choice of a Mirror Dungeon event for your team
    musthave.ts      must-have gifts (Lunar Memory) and building toward them
    startgifts.ts    gifts to buy before the run starts
  data/
    combos.json          hand-picked gift combos ("Gift sets to build")
    must_have.json       gifts to always build toward (Lunar Memory)
    identity_tiers.json  Mirror Dungeon identity ranking (built by scraper/tiers.py; not shown in the app)
    order_tips.json      player tips about lineup order the skill text doesn't spell out
  components/
    TeamTab.tsx      "Team" tab: the formation screen (cards, identity picker, Build)
    EgoLoadout.tsx   E.G.O loadout per deployed sinner (Team tab), E.G.O lean and Resonance odds
    Welcome.tsx      welcome screen (clock of sinners, demo team, features)
    EventsTab.tsx    "Events" tab: search an event, best choice for your team, who to send on a check
    PresetBox.tsx    "Team presets" on the Team tab: save, load, rename, reorder, delete saved teams
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
  #25; on a Burn team with no You Branch it's around #237. Only that exact affiliation counts:
  other Heishou branches (Mao, Si, Wu, Wei) get nothing from a You Branch gift, and the reason
  names who it's for ("only works for Heishou Pack - You Branch identities (Heathcliff, Sinclair),
  and yours (Sinclair, Heathcliff) are backups").
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
  Given, not needed (2026-10-19, after Special Contract read as needing Fragile): "are inflicted with
  2 Fragile", "all allies gain 5 Poise", "enemies ... gain Offense Level Down" and "receive X" count as
  the gift applying it; an ally gaining Fragile/Bind is a drawback, neither; "Skills that gain Charge"
  and "Identities that inflicted Sinking" stay team conditions. Team conditions with a parenthesis
  ("an ally with Attack Skills(except E.G.O Skills) that inflict Tremor") are read too, and an
  "... instead" sentence keeps the condition of the one before it (Chalice of Trickle-down's Yurodivy
  line), so Chalice only counts for teams with Tremor skills; "if the target doesn't have X" is not
  a need. "When triggering Amplitude Conversion or Amplitude Entanglement, ..." makes the effect
  conditional on a deployed unit with one of them (`when: status:A|B`; Interlinked Time, Interlocked
  Cogs), and `mechanicGates` (holder.ts) adds "Only works for units that trigger …". "The Identity
  with the most Tremor Count" / "allies with Bleed" is about your own units, not an enemy need (Poise
  and Charge excepted, since gifts give allies those).
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
- **Used-up ingredients** (`ctx.gone`, `isGone` in scoring.ts): once you own a recipe's result,
  its ingredients stop showing up for the rest of the run (Heishou Bolus - Mao, Harestride and
  Shadow Bamboo Hat after Shadowlurking), so they drop out of Best gifts, Your plan ("Gone"),
  theme pack cards, random fusion pools, event choices and the pre-run picks. Lunar Memory
  (a Super Shop recipe) is the exception: its Memories and Sin Fragments keep dropping.
- **How to get** (`src/lib/acquire.ts`, on gift cards): for each theme pack that has the gift,
  how to get it there: the pack's own events that give it (which choice, the check and its
  numbers, or a fight to win), how often its "?" nodes are its own events (from the pack page:
  "75% of …" / "always"), and battle rewards plus the shop before the boss for its exclusives.
  Then random "?" events on any floor (marked Chance, with the choice to pick), the general pool,
  packs with boosted odds, and fusion recipes. Event sources come from `data/events.json`, which
  now also includes every theme pack page's "Dungeon Events" (`pack` on those events);
  `theme_packs.json` has each pack's `layout` (nodes, shop) and `event_note`.
- **Before the run** (Best gifts, while Your run has no floor; `src/lib/startgifts.ts`): the gifts to
  buy at the start, in order (`START_RULES`: up to 3, Tier I–III; change it there if the game
  does). Value = score × 0.5 + score × find (0.25 for main-pool gifts, else min(1, 3 ÷ packs in
  this difficulty that give it)) + 0.8 × score × its share of a pack's fitting exclusives when
  that share is ≥ 0.6 ("Lets you skip <pack>"). Picks are greedy: each next pick is scored as
  if you owned the earlier ones, so recipe pieces pull each other in. It also says what the picks
  do together (complete a recipe, cover everything a pack has for you). Got it marks one bought.
- **EX gifts** (Wealth, A Certain Philosophy) only come from a rare event gamble: Your plan
  marks them "?" (luck) and never lists them under Get now, and their reasons say not to plan
  around them.
- **Owned status sources:** when a gift you own already applies a status your team doesn't use
  (Broken Compass spreads Sinking, Downpour applies Tremor), gifts that need that status get
  "Works with X, which you have", while other gifts that only apply it drop to 0.3× their
  "works on its own" credit ("X already does: get gifts that use it instead"). The "You already
  have N <keyword> gifts" bonus only counts for keywords your team itself uses. A team that
  uses the keyword still values more appliers normally (more stacks is the point).
- **Fusions:** an ingredient gets extra value when you already hold other parts of its
  recipe. Whether a recipe is worth fusing (`recipeGiveUp` in scoring.ts) compares the result
  with what you give up, but an ingredient the result covers (same keyword, or all its statuses
  are the result's) counts only 0.25× of its value: the result does its job, better. So
  Enrapturing Trance beats keeping Talisman Bundle + Standard-duty Battery + Thorny Rope Cuffs
  for a Rupture team, while off-keyword ingredients still count in full.
- **Fusion tab** (`src/lib/fusion.ts`), following the wiki's rules: pick a keyword, put 2-3
  gifts in (5 in a Super Shop, Hard floors only), and it forecasts the tier (points: I 3, II 6,
  III 10, IV 15, V 30; ≥25 is Tier IV, ≥22 in a Super Shop) and the keyword chance (60/90/99%
  for 2/3/4+ gifts), or the recipe result. It lists the gifts a random fusion can give, including
  your current pack's exclusives. **Last chance:** a current-pack exclusive you don't have that no
  later pack this run gives (and that fits your team: fit 0.35+ or built for it) counts ×1.6 in a
  fusion's expected value, and for each one the suggestions put first the spare gifts that make its
  keyword and tier with the best odds of rolling it ("Last chance at Virtue - Yong: only Spring
  Cultivation has it this run … 30% with these gifts"). Fuse removes the ingredients from your gifts and adds what you
  got. The Super Shop switch stays on when you change tabs or reload
  (`limbussite.supershop.v1`, kept in App) until you turn it off or Clear run. Below: suggested fusions from the gifts you'd miss least (vestiges first; never recipe or
  combo pieces), recipes to work on (ones you've started, plus Lunar Memory on Hard: the three
  Memories + any 2 Sin Fragments, Super Shop only), and gifts to sell or fuse. A gift worth under
  15% of your best one is marked **Fuse now**, with the reason it does nothing for you. A gift is
  only kept for a recipe whose result fits your team (fit ≥ 0.35), so Staticky Two-way Radio isn't
  held for Desperado on a team with no Ammo users.
- **Mechanics your team lacks** (`mechanicGates` in `src/lib/holder.ts`): parts of a gift that only
  work for units with a mechanic of their own ("a Skill that gains or spends Ammo", "Skills that
  consume Ammo", Bloodfeast; statuses on 20 or fewer identities) count by how many of your deployed
  units use it (full at about 3 of 7). With none, those parts and the small bonuses (sin affinity,
  other statuses) count for nothing: "Mostly works for units that use Ammo, and no one on your team does".
- **Must-have gifts** (`src/data/must_have.json`, `src/lib/musthave.ts`): Lunar Memory turns every
  enemy resistance Fatal, so it scores above any regular gift for every team (3.5× its tier value).
  On Hard, each piece it still needs (the three Memories, and Sin Fragments until you have 2) gets
  "Builds toward Lunar Memory": 0.2 × its value × (0.6 + 0.4 × pieces you'd have ÷ 5), even if the
  piece does nothing for your team. Your plan lists it first with "build toward it even if you
  can't fuse it yet", the Fusion tab always shows it and keeps its pieces. On Normal (no Super
  Shops) it's marked blocked and its pieces get no bonus. Recipe results are "Fusion only" in Your
  plan, even when the wiki lists them in the main pool.
- **Events tab** (`src/lib/events.ts`, `EventsTab.tsx`, `data/events.json`): type the event you
  walked into (or a gift it gives; your current pack's events are listed first). Each choice is
  valued for your team: gifts it gives (scored like Best gifts, ×0.9 for a fight you have to win,
  0.3 for one you already own) + 0.006 per Cost − 0.25 / 0.6 for hurting one / all units − 1.0 for
  a lasting penalty − 0.6 for a fight; a check is chance × pass + (1 − chance) × fail; a choice that
  leads to more choices adds its best follow-up. The best one is marked, ones 1.2 below it are
  "Avoid". Check odds are an estimate: the sinner rolls a skill (base + coin power per heads, 50%
  heads) and needs the lower number with a skill of a checked sin, the higher one without, plus any
  identity bonus the check lists; it suggests the sinner with the best odds. The game shows the
  exact chance when you pick one.
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
  **Defense skills** (`identity.defense` from the scraper; Guard, Evade or Counter) aren't in the deck:
  after picking the best hand skills, the model tries putting one or two units on their defense skill
  instead (it has a sin, so it counts for Resonance; the hand stays as it was). It keeps that when the
  turn is worth more by a margin (0.2 × the unit's average card, since nothing cycles). A defense skill
  counts 0.45 (Counter) or 0.25 (Guard, Evade) of an attack with its numbers. Gifts you own that trigger
  on a sin's (Absolute) Resonance add 2.5 × tier per activation (× share of the gift, × 0.35 if the
  trigger is minor) to the turn, so a defense skill gets slotted in when it completes a chain such a
  gift needs (Crown of Roses: Gluttony Absolute Resonance on about 62% of turns instead of 53% for the
  demo Heishou team, with Faust's Counter used on 11%).
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
  of their packs can show up on this floor, your picked pack first; once you've picked this floor's
  pack, other packs' gifts move to Later, and packs you've played don't count), **Later this run** (top gifts
  from later floors' packs), **Fusions to work toward** (result worth ≥0.45× what it uses up,
  pieces reachable this run; progress and pieces on this floor first; Lunar Memory's "any 2 Sin
  Fragments" and Super Shop rule included) and **Gift sets to build** (the hand-picked sets in
  `src/data/combos.json`; there's no in-app editor). Pieces show ✓ have, ●
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
  E.G.O can afford. Skill 3 is the default pick (S1 → S3, S2 → S3 are always worth it) unless it
  costs Resonance a gift you own triggers on. S1 → S2 is only suggested, ahead of Skill 3, when
  Skill 2 gives something Skill 3 doesn't: it can hit several targets (Atk Weight > 1, or "Atk
  Weight +N" in its text, `weight_bonus` from `scraper/skills.py`, like Dawn Office Fixer
  Sinclair) while Skill 1 and 3 hit one and no other unit or equipped E.G.O does, or it lines up
  Resonance a gift you own triggers on. That Resonance only counts when the triggered part matters
  (`triggerWorth`): a part that only adds more of a status (Crown of Roses: 2 Rupture on Gluttony
  Absolute Resonance) is minor when your team doesn't use that status or 2+ deployed units or other
  owned gifts already apply it; minor triggers are noted on the swap ("A bit more Gluttony Resonance
  for Crown of Roses, but it only adds Rupture there, and Faust, Ryōshū and Outis already apply
  Rupture") but never make S1 → S2 the pick or block Skill 3. A trigger is also minor when the gift
  switches on another way your team covers (`alternativeRoute`: Sunshower's "Sloth Absolute Resonance
  or using a Skill with 2+ Atk Weight" with Rodion's and Ishmael's multi-target Skill 3s; Employee
  Card's "or a Skill that gains or applies Charge"), or when fewer than 3 deployed units have a skill
  or defense skill of that sin, since Absolute Resonance needs 3 in a row. Those triggers add no
  Resonance value in the battle model, and gift scores count the other route as switching it on. Buffs (Power, Offense Level, damage,
  healing) always count. Swaps are played out with defense skills in play, so losing a sin's last skill
  matters less when the unit's defense skill has that sin ("its defense skill … is Gluttony too, so it
  can still fill a Gluttony Resonance chain when needed"); each card has a **Def** row with how often
  the model uses it. When no swap is clearly worth it (last floor, small
  gains), the card still shows "If you have Cost to spare" with the best swap that doesn't hurt the
  team; only when every swap would hurt (team damage down more than 0.5%, or Resonance a gift you
  own needs) does it say to skip. Press Did it to record a swap; decks update.
- **Removed content:** `scraper/removed.py` drops the Pilgrimage of Compassion pack and its gifts,
  which are gone from the game.
- **Pack route** (`src/lib/packroute.ts`; internal, not shown as a timeline): packs only show up on
  some floors (Hell's Chicken only on floor 2 on Hard, Nocturnal Sweeping on 4–10), so a route is
  planned for the whole run: one pack per floor, each pack once, the best total of pack scores (an
  assignment, Hungarian algorithm), with packs on earlier floors worth ×(1 + 0.03 × floors after it).
  It only decides the **order and verdicts on the Theme packs tab** once a floor is set
  (`prioritizePacks`): each pack in view is forced on this floor and the rest of the run re-planned, so
  a pack that won't show up again comes before a stronger one that will still be around. Go = within
  15% of the best pack's score of the best route, Skip = 50%+ lost (a strong pack that can wait is
  Maybe, not Skip). Each card gets one line: "Best pick now: X is stronger, but it also shows up on
  floors 6–10", "Last floor it shows up on (floors 2–3)" or "Can wait: it also shows up on floors
  6–10". Score comparisons with neighbouring cards are hidden then, since the order isn't by score.
  Packs you pick are remembered per floor (`run.visited`) and aren't planned again; going back a floor
  brings back that floor's pick.
- **Hidden packs** (`isHiddenPack`; The B.E., the wiki's "Hidden Theme Pack" with a `hiddenThemeRate`
  of 0.0002 = about 1 in 5,000 generated packs; scraped as `hidden`, `appear_rate`, `clear_rewards`):
  never planned around. On the floor list they come last, marked **If found** with no rating bar, and
  don't set the bar for other packs' ratings. Added as an offered pack (you found one), they're judged
  like any pack: The B.E.'s clear rewards (Bongy Plush, Lunar Memory, Piece of Relationship, Faith;
  the best one counts like an exclusive) make it a Go. Its gifts are "luck" in Your plan, it doesn't
  count as a second chance for last-chance fusions, and pre-run picks ignore it.
- **Recipes a pack can finish** (`packRecipe`): when every piece of a fusion recipe you still need is
  in a pack's pool and at least one is only in that pack (Spring Cultivation's Virtue - Zhi, Yong and
  Ren → Cultivation: Cut, File, Carve, Polish; Yield My Flesh's hilts and blades; Murder on the WARP
  Express' batteries), the result counts toward the pack: its score × 0.8, ÷ (1 + 0.35 per extra
  piece still needed), since every missing piece has to turn up on that floor. Owning some pieces
  makes it worth more. The card shows it with a **Fusion** pill ("Fuse Virtue - Zhi, Virtue - Yong
  and Virtue - Ren"), and a fitting one adds a reason. Lunar Memory and recipes with "any of" pieces
  are left to their own rules.
- **Keyword-free gift sets** (`src/data/combos.json` with `any_team`, from Folmore's Steam guide,
  ranked most to least important): Tremor (Nixie Divergence, Melted Eyeball, Oscillating Bracelet,
  Downpour, Reverberation, Bio-venom Vial), Poise (Cigarette Holder, Four-leaf Clover, Pendant of
  Nostalgia, Nebulizer, Clear Mirror Calm Water, Ornamental Horseshoe, Devil's Share, Old Wooden Doll,
  Finifugality, Angel's Cut), Sinking (Midwinter Nightmare, Melted Spring, Skeletal Crumbs, Broken
  Compass, Artistic Sense, Blue Starshard), Charge (Portable Battery Socket, Nightvision Goggles,
  Curriculum Vitae, Wrist Guards, Lightning Rod, Charge-type Gloves, Material Interference Force Field,
  UPS System), Bleed (Little and To-be-Naughty Plushie, Red-stained Gossypium, Rusted Muzzle, Arrested
  Hymn, Ruptured Blood Sac, Smokes and Wires; not White Gossypium), Rupture (Talisman Bundle,
  Standard-duty Battery, Broken Revolver, Fluorescent Lamp, Crown of Roses, Barbed Lasso, Thrill), Burn
  (Ashes to Ashes, Dust to Dust, Charred Disk, Pinpoint Logic Circuit, Fiery Down, Hellterfly's Dream;
  Glimpse of Flames only with Burn identities). They work for any team, so every piece gets
  `setBase` 3 × rank weight (1 for #1, −0.1 per rank) × (0.3 + 0.7 × share of the rest you own), even
  before you own one ("Piece of the Tremor set, #1 of 7 sets that work for any team"). It's a `set`
  part, not team synergy, so it doesn't inflate theme pack scores. A piece you fused into a gift you
  own counts as had when that fused gift switches on with your deployed team (no "N or more
  Identities" gate, or it's met; `ctx.fusedInto`, `setHas`): Enrapturing Trance on a Rupture team
  covers Talisman Bundle and Standard-duty Battery in the Rupture set, and Your plan shows them as
  "Talisman Bundle (in Enrapturing Trance)". Your plan's Gift sets to build
  shows them with an "Any team · #1" pill and the guide's note.
- **Lunar Memory pieces later in the run:** the "Builds toward Lunar Memory" bonus grows from ×0.8 on
  floor 1 to ×1.3 on the last floor (`pieceTiming` in musthave.ts): Super Shop odds build up with the
  Cost you spend, so the shop that fuses it usually comes late.
- **General gifts in theme packs** (`fusableKeyword` in types.ts): a random fusion only gives gifts of a
  keyword (Burn … Blunt), so a General (keywordless) gift that only drops in theme packs can't be fused
  for; a keyword one can. Such gifts count ×1.3 toward their pack's score (`WEIGHTS.packUnfusable`;
  "no keyword, so fusing can't give it" in Why this rank), go ×1.2 higher in Your plan's Get now /
  Later this run (`pickPriority`, among the top candidates), and say "No keyword, so fusing can't give
  it: take it when its theme pack offers it" on their card. Their value for your team is unchanged.
- **Theme packs:** a pack is worth the best gifts in its pool, weighted by how rare each gift
  is across packs: an exclusive counts ×1.5, while a gift in 60 packs counts ×0.1 (it's no
  reason to pick any one of them), and fusion-only gifts (Lunar Memory) count for nothing even
  when a pack page lists them. Gifts built for your team add a bonus. A pack card shows its
  exclusive gifts (fitting your team first) and up to 3 gifts it features that 6 or fewer packs
  do and that fit your team ("Boosted"); everything else is under "Everything it can give". Go, Maybe and Skip
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
  identity; the picker lists 000, then 00, then 0 identities, A–Z. The toolbar above the cards
  has the lineup count, the deployed count (5–7, default 7 as in Mirror Dungeon, so backups start
  at #8), Clear order, Select all and Build a team around…; the side panel only has lineup
  suggestions and affinity counts for the deployed sinners. Tiers aren't shown anywhere: order depends on more than how strong a unit is.
- **Suggested E.G.O** (Team tab, E.G.O loadout, `src/lib/egorec.ts`): for each deployed sinner and
  grade, the E.G.O worth the most per turn: value of one use over the skill it replaces (power, plus
  team keywords it inflicts) times the uses per turn your team can pay for, from the resources its
  skills make after your other equipped E.G.O. Each suggestion lists why (keywords it inflicts,
  whether the team makes enough of its sins); Equip takes one, Equip all takes every one. Empty
  slots are only suggested when the team can mostly afford the E.G.O, and a pick is only replaced
  for a clear improvement. Like Build, it doesn't know which E.G.O you own. When a slot's strongest
  E.G.O is held back only by resources your team doesn't make, the slot gets a "With resource gifts"
  note naming gifts that make them (ones naming the sin first, then random ones), and Best gifts
  marks those gifts and scores them a bit higher (`ctx.egoNeeds`, `egoAdjust` in scoring.ts). Once
  you own one, its resources count and the suggestion switches to that E.G.O on its own.
- **Welcome screen** (`Welcome.tsx`): shown on a first visit, from the LimbusSite title, or with
  `#welcome` at the end of the address. Dante's clock with the twelve sinners (your equipped
  identities) at their hours, rising sin-colored embers, counters from the data, and two ways in:
  **Try a demo team** (a Heishou lineup on Hard, floor 3, with a few gifts; your current lineup is
  saved as "Before demo" first if it isn't saved) and **Build my own team**. Animations are off
  for `prefers-reduced-motion`. The title font (Cinzel) and portraits load online; offline it
  falls back to a serif and initials.
- **Saved lineups** (above the lineup strip on every tab; **Manage saved lineups** opens the full
  list to rename, reorder or delete): **Save lineup** stores every sinner's identity and, if you've picked one, the
  lineup order; pick one from **Load a saved lineup…** to switch back. Changing a saved lineup
  offers **Save changes** or **Save as new**.
- **Clear run** (Your run panel): clears the gifts you have, offered theme packs, dismissed lineup
  suggestions, floor and pack, after a confirm. The team, E.G.O, saved lineups and difficulty stay.
- **Team presets** (top of the Team tab's side panel, `src/lib/presets.ts`): save which identity
  each sinner has equipped (e.g. The Thumb Rodion) under a name, and switch between saved teams in
  one click. If you've picked a lineup order it's saved with the preset and restored when you load
  it; you don't need one to save, and a preset without an order leaves your current order alone
  (Save this order to it adds one later). Deployed count, E.G.O and run state are never part of a
  preset. The preset you loaded shows as Current, or Edited once you swap an identity or change
  its saved order, with Save changes / Revert. Loading over a team that isn't saved anywhere
  offers Undo. Identities a data refresh removed fall back to the sinner's default. Stored in
  `limbussite.presets.v1`.
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
  who to move there if someone on your team meets it. A conditional part that buffs all allies
  (Cultivation: Cut, File, Carve, Polish with a Family Hierarch Candidate in #6 gives everyone Haste,
  Protection and Offense Level Up) isn't cut down to the one slot once the unit there qualifies.
  Build's starting order uses the same check,
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
- **Theme pack gift lists:** "Everything it can give" lists the whole pool, best for your team
  first, 30 more at a time. Each row has the gift's icon and its top reason.
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
