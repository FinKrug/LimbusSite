import { useMemo } from 'react'
import type { CostKeep } from '../lib/costkeep'
import { explainMove, heldBack, shopPlan, worthLabel, type MoveKind, type ShopFusions, type ShopMove, type ShopSwapsDone } from '../lib/shopoverview'
import { KeepLine } from './ShopAdvice'
import { meterAfter, type SaveAdvice } from '../lib/costsave'
import { ShopRefresh } from './ShopRefresh'
import type { Buffs } from '../lib/buffeffects'
import type { GiftScore, RunContext } from '../lib/scoring'

interface Props {
  moves: ShopMove[]
  /** Owned gifts and a deployed team: without them there's nothing to compare. */
  hasTeam: boolean
  hasGifts: boolean
  keep?: CostKeep | null
  /** Floors left (swaps and upgrades pay off over them). */
  floorsLeft: number
  onOpen: (tab: 'gifts' | 'upgrades' | 'skills' | 'fusion') => void
  /** Fusing: free, so it's done first (lib/shopoverview.ts `shopFusions`). */
  fusions: ShopFusions
  onDone: (m: ShopMove) => void
  /** Skill swaps done at this shop, and how many it still allows (1 at a regular shop, 3 at a Super Shop). */
  swapsDone?: ShopSwapsDone
  swapsLeft?: { total: number; max: number }
  /** The move just marked done, to undo it. */
  justDone?: ShopMove | null
  onUndo?: () => void
  onOpenTeam: () => void
  cost: number | null
  onCostChange: (c: number | null) => void
  /** For the refresh advice. */
  refresh: { ctx: RunContext; ranked: GiftScore[]; availableNow: Set<string>; buffs: Buffs; superShop: boolean; onSuperShopChange: (v: boolean) => void; onSpend: (amount: number, label: string) => void; saveBar?: number }
  /** Save or spend on this floor (costsave.ts), and the Super Shop chance shown in the shop. */
  save?: SaveAdvice
  onMeterChange?: (pct: number | null) => void
}

const KIND: Record<MoveKind, { label: string; tab: 'gifts' | 'upgrades' | 'skills' | 'fusion'; done: string; open: string }> = {
  fuse: { label: 'Fuse', tab: 'fusion', done: 'Fused it', open: 'Open Fuse' },
  buy: { label: 'Buy', tab: 'gifts', done: 'Bought it', open: 'Open Buy' },
  enhance: { label: 'Enhance', tab: 'upgrades', done: 'Enhanced it', open: 'Open Enhance' },
  swap: { label: 'Skill swap', tab: 'skills', done: 'Swapped it', open: 'Open Skill swaps' },
}
const SWAP_TEXT = { '1to2': 'Skill 1 → Skill 2', '2to3': 'Skill 2 → Skill 3', '1to3': 'Skill 1 → Skill 3' } as const
const SWAP_SHORT = { '1to2': 'S1 → S2', '2to3': 'S2 → S3', '1to3': 'S1 → S3' } as const
/** ID Skill Search's Starlight price (wiki: 25 / 50 / 75). */
const SEARCH_STARLIGHT = { '1to2': 25, '2to3': 50, '1to3': 75 } as const
const pct = (x: number) => `${Math.round(x * 100)}%`
const label = (m: ShopMove) => (m.pick ? 'Skill search' : KIND[m.kind].label)

function title(m: ShopMove) {
  if (m.kind === 'buy') return <><b>{m.gift!.name}</b></>
  if (m.kind === 'enhance') return <><b>{m.gift!.name}</b> to {'+'.repeat(m.to!)}</>
  if (m.kind === 'fuse') return <><b>{m.gift!.name}</b> <span className="muted">from {m.uses!.map((g) => g.name).join(' + ')}</span></>
  return <><b>{m.identity!.name}</b> <span className="muted">{SWAP_TEXT[m.swap!]}{m.pick ? ', picked with ID Skill Search' : ''}</span></>
}

function detail(m: ShopMove): string {
  if (m.kind === 'buy') return [...m.why, 'if the shop has it'].join(' · ')
  if (m.kind === 'enhance') return m.from ? `From + to ++: the full effect` : 'Upgrade a gift you have'
  const gain = m.gain ?? 0
  const what = `${m.skillTo} replaces a copy of ${m.skillFrom}: ${gain >= 0 ? '+' : ''}${(gain * 100).toFixed(1)}% team value per turn`
  return m.pick ? `${what} · you choose ${m.identity!.sinner}, no luck needed (or pay ${SEARCH_STARLIGHT[m.swap!]} Starlight instead of Cost)`
    : `${what} · if the shop offers it for ${m.identity!.sinner}`
}

/**
 * Shop overview (lib/shopoverview.ts): buying, enhancing and skill swaps on one list, best value
 * per Cost for your team first, plus what to do with the Cost you have.
 */
export function ShopOverview({ moves, hasTeam, hasGifts, keep = null, floorsLeft, onOpen, onDone, onOpenTeam, justDone = null, onUndo, refresh, cost, onCostChange: setCost, fusions, swapsDone, swapsLeft, save, onMeterChange }: Props) {
  const superShop = refresh.superShop
  const plan = useMemo(() => (cost === null ? null : shopPlan(moves, cost, keep, { superShop, done: swapsDone, save })), [moves, cost, keep, superShop, swapsDone, save])
  const best = (k: MoveKind) => moves.find((m) => m.kind === k)
  const firstRecipe = fusions.recipes[0]
  const firstIdea = fusions.ideas[0]
  // A Super Shop offers 2 Sinners: the plan's random swaps show as one line.
  const randomSwaps = plan?.moves.filter((m) => m.kind === 'swap' && !m.pick) ?? []
  const firstRandom = randomSwaps[0]
  const randomCount = randomSwaps.length
  if (!hasTeam) {
    return (
      <section className="panel shop-home">
        <h2>What to spend on</h2>
        <p className="muted">Pick your team first: buying, enhancing and skill swaps are all judged by what they do for it.</p>
        <button className="btn" onClick={onOpenTeam}>Open Team</button>
      </section>
    )
  }
  return (
    <div className="shop-home">
      <section className="panel">
        <h2>What to spend on</h2>
        <p className="muted small">
          Buying a gift, enhancing one you have, or swapping a skill: whichever does the most for your team per Cost comes first.
          {' '}{floorsLeft} floor{floorsLeft === 1 ? '' : 's'} left to make use of it.
        </p>
        <div className="shop-home-kinds">
          {(['buy', 'enhance', 'swap'] as const).map((k) => {
            const m = best(k)
            const w = m && worthLabel(m.ratio)
            return (
              <button key={k} className="shop-home-kind" onClick={() => onOpen(KIND[k].tab)}>
                <span className="shop-home-kind-label">Best {KIND[k].label.toLowerCase()}</span>
                {m ? <>
                  <span className="shop-home-kind-name">{title(m)}</span>
                  <span className="small"><span className={`worth worth-${w!.cls}`}>{w!.text}</span> · {m.cost} Cost</span>
                </> : <span className="muted small">{k === 'enhance' && !hasGifts ? 'No gifts to enhance yet'
                  : k === 'swap' && swapsLeft && swapsLeft.total === 0 ? `Used: this shop allows ${swapsLeft.max} skill swap${swapsLeft.max === 1 ? '' : 's'}` : 'Nothing worth it right now'}</span>}
                <span className="link-btn small">{KIND[k].open} →</span>
              </button>
            )
          })}
          <button className="shop-home-kind shop-home-fuse" onClick={() => onOpen('fusion')}>
            <span className="shop-home-kind-label">Fuse (free)</span>
            {firstRecipe ? <>
              <span className="shop-home-kind-name"><b>{firstRecipe.plan.result.name}</b></span>
              <span className="small">{firstRecipe.needsSuper ? 'Needs a Super Shop' : 'Ready: you have every piece'}</span>
            </> : firstIdea ? <>
              <span className="shop-home-kind-name">A Tier {firstIdea.forecast.tier} <b>{firstIdea.keyword}</b> gift</span>
              <span className="small">from {firstIdea.ingredients.length} spare gifts · {pct(firstIdea.forecast.targetOdds)} for one that helps</span>
            </> : <span className="muted small">Nothing worth fusing right now</span>}
            <span className="link-btn small">Open Fuse →</span>
          </button>
        </div>
      </section>

      {(fusions.recipes.length > 0 || fusions.ideas.length > 0) && (
        <section className="panel shop-fuse">
          <h3>Fuse first: it's free</h3>
          <p className="muted small">Fusing costs no Cost, so do it before buying: what you get can change what's worth buying, and the gifts that go in aren't worth enhancing.</p>
          <ul className="shop-home-list">
            {fusions.recipes.map((r) => (
              <li key={r.move.key} className="shop-move">
                <span className="shop-move-n">★</span>
                <div className="shop-move-body">
                  <div><span className="kind-tag kind-fuse">Recipe</span> {title(r.move)}</div>
                  <div className="muted small">{r.needsSuper ? 'Needs 5 slots: only a Super Shop can fuse it.' : 'You have every piece. A recipe always gives this gift.'}</div>
                </div>
                <div className="shop-move-side">
                  <span className="small">Free</span>
                  <button className="link-btn small" disabled={r.needsSuper} onClick={() => onDone(r.move)}>Fused it</button>
                </div>
              </li>
            ))}
            {fusions.ideas.map((i) => (
              <li key={i.keyword + i.ingredients.map((x) => x.gift.id).join()} className="shop-move">
                <span className="shop-move-n">?</span>
                <div className="shop-move-body">
                  <div><span className="kind-tag kind-fuse">Random</span> A Tier {i.forecast.tier} <b>{i.keyword}</b> gift <span className="muted">from {i.ingredients.map((x) => x.gift.name).join(' + ')}</span></div>
                  <div className="muted small">
                    {i.chase ? <>Last chance at <b>{i.chase.gift.name}</b> this run. </> : null}
                    {pct(i.forecast.targetOdds)} chance of one that helps your team{i.forecast.targets.length ? <> (like {i.forecast.targets.slice(0, 3).map((t) => t.gift.name).join(', ')})</> : null}; these gifts do little for it now.
                  </div>
                </div>
                <div className="shop-move-side">
                  <span className="small">Free</span>
                  <button className="link-btn small" onClick={() => onOpen('fusion')}>Open Fuse</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        {save && <SaveLine save={save} plan={plan} cost={cost} onMeterChange={onMeterChange} hard={refresh.ctx.run.difficulty !== 'normal'} floor={refresh.ctx.run.floor} floors={refresh.ctx.run.floors} />}
        <div className="shop-home-cost">
          <label>Cost you have <input type="number" min={0} step={10} inputMode="numeric" value={cost ?? ''} placeholder="e.g. 450"
            onChange={(e) => setCost(e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))} /></label>
          {plan && (plan.moves.length
            ? <span className="small">Shopping list below: up to <b>{plan.spent}</b> Cost if it all shows up{plan.lost > 0 ? ` (costs ${plan.lost} of next floor's bonus)` : ''}</span>
            : <span className="small muted">Nothing worth it fits in {cost} Cost: keep it for the next floor.</span>)}
        </div>
        {plan && plan.moves.length > 0 && (
          <p className="small shop-list-note">
            This is a <b>list of what's worth buying</b>, not Cost you need to use up. Shops are random, so you often won't find these
            gifts: <b>don't spend the rest on gifts that do little for your team</b> just to use it up. Cost you don't spend comes with
            you to the next floor{keep ? ' (and earns a bonus there, below)' : ''}.
          </p>
        )}
        {plan && plan.moves.length > 0 && (
          <ol className="shop-home-plan">
            {plan.moves.filter((m) => !(m.kind === 'swap' && !m.pick && m !== firstRandom)).map((m) => (
              <li key={m.key}><span className={`kind-tag kind-${m.kind}`}>{label(m)}</span>{' '}
                {m.kind === 'swap' && !m.pick && plan.swapFor.length > 1
                  ? <>{randomCount > 1 ? ` ×${randomCount}` : ''} for whichever {randomCount > 1 ? `${randomCount} Sinners` : 'Sinner'} the shop offers: {plan.swapFor.slice(0, 5).map((s, k) => (
                    <span key={s.key} title={s.identity!.name}>{k > 0 && ', '}<b>{s.identity!.sinner}</b> <span className="muted">({SWAP_SHORT[s.swap!]})</span></span>
                  ))}</>
                  : title(m)} <span className="muted small">{m.kind === 'swap' && !m.pick && randomCount > 1 ? `${randomCount} × ${m.cost}` : m.cost}</span>
              </li>
            ))}
          </ol>
        )}
        {plan && plan.moves.some((m) => m.chance) && (
          <p className="muted small">Buys and swaps depend on what the shop rolled (a regular shop's Skill Replacement is for one random sinner). If one isn't there, see <b>Refreshing the shop</b> below, or skip it and the next one moves up.</p>
        )}
        {keep && <KeepLine keep={keep} cost={cost} />}
      </section>

      <ShopRefresh {...refresh} moves={moves} cost={cost} />

      <section className="panel">
        <h3>Everything worth doing, best first</h3>
        {justDone && (
          <p className="small done-note" role="status">
            Marked done: {label(justDone).toLowerCase()} {title(justDone)}. The list is updated for it.
            {' '}{onUndo && <button className="link-btn" onClick={onUndo}>Undo</button>}
          </p>
        )}
        {moves.length === 0 ? <p className="muted">Nothing here helps your team right now: save the Cost for the next floor.</p> : (
          <ul className="shop-home-list">
            {moves.map((m, i) => {
              const w = worthLabel(m.ratio)
              return (
                <li key={m.key} className="shop-move">
                  <span className="shop-move-n">{i + 1}</span>
                  <div className="shop-move-body">
                    <div><span className={`kind-tag kind-${m.kind}`}>{label(m)}</span> {title(m)}</div>
                    <div className="muted small">{detail(m)}</div>
                    <MoveWhyDetails m={m} />
                  </div>
                  <div className="shop-move-side">
                    <span className={`worth worth-${w.cls}`} title={`${m.ratio.toFixed(2)}× a typical good shop gift's value per Cost`}>{w.text}</span>
                    <span className="small">{m.cost} Cost</span>
                    <button className="link-btn small" onClick={() => onDone(m)}>{m.pick ? 'Picked it' : KIND[m.kind].done}</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="muted small">
          Value per Cost compared with a typical good gift from this shop. Fusing isn't listed: see Fuse for recipes you're close to.
          {' '}Skill swaps come two ways: <b>Skill Replacement</b> (45 / 75 / 120) is for whichever Sinner the shop rolled;
          {' '}<b>ID Skill Search</b> (90 / 150 / 240, or 25 / 50 / 75 Starlight) lets you pick the Sinner, and only Super Shops have it
          {superShop ? '' : ' (tick "This is a Super Shop" above when you\'re in one)'}.
        </p>
      </section>
    </div>
  )
}

/** "Why?" for a move: the summary, and the steps behind it when opened (Finley, 2026-11-23). */
function MoveWhyDetails({ m }: { m: ShopMove }) {
  const x = explainMove(m)
  if (!x) return null
  return (
    <details className="move-why small">
      <summary><span className="move-why-q">Why?</span> {x.summary}</summary>
      <ol>{x.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
    </details>
  )
}

/**
 * Save or spend on this floor (costsave.ts, Finley 2026-11-23): early on, keep Cost for the strong
 * gifts later theme packs' shops sell; spend it all by the run's last floor (floor 10 of a 15-floor
 * run, keeping a little for 11-15). On Hard, spending also raises the next shop's Super Shop chance.
 */
function SaveLine({ save: s, plan, cost, onMeterChange, hard, floor, floors }: {
  save: SaveAdvice; plan: { spent: number } | null; cost: number | null; onMeterChange?: (pct: number | null) => void; hard: boolean; floor: number | null; floors: number
}) {
  const f = floor ?? 1
  const w = worthLabel(s.bar)
  return (
    <div className={`save-line save-${s.stage}`}>
      {s.stage === 'save' && <p className="small">
        <b>Floor {f}: save for later.</b> Buy now only what's <b>{w.text}</b> or better: Cost you keep is worth about that much
        {' '}on the {s.floorsLeft} floor{s.floorsLeft === 1 ? '' : 's'} before floor {s.spendBy}
        {s.later.length > 0 && <>, like {s.later.map((x, k) => <span key={x.gift.id}>{k > 0 && ', '}<b>{x.gift.name}</b> <span className="muted">(F{x.floor}, {x.pack!.name})</span></span>)}, which only those packs' shops sell</>}.
        {' '}Spend it all by floor {s.spendBy}{floors > s.spendBy ? ` (after that, adversities like Inflation make gifts dear)` : ': it\'s no use after the run ends'}.
      </p>}
      {s.stage === 'last' && <p className="small">
        <b>{floors > s.spendBy ? `Floor ${f}: spend most of your Cost now.` : `Last floor: spend it all.`}</b>
        {floors > s.spendBy
          ? <> From floor {s.spendBy + 1} on, adversities like Inflation make gifts much dearer. {cost !== null && heldBack(cost, s.reserve) > 0 ? <> The plan keeps about <b>{heldBack(cost, s.reserve)}</b> for one or two things you need there.</> : <> Keep a little for one or two things you need there.</>}</>
          : <> Cost is no use after the run ends: anything that helps your team is worth buying.</>}
      </p>}
      {s.stage === 'late' && <p className="small">
        {f >= floors ? <><b>Last floor: spend what's left</b> on anything that helps.</> : <><b>Floor {f}: buy only what you need.</b> Cost is scarce from here, and adversities like Inflation make gifts dear.</>}
      </p>}
      {hard && s.meterBonus > 0 && (
        <p className="small muted save-meter">
          <label>Super Shop chance shown at the top of this shop{' '}
            <input type="number" min={0} max={100} inputMode="numeric" value={s.meter ?? ''} placeholder="%" aria-label="Super Shop chance, %"
              onChange={(e) => onMeterChange?.(e.target.value === '' ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))))} />%</label>
          {' '}Every 20 Cost you spend adds 1% for the next shop
          {s.meter !== null && plan ? <>: the plan's {plan.spent} would make it about <b>{meterAfter(s.meter, plan.spent)}%</b></> : null}.
          {' '}A Super Shop shows 7 gifts, so spending also pays off that way.
        </p>
      )}
    </div>
  )
}
