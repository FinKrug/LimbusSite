import { useMemo, useState } from 'react'
import type { Buffs } from '../lib/buffeffects'
import type { GiftScore, RunContext } from '../lib/scoring'
import type { ShopMove } from '../lib/shopoverview'
import { REFRESH, refreshAdvice, refreshPrice, type RefreshStep } from '../lib/shoprefresh'
import { usePersistentState } from '../lib/storage'
import { KeywordChip } from './bits'

interface Props {
  ctx: RunContext
  ranked: GiftScore[]
  availableNow: Set<string>
  moves: ShopMove[]
  buffs: Buffs
  cost: number | null
  superShop: boolean
  onSuperShopChange: (v: boolean) => void
  /** Take a paid refresh's price off your Cost (negative: give it back). */
  onSpend: (amount: number, label: string) => void
}

const pct = (x: number) => `${Math.round(x * 100)}%`

function stepText(s: RefreshStep, keyword: string | null) {
  const what = s.kind === 'keyword' ? <>Keyword refresh{keyword ? <> (pick <b>{keyword}</b>)</> : null}</> : <>Refresh</>
  return <>{what}{s.free ? <span className="free-tag">free</span> : <span className="muted"> · {s.price} Cost</span>}</>
}

/**
 * Shop refreshes on the overview (lib/shoprefresh.ts): both kinds, what each one's chances are for
 * this team, and how many to do before stopping.
 */
export function ShopRefresh({ ctx, ranked, availableNow, moves, buffs, cost, superShop, onSuperShopChange, onSpend }: Props) {
  // Paid refreshes done at this shop, per floor (the price goes up 15 each time).
  const [done, setDone] = usePersistentState<{ floor: number | null; n: number }>('limbussite.refreshes.v1', { floor: null, n: 0 })
  const paidDone = done.floor === ctx.run.floor ? done.n : 0
  const setPaid = (n: number) => setDone({ floor: ctx.run.floor, n: Math.max(0, n) })
  // A paid refresh's price comes off your Cost; Undo gives the last one's back.
  const [kinds, setKinds] = useState<('normal' | 'keyword')[]>([])
  const addPaid = (kind: 'normal' | 'keyword') => {
    onSpend(refreshPrice(kind, paidDone), kind === 'keyword' ? 'Keyword refresh' : 'Refresh')
    setKinds([...kinds.slice(0, paidDone), kind])
    setPaid(paidDone + 1)
  }
  const removePaid = () => {
    const kind = kinds[paidDone - 1] ?? 'normal'
    onSpend(-refreshPrice(kind, paidDone - 1), kind === 'keyword' ? 'Keyword refresh taken back' : 'Refresh taken back')
    setPaid(paidDone - 1)
  }
  const a = useMemo(() => refreshAdvice(ctx, ranked, availableNow, moves, { buffs, superShop, cost, paidDone }),
    [ctx, ranked, availableNow, moves, buffs, superShop, cost, paidDone])
  const [showWanted, setShowWanted] = useState(false)
  const kw = a.keyword?.keyword ?? null
  const hard = ctx.run.difficulty !== 'normal'
  return (
    <section className="panel shop-refresh">
      <div className="shop-refresh-head">
        <h3>Refreshing the shop</h3>
        {hard && (
          <label className="small"><input type="checkbox" checked={superShop} onChange={(e) => onSuperShopChange(e.target.checked)} /> This is a Super Shop</label>
        )}
      </div>
      <p className="muted small">
        The shop shows {a.slots} gifts out of the {a.pool} it can sell here. <b>{a.wanted.length}</b> of them
        {' '}beat {a.fallback > REFRESH.save ? 'your best upgrade' : 'saving the Cost for the next floor'} for your team
        {a.wanted.length > 0 && <> (<button className="link-btn" onClick={() => setShowWanted(!showWanted)}>{showWanted ? 'hide' : 'show'}</button>)</>}.
      </p>
      {showWanted && (
        <ul className="refresh-wanted small">
          {a.wanted.map((w) => <li key={w.gift.id}>{w.gift.name} <KeywordChip keyword={w.gift.keyword} /> <span className="muted">{w.gift.cost}</span></li>)}
        </ul>
      )}
      <div className="refresh-kinds">
        <div className="refresh-kind">
          <b>Refresh</b>
          <span className="small muted">{refreshPrice('normal', paidDone)} Cost{paidDone ? '' : ', then +15 each time'}. New gifts and a new Sinner for Skill Replacement.</span>
          <span className="small">Each one: <b>{pct(a.normal.giftChance)}</b> chance of a gift worth buying{a.normal.swapChance > 0 && <>, <b>{pct(a.normal.swapChance)}</b> of a swap worth making</>}.</span>
          {a.free.normal > 0 && <span className="small free-line">{a.free.normal} free at each shop (Star of the Beginning)</span>}
        </div>
        <div className="refresh-kind">
          <b>Keyword refresh</b>
          <span className="small muted">{refreshPrice('keyword', paidDone)} Cost{paidDone ? '' : ', +15 for every refresh before it'}. Pick a keyword: the new gifts lean toward it.</span>
          {a.keyword
            ? <span className="small">Pick <b>{a.keyword.keyword}</b>: about <b>{pct(a.keyword.giftChance)}</b> chance of a gift worth buying.</span>
            : <span className="small muted">No keyword has gifts worth refreshing for.</span>}
          {a.keyword && a.steps.length > 0 && !a.steps.some((x) => x.kind === 'keyword') && (
            <span className="small muted">Not in the plan: the cheaper refreshes find a gift worth buying for less Cost here.</span>
          )}
          {a.free.keyword > 0 && <span className="small free-line">{a.free.keyword} free at each shop (Moon Star-shop)</span>}
        </div>
      </div>

      {a.steps.length > 0 ? (
        <>
          <p className="small"><b>Refresh until one of those gifts (or a swap worth making) shows up</b>, in this order:</p>
          <ol className="refresh-steps small">
            {a.steps.map((s, i) => <li key={i}>{stepText(s, kw)}</li>)}
            {a.stop && <li className="muted">Then stop: {a.stopReason === 'cost'
              ? 'more would leave too little Cost to buy what turns up'
              : <>the next one ({a.stop.price} Cost) isn't worth what it costs</>}.</li>}
          </ol>
        </>
      ) : (
        <p className="small"><b>Don't refresh.</b> {a.wanted.length ? 'The odds of something better are too low for the price.' : 'Nothing the shop can roll beats what you can already do with the Cost.'}</p>
      )}
      <div className="refresh-done small">
        Paid refreshes done at this shop: <b>{paidDone}</b>
        <button className="btn small-btn" onClick={() => addPaid('normal')}>+ Refresh ({refreshPrice('normal', paidDone)})</button>
        {a.keyword && <button className="btn small-btn" onClick={() => addPaid('keyword')}>+ Keyword ({refreshPrice('keyword', paidDone)})</button>}
        <button className="btn small-btn" onClick={removePaid} disabled={!paidDone} aria-label="Take one back">Undo</button>
      </div>
      <p className="muted small">
        The game doesn't publish how strongly a keyword refresh leans, so this assumes about {pct(REFRESH.keywordShare)} of its gifts
        {' '}are the keyword you pick, and that free refreshes don't raise the price of paid ones.
      </p>
    </section>
  )
}
