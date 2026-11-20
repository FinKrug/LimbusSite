/**
 * Shop overview (Finley, 2026-11-15: "a home type of page that tells you what would benefit your
 * team the most between buying gifts, swapping skills, and enhancing"). One list of every move a
 * shop offers, best value per Cost first, on one scale:
 *
 *  - buy:     a top pick a shop on this floor can sell (shopadvice.ts `shopBuys`);
 *  - enhance: the next worthwhile upgrade of a gift you have (upgrades.ts `planUpgrades`);
 *  - swap:    each deployed identity's recommended Skill Replacement (skillswap.ts `planSwaps`), two
 *             ways (Finley, 2026-11-15; wiki: Shop Functions): Skill Replacement, for the Sinner the
 *             shop rolled (45 / 75 / 120), or, at a Super Shop, ID Skill Search, for the Sinner you pick
 *             (90 / 150 / 240 Cost, or 25 / 50 / 75 Starlight; Trial Plan Guide doesn't lower it).
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
import { isCore, planUpgrades, shopValue, UPGRADE_LEVELS } from './upgrades'
import { LIST_PRICES } from './shopprices'
import type { GiftScore, RunContext } from './scoring'
import type { Gift, Identity, ThemePack } from './types'
import { fusionIdeas, fusionKeywords, recipePlans, type FusionIdea, type RecipePlan } from './fusion'

/** 'fuse': a recipe you can make now (free; never part of the Cost plan). */
export type MoveKind = 'buy' | 'enhance' | 'swap' | 'fuse'

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
  /** fuse: the gifts that go in (the result is `gift`). */
  uses?: Gift[]
  /** swap: ID Skill Search (you pick the Sinner, at a Super Shop) rather than the shop's random one. */
  pick?: boolean
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
  opts: { superShop?: boolean } = {},
): ShopMove[] {
  const up = planUpgrades(ctx, levels)
  const byId = new Map(ranked.map((r) => [r.gift.id, r]))
  const buys: ShopMove[] = shopBuys(ctx, ranked, availableNow, up.shop, LIMITS.buys).map((b) => ({
    kind: 'buy', key: `buy:${b.gift.id}`, cost: b.price, ratio: b.ratio, gift: b.gift, chance: true,
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
  // A swap's score is per 100 Cost at the swap's price (skillswap.ts, Trial Plan Guide included); its
  // "worth buying" bar matches a good gift at list prices, so when gifts are cheaper (Wealth, Prestige
  // Card) a swap is worth that much less next to them.
  const cheaper = shopValue(ctx, LIST_PRICES) / (up.shop || 1)
  const swaps: ShopMove[] = swapPlans.flatMap((p) => {
    const s = p.best ?? p.spare
    if (!s || s.hurts) return []
    const random: ShopMove = {
      kind: 'swap', key: `swap:${p.identity.id}:${s.kind}`, cost: s.cost, ratio: Math.max(0, s.score) / SWAP_WEIGHTS.worth * cheaper,
      identity: p.identity, swap: s.kind, skillFrom: s.from.name, skillTo: s.to.name, gain: s.gain, chance: true, why: s.pros.slice(0, 2),
    }
    // ID Skill Search: the same swap, sure, at its own price (value per Cost scales down with it).
    const pick: ShopMove = { ...random, key: `pick:${p.identity.id}:${s.kind}`, cost: s.search, ratio: random.ratio * s.cost / s.search, chance: false, pick: true }
    return opts.superShop ? [random, pick] : [random]
  })
  return [...buys, ...upgrades, ...swaps].filter((m) => m.ratio > 0).sort((a, b) => b.ratio - a.ratio)
}

/**
 * Skill swaps a shop allows (wiki: Shop Functions › Super Shops; Finley, 2026-11-19: "in a super
 * shop, there is a max of 3 skill swaps, and in a regular shop there is only one"): a regular shop
 * replaces 1 Sinner's skill (the one it rolled); a Super Shop 2 rolled Sinners plus 1 of your choice
 * (ID Skill Search).
 */
export const SHOP_SWAPS = { regular: { random: 1, search: 0 }, super: { random: 2, search: 1 } }

/** Swaps recorded at the shop you're in (this floor's). */
export interface ShopSwapsDone { floor: number | null; random: number; search: number }
export const NO_SHOP_SWAPS: ShopSwapsDone = { floor: null, random: 0, search: 0 }

/** Swaps this shop still allows, of each kind. */
export function swapsLeft(done: ShopSwapsDone, superShop: boolean): { random: number; search: number; total: number; max: number } {
  const cap = SHOP_SWAPS[superShop ? 'super' : 'regular']
  const random = Math.max(0, cap.random - done.random)
  const search = Math.max(0, cap.search - done.search)
  return { random, search, total: random + search, max: cap.random + cap.search }
}

/** Leave out swaps the shop has no room left for (all random ones once its Sinner(s) are used). */
export function limitSwaps(moves: ShopMove[], left: { random: number; search: number }): ShopMove[] {
  return moves.filter((m) => m.kind !== 'swap' || (m.pick ? left.search > 0 : left.random > 0))
}

/** Below this a move isn't worth spending on when Cost is short (an upgrade's "Low" bar). */
export const WORTH = UPGRADE_LEVELS.low

/**
 * What to do with the Cost you have, best value first: moves that fit, one per gift and identity.
 * With Cost to keep for the next floor (Cumulating Starcloud), a move that dips below it also pays
 * the bonus it loses, and waits unless it's still worth it.
 */
export function shopPlan(moves: ShopMove[], budget: number, keep: CostKeep | null = null, opts: { superShop?: boolean; done?: ShopSwapsDone } = {}): {
  moves: ShopMove[]; spent: number; lost: number
  /** A regular shop offers Skill Replacement for one random sinner (a Super Shop, two): the plan's
   *  random swap is for whichever of these it turns out to be (the plan's swap first). */
  swapFor: ShopMove[]
} {
  const picked: ShopMove[] = []
  let spent = 0
  let lost = 0
  const swaps = moves.filter((m) => m.kind === 'swap' && !m.pick && m.ratio >= WORTH)
  // Random swaps: as many as Sinners the shop offers (1, or 2 at a Super Shop); ID Skill Search: 1
  // at a Super Shop. Less what you've already done here. One swap per identity either way.
  const left = swapsLeft(opts.done ?? NO_SHOP_SWAPS, !!opts.superShop)
  const randomSlots = left.random
  for (const m of moves) {
    if (m.ratio < WORTH || spent + m.cost > budget) continue
    if (m.kind === 'swap') {
      const mine = picked.filter((p) => p.kind === 'swap')
      if (mine.some((p) => p.identity!.id === m.identity!.id)) continue
      if (m.pick ? mine.filter((p) => p.pick).length >= left.search : mine.filter((p) => !p.pick).length >= randomSlots) continue
    }
    if (keep) {
      const loss = starcloudLoss(keep, budget - spent, m.cost)
      if (loss > 0 && m.ratio * m.cost / (m.cost + loss) < WORTH) continue
      lost += loss
    }
    picked.push(m)
    spent += m.cost
  }
  const randoms = picked.filter((m) => m.kind === 'swap' && !m.pick)
  const taken = new Set(picked.filter((m) => m.kind === 'swap').map((m) => m.identity!.id))
  const most = Math.max(0, ...randoms.map((m) => m.cost))
  return { moves: picked, spent, lost: Math.round(lost),
    swapFor: randoms.length ? [...randoms, ...swaps.filter((m) => !taken.has(m.identity!.id) && m.cost <= most)] : [] }
}

/** "Top pick" … "Spare Cost only": how a move's value per Cost compares with a typical good shop gift. */
export function worthLabel(ratio: number): { text: string; cls: string } {
  if (ratio >= 1.25) return { text: 'Top pick', cls: 'top' }
  if (ratio >= 0.9) return { text: 'Strong', cls: 'strong' }
  if (ratio >= 0.6) return { text: 'Good', cls: 'good' }
  if (ratio >= WORTH) return { text: 'Fair', cls: 'fair' }
  return { text: 'Spare Cost only', cls: 'spare' }
}

/**
 * Fusing on the overview (Finley, 2026-11-15: "the shop overview does not account for fusing gifts").
 * Fusing is free (wiki: Shop Functions, Fuse Gifts: "Free"), so it doesn't compete for Cost: it goes
 * first. A recipe you can make now and that's worth it (fusion.ts `recipePlans`), and the best random
 * fusion of spare gifts for each of your keywords (`fusionIdeas`). Doing them before buying matters:
 * the result can change what's worth buying, and the gifts that go in shouldn't be enhanced first
 * (upgrades.ts already leaves those alone).
 */
export interface ShopFusions {
  /** Recipes you have every piece of, worth making, with the gifts that go in. */
  recipes: { plan: RecipePlan; uses: Gift[]; needsSuper: boolean; move: ShopMove }[]
  /** The best random fusions of spare gifts (best first). */
  ideas: FusionIdea[]
}

export function shopFusions(ctx: RunContext, owned: string[], keywords: string[], pack: ThemePack | null, superShop: boolean): ShopFusions {
  // At a Super Shop, a recipe can skip an intermediate one (Ruin without making Eerie Effigy first).
  const recipes = recipePlans(ctx, owned, { superShop }).filter((p) => p.ready && p.worthIt).map((plan) => {
    const f = plan.fusion
    const uses = plan.uses.map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g)
    const move: ShopMove = { kind: 'fuse', key: `fuse:${plan.result.id}`, cost: 0, ratio: 0, gift: plan.result, uses, chance: false, why: [] }
    return { plan, uses, needsSuper: !!f.super_shop && !superShop, move }
  })
  const ideas = fusionIdeas(ctx, owned, fusionKeywords(ctx, keywords), pack, superShop).slice(0, 2)
  return { recipes, ideas }
}
