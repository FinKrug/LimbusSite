import { useMemo } from 'react'
import { shopAdvice } from '../lib/shopadvice'
import type { GiftScore, RunContext } from '../lib/scoring'
import { usePersistentState } from '../lib/storage'
import type { UpgradeMove } from '../lib/upgrades'

interface Props {
  ctx: RunContext
  ranked: GiftScore[]
  levels: Record<string, number>
  availableNow: Set<string>
  /** The Shop part on screen ('gifts' = Buy, 'upgrades' = Enhance). */
  tab: string
  onOpen: (tab: 'gifts' | 'upgrades') => void
}

const plus = (n: number) => '+'.repeat(n)
const move = (m: UpgradeMove) => <><b>{m.gift.name}</b> to {plus(m.to)} ({m.cost} Cost)</>
const names = (list: { gift: { name: string } }[]) => list.map((b, k) => (
  <span key={b.gift.name}>{k > 0 && (k === list.length - 1 ? ' or ' : ', ')}<b>{b.gift.name}</b></span>
))

/**
 * Shop screen: is the Cost better spent enhancing a gift you have or buying a new one (lib/shopadvice.ts)?
 * Shown above the Shop's parts; uses the Cost you entered on Enhance, if any.
 */
export function ShopAdvice({ ctx, ranked, levels, availableNow, tab, onOpen }: Props) {
  const [cost] = usePersistentState<number | null>('limbussite.cost.v1', null)
  const a = useMemo(() => shopAdvice(ctx, ranked, levels, availableNow, cost), [ctx, ranked, levels, availableNow, cost])
  if (!ctx.owned.size || a.kind === 'none') return null
  const [first, second] = a.enhance
  const more = a.versusBuy && a.versusBuy >= 1.1 ? ` (about ${a.versusBuy.toFixed(1)}× as much per Cost)` : ''
  const go = a.kind === 'buy' ? 'gifts' : 'upgrades'
  return (
    <section className={`panel shop-advice shop-advice-${a.kind}`} aria-live="polite">
      <div className="shop-advice-body">
        <h3>{a.kind === 'enhance' ? 'Enhance before buying' : a.kind === 'either' ? 'Enhance, unless the shop has a top pick' : 'Buy first'}</h3>
        <p className="small">
          {a.kind === 'enhance' && <>Upgrading {move(first)} does more for your team per Cost than buying {a.buys.length ? <>your top picks{more}</> : 'a new gift'}.
            {second && <> Then {move(second)}.</>}</>}
          {a.kind === 'either' && <>If the shop sells {names(a.better)}, buy it: worth more per Cost.
            {' '}Otherwise upgrade {move(first)}: it beats a typical shop gift.</>}
          {a.kind === 'buy' && <>Gifts like {names(a.better.slice(0, 2))} do more for your team per Cost than any upgrade.
            {' '}With Cost left after buying, upgrade {move(first)}.</>}
        </p>
      </div>
      {tab !== go && <button className="btn small-btn" onClick={() => onOpen(go)}>{go === 'upgrades' ? 'Open Enhance' : 'Open Buy'}</button>}
    </section>
  )
}
