/**
 * Shop overview (Finley, 2026-11-15: "a home type of page that tells you what would benefit your
 * team the most between buying gifts, swapping skills, and enhancing"). One list of every move a
 * shop offers, best value per Cost first, on one scale:
 *
 *  - buy:     a top pick a shop on this floor can sell (shopadvice.ts `shopBuys`);
 *  - enhance: the next worthwhile upgrade of a gift you have (upgrades.ts `planUpgrades`);
 *  - swap:    each deployed identity's recommended Skill Replacement (skillswap.ts `planSwaps`).
 *
 * The scale is "value per 100 Cost, as a share of what 100 Cost buys in a shop" (1 = as good as a
 * typical good shop gift), which buys and upgrades already use. A swap's score is % of team value
 * per 100 Cost (floors left included); it is put on the same scale by its own "worth buying" bar
 * (SWAP_WEIGHTS.worth), which the swap planner treats as on a par with buying a good gift.
 *
 * Buys and swaps depend on what the shop rolled (stock; the sinner a regular shop's Skill
 * Replacement is for), so they say "if the shop has it". With the Cost you have, `shopPlan` picks
 * what fits, best first, like `affordable` does for upgrades; a regular shop offers Skill Replacement
 * for one random sinner, so the plan holds one swap, for whichever of the good ones the shop offers.
 */
import type { CostKeep } from './costkeep'
import { starcloudLoss } from './costkeep'
import { shopBuys } from './shopadvice'
import { SWAP_WEIGHTS, type IdentityPlan, type SwapKind } from './skillswap'
import { isCore, planUpgrades, UPGRADE_LEVELS } from './upgrades'
import type { GiftScore, RunContext } from './scoring'
import type { Gift, Identity } from './types'

export type MoveKind = 'buy' | 'enhance' | 'swap'

export interface ShopMove {
  kind: MoveKind
  /** Unique per move. */
  key: string
  cost: number
  /** Value per 100 Cost, 1 = a typical good shop gift. */
  ratio: number
  gift?: Gift
  /** enhance: the level before and after. */
  from?: number
  to?: number
  /** swap: whose deck, which swap, and what it does. */
  identity?: Identity
  swap?: SwapKind
  skillFrom?: string
  skillTo?: string
  /** swap: the change in the team's value per turn (0.02 = +2%). */
  gain?: number
  /** Short reasons (the swap planner's pros; a buy's "Built for your team"). */
  why: string[]
  /** Depends on what the shop rolled. */
  chance: boolean
}

/** Gifts to buy and swaps counted (the list is about the best few, not all of them). */
const LIMITS = { buys: 5, upgrades: 6 }

export function shopMoves(
  ctx: RunContext, ranked: GiftScore[], levels: Record<string, number>, availableNow: Set<string>, swapPlans: IdentityPlan[],
): ShopMove[] {
  const up = planUpgrades(ctx, levels)
  const byId = new Map(ranked.map((r) => [r.gift.id, r]))
  const buys: ShopMove[] = shopBuys(ctx, ranked, availableNow, up.shop, LIMITS.buys).map((b) => ({
    kind: 'buy', key: `buy:${b.gift.id}`, cost: b.gift.cost ?? 0, ratio: b.ratio, gift: b.gift, chance: true,
    why: (byId.get(b.gift.id)?.reasons ?? []).filter((r) => r.kind === 'good').slice(0, 2).map((r) => r.text),
  }))
  // Only each gift's next level: its ++ shows up once the + is done.
  const seen = new Set<string>()
  const upgrades: ShopMove[] = []
  for (const m of up.order) {
    if (seen.has(m.gift.id) || !(isCore(m.priority) || m.priority === 'spare')) continue
    seen.add(m.gift.id)
    upgrades.push({
      kind: 'enhance', key: `enh:${m.gift.id}:${m.to}`, cost: m.cost, ratio: m.ratio, gift: m.gift, from: m.from, to: m.to, chance: false,
      why: [], // the Enhance tab has the before/after text
    })
    if (upgrades.length >= LIMITS.upgrades) break
  }
  const swaps: ShopMove[] = swapPlans.flatMap((p) => {
    const s = p.best ?? p.spare
    if (!s || s.hurts) return []
    return [{
      kind: 'swap' as const, key: `swap:${p.identity.id}:${s.kind}`, cost: s.cost, ratio: Math.max(0, s.score) / SWAP_WEIGHTS.worth,
      identity: p.identity, swap: s.kind, skillFrom: s.from.name, skillTo: s.to.name, gain: s.gain, chance: true, why: s.pros.slice(0, 2),
    }]
  })
  return [...buys, ...upgrades, ...swaps].filter((m) => m.ratio > 0).sort((a, b) => b.ratio - a.ratio)
}

/** Below this a move isn't worth spending on when Cost is short (an upgrade's "Low" bar). */
export const WORTH = UPGRADE_LEVELS.low

/**
 * What to do with the Cost you have, best value first: moves that fit, one per gift and identity.
 * With Cost to keep for the next floor (Cumulating Starcloud), a move that dips below it also pays
 * the bonus it loses, and waits unless it's still worth it.
 */
export function shopPlan(moves: ShopMove[], budget: number, keep: CostKeep | null = null): {
  moves: ShopMove[]; spent: number; lost: number
  /** A regular shop offers Skill Replacement for one random sinner: the plan has one swap, for
   *  whichever of these it turns out to be (the plan's swap first). */
  swapFor: ShopMove[]
} {
  const picked: ShopMove[] = []
  let spent = 0
  let lost = 0
  const swaps = moves.filter((m) => m.kind === 'swap' && m.ratio >= WORTH)
  for (const m of moves) {
    if (m.ratio < WORTH || spent + m.cost > budget) continue
    if (m.kind === 'swap' && picked.some((p) => p.kind === 'swap')) continue
    if (keep) {
      const loss = starcloudLoss(keep, budget - spent, m.cost)
      if (loss > 0 && m.ratio * m.cost / (m.cost + loss) < WORTH) continue
      lost += loss
    }
    picked.push(m)
    spent += m.cost
  }
  const swap = picked.find((m) => m.kind === 'swap')
  return { moves: picked, spent, lost: Math.round(lost), swapFor: swap ? [swap, ...swaps.filter((m) => m !== swap && m.cost <= swap.cost)] : [] }
}

/** "Top pick" … "Spare Cost only": how a move's value per Cost compares with a typical good shop gift. */
export function worthLabel(ratio: number): { text: string; cls: string } {
  if (ratio >= 1.25) return { text: 'Top pick', cls: 'top' }
  if (ratio >= 0.9) return { text: 'Strong', cls: 'strong' }
  if (ratio >= 0.6) return { text: 'Good', cls: 'good' }
  if (ratio >= WORTH) return { text: 'Fair', cls: 'fair' }
  return { text: 'Spare Cost only', cls: 'spare' }
}
