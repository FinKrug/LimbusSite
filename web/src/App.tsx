import { useMemo } from 'react'
import { ComboList } from './components/ComboList'
import { FusionList } from './components/FusionList'
import { GiftList } from './components/GiftList'
import { OwnedGifts } from './components/OwnedGifts'
import { type FloorFilter, PackList } from './components/PackList'
import { TeamPicker, type TeamSelection } from './components/TeamPicker'
import { KeywordChip } from './components/bits'
import { gameData } from './lib/data'
import {
  makeContext, packOnFloor, packsByGift, planCombos, planFusions, rankGifts, rankThemePacks, teamFocus,
} from './lib/scoring'
import { DEFAULT_DEPLOYED } from './lib/lineup'
import { usePersistentState } from './lib/storage'
import type { TierOverrides } from './lib/strength'
import { buildTeam, suggestOrder, type OrderSuggestion } from './lib/teambuilder'
import { SINNERS, type Combo, type Identity, type Sinner } from './lib/types'

type Tab = 'gifts' | 'packs' | 'fusions'

export default function App() {
  const [team, setTeam] = usePersistentState<TeamSelection>('limbussite.team.v1', {})
  const [owned, setOwned] = usePersistentState<string[]>('limbussite.owned.v1', [])
  const [targets, setTargets] = usePersistentState<string[]>('limbussite.targets.v1', [])
  const [offered, setOffered] = usePersistentState<string[]>('limbussite.offered.v1', [])
  const [floorFilter, setFloorFilter] = usePersistentState<FloorFilter>(
    'limbussite.floor.v1', { difficulty: 'normal', floor: null })
  const [tab, setTab] = usePersistentState<Tab>('limbussite.tab.v1', 'gifts')
  const [customCombos, setCustomCombos] = usePersistentState<Combo[]>('limbussite.combos.v1', [])
  const [savedOrder, setSavedOrder] = usePersistentState<Sinner[]>('limbussite.order.v1', [])
  const [deployed, setDeployed] = usePersistentState<number>('limbussite.deployed.v3', DEFAULT_DEPLOYED)
  const [orderNotes, setOrderNotes] = usePersistentState<OrderSuggestion['notes']>('limbussite.ordernotes.v1', {})
  const [tiers, setTiers] = usePersistentState<TierOverrides>('limbussite.tiers.v1', {})

  const identitiesById = useMemo(() => new Map(gameData.identities.map((i) => [i.id, i])), [])
  const packsById = useMemo(() => new Map(gameData.themePacks.map((p) => [p.id, p])), [])
  const packsForGift = useMemo(() => packsByGift(gameData.themePacks), [])
  // Picked sinners in deployment order: the saved order first, then anyone added since.
  const order = useMemo(() => {
    const picked = SINNERS.filter((s) => team[s] && identitiesById.has(team[s]!))
    return [...savedOrder.filter((s) => picked.includes(s)), ...picked.filter((s) => !savedOrder.includes(s))]
  }, [team, savedOrder, identitiesById])
  const teamIdentities = useMemo(
    () => order.map((s) => identitiesById.get(team[s]!)).filter((i): i is Identity => !!i),
    [order, team, identitiesById],
  )
  const ctx = useMemo(
    () => makeContext(gameData, teamIdentities, owned, targets, customCombos, deployed, tiers),
    [teamIdentities, owned, targets, customCombos, deployed, tiers],
  )
  const applyOrder = (ids: Identity[]) => {
    const s = suggestOrder(gameData, ids, deployed, owned, tiers)
    setSavedOrder(s.order)
    setOrderNotes(s.notes)
  }
  const focus = teamFocus(ctx.profile)
  const traitsOnTeam = [...ctx.profile.traitCounts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])
  const rankedGifts = useMemo(() => rankGifts(ctx), [ctx])
  const rankedPacks = useMemo(() => {
    const offeredPacks = offered.map((id) => packsById.get(id)).filter((p) => !!p)
    const inView = offeredPacks.length ? offeredPacks
      : floorFilter.floor !== null
        ? gameData.themePacks.filter((p) => packOnFloor(p, floorFilter.difficulty, floorFilter.floor!))
        : gameData.themePacks
    return rankThemePacks(ctx, inView)
  }, [ctx, offered, packsById, floorFilter])
  const fusions = useMemo(() => planFusions(ctx), [ctx])
  const readyFusions = fusions.filter((f) => f.status === 'ready').length
  const combos = useMemo(() => planCombos(ctx), [ctx])

  const own = (id: string) => {
    setOwned((o) => (o.includes(id) ? o : [...o, id]))
    setTargets((t) => t.filter((x) => x !== id))
  }
  const toggleTarget = (id: string) => setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]))

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

      <div className="layout">
        <aside className="side">
          <TeamPicker
            identities={gameData.identities} team={team} onChange={setTeam}
            order={order} onOrderChange={(o) => { setSavedOrder(o); setOrderNotes({}) }}
            deployed={deployed} onDeployedChange={setDeployed} notes={orderNotes}
            tiers={tiers} onTiersChange={setTiers}
            onSuggestOrder={() => applyOrder(teamIdentities)}
            onBuild={(focus) => {
              const built = buildTeam(gameData, focus, undefined, tiers)
              setTeam(built.team)
              applyOrder(Object.values(built.team).map((id) => identitiesById.get(id!)!).filter(Boolean))
            }}
          />
          <OwnedGifts gifts={gameData.gifts} owned={owned}
            onChange={(o) => { setOwned(o); setTargets((t) => t.filter((x) => !o.includes(x))) }} />
          <OwnedGifts
            gifts={gameData.gifts} owned={targets} onChange={setTargets} exclude={owned}
            title="Targets" placeholder="Target a gift…"
            emptyHint="Gifts you want. The Theme packs tab ranks packs by how many of these they give."
            meta={(g) => {
              const n = packsForGift.get(g.id)?.length ?? 0
              return n ? `${n} pack${n > 1 ? 's' : ''}` : 'no pack'
            }}
          />
        </aside>

        <main className="main">
          <section className="focus panel">
            {focus.length === 0 && traitsOnTeam.length === 0 ? (
              <p className="hint">
                Pick identities for your team on the left. Recommendations are based on the status
                keywords (Burn, Bleed, Tremor…) your team uses and on gifts built for its
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
          </section>

          <nav className="tabs" role="tablist">
            <TabButton id="gifts" tab={tab} setTab={setTab}>Best gifts</TabButton>
            <TabButton id="packs" tab={tab} setTab={setTab}>
              Theme packs {targets.length > 0 && <span className="badge">★{ctx.targets.size}</span>}
            </TabButton>
            <TabButton id="fusions" tab={tab} setTab={setTab}>
              Fusions & combos {readyFusions > 0 && <span className="badge">{readyFusions}</span>}
            </TabButton>
          </nav>

          <div role="tabpanel">
            {tab === 'gifts' && (
              <GiftList ranked={rankedGifts} packsForGift={packsForGift}
                teamKeywords={focus.map((f) => f.keyword)} targets={ctx.targets}
                onOwn={own} onToggleTarget={toggleTarget} />
            )}
            {tab === 'packs' && (
              <PackList allPacks={gameData.themePacks} ranked={rankedPacks}
                offered={offered.filter((id) => packsById.has(id))} onOfferedChange={setOffered}
                targetCount={ctx.targets.size} floorFilter={floorFilter} onFloorFilterChange={setFloorFilter} />
            )}
            {tab === 'fusions' && (
              <>
                <ComboList plans={combos} gifts={gameData.gifts} packsForGift={packsForGift}
                  onSave={(c) => setCustomCombos((cs) => [...cs, c])}
                  onDelete={(id) => setCustomCombos((cs) => cs.filter((c) => c.id !== id))}
                  onTarget={(ids) => setTargets((t) => [...t, ...ids.filter((id) => !t.includes(id) && !owned.includes(id))])} />
                <section className="group"><h3>Fusions</h3><FusionList plans={fusions} /></section>
              </>
            )}
          </div>
        </main>
      </div>
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
