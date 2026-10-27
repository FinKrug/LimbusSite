/**
 * "Best use of your Cost" at a shop (Finley, 2026-10-27: when enhancing a gift helps your team more
 * than buying a new one, say so). Compares the best upgrade (upgrades.ts: value added per 100 Cost,
 * as a share of what 100 Cost buys in a shop) with your top shop picks you can buy on this floor,
 * measured the same way:
 *
 *  - enhance: the upgrade beats even your top picks per Cost: enhance first.
 *  - either:  the upgrade beats a typical good shop gift (ratio >= 1) but not your top picks:
 *             buy one of those if the shop has it, otherwise enhance.
 *  - buy:     shop gifts do more per Cost; enhance with what's left.
 *  - none:    nothing worth enhancing.
 *
 * The shop's stock is random and the site doesn't know it, hence "if the shop has it".
 */
import { affordable, isCore, planUpgrades, type UpgradeMove } from './upgrades'
import { intrinsicScore, type GiftScore, type RunContext } from './scoring'
import type { Gift } from './types'

export interface ShopBuy {
  gift: Gift
  /** Value per 100 Cost, as a share of a typical good shop gift's (same scale as UpgradeMove.ratio). */
  ratio: number
}

export interface ShopAdvice {
  kind: 'enhance' | 'either' | 'buy' | 'none'
  /** The upgrades worth doing first (up to 2), best first. */
  enhance: UpgradeMove[]
  /** Your top picks a shop on this floor can have, best first (up to 3). */
  buys: ShopBuy[]
  /** The ones among them worth more per Cost than the best upgrade. */
  better: ShopBuy[]
  /** The best upgrade's value per Cost compared with the best top pick's (e.g. 1.4 = 40% more). */
  versusBuy: number | null
}

/** Top picks counted. */
const TOP_PICKS = 3

/** Can a shop on this floor sell it: a main-pool gift with a price, tier I-IV, available now. */
function buyable(g: Gift, availableNow: Set<string>): boolean {
  return g.pools.includes('main') && (g.cost ?? 0) > 0 && (g.tier ?? 9) <= 4 && availableNow.has(g.id)
}

export function shopAdvice(
  ctx: RunContext, ranked: GiftScore[], levels: Record<string, number>, availableNow: Set<string>, cost: number | null = null,
): ShopAdvice {
  const up = planUpgrades(ctx, levels)
  const shop = up.shop || 1
  const buys = ranked
    .filter((r) => !ctx.owned.has(r.gift.id) && buyable(r.gift, availableNow))
    .slice(0, TOP_PICKS)
    .map((r) => ({ gift: r.gift, ratio: (intrinsicScore(r.gift, ctx).score / r.gift.cost! * 100) / shop }))
  // Worthwhile upgrades, the ones you can pay for first when you've said how much Cost you have.
  const core = up.order.filter((m) => isCore(m.priority))
  const fits = cost === null ? core : affordable(core, cost).moves
  const order = [...fits, ...core.filter((m) => !fits.includes(m))]
  const best = order[0]
  if (!best) return { kind: 'none', enhance: [], buys, better: buys, versusBuy: null }
  const topBuy = Math.max(0, ...buys.map((b) => b.ratio))
  const versusBuy = topBuy > 0 ? best.ratio / topBuy : null
  // A gift's ++ waits for its +: take the next move of a different gift, or this gift's next level.
  const enhance = [best, ...order.slice(1).filter((m) => m.gift.id !== best.gift.id || m.from === best.to).slice(0, 1)]
    .filter((m) => m.ratio >= Math.min(1, topBuy))
  const kind = versusBuy === null || versusBuy >= 1 ? 'enhance' : best.ratio >= 1 ? 'either' : 'buy'
  return { kind, enhance: kind === 'buy' ? [best] : enhance, buys, better: buys.filter((b) => b.ratio > best.ratio), versusBuy }
}
