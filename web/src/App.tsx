import { useMemo, useState } from 'react'
import { EvaluateTab } from './components/EvaluateTab'
import { FusionTab } from './components/FusionTab'
import { GiftList } from './components/GiftList'
import { OwnedGifts } from './components/OwnedGifts'
import { PlanPanel } from './components/PlanPanel'
import { availability } from './lib/plan'
import { PackList } from './components/PackList'
import { FormationBar } from './components/FormationBar'
import { RunPanel } from './components/RunPanel'
import { SkillsTab } from './components/SkillsTab'
import { TeamTab } from './components/TeamTab'
import { KeywordChip } from './components/bits'
import { gameData } from './lib/data'
import {
  DEFAULT_RUN, defaultFloors, makeContext, packInDifficulty, packOnFloor, packsByGift, rankGifts, rankThemePacks, teamFocus,
  type Difficulty, type RunSettings,
} from './lib/scoring'
import { DEFAULT_DEPLOYED } from './lib/lineup'
import { usePersistentState } from './lib/storage'
import type { TierOverrides } from './lib/strength'
import type { ArtVariant } from './lib/images'
import { lineupSuggestions, moveTo } from './lib/ordering'
import type { SwapState } from './lib/skillswap'
import type { EgoLoadout } from './lib/ego'
import { buildTeam, suggestOrder } from './lib/teambuilder'
import { addGift } from './lib/vestiges'
import { SINNERS, type Combo, type Gift, type Identity, type Sinner } from './lib/types'

type Tab = 'team' | 'gifts' | 'packs' | 'fusion' | 'evaluate' | 'skills'
const TABS: Tab[] = ['team', 'gifts', 'packs', 'fusion', 'evaluate', 'skills']
/** Each sinner's equipped identity id (every sinner always has one, like in game). */
type Equipped = Partial<Record<Sinner, string | null>>

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
  const [offered, setOffered] = usePersistentState<string[]>('limbussite.offered.v1', [])
  const [firstRun] = useState(legacyRun)
  const [run, setRun] = usePersistentState<RunSettings>('limbussite.run.v1', firstRun)
  const [storedTab, setTab] = usePersistentState<string>('limbussite.tab.v1', 'team')
  const tab: Tab = storedTab === 'fusions' ? 'fusion' : (TABS as string[]).includes(storedTab) ? storedTab as Tab : 'team'
  // Your own gift sets (Best gifts > Your plan > Add a gift set); they count in scores like combos.
  const [customCombos, setCustomCombos] = usePersistentState<Combo[]>('limbussite.combos.v1', [])
  const [swaps, setSwaps] = usePersistentState<SwapState>('limbussite.swaps.v1', {})
  const [deployed, setDeployed] = usePersistentState<number>('limbussite.deployed.v3', DEFAULT_DEPLOYED)
  // Ratings set in an earlier version still count; there's no UI for them now that tiers aren't shown.
  const [tiers] = usePersistentState<TierOverrides>('limbussite.tiers.v1', {})
  // v2: threadspun became the default (v1 defaulted to base).
  const [art, setArt] = usePersistentState<ArtVariant>('limbussite.art.v2', 'uptie')
  const [dismissed, setDismissed] = usePersistentState<string[]>('limbussite.dismissed.v1', [])
  // Equipped E.G.O per sinner and grade (Team tab).
  const [loadout, setLoadout] = usePersistentState<EgoLoadout>('limbussite.egos.v1', {})

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
  const teamIdentities = useMemo(() => order.map((s) => equipped[s]).filter(Boolean), [order, equipped])
  const ctx = useMemo(
    () => makeContext(gameData, teamIdentities, owned, { combos: customCombos, deployed, tiers, run, loadout, swaps }),
    [teamIdentities, owned, customCombos, deployed, tiers, run, loadout, swaps],
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
  const rankedPacks = useMemo(() => {
    const offeredPacks = offered.map((id) => packsById.get(id)).filter((p) => !!p)
    const inView = offeredPacks.length ? offeredPacks
      : run.floor !== null
        ? gameData.themePacks.filter((p) => packOnFloor(p, run.difficulty, run.floor!))
        : gameData.themePacks.filter((p) => packInDifficulty(p, run.difficulty))
    return rankThemePacks(ctx, inView)
  }, [ctx, offered, packsById, run.difficulty, run.floor])
  const currentPack = run.pack ? packsById.get(run.pack) ?? null : null
  // Gifts you can get on the floor you're on (shops, rewards, this floor's packs).
  const availableNow = useMemo(
    () => new Set(gameData.gifts.filter((g) => availability(g, ctx, packsForGift).where === 'now').map((g) => g.id)),
    [ctx, packsForGift],
  )
  const ownedGifts = useMemo(() => [...ctx.owned].map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g), [ctx])

  const own = (id: string) => setOwned((o) => addGift(o, id, ctx.giftsById.get(id)?.tier ?? null))

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>LimbusSite</h1>
          <p className="sub">Mirror Dungeon E.G.O gift planner</p>
        </div>
        <p className="data-note">
          {gameData.gifts.length} gifts · {gameData.themePacks.length} theme packs · data from the{' '}
          <a href="https://limbuscompany.wiki.gg/" target="_blank" rel="noreferrer">Limbus Company Wiki</a>
          {gameData.generatedAt && <>, {new Date(gameData.generatedAt).toLocaleDateString()}</>}
        </p>
      </header>

      <nav className="tabs main-tabs" role="tablist">
        <TabButton id="team" tab={tab} setTab={setTab}>
          Team <span className="badge">{order.length}/12</span>
        </TabButton>
        <TabButton id="gifts" tab={tab} setTab={setTab}>Best gifts</TabButton>
        <TabButton id="packs" tab={tab} setTab={setTab}>
          Theme packs {run.floor !== null && <span className="badge">F{run.floor}</span>}
        </TabButton>
        <TabButton id="fusion" tab={tab} setTab={setTab}>Fusion</TabButton>
        <TabButton id="evaluate" tab={tab} setTab={setTab}>Evaluate</TabButton>
        <TabButton id="skills" tab={tab} setTab={setTab}>Skill swaps</TabButton>
      </nav>

      <FormationBar selection={order} equipped={equipped} deployed={deployed} minDeployed={5} maxDeployed={7}
        suggested={suggestedTo} suggestionCount={suggestions.length} art={art}
        onSelectionChange={setSelection}
        onDeployedChange={setDeployed} onOpenTeam={() => setTab('team')} />

      {tab === 'team' ? (
        <div role="tabpanel">
          <TeamTab
            identities={gameData.identities} equipped={equipped} selection={order} deployed={deployed}
            art={art} onArtChange={setArt}
            egos={gameData.egos ?? []} loadout={loadout} onLoadoutChange={setLoadout} battle={ctx.battle}
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
        </div>
      ) : (
      <div className="layout">
        <aside className="side">
          <RunPanel run={run} onChange={setRun} packs={gameData.themePacks} ranked={rankedGifts} ctx={ctx} />
          <OwnedGifts gifts={gameData.gifts} owned={owned} onChange={setOwned} />
        </aside>

        <main className="main">
          {(tab === 'gifts' || tab === 'packs') && <section className="focus panel">
            {focus.length === 0 && traitsOnTeam.length === 0 ? (
              <p className="hint">
                Pick your team on the Team tab. Recommendations are based on the status keywords
                (Burn, Bleed, Tremor…) your deployed sinners use and on gifts built for their
                affiliations, like The Thumb or Heishou Pack.
              </p>
            ) : (
              <>
                <h2>Team focus {order.length > deployed && <span className="count">deployed #1–#{deployed}</span>}</h2>
                <ul className="focus-list">
                  {focus.map((f) => (
                    <li key={f.keyword}>
                      <KeywordChip keyword={f.keyword} />
                      <span className="focus-bar"><span style={{ width: `${f.share * 100}%` }} className={`kwbg-${f.keyword.toLowerCase()}`} /></span>
                      <span className="muted">{f.count}/{ctx.profile.size}</span>
                    </li>
                  ))}
                </ul>
                {traitsOnTeam.length > 0 && (
                  <p className="traits-line">
                    <span className="muted">Affiliations: </span>
                    {traitsOnTeam.slice(0, 4).map(([t, n]) => <span key={t} className="trait">{t} ×{n}</span>)}
                  </p>
                )}
              </>
            )}
          </section>}

          <div role="tabpanel">
            {tab === 'gifts' && <PlanPanel ctx={ctx} ranked={rankedGifts} packsForGift={packsForGift} onOwn={own}
              gifts={gameData.gifts} customSets={customCombos}
              onAddSet={(c) => setCustomCombos((l) => [...l.filter((x) => x.id !== c.id), c])}
              onRemoveSet={(id) => setCustomCombos((l) => l.filter((x) => x.id !== id))} />}
            {tab === 'gifts' && (
              <GiftList ranked={rankedGifts} packsForGift={packsForGift} packs={gameData.themePacks} availableNow={availableNow}
                teamKeywords={focus.map((f) => f.keyword)}
                onOwn={own} giftsById={ctx.giftsById} owned={ctx.owned} />
            )}
            {tab === 'packs' && (
              <PackList allPacks={gameData.themePacks} ranked={rankedPacks}
                offered={offered.filter((id) => packsById.has(id))} onOfferedChange={setOffered}
                run={run} onPickPack={(id) => setRun({ ...run, pack: id })}
                packsForGift={packsForGift} giftsById={ctx.giftsById} owned={ctx.owned} />
            )}
            {tab === 'fusion' && (
              <FusionTab ctx={ctx} owned={owned} onOwnedChange={setOwned} run={run} pack={currentPack}
                teamKeywords={focus.map((f) => f.keyword)} packsForGift={packsForGift} />
            )}
            {tab === 'evaluate' && <EvaluateTab ctx={ctx} packsForGift={packsForGift} />}
            {tab === 'skills' && (
              <SkillsTab team={teamIdentities.slice(0, deployed)} swaps={swaps} onSwapsChange={setSwaps} owned={ownedGifts} art={art}
                egos={gameData.egos ?? []} loadout={loadout} run={run} battle={ctx.battle} onOpenTeam={() => setTab('team')} />
            )}
          </div>
        </main>
      </div>
      )}
    </div>
  )
}

function TabButton({ id, tab, setTab, children }: {
  id: Tab; tab: Tab; setTab: (t: Tab) => void; children: React.ReactNode
}) {
  return (
    <button role="tab" aria-selected={tab === id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>
      {children}
    </button>
  )
}
