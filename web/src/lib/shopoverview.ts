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
import { floorsWeight, SWAP_WEIGHTS, type IdentityPlan, type SwapKind } from './skillswap'
import { isCore, planUpgrades, shopBaseline, shopValue, UPGRADE_LEVELS } from './upgrades'
import { LIST_PRICES } from './shopprices'
import { intrinsicScore, levelValue, type GiftScore, type Reason, type RunContext } from './scoring'
import type { Gift, Identity, ThemePack } from './types'
import { fodder, fusionIdeas, fusionKeywords, isSpare, recipePlans, type FuseOdds, type FusionIdea, type RecipePlan } from './fusion'

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
  /** The numbers behind its place on the list, for "Why?" (Finley, 2026-11-23). */
  explain?: MoveWhy
}

/**
 * Why a move is worth what the list says (Finley, 2026-11-23: "I would like more detailed
 * explanations in the overview... originally I thought you were wrong but now it makes more sense").
 * Every buy and enhance is valued the same way: what it adds to your team's score, per 100 Cost,
 * next to what 100 Cost buys in a typical good gift (`shopBaseline`).
 */
export interface MoveWhy {
  /** buy: the gift's value; enhance: its value before. With the reasons behind it. */
  score?: number
  reasons?: Reason[]
  /** enhance: the value after, the effect text before and after, and how much stronger (1.4 = 40%). */
  after?: number
  textFrom?: string
  textTo?: string
  stronger?: number
  /** swap: what it does and doesn't do, and the floors left to use it. */
  pros?: string[]
  cons?: string[]
  floorsLeft?: number
  /** Score added for the move, per 100 Cost (buy and enhance). */
  per100?: number
  /** What 100 Cost buys for your team in a typical good gift, and the gifts that set it. */
  shop: number
  examples: { name: string; score: number; price: number }[]
}

/** An effect's text at an upgrade level (0 = as it is). */
const textAt = (g: Gift, level: number) => (level > 0 ? g.upgrades?.[level - 1] ?? g.effect : g.effect) ?? ''

/** Gifts to buy and swaps counted (the list is about the best few, not all of them). */
const LIMITS = { buys: 5, upgrades: 6 }

export function shopMoves(
  ctx: RunContext, ranked: GiftScore[], levels: Record<string, number>, availableNow: Set<string>, swapPlans: IdentityPlan[],
  opts: { superShop?: boolean } = {},
): ShopMove[] {
  const up = planUpgrades(ctx, levels)
  const byId = new Map(ranked.map((r) => [r.gift.id, r]))
  const base = shopBaseline(ctx)
  const baseline = { shop: up.shop || 1, examples: base.gifts.slice(0, 3).map((x) => ({ name: x.gift.name, score: x.score, price: x.price })) }
  const buys: ShopMove[] = shopBuys(ctx, ranked, availableNow, up.shop, LIMITS.buys).map((b) => {
    const score = intrinsicScore(b.gift, ctx).score
    return {
      kind: 'buy', key: `buy:${b.gift.id}`, cost: b.price, ratio: b.ratio, gift: b.gift, chance: true,
      why: (byId.get(b.gift.id)?.reasons ?? []).filter((r) => r.kind === 'good').slice(0, 2).map((r) => r.text),
      explain: { score, reasons: byId.get(b.gift.id)?.reasons ?? [], per100: score / Math.max(1, b.price) * 100, ...baseline },
    }
  })
  // Only each gift's next level: its ++ shows up once the + is done.
  const seen = new Set<string>()
  const upgrades: ShopMove[] = []
  for (const m of up.order) {
    if (seen.has(m.gift.id) || !(isCore(m.priority) || m.priority === 'spare')) continue
    seen.add(m.gift.id)
    const textFrom = textAt(m.gift, m.from)
    const textTo = textAt(m.gift, m.to)
    const before = levelValue(m.gift, ctx, m.from)
    const after = levelValue(m.gift, ctx, m.to)
    upgrades.push({
      kind: 'enhance', key: `enh:${m.gift.id}:${m.to}`, cost: m.cost, ratio: m.ratio, gift: m.gift, from: m.from, to: m.to, chance: false,
      why: [], // the Enhance tab has the before/after text
      explain: {
        score: before, after,
        reasons: byId.get(m.gift.id)?.reasons ?? intrinsicScore(m.gift, ctx).reasons,
        // As the gift's values have it (levelValue: each level scored next to the gift as it is).
        textFrom, textTo, stronger: before > 0 ? after / before : 1,
        per100: m.gain / Math.max(1, m.cost) * 100, ...baseline,
      },
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
      explain: { pros: s.pros, cons: s.cons, floorsLeft: floorsWeight(ctx.run).floorsLeft, ...baseline },
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
export function shopPlan(moves: ShopMove[], budget: number, keep: CostKeep | null = null, opts: {
  superShop?: boolean; done?: ShopSwapsDone
  /** Save or spend (costsave.ts): the value per Cost a move needs now (default WORTH), what each
   *  Cost spent adds toward a Super Shop, and Cost to hold back for later floors. */
  save?: { bar: number; meterBonus: number; reserve: number }
} = {}): {
  moves: ShopMove[]; spent: number; lost: number
  /** A regular shop offers Skill Replacement for one random sinner (a Super Shop, two): the plan's
   *  random swap is for whichever of these it turns out to be (the plan's swap first). */
  swapFor: ShopMove[]
} {
  const picked: ShopMove[] = []
  let spent = 0
  let lost = 0
  const bar = opts.save ? opts.save.bar - opts.save.meterBonus : WORTH
  const worth = (m: ShopMove) => m.ratio >= bar
  budget = Math.max(0, budget - heldBack(budget, opts.save?.reserve ?? 0))
  const swaps = moves.filter((m) => m.kind === 'swap' && !m.pick && worth(m))
  // Random swaps: as many as Sinners the shop offers (1, or 2 at a Super Shop); ID Skill Search: 1
  // at a Super Shop. Less what you've already done here. One swap per identity either way.
  const left = swapsLeft(opts.done ?? NO_SHOP_SWAPS, !!opts.superShop)
  const randomSlots = left.random
  for (const m of moves) {
    if (!worth(m) || spent + m.cost > budget) continue
    if (m.kind === 'swap') {
      const mine = picked.filter((p) => p.kind === 'swap')
      if (mine.some((p) => p.identity!.id === m.identity!.id)) continue
      if (m.pick ? mine.filter((p) => p.pick).length >= left.search : mine.filter((p) => !p.pick).length >= randomSlots) continue
    }
    if (keep) {
      const loss = starcloudLoss(keep, budget - spent, m.cost)
      if (loss > 0 && m.ratio * m.cost / (m.cost + loss) < Math.max(bar, WORTH)) continue
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

/** Cost the plan holds back for floors 11-15: the reserve, but at most 30% of what you have. */
export function heldBack(cost: number, reserve: number): number {
  return Math.min(reserve, Math.round(cost * 0.3 / 10) * 10)
}

/** "Top pick" … "Spare Cost only": how a move's value per Cost compares with a typical good shop gift. */
/** The worth labels' bars, for explaining them. */
export const WORTH_BARS = [['Top pick', 1.25], ['Strong', 0.9], ['Good', 0.6], ['Fair', WORTH]] as const

/** A move's "Why?": a one-line summary, then the steps behind it in plain words. */
export function explainMove(m: ShopMove): { summary: string; steps: string[] } | null {
  const e = m.explain
  if (!e) return null
  const n = (x: number) => x.toFixed(x >= 10 ? 1 : 2)
  const times = `${m.ratio.toFixed(2)}×`
  const label = worthLabel(m.ratio).text
  const bars = `${WORTH_BARS.map(([t, b]) => `${t} ${b}×`).join(', ')}; below that, Spare Cost only`
  const compare = [
    `Buying gifts gets your team about ${n(e.shop)} per 100 Cost: that's the middle of the 10 best-value gifts you could buy this floor`
      + (e.examples.length ? `, like ${e.examples.map((x) => `${x.name} (${n(x.score)} for ${x.price} Cost)`).join(', ')}.` : '.'),
    `${e.per100 !== undefined ? `${n(e.per100)} ÷ ${n(e.shop)} = ` : ''}${times} the value per Cost of a typical good buy, so it's "${label}" (${bars}).`,
  ]
  const why = (rs: Reason[] | undefined) => {
    const good = (rs ?? []).filter((r) => r.kind === 'good').map((r) => r.text)
    const bad = (rs ?? []).filter((r) => r.kind === 'bad').map((r) => r.text)
    return [good.length ? `What counts for it: ${good.join('; ')}.` : null, bad.length ? `What counts against it: ${bad.join('; ')}.` : null]
  }
  const bare = (name?: string) => (name ?? '').replace(/\.$/, '')
  const pctUp = (x: number) => `${Math.round((x - 1) * 100)}%`
  if (m.kind === 'enhance' && e.score !== undefined && e.after !== undefined) {
    const gain = e.after - e.score
    const plus = '+'.repeat(m.to ?? 1)
    return {
      summary: `Enhancing to ${plus} makes it about ${pctUp(e.stronger ?? 1)} stronger for only ${m.cost} Cost: ${times} the value per Cost of a typical good buy.`,
      steps: [
        `${m.gift!.name}${m.from ? '+'.repeat(m.from) : ''} is worth ${n(e.score)} to your team now (a score: the same one the Buy list ranks gifts by).`,
        ...why(e.reasons),
        e.textFrom && e.textTo && e.textFrom !== e.textTo ? `Enhancing to ${plus} changes "${e.textFrom.replace(/\s+/g, ' ').trim()}" into "${e.textTo.replace(/\s+/g, ' ').trim()}"` : null,
        `The site counts that as about ${pctUp(e.stronger ?? 1)} stronger, so it would be worth ${n(e.after)}: +${n(gain)} for ${m.cost} Cost, or ${n(e.per100 ?? 0)} per 100 Cost.`,
        ...compare,
        m.ratio >= 0.9 && m.cost <= 75 ? `It ranks this high mostly because it's cheap: a small gain for little Cost is still good value.` : null,
      ].filter((x): x is string => !!x),
    }
  }
  if (m.kind === 'buy' && e.score !== undefined) {
    return {
      summary: `Worth ${n(e.score)} to your team for ${m.cost} Cost: ${times} the value per Cost of a typical good buy.`,
      steps: [
        `${m.gift!.name} is worth ${n(e.score)} to your team (a score: the one the Buy list ranks gifts by).`,
        ...why(e.reasons),
        `${n(e.score)} for ${m.cost} Cost is ${n(e.per100 ?? 0)} per 100 Cost.`,
        ...compare,
        `Only if this shop has it: shops are random.`,
      ].filter((x): x is string => !!x),
    }
  }
  if (m.kind === 'swap') {
    const gain = m.gain ?? 0
    const sign = gain >= 0 ? '+' : ''
    return {
      summary: `${sign}${(gain * 100).toFixed(1)}% team value every turn for ${m.cost} Cost, for the ${e.floorsLeft ?? 0} floors left: ${times} a typical good buy.`,
      steps: [
        `${bare(m.skillTo)} replaces a copy of ${bare(m.skillFrom)} in ${m.identity!.name}'s deck. In the site's battle simulation that changes your team's value per turn by ${sign}${(gain * 100).toFixed(1)}%.`,
        e.pros?.length ? `What counts for it: ${e.pros.join('; ')}.` : null,
        e.cons?.length ? `What counts against it: ${e.cons.join('; ')}.` : null,
        `A swap keeps paying off every fight, so it's worth more with more floors left (${e.floorsLeft} here) and less near the end.`,
        `A swap is on a par with buying a good gift at ${SWAP_WEIGHTS.worth}% team value per 100 Cost (with 8+ floors left). This one comes out at ${times} that, so it's "${label}" (${bars}).`,
        m.pick ? `ID Skill Search costs more than a Skill Replacement, but you pick the Sinner instead of hoping the shop rolls them.` : `Only if the shop offers ${m.identity!.sinner}'s Skill Replacement: a regular shop rolls one Sinner.`,
      ].filter((x): x is string => !!x),
    }
  }
  return null
}

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

export function shopFusions(
  ctx: RunContext, owned: string[], keywords: string[], pack: ThemePack | null, superShop: boolean, odds: FuseOdds = 'safe',
): ShopFusions {
  // At a Super Shop, a recipe can skip an intermediate one (Ruin without making Eerie Effigy first).
  const recipes = recipePlans(ctx, owned, { superShop }).filter((p) => p.ready && p.worthIt).map((plan) => {
    const f = plan.fusion
    const uses = plan.uses.map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g)
    const move: ShopMove = { kind: 'fuse', key: `fuse:${plan.result.id}`, cost: 0, ratio: 0, gift: plan.result, uses, chance: false, why: [] }
    return { plan, uses, needsSuper: !!f.super_shop && !superShop, move }
  })
  // Random fusions only from gifts on the Fuse tab's "Sell or fuse these" list (Finley, 2026-11-20:
  // with nothing there, the overview shouldn't suggest fusing gifts the team uses).
  const spare = new Set(fodder(ctx, [...new Set(owned)]).filter(isSpare).map((n) => n.gift.id))
  const ideas = spare.size < 2 ? [] : fusionIdeas(ctx, owned, fusionKeywords(ctx, keywords), pack, superShop, odds)
    .filter((i) => i.ingredients.every((x) => spare.has(x.gift.id))).slice(0, 2)
  return { recipes, ideas }
}
