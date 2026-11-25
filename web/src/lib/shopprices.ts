/**
 * Shop prices with the gifts you own (Finley, 2026-11-15: "if you have wealth, everything in the shop
 * that it affects should have its price updated to reflect that. This should also affect the overview
 * page"). Gift texts (gifts.json):
 *  - Wealth (EX): "Fix all E.G.O Gift Purchase & Enhancement Cost to 1" (each enhance step costs 1).
 *  - Prestige Card: "Shop E.G.O Gift Purchase Cost -30%"
 *  - Renewed Merch: "Shop E.G.O Gift Enhance Cost -30%"
 *  - Trial Plan Guide: "Shop Skill Replacement Cost -30% (excluding Skill Search fee)"
 *  - Pre-order Discount: "Shop Regular Refresh Cost -30%" (not the keyword refresh)
 * Wealth wins over the -30% gifts. How the game rounds a -30% price isn't published: rounded here.
 *
 * Inflation (an adversity, Finley 2026-11-24; adversities.json): "Doubles the cost of every Shop
 * function, except for selling E.G.O Gifts" (II: triples). It applies from the floor after the one
 * it's chosen on, to gifts, enhancing, skill swaps (Skill Search too), refreshes and healing.
 * Not published: whether it doubles Wealth's fixed 1. Taken here as no ("fix to 1" wins).
 */
import { ENHANCE_COST, type RunContext, type RunSettings } from './scoring'
import type { Gift } from './types'

export interface ShopPrices {
  /** What changes prices (gifts you own, Inflation), with what it changes (for showing). */
  discounts: { gift: Gift | null; name: string; text: string }[]
  /** Inflation's multiplier on every shop price (1 without it). */
  scale: number
  wealth: boolean
  /** A gift's price in a shop (null: not sold). */
  gift: (g: Gift) => number | null
  /** Enhancing from one level to another (each step paid separately). */
  enhance: (g: Gift, from: number, to: number) => number
  /** A Skill Replacement at its list price (45 / 75 / 120). */
  swap: (list: number) => number
  /** A refresh at its list price (normal: 15 +15 each; keyword: 90 +15 each). */
  refresh: (kind: 'normal' | 'keyword', list: number) => number
  /** Anything else the shop charges, at its list price (ID Skill Search, a heal). */
  other: (list: number) => number
}

const NAMES = { wealth: 'Wealth', purchase: 'Prestige Card', enhance: 'Renewed Merch', swap: 'Trial Plan Guide', refresh: 'Pre-order Discount' }
const OFF = 0.7

function build(owned: Gift[], scale = 1): ShopPrices {
  const has = (name: string) => owned.find((g) => g.name === name)
  const wealth = has(NAMES.wealth)
  const purchase = has(NAMES.purchase)
  const enh = has(NAMES.enhance)
  const swap = has(NAMES.swap)
  const refresh = has(NAMES.refresh)
  const off = (n: number) => Math.round(n * OFF)
  const discounts: ShopPrices['discounts'] = []
  const by = (gift: Gift, text: string) => discounts.push({ gift, name: gift.name, text })
  if (wealth) by(wealth, 'every gift and every enhance costs 1')
  if (purchase && !wealth) by(purchase, 'gifts cost 30% less')
  if (enh && !wealth) by(enh, 'enhancing costs 30% less')
  if (swap) by(swap, 'skill swaps cost 30% less')
  if (refresh) by(refresh, 'refreshes (not keyword ones) cost 30% less')
  if (scale > 1) discounts.push({ gift: null, name: scale >= 3 ? 'Inflation II' : 'Inflation I', text: `everything in the shop costs ${scale === 2 ? 'double' : scale === 3 ? 'triple' : `${scale}×`}${wealth ? ' (except what Wealth fixes at 1)' : ''}` })
  const up = (n: number) => n * scale
  return {
    discounts,
    scale,
    wealth: !!wealth,
    gift: (g) => (g.cost === null ? null : wealth ? 1 : up(purchase ? off(g.cost) : g.cost)),
    enhance: (g, from, to) => {
      const costs = ENHANCE_COST[g.tier ?? 0] ?? []
      const lo = Math.min(from, to)
      const hi = Math.max(from, to)
      return costs.slice(lo, hi).reduce((a, c) => a + (wealth ? 1 : up(enh ? off(c) : c)), 0)
    },
    swap: (list) => up(swap ? off(list) : list),
    refresh: (kind, list) => up(kind === 'normal' && refresh ? off(list) : list),
    other: up,
  }
}

/** Inflation's price multiplier on a floor (1 without it; II replaces I). */
export function priceScale(run: Pick<RunSettings, 'inflation' | 'floor'> | undefined, floor: number | null = run?.floor ?? null): number {
  if (!run?.inflation || floor === null) return 1
  return run.inflation.reduce((s, x) => (floor >= x.from ? Math.max(s, x.scale) : s), 1)
}

/** List prices: what the shop charges with none of those gifts. */
export const LIST_PRICES: ShopPrices = build([])

const cache = new WeakMap<Set<string>, Map<number, ShopPrices>>()

/** Prices for the gifts in this run context, on its floor (or `floor`: Inflation goes by floor). */
export function pricesFor(ctx: Pick<RunContext, 'owned' | 'giftsById'> & { run?: RunSettings }, floor?: number | null): ShopPrices {
  const scale = priceScale(ctx.run, floor === undefined ? ctx.run?.floor ?? null : floor)
  let byScale = cache.get(ctx.owned)
  if (!byScale) cache.set(ctx.owned, byScale = new Map())
  let p = byScale.get(scale)
  if (!p) byScale.set(scale, p = pricesFromGifts([...ctx.owned].map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g), scale))
  return p
}

export function pricesFromGifts(owned: Gift[], scale = 1): ShopPrices {
  return build(owned, scale)
}
