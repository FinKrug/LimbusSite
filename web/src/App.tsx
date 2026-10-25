import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EvaluateTab } from './components/EvaluateTab'
import { EventsTab } from './components/EventsTab'
import { ImportTab } from './components/ImportTab'
import { UpgradesTab } from './components/UpgradesTab'
import { Welcome } from './components/Welcome'
import { FusionTab } from './components/FusionTab'
import { GiftList } from './components/GiftList'
import { OwnedGifts } from './components/OwnedGifts'
import { PlanPanel } from './components/PlanPanel'
import { LineupTools, PresetBox } from './components/PresetBox'
import { availability } from './lib/plan'
import { PackList } from './components/PackList'
import { prioritizePacks, routeScores } from './lib/packroute'
import { allPackEvents } from './lib/packevents'
import { FormationBar } from './components/FormationBar'
import { CostBox, RunPanel } from './components/RunPanel'
import { RunBar } from './components/RunBar'
import { SkillsTab } from './components/SkillsTab'
import { SyncButton, SyncDialogs } from './components/SyncPanel'
import { TeamTab } from './components/TeamTab'
import { KeywordChip } from './components/bits'
import { gameData } from './lib/data'
import {
  DEFAULT_RUN, defaultFloors, makeContext, withPack, packInDifficulty, playedPacks, packOnFloor, packsByGift, rankGifts, rankThemePacks, teamFocus,
  type Difficulty, type RunSettings,
} from './lib/scoring'
import { DEFAULT_DEPLOYED } from './lib/lineup'
import { usePersistentState } from './lib/storage'
import { sync } from './lib/sync'
import type { SummaryLookups } from './lib/transfer'
import { makePreset, presetMatches, restoreSelection, restoreTeam, validPresets, type Equipped, type TeamPreset } from './lib/presets'
import type { TierOverrides } from './lib/strength'
import type { ArtVariant } from './lib/images'
import { lineupSuggestions, moveTo } from './lib/ordering'
import type { SwapState } from './lib/skillswap'
import type { EgoLoadout } from './lib/ego'
import { buildTeam, suggestOrder } from './lib/teambuilder'
import { addGift } from './lib/vestiges'
import { SINNERS, type Gift, type Identity, type Sinner } from './lib/types'

type Tab = 'team' | 'gifts' | 'packs' | 'fusion' | 'upgrades' | 'events' | 'evaluate' | 'skills' | 'import'
const TABS: Tab[] = ['team', 'gifts', 'packs', 'fusion', 'upgrades', 'events', 'evaluate', 'skills', 'import']

/**
 * The site follows a Mirror Dungeon run: set up your team, pick a pack, then whatever
 * the floor throws at you (a shop, an event, a battle). Each screen shows only what
 * that moment needs. Evaluate and Import gifts are in the Tools menu.
 */
type Stage = 'team' | 'packs' | 'shop' | 'event' | 'battle' | 'tools'
const STAGE_OF: Record<Tab, Stage> = {
  team: 'team', packs: 'packs', gifts: 'shop', fusion: 'shop', upgrades: 'shop', events: 'event', skills: 'battle',
  evaluate: 'tools', import: 'tools',
}
const STAGES: { id: Stage; tab: Tab; label: string; hint: string }[] = [
  { id: 'team', tab: 'team', label: 'Team', hint: 'Before the run' },
  { id: 'packs', tab: 'packs', label: 'Pick a pack', hint: 'Theme pack for the floor' },
  { id: 'shop', tab: 'gifts', label: 'Shop', hint: 'Buy, fuse, enhance' },
  { id: 'event', tab: 'events', label: 'Event', hint: 'What to choose' },
  { id: 'battle', tab: 'skills', label: 'Battle', hint: 'Lineup and skill swaps' },
]
type ShopTab = 'gifts' | 'fusion' | 'upgrades'
const SHOP_TABS: { id: ShopTab; label: string }[] = [
  { id: 'gifts', label: 'Buy' }, { id: 'fusion', label: 'Fuse' }, { id: 'upgrades', label: 'Enhance' },
]
const TOOL_LABEL = { evaluate: 'Evaluate a gift or pack', import: 'Import gifts from a screenshot' }
const TOOL_HINT = { evaluate: 'Pros and cons of one gift or theme pack for your team', import: 'Read Gifts you have from game screenshots' }

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
  /** Upgrade level of gifts you've enhanced this run (Upgrades tab). */
  const [enhanced, setEnhanced] = usePersistentState<Record<string, number>>('limbussite.enhanced.v1', {})
  const [offered, setOffered] = usePersistentState<string[]>('limbussite.offered.v1', [])
  const [firstRun] = useState(legacyRun)
  const [run, setRun] = usePersistentState<RunSettings>('limbussite.run.v1', firstRun)
  const [storedTab, setStoredTab] = usePersistentState<string>('limbussite.tab.v1', 'team')
  const tab: Tab = storedTab === 'fusions' ? 'fusion' : (TABS as string[]).includes(storedTab) ? storedTab as Tab : 'team'
  const stage = STAGE_OF[tab]
  // The Shop opens on the part you used last; Tools' Back returns to the last run screen.
  const [shopTab, setShopTab] = usePersistentState<ShopTab>('limbussite.shoptab.v1', stage === 'shop' ? tab as ShopTab : 'gifts')
  const [lastStageTab, setLastStageTab] = useState<Tab>(stage === 'tools' ? 'team' : tab)
  const setTab = (t: Tab) => {
    if (STAGE_OF[t] === 'shop') setShopTab(t as ShopTab)
    if (STAGE_OF[t] !== 'tools') setLastStageTab(t)
    setStoredTab(t)
  }
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
  // Your data: cloud sync and backup files (SyncPanel.tsx).
  const [dataOpen, setDataOpen] = useState(false)
  const lookups = useMemo<SummaryLookups>(() => ({
    identities: identitiesById,
    gifts: new Map(gameData.gifts.map((g) => [g.id, g])),
    packs: packsById,
  }), [identitiesById, packsById])
  useEffect(() => sync.init(lookups), [lookups])
  const syncDialogs = <SyncDialogs open={dataOpen} onClose={() => setDataOpen(false)} look={lookups} />
  // Welcome screen: first visit, or the LimbusSite title.
  const [home, setHome] = useState(firstVisit)
  const [, setWelcomed] = usePersistentState<boolean>('limbussite.welcomed.v1', false)
  const leaveHome = (to: Tab) => { setHome(false); setWelcomed(true); setTab(to); window.scrollTo(0, 0) }
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
  const ctx = useMemo(
    () => makeContext(gameData, teamIdentities, owned, { deployed, tiers, run, loadout, swaps }),
    [teamIdentities, owned, deployed, tiers, run, loadout, swaps],
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
  // Gifts you can get on the floor you're on (shops, rewards, this floor's packs).
  const availableNow = useMemo(
    () => new Set(gameData.gifts.filter((g) => availability(g, ctx, packsForGift).where === 'now').map((g) => g.id)),
    [ctx, packsForGift],
  )
  const ownedGifts = useMemo(() => [...ctx.owned].map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g), [ctx])

  const own = (id: string) => setOwned((o) => addGift(o, id, ctx.giftsById.get(id)?.tier ?? null))

  if (home) {
    return (
      <>
        <Welcome equipped={equipped} art={art} hasTeam={order.length > 0}
          counts={{ gifts: gameData.gifts.length, packs: gameData.themePacks.length, events: (gameData.events ?? []).length, identities: gameData.identities.length }}
          onDemo={loadDemo} onBuild={() => leaveHome('team')} onContinue={() => leaveHome(tab)}
          onOpenData={() => setDataOpen(true)} />
        {syncDialogs}
      </>
    )
  }

  const clearRun = () => {
    // Run data only: the team, E.G.O, saved lineups and settings stay.
    setOwned([])
    setEnhanced({})
    setOffered([])
    setDismissed([])
    setSuperShop(false)
    setRun({ ...run, floor: null, pack: null, visited: {} })
  }
  const lineupStrip = (
    <>
      <LineupTools presets={presets} onPresetsChange={setPresets} activeId={activePreset} onActiveChange={setActivePreset}
        current={currentTeam} selection={order} identities={gameData.identities}
        onApply={applyLineup}
        onManage={() => setManaging(true)} />
      <FormationBar selection={order} equipped={equipped} deployed={deployed} minDeployed={5} maxDeployed={7}
        suggested={suggestedTo} suggestionCount={suggestions.length} art={art}
        onSelectionChange={setSelection}
        onDeployedChange={setDeployed} onOpenTeam={() => setTab('team')} />
    </>
  )
  const focusLine = <TeamFocus focus={focus} traits={traitsOnTeam} size={ctx.profile.size} deployedOnly={order.length > deployed} deployed={deployed}
    onOpenTeam={() => setTab('team')} />

  return (
    <div className="app">
      <header className="top">
        <button className="top-home" onClick={() => { setHome(true); window.scrollTo(0, 0) }} title="Back to the welcome screen">
          <h1>LimbusSite</h1>
          <p className="sub">Mirror Dungeon E.G.O gift planner</p>
        </button>
        <div className="top-right">
          <ToolsMenu current={tab} onPick={(t) => setTab(t)} />
          <SyncButton onOpen={() => setDataOpen(true)} />
        </div>
      </header>
      {syncDialogs}

      <nav className="stages" role="tablist" aria-label="Where you are in the run">
        {STAGES.map((s, k) => (
          <button key={s.id} role="tab" aria-selected={stage === s.id} className={stage === s.id ? 'stage active' : 'stage'}
            onClick={() => setTab(s.id === 'shop' ? shopTab : s.tab)}>
            <span className="stage-n">{k + 1}</span>
            <span className="stage-text">
              <b>{s.label}{s.id === 'team' && <span className="badge">{order.length}/12</span>}
                {s.id === 'packs' && run.floor !== null && <span className="badge">F{run.floor}</span>}</b>
              <small>{s.hint}</small>
            </span>
          </button>
        ))}
      </nav>

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
          <OwnedGifts gifts={gameData.gifts} owned={owned} onChange={setOwned} />
          <p className="small"><button className="link-btn" onClick={() => { setGiftsOpen(false); setTab('import') }}>
            Import gifts from a screenshot →</button></p>
        </Dialog>
      )}

      {stage !== 'team' && (
        <RunBar run={run} onChange={setRun} packs={gameData.themePacks} giftCount={owned.length}
          onOpenSettings={() => setRunOpen(true)} onOpenGifts={stage === 'shop' ? undefined : () => setGiftsOpen(true)} />
      )}

      {stage === 'tools' && (
        <div className="tools-head">
          <h2>{TOOL_LABEL[tab as 'evaluate' | 'import']}</h2>
          <button className="link-btn" onClick={() => setTab(lastStageTab)}>← Back</button>
        </div>
      )}

      <div role="tabpanel">
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
              onBuild={(focus) => {
                // A new team needs a starting order; after that, only suggestions.
                const built = buildTeam(gameData, focus, undefined, tiers)
                setTeam(built.team)
                const ids = SINNERS.map((s) => identitiesById.get(built.team[s] ?? '') ?? equipped[s])
                setSelection(suggestOrder(gameData, ids, deployed, owned, tiers).order)
              }}
            />
          </>
        )}

        {tab === 'packs' && (
          <div className="stage-main">
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
              <section className="panel"><CostBox run={run} ranked={rankedGifts} ctx={ctx} /></section>
              <OwnedGifts gifts={gameData.gifts} owned={owned} onChange={setOwned} />
            </aside>
            <main className="main">
              <nav className="tabs sub-tabs" role="tablist" aria-label="Shop">
                {SHOP_TABS.map((t) => (
                  <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'}
                    onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
              </nav>
              {tab === 'gifts' && (
                <>
                  {focusLine}
                  <PlanPanel ctx={ctx} ranked={rankedGifts} packsForGift={packsForGift} onOwn={own} rebuild={rebuildCtx} />
                  <GiftList ranked={rankedGifts} packsForGift={packsForGift} packs={gameData.themePacks} availableNow={availableNow}
                    teamKeywords={focus.map((f) => f.keyword)}
                    onOwn={own} giftsById={ctx.giftsById} owned={ctx.owned} />
                </>
              )}
              {tab === 'fusion' && (
                <FusionTab ctx={ctx} owned={owned} onOwnedChange={setOwned} run={run} pack={currentPack}
                  teamKeywords={focus.map((f) => f.keyword)} packsForGift={packsForGift}
                  superShop={superShop} onSuperShopChange={setSuperShop} />
              )}
              {tab === 'upgrades' && <UpgradesTab ctx={ctx} levels={enhanced} onLevelsChange={setEnhanced} />}
            </main>
          </div>
        )}

        {tab === 'events' && (
          <EventsTab ctx={ctx} events={gameData.events ?? []} team={teamIdentities.length ? teamIdentities : ctx.members} pack={currentPack}
            owned={owned} onOwnedChange={setOwned} />
        )}

        {tab === 'skills' && (
          <>
            {lineupStrip}
            <SkillsTab team={teamIdentities.slice(0, deployed)} backups={teamIdentities.slice(deployed)} swaps={swaps} onSwapsChange={setSwaps} owned={ownedGifts} art={art}
              egos={gameData.egos ?? []} loadout={loadout} run={run} battle={ctx.battle} onOpenTeam={() => setTab('team')} />
          </>
        )}

        {tab === 'evaluate' && <EvaluateTab ctx={ctx} packsForGift={packsForGift} />}
        {tab === 'import' && <ImportTab gifts={gameData.gifts} owned={owned} onOwnedChange={setOwned} />}
      </div>

      <footer className="foot">
        {gameData.gifts.length} gifts · {gameData.themePacks.length} theme packs · {(gameData.events ?? []).length} events · data from the{' '}
        <a href="https://limbuscompany.wiki.gg/" target="_blank" rel="noreferrer">Limbus Company Wiki</a>
        {gameData.generatedAt && <>, {new Date(gameData.generatedAt).toLocaleDateString()}</>}. A fan project, not affiliated with Project Moon.
      </footer>
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

/** Evaluate and Import gifts: used now and then, not at one point in the run. */
function ToolsMenu({ current, onPick }: { current: Tab; onPick: (t: Tab) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className="tools-menu" ref={ref}>
      <button className={`sync-btn${current === 'evaluate' || current === 'import' ? ' sync-warn' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        Tools ▾
      </button>
      {open && (
        <ul className="tools-list" role="menu">
          {(['evaluate', 'import'] as const).map((t) => (
            <li key={t}>
              <button role="menuitem" onClick={() => { onPick(t); setOpen(false) }}>
                <b>{TOOL_LABEL[t]}</b><small>{TOOL_HINT[t]}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
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
