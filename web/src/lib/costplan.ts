/**
 * How much Cost to have when you reach each floor's shop.
 *
 * Shops sell main-pool gifts at their listed price (Tier I ~150, II ~200,
 * III ~250, IV ~400; wiki: Mirror Dungeon). The minimum is enough for your
 * best-value shop gift on that floor (most score per Cost among your top 10),
 * plus a couple of refreshes to find it (15, then 30), plus a heal (100) from
 * floor 3 on, where fights hit harder. "Comfortable" also covers your #1 pick.
 *
 * The top gifts are ranked for that floor (Cost gifts early, survival gifts late),
 * with the gifts you own left out.
 */
import { rankGifts, type GiftScore, type RunContext } from './scoring'
import { tierLabel, type Gift } from './types'

export const COST_WEIGHTS = {
  /** Shop gifts considered for the best value. */
  topN: 10,
  /** Two refreshes: 15 + 30. */
  refresh: 45,
  heal: 100,
  /** Keep a heal from this floor on. */
  healFrom: 3,
}

export interface CostPart {
  label: string
  cost: number
}

export interface FloorCost {
  floor: number
  min: number
  /** Also enough for your #1 shop gift. */
  comfortable: number
  /** Best score per Cost among your top shop gifts. */
  value: Gift | null
  /** Your #1 shop gift. */
  top: Gift | null
  parts: CostPart[]
}

/** Gifts a regular shop can sell: the main pool, Tiers I-IV, with a price. */
export function shopGift(g: Gift): boolean {
  return g.pools.includes('main') && g.cost !== null && (g.tier ?? 0) >= 1 && (g.tier ?? 0) <= 4
}

export function floorCost(ctx: RunContext, floor: number): FloorCost {
  return floorCostFrom(rankGifts({ ...ctx, run: { ...ctx.run, floor } }), floor)
}

/** The same from gifts already ranked for that floor (the Best gifts list). */
export function floorCostFrom(rankedGifts: GiftScore[], floor: number): FloorCost {
  const ranked = rankedGifts.filter((s) => shopGift(s.gift)).slice(0, COST_WEIGHTS.topN)
  const top = ranked[0]?.gift ?? null
  const best = ranked.reduce<(typeof ranked)[number] | null>(
    (a, b) => (!a || b.score / b.gift.cost! > a.score / a.gift.cost! ? b : a), null)
  const value = best?.gift ?? null
  const parts: CostPart[] = []
  if (value) parts.push({ label: `${value.name} (Tier ${tierLabel(value.tier)}), your best value for the Cost`, cost: value.cost! })
  parts.push({ label: '2 refreshes to find it', cost: COST_WEIGHTS.refresh })
  if (floor >= COST_WEIGHTS.healFrom) parts.push({ label: 'A heal', cost: COST_WEIGHTS.heal })
  const round5 = (x: number) => Math.ceil(x / 5) * 5
  const reserve = parts.slice(value ? 1 : 0).reduce((a, p) => a + p.cost, 0)
  const min = round5((value?.cost ?? 0) + reserve)
  const comfortable = Math.max(min, round5((top?.cost ?? 0) + reserve))
  return { floor, min, comfortable, parts, value, top }
}

/** The minimum for every floor of the run. */
export function costPlan(ctx: RunContext): FloorCost[] {
  return Array.from({ length: ctx.run.floors }, (_, k) => floorCost(ctx, k + 1))
}
