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
 */
import { ENHANCE_COST, type RunContext } from './scoring'
import type { Gift } from './types'

export interface ShopPrices {
  /** Gifts you own that change prices, with what they change (for showing). */
  discounts: { gift: Gift; text: string }[]
  wealth: boolean
  /** A gift's price in a shop (null: not sold). */
  gift: (g: Gift) => number | null
  /** Enhancing from one level to another (each step paid separately). */
  enhance: (g: Gift, from: number, to: number) => number
  /** A Skill Replacement at its list price (45 / 75 / 120). */
  swap: (list: number) => number
  /** A refresh at its list price (normal: 15 +15 each; keyword: 90 +15 each). */
  refresh: (kind: 'normal' | 'keyword', list: number) => number
}

const NAMES = { wealth: 'Wealth', purchase: 'Prestige Card', enhance: 'Renewed Merch', swap: 'Trial Plan Guide', refresh: 'Pre-order Discount' }
const OFF = 0.7

function build(owned: Gift[]): ShopPrices {
  const has = (name: string) => owned.find((g) => g.name === name)
  const wealth = has(NAMES.wealth)
  const purchase = has(NAMES.purchase)
  const enh = has(NAMES.enhance)
  const swap = has(NAMES.swap)
  const refresh = has(NAMES.refresh)
  const off = (n: number) => Math.round(n * OFF)
  const discounts: ShopPrices['discounts'] = []
  if (wealth) discounts.push({ gift: wealth, text: 'every gift and every enhance costs 1' })
  if (purchase && !wealth) discounts.push({ gift: purchase, text: 'gifts cost 30% less' })
  if (enh && !wealth) discounts.push({ gift: enh, text: 'enhancing costs 30% less' })
  if (swap) discounts.push({ gift: swap, text: 'skill swaps cost 30% less' })
  if (refresh) discounts.push({ gift: refresh, text: 'refreshes (not keyword ones) cost 30% less' })
  return {
    discounts,
    wealth: !!wealth,
    gift: (g) => (g.cost === null ? null : wealth ? 1 : purchase ? off(g.cost) : g.cost),
    enhance: (g, from, to) => {
      const costs = ENHANCE_COST[g.tier ?? 0] ?? []
      const lo = Math.min(from, to)
      const hi = Math.max(from, to)
      return costs.slice(lo, hi).reduce((a, c) => a + (wealth ? 1 : enh ? off(c) : c), 0)
    },
    swap: (list) => (swap ? off(list) : list),
    refresh: (kind, list) => (kind === 'normal' && refresh ? off(list) : list),
  }
}

/** List prices: what the shop charges with none of those gifts. */
export const LIST_PRICES: ShopPrices = build([])

const cache = new WeakMap<Set<string>, ShopPrices>()

/** Prices for the gifts in this run context. */
export function pricesFor(ctx: Pick<RunContext, 'owned' | 'giftsById'>): ShopPrices {
  let p = cache.get(ctx.owned)
  if (!p) cache.set(ctx.owned, p = pricesFromGifts([...ctx.owned].map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g)))
  return p
}

export function pricesFromGifts(owned: Gift[]): ShopPrices {
  return build(owned)
}
