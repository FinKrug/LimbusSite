import { useMemo } from 'react'
import type { CostKeep } from '../lib/costkeep'
import { shopPlan, worthLabel, type MoveKind, type ShopMove } from '../lib/shopoverview'
import { KeepLine } from './ShopAdvice'
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
  onOpen: (tab: 'gifts' | 'upgrades' | 'skills') => void
  onDone: (m: ShopMove) => void
  /** The move just marked done, to undo it. */
  justDone?: ShopMove | null
  onUndo?: () => void
  onOpenTeam: () => void
  cost: number | null
  onCostChange: (c: number | null) => void
  /** For the refresh advice. */
  refresh: { ctx: RunContext; ranked: GiftScore[]; availableNow: Set<string>; buffs: Buffs; superShop: boolean; onSuperShopChange: (v: boolean) => void; onSpend: (amount: number, label: string) => void }
}

const KIND: Record<MoveKind, { label: string; tab: 'gifts' | 'upgrades' | 'skills'; done: string; open: string }> = {
  buy: { label: 'Buy', tab: 'gifts', done: 'Bought it', open: 'Open Buy' },
  enhance: { label: 'Enhance', tab: 'upgrades', done: 'Enhanced it', open: 'Open Enhance' },
  swap: { label: 'Skill swap', tab: 'skills', done: 'Swapped it', open: 'Open Skill swaps' },
}
const SWAP_TEXT = { '1to2': 'Skill 1 → Skill 2', '2to3': 'Skill 2 → Skill 3', '1to3': 'Skill 1 → Skill 3' } as const
const SWAP_SHORT = { '1to2': 'S1 → S2', '2to3': 'S2 → S3', '1to3': 'S1 → S3' } as const

function title(m: ShopMove) {
  if (m.kind === 'buy') return <><b>{m.gift!.name}</b></>
  if (m.kind === 'enhance') return <><b>{m.gift!.name}</b> to {'+'.repeat(m.to!)}</>
  return <><b>{m.identity!.name}</b> <span className="muted">{SWAP_TEXT[m.swap!]}</span></>
}

function detail(m: ShopMove): string {
  if (m.kind === 'buy') return [...m.why, 'if the shop has it'].join(' · ')
  if (m.kind === 'enhance') return m.from ? `From + to ++: the full effect` : 'Upgrade a gift you have'
  const gain = m.gain ?? 0
  return `${m.skillTo} replaces a copy of ${m.skillFrom}: ${gain >= 0 ? '+' : ''}${(gain * 100).toFixed(1)}% team value per turn · if the shop offers it for ${m.identity!.sinner}`
}

/**
 * Shop overview (lib/shopoverview.ts): buying, enhancing and skill swaps on one list, best value
 * per Cost for your team first, plus what to do with the Cost you have.
 */
export function ShopOverview({ moves, hasTeam, hasGifts, keep = null, floorsLeft, onOpen, onDone, onOpenTeam, justDone = null, onUndo, refresh, cost, onCostChange: setCost }: Props) {
  const plan = useMemo(() => (cost === null ? null : shopPlan(moves, cost, keep)), [moves, cost, keep])
  const best = (k: MoveKind) => moves.find((m) => m.kind === k)
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
                </> : <span className="muted small">{k === 'enhance' && !hasGifts ? 'No gifts to enhance yet' : 'Nothing worth it right now'}</span>}
                <span className="link-btn small">{KIND[k].open} →</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="panel">
        <div className="shop-home-cost">
          <label>Cost you have <input type="number" min={0} step={10} inputMode="numeric" value={cost ?? ''} placeholder="e.g. 450"
            onChange={(e) => setCost(e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))} /></label>
          {plan && (plan.moves.length
            ? <span className="small">Spend <b>{plan.spent}</b>, keep <b>{(cost ?? 0) - plan.spent}</b>{plan.lost > 0 ? ` (costs ${plan.lost} of next floor's bonus)` : ''}</span>
            : <span className="small muted">Nothing worth it fits in {cost} Cost.</span>)}
        </div>
        {plan && plan.moves.length > 0 && (
          <ol className="shop-home-plan">
            {plan.moves.map((m) => (
              <li key={m.key}><span className={`kind-tag kind-${m.kind}`}>{KIND[m.kind].label}</span>{' '}
                {m.kind === 'swap' && plan.swapFor.length > 1
                  ? <> for whichever the shop offers: {plan.swapFor.slice(0, 4).map((s, k) => (
                    <span key={s.key} title={s.identity!.name}>{k > 0 && ', '}<b>{s.identity!.sinner}</b> <span className="muted">({SWAP_SHORT[s.swap!]})</span></span>
                  ))}</>
                  : title(m)} <span className="muted small">{m.cost}</span>
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
            Marked done: {KIND[justDone.kind].label.toLowerCase()} {title(justDone)}. The list is updated for it.
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
                    <div><span className={`kind-tag kind-${m.kind}`}>{KIND[m.kind].label}</span> {title(m)}</div>
                    <div className="muted small">{detail(m)}</div>
                  </div>
                  <div className="shop-move-side">
                    <span className={`worth worth-${w.cls}`} title={`${m.ratio.toFixed(2)}× a typical good shop gift's value per Cost`}>{w.text}</span>
                    <span className="small">{m.cost} Cost</span>
                    <button className="link-btn small" onClick={() => onDone(m)}>{KIND[m.kind].done}</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="muted small">Value per Cost compared with a typical good gift from this shop. Fusing isn't listed: see Fuse for recipes you're close to.</p>
      </section>
    </div>
  )
}
