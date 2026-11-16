import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EvaluateTab } from './components/EvaluateTab'
import { EventsTab } from './components/EventsTab'
import { ShopAdvice } from './components/ShopAdvice'
import { ShopOverview } from './components/ShopOverview'
import { shopFusions, shopMoves, type ShopMove } from './lib/shopoverview'
import { floorsWeight, planSwaps, SWAPS } from './lib/skillswap'
import { CostNow, type CostChange } from './components/CostNow'
import { Celebration } from './components/Celebration'
import { rareFind, rareStyle, type RareFind } from './lib/rare'
import { pricesFor } from './lib/shopprices'
import { ImportTab } from './components/ImportTab'
import { UpgradesTab } from './components/UpgradesTab'
import { Welcome } from './components/Welcome'
import { FusionTab } from './components/FusionTab'
import { GiftList } from './components/GiftList'
import { OwnedGifts, PickupBox } from './components/OwnedGifts'
import { PlanPanel } from './components/PlanPanel'
import { PreRunTab } from './components/PreRunTab'
import { EMPTY_PRERUN, type PreRunState } from './lib/prerun'
import { starcloudKeep } from './lib/costkeep'
import { floorNotes, freeRefreshes, shopNotes, shopTierCost, startingCost } from './lib/buffeffects'
import { BuffNotes } from './components/BuffNotes'
import { LineupTools, PresetBox } from './components/PresetBox'
import { availability, shoppingOrder } from './lib/plan'
import { CurrentPack, PackList } from './components/PackList'
import { prioritizePacks, routeScores } from './lib/packroute'
import { allPackEvents, packEvents as packEventsFor, usualEvents, usualWorth } from './lib/packevents'
import { eventsForPack } from './lib/events'
import { FormationBar } from './components/FormationBar'
import { CostBox, RunPanel } from './components/RunPanel'
import { RunBar } from './components/RunBar'
import { RewardPicker } from './components/RewardPicker'
import { withFloor } from './lib/run'
import { SkillsTab } from './components/SkillsTab'
import { SyncButton, SyncDialogs } from './components/SyncPanel'
import { TeamTab } from './components/TeamTab'
import { KeywordChip } from './components/bits'
import { gameData } from './lib/data'
import {
  DEFAULT_RUN, ENHANCE_COST, defaultFloors, makeContext, withPack, packInDifficulty, playedPacks, packOnFloor, packsByGift, rankGifts, rankThemePacks, teamFocus,
  type Difficulty, type RunSettings,
} from './lib/scoring'
import { DEFAULT_DEPLOYED } from './lib/lineup'
import { usePersistentState } from './lib/storage'
import { OWNED_IDENTITIES_KEY, hasMarkedIdentities, ownedIdentitySet } from './lib/myidentities'
import { MyCollection } from './components/MyCollection'
import { OWNED_EGOS_KEY, hasMarkedEgos, ownedEgoSet } from './lib/myegos'
import { ownedKeywordTeams } from './lib/rankings'
import { RankingsPage } from './components/RankingsPage'
import { Tour, type TourStep } from './components/Tour'
import { SETUP_KEY, SetupWizard, type SetupState } from './components/SetupWizard'
import { StartRun } from './components/StartRun'
import { SettingsPage } from './components/SettingsPage'
import { sync } from './lib/sync'
import type { SummaryLookups } from './lib/transfer'
import { hasOrder, makePreset, presetMatches, restoreSelection, restoreTeam, validPresets, type Equipped, type TeamPreset } from './lib/presets'
import type { TierOverrides } from './lib/strength'
import type { ArtVariant } from './lib/images'
import { lineupSuggestions, moveTo } from './lib/ordering'
import type { SwapState } from './lib/skillswap'
import { withSwaps } from './lib/battle'
import type { EgoLoadout } from './lib/ego'
import { buildTeam, suggestOrder } from './lib/teambuilder'
import { addGift, removeOne } from './lib/vestiges'
import { SINNERS, type Gift, type Identity, type Sinner } from './lib/types'

type Tab = 'team' | 'identities' | 'settings' | 'start' | 'prerun' | 'shophome' | 'gifts' | 'packs' | 'fusion' | 'upgrades' | 'events' | 'evaluate' | 'skills' | 'import' | 'rewards' | 'boss' | 'best' | 'rank-gifts' | 'rank-ids' | 'rank-egos'
const TABS: Tab[] = ['team', 'identities', 'settings', 'start', 'prerun', 'shophome', 'gifts', 'packs', 'fusion', 'upgrades', 'events', 'evaluate', 'skills', 'import', 'rewards', 'boss', 'best', 'rank-gifts', 'rank-ids', 'rank-egos']

/**
 * Two places (Finley, 2026-11-15): Home, with your team and lineups, owned identities and settings;
 * and the Run. Entering a run asks for the lineup and difficulty, then Before the run (Starlight
 * buffs, starting gifts), then follows each floor: pick a pack, fight your way through its battles
 * and "?" events, shop, then the boss, and on to the next floor (Next phase). "Run setup" in the
 * run bar goes back to the start questions. Best gifts, Evaluate and Import gifts are in Tools.
 * Rankings (Finley, 2026-11-15): the best of everything for Mirror Dungeon whatever you own; what to
 * do with what you own stays on Home's Team & lineups.
 */
type Stage = 'home' | 'rankings' | 'start' | 'packs' | 'fights' | 'shop' | 'boss' | 'yourgifts'
type RunStage = 'packs' | 'fights' | 'shop' | 'boss'
const STAGE_OF: Record<Tab, Stage> = {
  team: 'home', identities: 'home', settings: 'home', start: 'start', prerun: 'start',
  packs: 'packs', rewards: 'fights', events: 'fights',
  shophome: 'shop', gifts: 'shop', fusion: 'shop', upgrades: 'shop', skills: 'shop', boss: 'boss',
  evaluate: 'yourgifts', import: 'yourgifts', best: 'yourgifts', 'rank-gifts': 'rankings', 'rank-ids': 'rankings', 'rank-egos': 'rankings',
}
/** Left to right, for which way a screen slides in. */
const STAGE_INDEX: Record<Stage, number> = { home: 0, rankings: 1, start: 2, packs: 3, fights: 4, shop: 5, boss: 6, yourgifts: 7 }
const STAGES: { id: RunStage; tab: Tab; label: string; hint: string }[] = [
  { id: 'packs', tab: 'packs', label: 'Pick a pack', hint: "The floor's theme pack" },
  { id: 'fights', tab: 'events', label: 'Fights & events', hint: 'Gifts, "?" events' },
  { id: 'shop', tab: 'shophome', label: 'Shop', hint: 'Buy, enhance, swap' },
  { id: 'boss', tab: 'boss', label: 'Boss', hint: 'Boss, floor reward' },
]
/** Screens with parts of their own, and the parts. */
const SUB_TABS: Partial<Record<Stage, { id: Tab; label: string }[]>> = {
  home: [{ id: 'team', label: 'Team & lineups' }, { id: 'identities', label: 'My identities & E.G.O' }, { id: 'settings', label: 'Settings' }],
  yourgifts: [{ id: 'best', label: 'Ranked for your team' }, { id: 'evaluate', label: 'Check a gift or pack' }, { id: 'import', label: 'Import from screenshots' }],
  rankings: [{ id: 'rank-gifts', label: 'E.G.O gifts' }, { id: 'rank-ids', label: 'Identities' }, { id: 'rank-egos', label: 'E.G.O' }],
  shop: [{ id: 'shophome', label: 'Overview' }, { id: 'gifts', label: 'Buy' }, { id: 'fusion', label: 'Fuse' }, { id: 'upgrades', label: 'Enhance' }, { id: 'skills', label: 'Skill swaps' }],
}
/** The questions before floor 1. */
const START_STEPS: { id: Tab; label: string }[] = [
  { id: 'start', label: 'Lineup & difficulty' },
  { id: 'prerun', label: 'Before the run' },
]

/** The guided tour (Welcome › Take the tour, Settings): the real screens, one part at a time. */
const TOUR: TourStep<Tab>[] = [
  { title: 'Welcome to GesellschaftMD', text: <>A quick look around: about a minute. It points at the real screens, so everything you see here is where it'll be later. Use <b>Next</b> or the arrow keys.</> },
  { target: 'home-nav', tab: 'team', title: 'Home: your team', text: 'Home holds what stays between runs: your team and saved lineups, the identities and E.G.O you own, and settings.' },
  { target: 'tab-identities', title: 'Tell it what you own', text: 'Mark the identities and E.G.O you have, by hand or by dropping in screenshots of your in-game lists. Recommendations then stick to what you can actually field.' },
  { target: 'team-grid', tab: 'team', title: 'Your lineup', text: 'Click sinners in the order you want them deployed, like in game. Swap changes an identity; the side panel suggests better orders as your run changes.' },
  { target: 'build', title: 'Build a team for you', text: 'Pick a status keyword (Burn, Bleed, Poise…) or an affiliation and Build fills in an identity per sinner and an order. Tick "Only mine" to use only what you own.' },
  { target: 'owned-teams', title: 'Best teams from what you own', text: 'Which keyword teams your collection is strongest at, with one click to build one.' },
  { target: 'ego-loadout', title: 'E.G.O loadout', text: "Each deployed sinner's E.G.O. Suggestions (★) come from the E.G.O you own; the loadout changes how much E.G.O gifts and skill swaps are worth." },
  { target: 'rankings-nav', tab: 'rank-gifts', title: 'Rankings: the best of the best', text: 'The best E.G.O gifts and identities for Mirror Dungeon, whatever you own: for planning what to chase, not just this run.' },
  { target: 'gift-filters', tab: 'rank-gifts', title: 'Best gifts by keyword', text: 'See the best gifts overall, for any team, or for one keyword\'s team.' },
  { target: 'get-next', tab: 'rank-ids', title: 'Worth getting next', text: 'Identities you don\'t have yet that would most improve the teams you can build. Handy before spending Lunacy or Thread.' },
  { target: 'run-nav', tab: 'start', title: 'Start a run', text: 'When you go in: pick the lineup and difficulty, then your Starlight buffs and starting gifts. After that it follows each floor: pick a pack, fights and events, the shop, then the boss.' },
  { target: 'start-run', tab: 'start', title: 'During the run', text: 'Every gift, pack and event choice is judged for the team you picked. "Run setup" in the run bar comes back here if you change your mind.' },
  { target: 'your-gifts', tab: 'best', title: 'Gifts for your team', text: 'Next to the floor-by-floor steps, but not one of them: every gift ranked for your team and run right now, a close look at any one gift or pack, and reading the gifts you have from screenshots. Check it any time.' },
  { target: 'sync', title: 'Keep it everywhere', text: 'Sign in with Google to save your team, collection and run to your account, so it\'s there on any computer or phone. Or save a backup file.' },
  { target: 'title', title: "That's it!", text: <>The GesellschaftMD title takes you back to the home page. You can take this tour again from <b>Home › Settings</b>. Good luck down there, Manager.</> },
]

/** The "Try a demo team" run: a Heishou lineup on Hard, floor 3, with a few gifts already picked up. */
const DEMO = {
  team: {
    'Hong Lu': 'the-lord-of-hongyuan-hong-lu', Faust: 'heishou-pack-mao-branch-adept-faust',
    'Ryōshū': 'heishou-pack-mao-branch-ryoshu', Outis: 'heishou-pack-mao-branch-outis',
    Ishmael: 'family-hierarch-candidate-ishmael', Rodion: 'heishou-pack-si-branch-rodion',
    Gregor: 'heishou-pack-si-branch-gregor', Sinclair: 'heishou-pack-you-branch-sinclair',
    Heathcliff: 'heishou-pack-you-branch-adept-heathcliff', 'Don Quixote': 'heishou-pack-wei-branch-don-quixote',
    'Yi Sang': 'heishou-pack-wu-branch-adept-yi-sang', Meursault: 'cinq-assoc-west-section-3-meursault',
  } as Equipped,
  order: ['Hong Lu', 'Faust', 'Ryōshū', 'Outis', 'Ishmael', 'Rodion', 'Gregor', 'Sinclair', 'Heathcliff', 'Don Quixote', 'Yi Sang', 'Meursault'] as Sinner[],
  owned: ['thrill', 'glyph-of-glass-shards', 'sundered-memory'],
}

/** Show the welcome screen on a first visit (or with #welcome in the address). */
function firstVisit(): boolean {
  try {
    return location.hash === '#welcome' || localStorage.getItem('limbussite.welcomed.v1') === null
  } catch {
    return true
  }
}

/** Lineups saved before the Team tab (team + order) become the selection. */
function legacySelection(): Sinner[] {
  try {
    const team = JSON.parse(localStorage.getItem('limbussite.team.v1') ?? '{}') as Equipped
    const order = JSON.parse(localStorage.getItem('limbussite.order.v1') ?? '[]') as Sinner[]
    const picked = SINNERS.filter((s) => team[s])
    return [...order.filter((s) => picked.includes(s)), ...picked.filter((s) => !order.includes(s))]
  } catch {
    return []
  }
}

/** The run starts from the old Theme packs floor filter, if there was one. */
function legacyRun(): RunSettings {
  try {
    const old = JSON.parse(localStorage.getItem('limbussite.floor.v1') ?? 'null') as { difficulty?: Difficulty } | null
    const difficulty = old?.difficulty ?? 'normal'
    return { ...DEFAULT_RUN, difficulty, floors: defaultFloors(difficulty) }
  } catch {
    return DEFAULT_RUN
  }
}

export default function App() {
  const [team, setTeam] = usePersistentState<Equipped>('limbussite.team.v1', {})
  const [firstSelection] = useState(legacySelection)
  const [selection, setSelection] = usePersistentState<Sinner[]>('limbussite.selection.v1', firstSelection)
  const [owned, setOwned] = usePersistentState<string[]>('limbussite.owned.v1', [])
  /** Identities you own (Tools > My identities), base ones not stored. */
  const [myIdentities, setMyIdentities] = usePersistentState<string[]>(OWNED_IDENTITIES_KEY, [])
  /** E.G.O you own (Home › My identities & E.G.O › E.G.O), starting ones not stored. */
  const [myEgos, setMyEgos] = usePersistentState<string[]>(OWNED_EGOS_KEY, [])
  /** Upgrade level of gifts you've enhanced this run (Upgrades tab). */
  const [enhanced, setEnhanced] = usePersistentState<Record<string, number>>('limbussite.enhanced.v1', {})
  /** Before the run: Starlight buffs you took, your starting keyword, Starlight to spend. */
  const [prerun, setPrerun] = usePersistentState<PreRunState>('limbussite.prerun.v1', EMPTY_PRERUN)
  const [offered, setOffered] = usePersistentState<string[]>('limbussite.offered.v1', [])
  const [firstRun] = useState(legacyRun)
  const [run, setRun] = usePersistentState<RunSettings>('limbussite.run.v1', firstRun)
  const [storedTab, setStoredTab] = usePersistentState<string>('limbussite.tab.v1', 'team')
  const tab: Tab = storedTab === 'fusions' ? 'fusion' : (TABS as string[]).includes(storedTab) ? storedTab as Tab : 'team'
  const stage = STAGE_OF[tab]
  // A screen with parts opens on the part you used last; Tools' Back returns to the last run screen.
  const [subTabs, setSubTabs] = usePersistentState<Partial<Record<Stage, Tab>>>('limbussite.subtab.v1', {})
  // The run screen you were last on, for the Run button.
  const [lastRunTab, setLastRunTab] = useState<Tab | null>(null)
  // Which way the screen slides in: forward through the floor, or back.
  const [direction, setDirection] = useState<'fwd' | 'back'>('fwd')
  const setTab = (t: Tab) => {
    // "Marked done … Undo" on the shop overview only lasts until you go elsewhere.
    if (t !== 'shophome') setLastMove(null)
    const to = STAGE_OF[t]
    if (SUB_TABS[to]) setSubTabs((m) => ({ ...m, [to]: t }))
    if (to === 'packs' || to === 'fights' || to === 'shop' || to === 'boss') setLastRunTab(t)
    if (to !== stage) setDirection(STAGE_INDEX[to] >= STAGE_INDEX[stage] ? 'fwd' : 'back')
    setStoredTab(t)
  }
  const openStage = (s: RunStage | 'home' | 'rankings' | 'yourgifts') => {
    // The shop opens on its overview (what to spend on) every time.
    const sub = s === 'shop' ? undefined : subTabs[s]
    setTab(sub && STAGE_OF[sub] === s ? sub : s === 'home' ? 'team' : s === 'rankings' ? 'rank-gifts' : s === 'yourgifts' ? 'best'
      : STAGES.find((x) => x.id === s)!.tab)
  }
  // Making or editing a lineup from the start-of-run questions: Home's Team page offers a way back.
  const [buildingForRun, setBuildingForRun] = useState(false)
  // "Floor 3 cleared" / "Run cleared", shown for a moment after the boss.
  const [cleared, setCleared] = useState<{ key: number; title: string; sub: string } | null>(null)
  const [bossSearch, setBossSearch] = useState(false)
  const [runOpen, setRunOpen] = useState(false)
  const [giftsOpen, setGiftsOpen] = useState(false)
  const [swaps, setSwaps] = usePersistentState<SwapState>('limbussite.swaps.v1', {})
  const [deployed, setDeployed] = usePersistentState<number>('limbussite.deployed.v3', DEFAULT_DEPLOYED)
  // Ratings set in an earlier version still count; there's no UI for them now that tiers aren't shown.
  const [tiers] = usePersistentState<TierOverrides>('limbussite.tiers.v1', {})
  // v2: threadspun became the default (v1 defaulted to base).
  const [art, setArt] = usePersistentState<ArtVariant>('limbussite.art.v2', 'uptie')
  const [dismissed, setDismissed] = usePersistentState<string[]>('limbussite.dismissed.v1', [])
  // Fusion tab: are you at a Super Shop? Stays on across tabs and reloads until you turn it off.
  const [superShop, setSuperShop] = usePersistentState<boolean>('limbussite.supershop.v1', false)
  // Equipped E.G.O per sinner and grade (Team tab).
  const [loadout, setLoadout] = usePersistentState<EgoLoadout>('limbussite.egos.v1', {})
  // Saved lineups (strip above the lineup; Manage opens the full list) and the one last loaded or saved.
  const [storedPresets, setPresets] = usePersistentState<TeamPreset[]>('limbussite.presets.v1', [])
  const presets = useMemo(() => validPresets(storedPresets), [storedPresets])
  const [activePreset, setActivePreset] = usePersistentState<string | null>('limbussite.presets.active.v1', null)

  const identitiesById = useMemo(() => new Map(gameData.identities.map((i) => [i.id, i])), [])
  // What you own (Home › My identities & E.G.O); null until you've marked any.
  const markedIds = hasMarkedIdentities(myIdentities, gameData.identities)
  const ownedIds = useMemo(() => ownedIdentitySet(myIdentities, gameData.identities), [myIdentities])
  const ownedEgoIds = useMemo(() => (hasMarkedEgos(myEgos, gameData.egos ?? []) ? ownedEgoSet(myEgos, gameData.egos ?? []) : null), [myEgos])
  const ownedTeams = useMemo(() => (markedIds && tab === 'team' ? ownedKeywordTeams(gameData, ownedIds, tiers) : []), [markedIds, ownedIds, tab, tiers])
  const packsById = useMemo(() => new Map(gameData.themePacks.map((p) => [p.id, p])), [])
  const packsForGift = useMemo(() => packsByGift(gameData.themePacks), [])
  // Every sinner shows an identity: the one you picked, or their base LCB Sinner.
  const equipped = useMemo(() => {
    const out = {} as Record<Sinner, Identity>
    for (const s of SINNERS) {
      const own = team[s] ? identitiesById.get(team[s]!) : undefined
      const mine = gameData.identities.filter((i) => i.sinner === s)
      out[s] = own ?? mine.find((i) => i.name.startsWith('LCB Sinner')) ?? mine[0]
    }
    return out
  }, [team, identitiesById])
  const order = useMemo(() => selection.filter((s, k) => SINNERS.includes(s) && selection.indexOf(s) === k), [selection])
  // Every sinner's identity as a preset saves it (presets also keep the order, if one is picked).
  const currentTeam = useMemo<Equipped>(
    () => Object.fromEntries(SINNERS.map((s) => [s, equipped[s]?.id ?? null])) as Equipped,
    [equipped],
  )
  const knownIdentities = useMemo(() => new Set(gameData.identities.map((i) => i.id)), [])
  // Load a saved lineup: its identities, and its order if it saved one.
  const applyLineup = (t: Equipped, sel?: Sinner[]) => {
    setTeam(restoreTeam(t, knownIdentities))
    if (sel) setSelection(restoreSelection(sel))
  }
  const [managing, setManaging] = useState(false)
  // Before the team is replaced (a saved lineup or a new one for the run): keep an unsaved team as a lineup.
  const keepCurrent = () => {
    if (order.length && !presets.some((p) => presetMatches(p, currentTeam, order))) {
      const kept = makePreset('Previous team', currentTeam, order, presets)
      setPresets([...presets, kept])
    }
  }
  const useLineupForRun = (p: TeamPreset) => {
    if (presetMatches(p, currentTeam, order)) { setActivePreset(p.id); return }
    keepCurrent()
    applyLineup(p.team, hasOrder(p) ? restoreSelection(p.selection) : undefined)
    setActivePreset(p.id)
  }
  // Your data: cloud sync and backup files (SyncPanel.tsx).
  const [dataOpen, setDataOpen] = useState(false)
  const lookups = useMemo<SummaryLookups>(() => ({
    identities: identitiesById,
    gifts: new Map(gameData.gifts.map((g) => [g.id, g])),
    packs: packsById,
  }), [identitiesById, packsById])
  useEffect(() => sync.init(lookups), [lookups])
  const syncDialogs = <SyncDialogs open={dataOpen} onClose={() => setDataOpen(false)} look={lookups} />
  // Welcome screen: first visit, or the GesellschaftMD title.
  const [home, setHome] = useState(firstVisit)
  const [, setWelcomed] = usePersistentState<boolean>('limbussite.welcomed.v1', false)
  const leaveHome = (to: Tab) => { setHome(false); setSetupOpen(false); setWelcomed(true); setTab(to); window.scrollTo(0, 0) }
  const [touring, setTouring] = useState(false)
  const startTour = () => { leaveHome('team'); setTouring(true) }
  // First-time setup (sign in, identities you own): until you finish or skip it, it opens
  // for anyone who hasn't set anything up yet (no lineup, no identities marked).
  const [setupState, setSetupState] = usePersistentState<SetupState>(SETUP_KEY, null)
  const unconfigured = order.length === 0 && !hasMarkedIdentities(myIdentities, gameData.identities)
    && !hasMarkedEgos(myEgos, gameData.egos ?? [])
  const [setupOpen, setSetupOpen] = useState(() => !home && setupState === null && unconfigured)
  const openSetup = () => { setHome(false); setWelcomed(true); setSetupOpen(true); window.scrollTo(0, 0) }
  const loadDemo = () => {
    // Keep the lineup you had: save it first unless it's already saved.
    if (order.length && !presets.some((p) => presetMatches(p, currentTeam, order))) {
      const kept = makePreset('Before demo', currentTeam, order, presets)
      setPresets([...presets, kept])
    }
    const known = new Set(gameData.gifts.map((g) => g.id))
    setTeam(restoreTeam(DEMO.team, knownIdentities))
    setSelection(DEMO.order)
    setDeployed(7)
    setOwned(DEMO.owned.filter((id) => known.has(id)))
    setOffered([])
    setDismissed([])
    setRun({ difficulty: 'hard', floors: defaultFloors('hard'), floor: 3, pack: null })
    setActivePreset(null)
    leaveHome('gifts')
  }
  const teamIdentities = useMemo(() => order.map((s) => equipped[s]).filter(Boolean), [order, equipped])
  // The same context with other gifts owned (starting-gift picks try gifts one at a time).
  const rebuildCtx = useCallback(
    (ids: string[]) => makeContext(gameData, teamIdentities, ids, { deployed, tiers, run, loadout, swaps }),
    [teamIdentities, deployed, tiers, run, loadout, swaps],
  )
  // At the last floor's shop, a regular one, or later on that floor: no Super Shop is left this
  // run, so Super Shop recipes (Lunar Memory) can't be made and their pieces aren't worth keeping.
  const noSuperShopLeft = run.floor !== null && run.floor >= run.floors
    && ((stage === 'shop' && !(superShop && run.difficulty !== 'normal')) || stage === 'boss')
  const ctxRun = useMemo(() => (noSuperShopLeft ? { ...run, noSuperShopLeft } : run), [run, noSuperShopLeft])
  const ctx = useMemo(
    () => makeContext(gameData, teamIdentities, owned, { deployed, tiers, run: ctxRun, loadout, swaps }),
    [teamIdentities, owned, deployed, tiers, ctxRun, loadout, swaps],
  )
  // Event checks use the skills each sinner has now: after skill swaps, a skill swapped away
  // completely can't be rolled (Finley: Thumb Meursault had only Wrath skills left).
  const eventTeam = useMemo(
    () => (teamIdentities.length ? teamIdentities : ctx.members).map((i) => withSwaps(i, swaps[i.id])),
    [teamIdentities, ctx.members, swaps],
  )
  // Suggestions update live as gifts and identities change; nothing moves until you press Move.
  const lineup = useMemo(
    () => lineupSuggestions(gameData, teamIdentities, deployed, owned, tiers),
    [teamIdentities, deployed, owned, tiers],
  )
  const suggestions = lineup.suggestions.filter((s) => !dismissed.includes(s.id))
  const suggestedTo = Object.fromEntries(suggestions.map((s) => [s.sinner, s.to])) as Partial<Record<Sinner, number>>
  const focus = teamFocus(ctx.profile)
  const traitsOnTeam = [...ctx.profile.traitCounts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])
  const rankedGifts = useMemo(() => rankGifts(ctx), [ctx])
  // At the shop: gifts only this floor's pack has (now or never) ahead of ones any shop sells.
  const shopRanked = useMemo(() => shoppingOrder(rankedGifts, ctx, packsForGift), [rankedGifts, ctx, packsForGift])
  // The route over the whole run (packroute.ts) is internal: it orders the packs in view so one
  // that's about to stop showing up comes before one that will still be around later.
  const routeScoresAll = useMemo(() => (tab === 'packs' && ctx.profile.size && run.floor !== null ? routeScores(ctx) : []), [ctx, tab, run.floor])
  const { order: rankedPacks, advice: packAdvice } = useMemo(() => {
    const offeredPacks = offered.map((id) => packsById.get(id)).filter((p) => !!p)
    // Packs you've played on earlier floors can't be picked again this run.
    const played = playedPacks(run)
    const inView = offeredPacks.length ? offeredPacks
      : run.floor !== null
        ? gameData.themePacks.filter((p) => packOnFloor(p, run.difficulty, run.floor!) && !played.has(p.id))
        : gameData.themePacks.filter((p) => packInDifficulty(p, run.difficulty))
    return prioritizePacks(routeScoresAll, rankThemePacks(ctx, inView), run, offeredPacks.length > 0)
  }, [ctx, offered, packsById, run, routeScoresAll])
  const currentPack = run.pack ? packsById.get(run.pack) ?? null : null
  // Per pack: whether its "?" event nodes are worth walking into for this team (packevents.ts).
  const packEvents = useMemo(
    () => (tab === 'packs' && ctx.profile.size
      ? allPackEvents(gameData.themePacks, gameData.events ?? [], ctx, teamIdentities.length ? teamIdentities : ctx.members)
      : undefined),
    [ctx, tab, teamIdentities],
  )
  // Fights & events: the floor's pack at the top, with its events and gifts (as on Pick a pack).
  const currentPackScore = useMemo(
    () => (stage === 'fights' && currentPack ? rankThemePacks(ctx, [currentPack])[0] ?? null : null),
    [stage, currentPack, ctx],
  )
  const currentPackEvents = useMemo(() => {
    if (stage !== 'fights' || !currentPack || !ctx.profile.size) return undefined
    const team = teamIdentities.length ? teamIdentities : ctx.members
    const events = gameData.events ?? []
    return packEventsFor(currentPack, events, ctx, team, usualWorth(usualEvents(events, gameData.themePacks), ctx, team))
  }, [stage, currentPack, ctx, teamIdentities])
  // Gifts you can get on the floor you're on (shops, rewards, this floor's packs).
  const availableNow = useMemo(
    () => new Set(gameData.gifts.filter((g) => availability(g, ctx, packsForGift).where === 'now').map((g) => g.id)),
    [ctx, packsForGift],
  )
  // Gifts for your team lists only what this run can still give (Finley, 2026-11-15: an EXTREME-only
  // gift has no place in a 5-floor run); the rest can be shown on request.
  const [showUnreachable, setShowUnreachable] = useState(false)
  const reachable = useMemo(() => (tab !== 'best' ? null
    : rankedGifts.filter((r) => availability(r.gift, ctx, packsForGift).where !== 'no')), [tab, rankedGifts, ctx, packsForGift])
  // The Cost you have at the shop: buying, enhancing, swaps and refreshes marked here take their price
  // off (Finley, 2026-11-15). Nothing comes off until you've entered it.
  const [shopCost, setShopCost] = usePersistentState<number | null>('limbussite.cost.v1', null)
  const [costLog, setCostLog] = useState<CostChange[]>([])
  // What the shop charges you: Wealth makes gifts and enhancing 1 Cost, Prestige Card & co. 30% off.
  const shopPrices = pricesFor(ctx)
  const spend = (amount: number, label: string) => {
    if (!amount) return
    // Before the Cost is entered, the change is still listed (so it's clear nothing came off).
    if (shopCost !== null) setShopCost((c) => (c === null ? c : Math.max(0, c - amount)))
    setCostLog((l) => [{ key: Date.now() + Math.random(), amount, label, untracked: shopCost === null }, ...l].slice(0, 5))
  }
  /** Buying at the shop: the gift is yours and its price comes off. */
  const buy = (id: string) => {
    const g = ctx.giftsById.get(id)
    if (!g || ctx.owned.has(id)) return own(id)
    own(id)
    spend(shopPrices.gift(g) ?? 0, `Bought ${g.name}`)
  }
  /** Enhancing at the shop: each level up costs its Enhance price (a level taken back gives it back). */
  const shopSetEnhanced = (next: Record<string, number>) => {
    for (const id of new Set([...Object.keys(enhanced), ...Object.keys(next)])) {
      const g = ctx.giftsById.get(id)
      const from = enhanced[id] ?? 0
      const to = next[id] ?? 0
      if (!g || !ENHANCE_COST[g.tier ?? 0] || from === to) continue
      const price = shopPrices.enhance(g, from, to)
      spend(to > from ? price : -price, to > from ? `${g.name} to ${'+'.repeat(to)}` : `${g.name} back to ${'+'.repeat(to) || 'base'}`)
    }
    setEnhanced(next)
  }
  /** Skill swaps at the shop: each swap recorded costs its price (one taken back gives it back). */
  const shopSetSwaps = (next: SwapState, via: 'random' | 'search' = 'random') => {
    for (const id of new Set([...Object.keys(swaps), ...Object.keys(next)])) {
      const name = gameData.identities.find((i) => i.id === id)?.sinner ?? 'Swap'
      for (const sw of SWAPS) {
        const d = (next[id]?.[sw.kind] ?? 0) - (swaps[id]?.[sw.kind] ?? 0)
        // ID Skill Search (Super Shop): you pick the Sinner, at its own price (Trial Plan Guide doesn't lower it).
        if (d) spend(d * (via === 'search' ? sw.search : shopPrices.swap(sw.cost)), `${name}: skill ${sw.from} → ${sw.to}${via === 'search' ? ' (Skill Search)' : ''}${d < 0 ? ' taken back' : ''}`)
      }
    }
    setSwaps(next)
  }
  // The shop overview: buying, enhancing and skill swaps on one list (lib/shopoverview.ts).
  const shopOverview = useMemo(() => {
    if (tab !== 'shophome' || !teamIdentities.length) return []
    const owned = [...ctx.owned].map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g)
    const plans = planSwaps(teamIdentities.slice(0, deployed), swaps, owned, { egos: gameData.egos ?? [], loadout, run })
    return shopMoves(ctx, shopRanked, enhanced, availableNow, plans, { superShop: superShop && run.difficulty !== 'normal' })
  }, [tab, teamIdentities, deployed, swaps, ctx, loadout, run, shopRanked, enhanced, availableNow, superShop])
  // Fusing on the overview: free, so it comes first (recipes you can make, the best random fusions).
  const focusKey = focus.map((f) => f.keyword).join('|')
  const focusKeywords = useMemo(() => (focusKey ? focusKey.split('|') : []), [focusKey])
  const shopFusionAdvice = useMemo(() => (tab !== 'shophome' ? { recipes: [], ideas: [] }
    : shopFusions(ctx, owned, focusKeywords, currentPack ?? null, superShop && run.difficulty !== 'normal')),
  [tab, ctx, owned, focusKeywords, currentPack, superShop, run.difficulty])
  // The last move marked done on the overview, with what it changed, so it can be undone.
  const [lastMove, setLastMove] = useState<{ move: ShopMove; owned: string[]; enhanced: Record<string, number>; swaps: SwapState; cost: number | null } | null>(null)
  const undoMove = () => {
    if (!lastMove) return
    setOwned(lastMove.owned); setEnhanced(lastMove.enhanced); setSwaps(lastMove.swaps)
    if (lastMove.cost !== shopCost) {
      setShopCost(lastMove.cost)
      setCostLog((l) => l.slice(1))
    }
    setLastMove(null)
  }
  const doMove = (m: ShopMove) => {
    setLastMove({ move: m, owned, enhanced, swaps, cost: shopCost })
    if (m.kind === 'buy') buy(m.gift!.id)
    else if (m.kind === 'fuse') {
      let next = owned
      for (const g of m.uses ?? []) next = removeOne(next, g.id)
      addOwned(addGift(next, m.gift!.id, m.gift!.tier))
    }
    else if (m.kind === 'enhance') shopSetEnhanced({ ...enhanced, [m.gift!.id]: m.to! })
    else {
      const log = { ...(swaps[m.identity!.id] ?? {}) }
      log[m.swap!] = (log[m.swap!] ?? 0) + 1
      shopSetSwaps({ ...swaps, [m.identity!.id]: log }, m.pick ? 'search' : 'random')
    }
  }
  const ownedGifts = useMemo(() => [...ctx.owned].map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g), [ctx])

  // Cost to leave each floor with, from the Starlight buffs you took (Cumulating Starcloud).
  const keepCost = useMemo(() => starcloudKeep(prerun.buffs, run), [prerun.buffs, run])
  // The rest of what they do at shops and on entering floors (lib/buffeffects.ts).
  const ownedTiers = useMemo(() => owned.map((id) => ctx.giftsById.get(id)?.tier ?? 0), [owned, ctx.giftsById])
  const shopBuffs = useMemo(() => ({ freeRefreshes: freeRefreshes(prerun.buffs), onEntry: shopTierCost(prerun.buffs, ownedTiers)?.cost }),
    [prerun.buffs, ownedTiers])
  const shopBuffNotes = useMemo(() => shopNotes(prerun.buffs, run.floor ?? 1, ownedTiers), [prerun.buffs, run.floor, ownedTiers])
  const floorBuffNotes = useMemo(() => (run.floor === null ? [] : floorNotes(prerun.buffs, run.floor, prerun.keyword)),
    [prerun.buffs, run.floor, prerun.keyword])
  // A rare find (Wealth, a hidden pack's gift…) gets a celebration when you add it by hand: picking
  // a reward, buying, fusing, an event. Not for sync, backups, the demo team or screenshot imports.
  const [celebrate, setCelebrate] = usePersistentState<boolean>('limbussite.celebrate.v1', true)
  const [rare, setRare] = useState<RareFind | null>(null)
  const closeRare = useCallback(() => setRare(null), [setRare])
  const addOwned = (next: string[] | ((o: string[]) => string[])) => {
    const after = typeof next === 'function' ? next(owned) : next
    if (celebrate) {
      const before = new Set(owned)
      const found = rareFind(after.filter((id) => !before.has(id)), ctx, packsForGift)
      if (found) setRare(found)
    }
    setOwned(after)
  }
  const addMany = (ids: string[]) => addOwned((o) => ids.reduce((acc, id) => addGift(acc, id, ctx.giftsById.get(id)?.tier ?? null), o))
  const floorBuffBox = (
    <BuffNotes title={`Your Starlight buffs on floor ${run.floor}`} notes={floorBuffNotes} giftsById={ctx.giftsById} owned={owned} onAdd={addMany} />
  )
  const own = (id: string) => addOwned((o) => addGift(o, id, ctx.giftsById.get(id)?.tier ?? null))

  if (home) {
    return (
      <>
        <Welcome equipped={equipped} art={art} hasTeam={order.length > 0}
          counts={{ gifts: gameData.gifts.length, packs: gameData.themePacks.length, events: (gameData.events ?? []).length, identities: gameData.identities.length }}
          onDemo={loadDemo} onBuild={() => (setupState === null && unconfigured ? openSetup() : leaveHome(run.floor !== null ? 'team' : 'start'))}
          onContinue={() => leaveHome(tab)}
          onTour={startTour}
          onOpenData={() => setDataOpen(true)} />
        {syncDialogs}
      </>
    )
  }

  if (setupOpen) {
    return (
      <>
        <SetupWizard identities={gameData.identities} stored={myIdentities} onIdentitiesChange={setMyIdentities} art={art}
          egos={gameData.egos ?? []} storedEgos={myEgos} onEgosChange={setMyEgos}
          hasTeam={order.length > 0} onOpenData={() => setDataOpen(true)}
          onSkip={() => { if (setupState === null) setSetupState('skipped'); leaveHome('team') }}
          onFinish={(to) => { setSetupState('done'); if (to === 'demo') loadDemo(); else leaveHome('team') }} />
        {syncDialogs}
      </>
    )
  }

  // A new team needs a starting order; after that, only suggestions.
  const buildFor = (focus: Parameters<typeof buildTeam>[1], ownedOnly: boolean) => {
    const built = buildTeam(gameData, focus, ownedOnly && markedIds ? ownedIds : undefined, tiers)
    setTeam(built.team)
    const ids = SINNERS.map((s) => identitiesById.get(built.team[s] ?? '') ?? equipped[s])
    setSelection(suggestOrder(gameData, ids, deployed, owned, tiers).order)
  }
  const clearRun = () => {
    // Run data only: the team, E.G.O, saved lineups and settings stay.
    setOwned([])
    setEnhanced({})
    // Skill swaps only last the run (Finley: they were still there after clearing it).
    setSwaps({})
    setPrerun({ ...EMPTY_PRERUN, starlight: prerun.starlight })
    setOffered([])
    setDismissed([])
    setSuperShop(false)
    setRun({ ...run, floor: null, pack: null, visited: {} })
  }
  const formation = (
    <FormationBar selection={order} equipped={equipped} deployed={deployed} minDeployed={5} maxDeployed={7}
      suggested={suggestedTo} suggestionCount={suggestions.length} art={art}
      onSelectionChange={setSelection}
      onDeployedChange={setDeployed} onOpenTeam={() => setTab('team')} />
  )
  const lineupStrip = (
    <>
      <LineupTools presets={presets} onPresetsChange={setPresets} activeId={activePreset} onActiveChange={setActivePreset}
        current={currentTeam} selection={order} identities={gameData.identities}
        onApply={applyLineup}
        onManage={() => setManaging(true)} />
      {formation}
    </>
  )
  const subNav = SUB_TABS[stage] && (
    <nav className="tabs sub-tabs" role="tablist" aria-label={STAGES[STAGE_INDEX[stage]]?.label}>
      {SUB_TABS[stage]!.map((t) => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'}
          onClick={() => setTab(t.id)}>{t.label}</button>
      ))}
    </nav>
  )

  // The Boss screen: the floor's boss event, if the wiki has one (others on request).
  const bossEvents = stage === 'boss' && currentPack ? eventsForPack(gameData.events ?? [], currentPack).filter((e) => e.boss) : []
  // Next phase: through the floor, then on to the next one.
  const hasShop = currentPack?.layout?.shop !== false
  const toTop = () => window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
  // The Run button: back to where you were in the run, or the start questions if there's no run.
  const openRun = () => {
    if (run.floor === null) { setTab('start'); return }
    if (lastRunTab) setTab(lastRunTab)
    else openStage(run.pack ? 'fights' : 'packs')
  }
  const backToRun = { label: 'Back to the run', sub: `Floor ${run.floor}`, go: () => { openRun(); toTop() } }
  const next: { label: string; sub?: string; go: () => void } | null = (() => {
    const f = run.floor
    switch (tab) {
      case 'team': case 'identities': case 'settings':
        if (buildingForRun) return { label: 'Use this lineup', sub: 'Back to the run setup', go: () => { setBuildingForRun(false); setTab('start'); toTop() } }
        return f === null
          ? { label: 'Start a run', sub: 'Pick a lineup and difficulty', go: () => { setTab('start'); toTop() } }
          : backToRun
      case 'start':
        return { label: 'Next: Before the run', sub: 'Starlight buffs and starting gifts', go: () => { setTab('prerun'); toTop() } }
      case 'prerun': return f === null
        ? { label: 'Start the run', sub: 'Floor 1: pick a pack', go: () => { setRun(withFloor(run, 1)); setLastRunTab(null); openStage('packs'); toTop() } }
        : backToRun
    }
    switch (stage) {
      case 'packs': return { label: 'Next: Fights & events', sub: currentPack ? currentPack.name : 'Pick your pack in the bar first',
        go: () => { openStage('fights'); toTop() } }
      case 'fights': return hasShop
        ? { label: 'Next: Shop', go: () => { openStage('shop'); toTop() } }
        : { label: 'Next: Boss', sub: `${currentPack!.name} has no shop`, go: () => { openStage('boss'); toTop() } }
      case 'shop': return { label: 'Next: Boss', go: () => { openStage('boss'); toTop() } }
      case 'boss':
        if (f === null) return { label: 'Start a run', go: () => { setTab('start'); toTop() } }
        if (f < run.floors) return { label: `Floor ${f} cleared`, sub: `On to floor ${f + 1}`, go: () => {
          setRun(withFloor(run, f + 1))
          setOffered([])
          setBossSearch(false)
          setCleared((c) => ({ key: (c?.key ?? 0) + 1, title: `Floor ${f} cleared`, sub: `Floor ${f + 1} of ${run.floors}` }))
          openStage('packs')
          toTop()
        } }
        return { label: 'Finish the run', sub: `Floor ${f} was the last`, go: () => {
          setRun(withFloor(run, null))
          // The game puts skills back when the run ends; gifts stay here until Clear run, to look back on.
          setSwaps({})
          setLastRunTab(null)
          setCleared((c) => ({ key: (c?.key ?? 0) + 1, title: 'Run cleared', sub: 'Skill swaps are reset; your gifts stay until you Clear run' }))
          openStage('home')
          toTop()
        } }
      default: return null
    }
  })()
  const focusLine = <TeamFocus focus={focus} traits={traitsOnTeam} size={ctx.profile.size} deployedOnly={order.length > deployed} deployed={deployed}
    onOpenTeam={() => setTab('team')} />

  const dataNote = (
    <>
      {gameData.gifts.length} gifts · {gameData.themePacks.length} theme packs · {gameData.identities.length} identities · {(gameData.events ?? []).length} events · data from the{' '}
      <a href="https://limbuscompany.wiki.gg/" target="_blank" rel="noreferrer">Limbus Company Wiki</a>
      {gameData.generatedAt && <>, {new Date(gameData.generatedAt).toLocaleDateString()}</>}. A fan project, not affiliated with Project Moon.
    </>
  )
  const inRun = run.floor !== null
  const runStage = stage === 'packs' || stage === 'fights' || stage === 'shop' || stage === 'boss' || stage === 'yourgifts'
  const homeSub = (
    <nav className="tabs sub-tabs home-tabs" role="tablist" aria-label="Home">
      {SUB_TABS.home!.map((t) => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'}
          data-tour={`tab-${t.id}`} onClick={() => setTab(t.id)}>{t.label}</button>
      ))}
    </nav>
  )
  const startStep = START_STEPS.findIndex((x) => x.id === tab)

  return (
    <div className="app">
      <header className="top">
        <button className="top-home" data-tour="title" onClick={() => { setHome(true); window.scrollTo(0, 0) }} title="Back to the home page">
          <h1>GesellschaftMD</h1>
          <p className="sub">Mirror Dungeon planner</p>
        </button>
        <nav className="main-nav" aria-label="Main">
          <button className={`main-nav-btn${stage === 'home' ? ' on' : ''}`} aria-current={stage === 'home' ? 'page' : undefined}
            data-tour="home-nav" onClick={() => { setBuildingForRun(false); openStage('home') }}>
            <b>Home</b><small>Team, identities, settings</small>
          </button>
          <button className={`main-nav-btn${stage === 'rankings' ? ' on' : ''}`} aria-current={stage === 'rankings' ? 'page' : undefined}
            data-tour="rankings-nav" onClick={() => { setBuildingForRun(false); openStage('rankings') }}>
            <b>Rankings</b><small>Best gifts and identities</small>
          </button>
          <button className={`main-nav-btn run${stage === 'start' || runStage ? ' on' : ''}${inRun ? ' live' : ''}`}
            aria-current={stage === 'start' || runStage ? 'page' : undefined}
            data-tour="run-nav" onClick={() => { setBuildingForRun(false); openRun() }}>
            <b>{inRun ? 'Your run' : 'Start a run'}</b>
            <small>{inRun ? `Floor ${run.floor} of ${run.floors}${currentPack ? ` · ${currentPack.name}` : ''}` : 'Lineup, Starlight, first gifts'}</small>
          </button>
        </nav>
        <div className="top-right">
          <span data-tour="sync"><SyncButton onOpen={() => setDataOpen(true)} /></span>
        </div>
      </header>
      {syncDialogs}
      {rare && <Celebration key={rare.gift.id + rare.why} find={rare} onDone={closeRare} />}
      {touring && <Tour steps={TOUR} onOpenTab={(t) => { setBuildingForRun(false); setTab(t) }} onClose={() => { setTouring(false); setTab('team'); window.scrollTo(0, 0) }} />}

      {managing && (
        <Dialog title="Saved lineups" onClose={() => setManaging(false)}>
          <PresetBox presets={presets} onPresetsChange={setPresets} activeId={activePreset} onActiveChange={setActivePreset}
            current={currentTeam} selection={order} onApply={applyLineup} identities={gameData.identities} art={art} />
        </Dialog>
      )}
      {runOpen && (
        <Dialog title="Run settings" onClose={() => setRunOpen(false)}>
          <RunPanel run={run} onChange={setRun} packs={gameData.themePacks} ranked={rankedGifts} ctx={ctx} showCost={false}
            onClearRun={clearRun} />
        </Dialog>
      )}
      {giftsOpen && (
        <Dialog title="Gifts you have" onClose={() => setGiftsOpen(false)}>
          <OwnedGifts gifts={gameData.gifts} owned={owned} onChange={addOwned} />
          <p className="small"><button className="link-btn" onClick={() => { setGiftsOpen(false); setTab('import') }}>
            Import gifts from a screenshot →</button></p>
        </Dialog>
      )}

      {stage === 'home' && homeSub}
      {stage === 'rankings' && (
        <nav className="tabs sub-tabs home-tabs" role="tablist" aria-label="Rankings">
          {SUB_TABS.rankings!.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'}
              data-tour={`tab-${t.id}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
      )}
      {stage === 'home' && buildingForRun && (
        <div className="building-banner">
          <span><b>Setting up a lineup for your run.</b> Pick identities and the deployment order, then use it.</span>
          <span className="building-banner-btns">
            <button className="btn primary small-btn" onClick={() => { setBuildingForRun(false); setTab('start') }}>Use this lineup</button>
            <button className="link-btn" onClick={() => { setBuildingForRun(false); setTab('start') }}>Cancel</button>
          </span>
        </div>
      )}
      {stage === 'home' && inRun && !buildingForRun && tab === 'team' && (
        <p className="hint home-run-note">
          You're on floor {run.floor} of a run: changes to your team here change the team the run is planned for.
        </p>
      )}

      {stage === 'start' && (
        <nav className="start-steps" aria-label="Starting a run">
          {START_STEPS.map((x, k) => (
            <button key={x.id} className={`start-step${k === startStep ? ' on' : ''}${k < startStep ? ' done' : ''}`}
              aria-current={k === startStep ? 'step' : undefined} onClick={() => setTab(x.id)}>
              <span className="start-step-n">{k < startStep ? '✓' : k + 1}</span>{x.label}
            </button>
          ))}
          <span className={`start-step${inRun ? ' done' : ' later'}`}>
            <span className="start-step-n">{inRun ? '✓' : 3}</span>{inRun ? `In the run: floor ${run.floor}` : 'Floor 1: pick a pack'}
          </span>
          {inRun && <button className="link-btn start-back" onClick={openRun}>← Back to the run</button>}
        </nav>
      )}

      {runStage && (
        <>
          <RunBar run={run} onChange={setRun} packs={gameData.themePacks} giftCount={owned.length}
            onOpenSettings={() => setRunOpen(true)} onOpenGifts={stage === 'shop' ? undefined : () => setGiftsOpen(true)}
            onOpenSetup={() => setTab('start')} onStart={() => setTab('start')} />
          <StageNav stage={stage as RunStage | 'yourgifts'} lastRun={lastRunTab ? STAGE_OF[lastRunTab] as RunStage : null} inRun={inRun} floor={run.floor}
            noShop={!hasShop ? currentPack?.name ?? null : null} onOpen={openStage} />
        </>
      )}

      {stage === 'yourgifts' && (
        <nav className="tabs sub-tabs home-tabs" role="tablist" aria-label="Gifts for your team">
          {SUB_TABS.yourgifts!.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'}
              data-tour={`tab-${t.id}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
      )}

      <div role="tabpanel" key={stage === 'home' || stage === 'start' || stage === 'rankings' || stage === 'yourgifts' ? tab : stage} className={`phase phase-${direction}`}>
        {tab === 'team' && (
          <>
            {lineupStrip}
            <TeamTab
              identities={gameData.identities} equipped={equipped} selection={order} deployed={deployed}
              art={art} onArtChange={setArt}
              egos={gameData.egos ?? []} loadout={loadout} onLoadoutChange={setLoadout} battle={ctx.battle}
              gifts={gameData.gifts} owned={ctx.owned}
              suggestions={suggestions} info={lineup.info}
              dismissedCount={lineup.suggestions.length - suggestions.length}
              onApply={(sug) => setSelection(moveTo(order, sug.sinner, sug.to))}
              onDismiss={(sug) => setDismissed((d) => [...d, sug.id])}
              onRestoreDismissed={() => setDismissed([])}
              onToggle={(s) => setSelection(order.includes(s) ? order.filter((x) => x !== s) : [...order, s])}
              onEquip={(s, id) => setTeam({ ...team, [s]: id })}
              onClear={() => setSelection([])}
              onSelectAll={() => setSelection([...order, ...SINNERS.filter((s) => !order.includes(s))])}
              onDeployedChange={setDeployed}
              ownedCount={ownedIds.size}
              onOpenMyIdentities={() => setTab('identities')}
              ownedIdentities={markedIds ? ownedIds : null} ownedEgos={ownedEgoIds} ownedTeams={ownedTeams}
              onBuild={(focus, ownedOnly) => buildFor(focus, ownedOnly)}
              onBuildOwned={(focus) => buildFor(focus, true)}
            />
          </>
        )}
        {(tab === 'rank-gifts' || tab === 'rank-ids' || tab === 'rank-egos') && (
          <RankingsPage view={tab === 'rank-gifts' ? 'gifts' : tab === 'rank-egos' ? 'egos' : 'identities'} data={gameData} ownedIdentities={ownedIds}
            hasMarked={markedIds} ownedEgos={ownedEgoIds} art={art} onOpenMyIdentities={() => setTab('identities')} />
        )}
        {tab === 'identities' && (
          <MyCollection identities={gameData.identities} storedIdentities={myIdentities} onIdentitiesChange={setMyIdentities}
            egos={gameData.egos ?? []} storedEgos={myEgos} onEgosChange={setMyEgos} art={art} onOpenData={() => setDataOpen(true)} />
        )}
        {tab === 'settings' && (
          <SettingsPage celebrate={celebrate} onCelebrateChange={setCelebrate}
            onPreviewCelebration={(style) => {
              const g = gameData.gifts.find((x) => (style === 'coins' ? rareStyle(x) === 'coins' : (x.tier ?? 0) >= 6 && rareStyle(x) === 'stars'))
              if (g) setRare({ gift: g, style, why: 'A preview: this shows when you get a gift only luck gives.' })
            }}
            art={art} onArtChange={setArt} onOpenData={() => setDataOpen(true)} onSetup={openSetup}
            onTour={() => { setTab('team'); setTouring(true) }} dataNote={dataNote} />
        )}

        {tab === 'start' && (
          <StartRun presets={presets} activeId={activePreset} current={currentTeam} selection={order} deployed={deployed}
            identities={gameData.identities} art={art} run={run} onRunChange={setRun}
            onUse={useLineupForRun}
            onUseCurrent={() => setActivePreset(presets.find((p) => presetMatches(p, currentTeam, order))?.id ?? null)}
            onNewLineup={() => {
              keepCurrent()
              setTeam({})
              setSelection([])
              setActivePreset(null)
              setBuildingForRun(true)
              setTab('team')
              toTop()
            }}
            onEditTeam={() => { setBuildingForRun(true); setTab('team'); toTop() }} />
        )}

        {tab === 'prerun' && (
          <div className="stage-main">
            {focusLine}
            <PreRunTab ctx={ctx} packsForGift={packsForGift} rebuild={rebuildCtx} state={prerun} onStateChange={setPrerun}
              onOwn={own} inRun={run.floor !== null} />
          </div>
        )}

        {tab === 'packs' && (
          <div className="stage-main">
            {floorBuffBox}
            {focusLine}
            <PackList advice={packAdvice} events={packEvents} allPacks={gameData.themePacks} ranked={rankedPacks}
              offered={offered.filter((id) => packsById.has(id))} onOfferedChange={setOffered}
              run={run} onPickPack={(id) => setRun(withPack(run, id))}
              packsForGift={packsForGift} giftsById={ctx.giftsById} owned={ctx.owned} />
          </div>
        )}

        {stage === 'shop' && (
          <div className="layout">
            <aside className="side">
              <CostNow cost={shopCost} onChange={setShopCost} log={costLog} discounts={shopPrices.discounts} />
              <section className="panel"><CostBox run={run} ranked={rankedGifts} ctx={ctx} keep={keepCost} buffs={shopBuffs} start={startingCost(prerun.buffs)} /></section>
              <OwnedGifts gifts={gameData.gifts} owned={owned} onChange={addOwned} />
            </aside>
            <main className="main">
              <BuffNotes title="Your Starlight buffs at this shop" notes={shopBuffNotes} giftsById={ctx.giftsById} owned={owned} onAdd={addMany} />
              {tab !== 'shophome' && <ShopAdvice ctx={ctx} ranked={shopRanked} levels={enhanced} availableNow={availableNow} tab={tab} onOpen={setTab} keep={keepCost} cost={shopCost} />}
              {subNav}
              {tab === 'shophome' && (
                <ShopOverview moves={shopOverview} hasTeam={teamIdentities.length > 0} hasGifts={owned.length > 0} keep={keepCost}
                  floorsLeft={floorsWeight(run).floorsLeft} onOpen={setTab} onOpenTeam={() => setTab('team')} onDone={doMove}
                  justDone={lastMove?.move ?? null} onUndo={undoMove} cost={shopCost} onCostChange={setShopCost}
                  fusions={shopFusionAdvice}
                  refresh={{ ctx, ranked: shopRanked, availableNow, buffs: prerun.buffs, superShop: superShop && run.difficulty !== 'normal', onSuperShopChange: setSuperShop, onSpend: spend }} />
              )}
              {tab === 'gifts' && (
                <>
                  {focusLine}
                  <PlanPanel ctx={ctx} ranked={rankedGifts} packsForGift={packsForGift} onOwn={buy} prices={shopPrices} />
                  <GiftList ranked={shopRanked} packsForGift={packsForGift} packs={gameData.themePacks} availableNow={availableNow}
                    teamKeywords={focus.map((f) => f.keyword)} initialFilter={run.floor === null ? 'team' : 'now'}
                    onOwn={buy} prices={shopPrices} giftsById={ctx.giftsById} owned={ctx.owned} />
                </>
              )}
              {tab === 'fusion' && (
                <FusionTab ctx={ctx} owned={owned} onOwnedChange={addOwned} run={run} pack={currentPack}
                  teamKeywords={focus.map((f) => f.keyword)} packsForGift={packsForGift}
                  superShop={superShop} onSuperShopChange={setSuperShop} />
              )}
              {tab === 'upgrades' && <UpgradesTab ctx={ctx} levels={enhanced} onLevelsChange={shopSetEnhanced} ranked={rankedGifts} keep={keepCost}
                cost={shopCost} onCostChange={setShopCost} />}
              {tab === 'skills' && (
                <SkillsTab team={teamIdentities.slice(0, deployed)} backups={teamIdentities.slice(deployed)} swaps={swaps} onSwapsChange={shopSetSwaps} superShop={superShop && run.difficulty !== 'normal'} owned={ownedGifts} art={art}
                  egos={gameData.egos ?? []} loadout={loadout} run={run} battle={ctx.battle} onOpenTeam={() => setTab('team')} />
              )}
            </main>
          </div>
        )}

        {stage === 'fights' && (
          <div className="stage-main">
            {currentPackScore ? (
              <CurrentPack pack={currentPackScore} events={currentPackEvents} floor={run.floor}
                packsForGift={packsForGift} giftsById={ctx.giftsById} owned={ctx.owned} onChange={() => { openStage('packs'); toTop() }} />
            ) : (
              <p className="panel current-pack-none">
                Pick this floor's theme pack to see which of its "?" events to go for and the gifts it has for your team.{' '}
                <button className="link-btn" onClick={() => { openStage('packs'); toTop() }}>Pick a pack</button>
              </p>
            )}
            {floorBuffBox}
            {formation}
            {/* After a fight the reward card's gift is random (no choice to compare), so this screen
                is for adding what you got, and the "?" events. */}
            <PickupBox gifts={gameData.gifts} owned={owned} onChange={addOwned} />
            <EventsTab ctx={ctx} events={gameData.events ?? []} team={eventTeam} pack={currentPack}
              owned={owned} onOwnedChange={addOwned} />
          </div>
        )}

        {stage === 'boss' && (
          <div className="stage-main">
            {formation}
            {bossEvents.length > 0 || bossSearch ? (
              <EventsTab kind="boss" ctx={ctx} events={gameData.events ?? []} team={eventTeam} pack={currentPack}
                owned={owned} onOwnedChange={addOwned} />
            ) : (
              <p className="panel boss-note">
                {currentPack ? <>No boss event is known for <b>{currentPack.name}</b>: just fight it.</> : 'Pick the floor\'s pack in the bar above to see if its boss has an event.'}{' '}
                <button className="link-btn" onClick={() => setBossSearch(true)}>Look up a boss event</button>
              </p>
            )}
            <RewardPicker key={`${run.floor}-${run.pack}`} ctx={ctx} gifts={gameData.gifts} owned={owned} onOwnedChange={addOwned}
              preset={currentPack?.clear_rewards ?? []} picks={run.difficulty === 'normal' ? 1 : 2}
              title="Boss reward gifts"
              hint={`Each pack shows the gifts you can choose after its boss (on the pack select screen too). Add the ones offered and they're ranked for your team; you pick ${run.difficulty === 'normal' ? 'one' : 'two on Hard'}. Then press the button below to go to the next floor.`} />
            <PickupBox gifts={gameData.gifts} owned={owned} onChange={addOwned} />
          </div>
        )}

        {tab === 'best' && (
          <div className="best-gifts">
            <p className="muted small">
              Every gift ranked for your team and this run right now, wherever it comes from: shops, theme packs, events or fusing.
              It updates as your team, the gifts you have and the floor change. Open one to see why it ranks there and how to get it.
              For what to buy right now, use the Shop; for the best gifts for any team, see Rankings.
            </p>
            {focusLine}
            {reachable && reachable.length < rankedGifts.length && (
              <p className="muted small unreachable-note">
                {showUnreachable
                  ? <>Showing all gifts, including {rankedGifts.length - reachable.length} this run can't give.</>
                  : <>{rankedGifts.length - reachable.length} gifts this run can't give are hidden ({run.difficulty === 'extreme' ? 'EXTREME' : run.difficulty === 'hard' ? 'Hard' : 'Normal'}, {run.floors} floors
                    {run.floor !== null ? `, from floor ${run.floor}` : ''}): theme packs that don't show up on your floors, packs you've played, and fusions that need them.</>}
                {' '}<button className="link-btn" onClick={() => setShowUnreachable(!showUnreachable)}>{showUnreachable ? 'Hide them' : 'Show them'}</button>
              </p>
            )}
            <GiftList ranked={showUnreachable || !reachable ? rankedGifts : reachable} packsForGift={packsForGift} packs={gameData.themePacks} availableNow={availableNow}
              teamKeywords={focus.map((f) => f.keyword)}
              onOwn={own} giftsById={ctx.giftsById} owned={ctx.owned} />
          </div>
        )}
        {tab === 'evaluate' && <EvaluateTab ctx={ctx} packsForGift={packsForGift} />}
        {tab === 'import' && <ImportTab gifts={gameData.gifts} owned={owned} onOwnedChange={setOwned} />}
      </div>

      {next && (
        <div className="next-phase-wrap">
          <button className={`next-phase${stage === 'boss' ? ' floor-clear' : ''}`} onClick={next.go}>
            <span className="next-text"><b>{next.label}</b>{next.sub && <small>{next.sub}</small>}</span>
            <span className="next-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      )}
      {cleared && <ClearedToast key={cleared.key} title={cleared.title} sub={cleared.sub} onDone={() => setCleared(null)} />}

      <footer className="foot">{dataNote}</footer>
    </div>
  )
}

/** Your team's keywords and affiliations in one line (Pick a pack, Shop > Buy). */
function TeamFocus({ focus, traits, size, deployedOnly, deployed, onOpenTeam }: {
  focus: { keyword: string; share: number; count: number }[]
  traits: [string, number][]
  size: number
  deployedOnly: boolean
  deployed: number
  onOpenTeam: () => void
}) {
  if (focus.length === 0 && traits.length === 0) {
    return (
      <p className="team-focus hint">
        <button className="link-btn" onClick={onOpenTeam}>Pick your team</button> to get recommendations: they're based on
        the status keywords your deployed sinners use and on gifts built for their affiliations.
      </p>
    )
  }
  return (
    <div className="team-focus" title={deployedOnly ? `Your deployed sinners (#1–#${deployed})` : undefined}>
      <span className="muted">Your team</span>
      {focus.map((f) => (
        <span key={f.keyword} className="team-focus-kw"><KeywordChip keyword={f.keyword} /> <span className="muted">{f.count}/{size}</span></span>
      ))}
      {traits.slice(0, 3).map(([t, n]) => <span key={t} className="trait">{t} ×{n}</span>)}
    </div>
  )
}

/** A modal panel (Saved lineups): closes on Escape, the ✕ or a click outside. */
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="picker-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="picker-scroll dialog-body">{children}</div>
      </div>
    </div>
  )
}

/** "Floor 3 cleared": a short banner between floors. */
function ClearedToast({ title, sub, onDone }: { title: string; sub: string; onDone: () => void }) {
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })
  useEffect(() => {
    const t = setTimeout(() => done.current(), reducedMotion() ? 1800 : 2400)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="cleared" role="status" onClick={onDone}>
      <div className="cleared-card">
        <span className="cleared-line" aria-hidden="true" />
        <b>{title}</b>
        <small>{sub}</small>
      </div>
    </div>
  )
}

function reducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** The four screens of a floor as cards; earlier ones get a ✓ during a run. */
function StageNav({ stage, inRun, floor, noShop, lastRun, onOpen }: {
  stage: RunStage | 'yourgifts'
  inRun: boolean
  floor: number | null
  /** The floor's pack, when it has no shop. */
  noShop: string | null
  /** The run step you were last on (for the ✓ marks while Best gifts is open). */
  lastRun: RunStage | null
  onOpen: (s: RunStage | 'yourgifts') => void
}) {
  const ref = useRef<HTMLElement>(null)
  // On a phone the cards scroll sideways: keep the current one in view.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.stage.active')
    const nav = ref.current
    if (el && nav && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: el.offsetLeft - nav.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' })
  }, [stage])
  const here = STAGES.findIndex((s) => s.id === (stage === 'yourgifts' ? lastRun : stage))
  return (
    <nav className="stages" role="tablist" aria-label="Where you are in the run" ref={ref}>
      {STAGES.map((s, k) => {
        const done = inRun && k < here
        const skipped = s.id === 'shop' && noShop !== null
        return (
          <button key={s.id} role="tab" aria-selected={stage === s.id}
            className={`stage${stage === s.id ? ' active' : ''}${done ? ' done' : ''}${skipped ? ' skipped' : ''}`}
            title={skipped ? `${noShop} has no shop` : undefined}
            onClick={() => onOpen(s.id)}>
            <span className="stage-n">{done ? '✓' : k + 1}</span>
            <span className="stage-text">
              <b>{s.label}
                {s.id === 'packs' && floor !== null && <span className="badge">F{floor}</span>}
                {skipped && <span className="badge muted-badge">none</span>}</b>
              <small>{s.hint}</small>
            </span>
          </button>
        )
      })}
      {/* Not a step: something to check at any point in the run (Finley, 2026-11-15). */}
      <span className="stages-sep" aria-hidden="true" />
      <button role="tab" aria-selected={stage === 'yourgifts'} data-tour="your-gifts"
        className={`stage stage-side${stage === 'yourgifts' ? ' active' : ''}`} onClick={() => onOpen('yourgifts')}>
        <span className="stage-n" aria-hidden="true">★</span>
        <span className="stage-text"><b>Gifts for your team</b><small>Ranked, check one, import</small></span>
      </button>
    </nav>
  )
}
