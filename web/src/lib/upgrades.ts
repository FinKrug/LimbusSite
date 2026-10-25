/**
 * Upgrade planner: which of your gifts to enhance at a shop, how far (+ or ++), in what order.
 *
 * Only gifts the game lets you enhance have upgrade text (gifts.json `upgrades`): the bright tiles on
 * the Enhance screen (checked against Finley's screenshot, 2026-10-22). Each level is worth what the
 * gift scores at that level for your team (levelValue: the upgraded text scored like any gift, times how
 * much its numbers grow), so clash effects, slots it starts covering and team fit all count.
 *
 *   step value   = value at the new level - value at the level before
 *   per 100 Cost = step value / its Enhance Cost x 100 (ENHANCE_COST: + and ++ per tier)
 *   priority     = per 100 Cost / what 100 Cost buys in a shop (`shopValue`: the median of your best
 *                  shop gifts' value per 100 Cost), so 1 = as good as buying a good gift
 *
 * Verdicts: "Max it" when ++ is still worth it after +, "Upgrade once" when only + is, "Skip" when
 * neither is (below UPGRADE_LEVELS.low). When ++ is better value than + on its own (+ barely changes
 * anything, ++ adds the effect), the plan goes straight to ++.
 */
import { ENHANCE_COST, intrinsicScore, levelValue, type RunContext } from './scoring'
import type { Gift } from './types'
import { isVestige } from './vestiges'

export const UPGRADE_LEVELS = { high: 1, medium: 0.6, low: 0.35 }
/** Shop gifts compared against: your best this many main-pool gifts. */
const SHOP_TOP = 10

export type Priority = 'high' | 'medium' | 'low' | 'skip'

export interface UpgradeMove {
  gift: Gift
  /** Level after this move (1 = +, 2 = ++). */
  to: number
  from: number
  cost: number
  /** Value added for your team. */
  gain: number
  /** gain per 100 Cost, as a share of what 100 Cost buys in a shop. */
  ratio: number
  priority: Priority
}

export interface UpgradePlan {
  gift: Gift
  /** Level you have it at. */
  level: number
  maxLevel: number
  verdict: 'max' | 'once' | 'skip' | 'done'
  /** Moves still to make, in order. */
  moves: UpgradeMove[]
  /** The best priority among its moves (for sorting). */
  ratio: number
  /** Value now and at each level, for showing what an upgrade does. */
  values: number[]
}

export function priorityOf(ratio: number): Priority {
  return ratio >= UPGRADE_LEVELS.high ? 'high' : ratio >= UPGRADE_LEVELS.medium ? 'medium' : ratio >= UPGRADE_LEVELS.low ? 'low' : 'skip'
}

/** Can the game enhance it, and how far. */
export function maxLevel(g: Gift): number {
  const costs = ENHANCE_COST[g.tier ?? 0]
  if (!costs) return 0
  return Math.min(costs.length, (g.upgrades ?? []).filter((t) => t && t !== g.effect).length, g.max_level || 2)
}

/** What 100 Cost buys in a shop for this team: the median value per 100 Cost of your best shop gifts. */
export function shopValue(ctx: RunContext): number {
  const per = ctx.data.gifts
    .filter((g) => g.pools.includes('main') && (g.cost ?? 0) > 0 && !ctx.owned.has(g.id) && (g.tier ?? 9) <= 4)
    .map((g) => intrinsicScore(g, ctx).score / g.cost! * 100)
    .sort((a, b) => b - a)
    .slice(0, SHOP_TOP)
  if (!per.length) return 1
  return per[per.length >> 1]
}

/** One gift's plan, given the level you have it at. */
export function planGift(g: Gift, ctx: RunContext, level: number, shop: number): UpgradePlan | null {
  const max = maxLevel(g)
  if (!max) return null
  const costs = ENHANCE_COST[g.tier ?? 0]!
  const values = Array.from({ length: max + 1 }, (_, l) => levelValue(g, ctx, l))
  const at = Math.min(level, max)
  const step = (from: number, to: number): UpgradeMove => {
    const cost = costs.slice(from, to).reduce((a, b) => a + b, 0)
    const gain = Math.max(0, values[to] - values[from])
    const ratio = shop > 0 ? (gain / cost * 100) / shop : 0
    return { gift: g, from, to, cost, gain, ratio, priority: priorityOf(ratio) }
  }
  if (at >= max) return { gift: g, level: at, maxLevel: max, verdict: 'done', moves: [], ratio: 0, values }
  const next = step(at, at + 1)
  let moves: UpgradeMove[] = [next]
  if (max - at >= 2) {
    const second = step(at + 1, at + 2)
    const both = step(at, at + 2)
    if (second.ratio > next.ratio && both.priority !== 'skip') moves = [both] // + alone is barely worth it; ++ is
    else if (second.priority !== 'skip') moves = [next, second]
  }
  moves = moves.filter((m) => m.priority !== 'skip')
  const reach = moves.length ? moves[moves.length - 1].to : at
  const verdict = !moves.length ? 'skip' : reach >= max ? 'max' : 'once'
  return { gift: g, level: at, maxLevel: max, verdict, moves, ratio: Math.max(next.ratio, ...moves.map((m) => m.ratio)), values }
}

export interface UpgradeOverview {
  /** Every owned gift that can be enhanced, best first (done and skipped last). */
  plans: UpgradePlan[]
  /** Every worthwhile move across your gifts, best first: the order to enhance in. */
  order: UpgradeMove[]
  /** Value per 100 Cost of a good shop gift (priority 1). */
  shop: number
  /** Owned gifts the game can't enhance. */
  fixed: number
}

/** Plans for all the gifts you own. `levels`: the level each gift is at (missing = not enhanced). */
export function planUpgrades(ctx: RunContext, levels: Record<string, number> = {}): UpgradeOverview {
  const shop = shopValue(ctx)
  const plans: UpgradePlan[] = []
  let fixed = 0
  for (const id of ctx.owned) {
    if (isVestige(id)) continue
    const g = ctx.giftsById.get(id)
    if (!g) continue
    const p = planGift(g, ctx, levels[id] ?? 0, shop)
    if (p) plans.push(p)
    else fixed++
  }
  const rank = { max: 0, once: 0, skip: 1, done: 2 }
  plans.sort((a, b) => rank[a.verdict] - rank[b.verdict] || b.ratio - a.ratio || a.gift.name.localeCompare(b.gift.name))
  // A gift's + and ++ moves are only split when + is the better value, so sorting (stable) keeps + first.
  const order = plans.flatMap((p) => p.moves).sort((a, b) => b.ratio - a.ratio)
  return { plans, order, shop, fixed }
}
