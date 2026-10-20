/**
 * E.G.O gift fusion, as the game does it (wiki: Mirror Dungeon > Gift Fusion Details).
 *
 * - Pick a keyword category, then 2-3 gifts (up to 5 in a Super Shop).
 * - Recipe fusions: an exact set of gifts gives a fixed gift that can't be had
 *   any other way. Lunar Memory needs 5 (Super Shop only).
 * - Random fusions: any other set gives a random non-recipe gift. Its tier comes
 *   from fusion points (I 3, II 6, III 10, IV 15, V 30); it's of the chosen keyword
 *   with 60% (2 gifts), 90% (3) or 99% (4+) chance, and the pool includes gifts
 *   exclusive to the current floor's theme pack.
 *
 * Last chances: a current-pack exclusive you don't have, that no pack later in the run
 * can give (`lastChanceGifts`), counts x(1 + lastChance) in a fusion's expected value,
 * and suggestions aim for it: for each one that fits your team, the spare gifts that make
 * its keyword and tier with the best odds of rolling it come first ("Last chance at X").
 * Main-pool gifts can still be bought later; these can't.
 */
import { fullTierValue, intrinsicScore, isGone, setKeepValue, isHiddenPack, packOnFloor, packPool, recipeGiveUp, scoreGift, type GiftScore, type RunContext } from './scoring'
import { isVestige } from './vestiges'
import { fusableThisRun, mustHave, mustHaveRecipes, neededPiece } from './musthave'
import type { Combo, Fusion, Gift, ThemePack } from './types'

/** Keyword categories on the fusion screen. */
import { FUSION_KEYWORDS } from './types'
export { FUSION_KEYWORDS }
export type FusionKeyword = (typeof FUSION_KEYWORDS)[number]

export const FUSION_POINTS: Record<number, number> = { 1: 3, 2: 6, 3: 10, 4: 15, 5: 30, 6: 30 }
export const REGULAR_SLOTS = 3
export const SUPER_SLOTS = 5

export function fusionPoints(gifts: Gift[]): number {
  return gifts.reduce((sum, g) => sum + (FUSION_POINTS[g.tier ?? 1] ?? 3), 0)
}

/** Result tier from fusion points; Super Shops have slightly lower thresholds. */
export function fusionTier(points: number, superShop = false): number {
  const [i, ii, iii] = superShop ? [9, 14, 21] : [10, 16, 24]
  return points <= i ? 1 : points <= ii ? 2 : points <= iii ? 3 : 4
}

/** Chance the result has the chosen keyword. */
export function keywordChance(count: number): number {
  return count >= 4 ? 0.99 : count === 3 ? 0.9 : count === 2 ? 0.6 : 0
}

/** Points still needed to reach a tier (0 if already there). */
export function pointsFor(tier: number, superShop = false): number {
  const lows = superShop ? { 1: 0, 2: 10, 3: 15, 4: 22 } : { 1: 0, 2: 11, 3: 17, 4: 25 }
  return lows[tier as 1 | 2 | 3 | 4] ?? 0
}

/** Does this set of gifts (with repeats) make a recipe? */
export function matchRecipe(ids: string[], fusions: Fusion[]): Fusion | null {
  const sorted = [...ids].sort()
  for (const f of fusions) {
    const extra = f.any_of?.count ?? 0
    if (f.ingredients.length + extra !== ids.length) continue
    const rest = [...sorted]
    let ok = true
    for (const i of f.ingredients) {
      const k = rest.indexOf(i)
      if (k < 0) { ok = false; break }
      rest.splice(k, 1)
    }
    if (ok && (!f.any_of ? rest.length === 0 : rest.every((r) => f.any_of!.from.includes(r)))) return f
  }
  return null
}

/** Gifts a random fusion can give: standard gifts of that keyword and tier, plus the
 *  current pack's exclusives. Never recipe results, vestiges or gifts you own. */
export function randomPool(ctx: RunContext, keyword: string, tier: number, pack: ThemePack | null): Gift[] {
  const recipeResults = new Set(ctx.data.fusions.map((f) => f.result))
  return ctx.data.gifts.filter((g) =>
    g.keyword === keyword && g.tier === tier && !ctx.owned.has(g.id) && !isGone(ctx, g.id) && !recipeResults.has(g.id) && !isVestige(g.id)
    && (g.pools.includes('main') || (pack !== null && pack.gifts.includes(g.id))))
}

export const FUSION_WEIGHTS = {
  /** A last-chance pack exclusive counts x(1 + this) in a fusion's expected value. */
  lastChance: 0.6,
}

/**
 * The current pack's exclusives you can't get later this run: you don't have them, they
 * aren't in the main pool, and no pack you haven't played that shows up on a later floor
 * has them. Fusing here is one more way to roll them before they're gone.
 */
export function lastChanceGifts(ctx: RunContext, pack: ThemePack | null): Set<string> {
  if (!pack) return new Set()
  const floor = ctx.run.floor ?? 1
  const visited = new Set(Object.values(ctx.run.visited ?? {}))
  const laterPacks = ctx.data.themePacks.filter((p) => {
    // A hidden pack (The B.E.) is no second chance: it almost never shows up.
    if (p.id === pack.id || visited.has(p.id) || isHiddenPack(p)) return false
    for (let f = floor + 1; f <= ctx.run.floors; f++) if (packOnFloor(p, ctx.run.difficulty, f)) return true
    return false
  })
  return new Set(pack.gifts.filter((id) => {
    const g = ctx.giftsById.get(id)
    if (!g || ctx.owned.has(id) || isGone(ctx, id) || g.pools.includes('main')) return false
    return !laterPacks.some((p) => packPool(p).includes(id))
  }))
}

export interface PoolForecast {
  tier: number
  chance: number
  pool: GiftScore[]
  /** Average score of the pool for your team (last chances count extra). */
  expected: number
  /** Gifts in the pool only because of the current theme pack. */
  fromPack: GiftScore[]
  /** Pack exclusives in the pool that fit your team (fit 0.35+, or built for it) and won't show up again this run. */
  lastChance: GiftScore[]
  /** Chance the fusion gives one of `lastChance`. */
  lastChanceOdds: number
}

/** Scored random pools by keyword and tier (they don't depend on the ingredients). */
export type PoolCache = Map<string, GiftScore[]>

export function forecast(
  ctx: RunContext, keyword: string, gifts: Gift[], pack: ThemePack | null, superShop: boolean,
  last: Set<string> = lastChanceGifts(ctx, pack), cache?: PoolCache,
): PoolForecast {
  const tier = fusionTier(fusionPoints(gifts), superShop)
  const key = `${keyword}|${tier}`
  let pool = cache?.get(key)
  if (!pool) {
    pool = randomPool(ctx, keyword, tier, pack)
      .map((g) => ({ ...scoreGift(g, ctx), rating: 0 }))
      .sort((a, b) => b.score - a.score)
    cache?.set(key, pool)
  }
  // Only chase gifts that do something real for your team.
  const fits = (g: GiftScore) => g.fit >= KEEP_MIN_FIT || g.synergy
  const lastChance = pool.filter((g) => last.has(g.gift.id) && fits(g))
  const value = (g: GiftScore) => g.score * (lastChance.includes(g) ? 1 + FUSION_WEIGHTS.lastChance : 1)
  const expected = pool.length ? pool.reduce((s, g) => s + value(g), 0) / pool.length : 0
  const fromPack = pack ? pool.filter((g) => pack.gifts.includes(g.gift.id) && !g.gift.pools.includes('main')) : []
  const chance = keywordChance(gifts.length)
  const lastChanceOdds = pool.length ? chance * lastChance.length / pool.length : 0
  return { tier, chance, pool, expected, fromPack, lastChance, lastChanceOdds }
}

/** How much a gift you own is worth keeping (vestiges do nothing on their own): what it does for
 *  your team, plus being a piece of a keyword-free set (Smokes and Wires in the Bleed set). */
export function keepValue(g: Gift, ctx: RunContext): number {
  if (isVestige(g.id)) return 0
  return intrinsicScore(g, ctx).score + setKeepValue(g, ctx)
}

/** Below this share of a fitting gift of its tier, a gift you own is worth selling or fusing. */
export const SPARE_SHARE = 0.35
/** Below this share it does next to nothing: fuse it now. */
export const FUSE_NOW_SHARE = 0.2

export interface KeepNote {
  gift: Gift
  value: number
  /** value / what a fitting gift of its tier is worth: Ebony Brooch on a Rupture team is ~1.4,
   *  Respite with no Bleed users 0. Judged per gift, not against your best gift. */
  share: number
  /** Why to keep it despite a low value, or null. */
  keepFor: string | null
}

/**
 * Is this recipe worth holding ingredients for? Only if its result does something for
 * your team: Desperado doesn't for a team with no Ammo users, so Staticky Two-way Radio
 * and Torn Bandolier are fodder there, not pieces to keep.
 */
export function recipeWorthKeeping(f: Fusion, ctx: RunContext): boolean {
  const result = ctx.giftsById.get(f.result)
  return !!result && intrinsicScore(result, ctx).fit >= KEEP_MIN_FIT
}
/** A recipe result must fit your team at least this well to hold its pieces. */
const KEEP_MIN_FIT = 0.35

/** Worth selling or fusing: a vestige, or a gift that does little for your team (not kept for a recipe or combo). */
export function isSpare(n: KeepNote): boolean {
  return !n.keepFor && (isVestige(n.gift.id) || n.share < SPARE_SHARE)
}

/** Owned gifts (one row per copy), cheapest to give up first, with what they're kept for. */
export function fodder(ctx: RunContext, owned: string[]): KeepNote[] {
  const recipeIngredient = (id: string) => ctx.data.fusions.find((f) =>
    !ctx.owned.has(f.result) && !mustHave(f.result) && [...f.ingredients, ...(f.any_of?.from ?? [])].includes(id)
    && f.ingredients.some((i) => i !== id && ctx.owned.has(i)) && recipeWorthKeeping(f, ctx))
  const comboWith = (id: string): Combo | undefined => ctx.combos.find((c) =>
    c.gifts.includes(id) && c.gifts.some((o) => o !== id && ctx.owned.has(o)))
  // Pieces of a must-have (Lunar Memory) are always kept on a run that can fuse it.
  const mustPiece = (g: Gift) => mustHaveRecipes(g, ctx).find((f) => fusableThisRun(f, ctx) && neededPiece(f, g, ctx.owned))
  const valued = (g: Gift) => {
    const value = keepValue(g, ctx)
    return { gift: g, value, share: isVestige(g.id) ? 0 : value / fullTierValue(g) }
  }
  return owned
    .map((id) => ctx.giftsById.get(id))
    .filter((g): g is Gift => !!g)
    .map((g) => {
      const m = mustPiece(g)
      if (m) {
        const name = ctx.giftsById.get(m.result)?.name ?? m.result
        return { ...valued(g), keepFor: `piece of ${name}: always build toward it (${mustHave(m.result)!.short})` }
      }
      const r = isVestige(g.id) ? undefined : recipeIngredient(g.id)
      const c = isVestige(g.id) ? undefined : comboWith(g.id)
      const keepFor = r ? `ingredient for ${ctx.giftsById.get(r.result)?.name ?? r.result}`
        : c ? `combo with ${c.gifts.filter((o) => o !== g.id && ctx.owned.has(o)).map((o) => ctx.giftsById.get(o)?.name).join(', ')}`
          : null
      return { ...valued(g), keepFor }
    })
    .sort((a, b) => Number(!!a.keepFor) - Number(!!b.keepFor) || a.value - b.value)
}

export interface FusionIdea {
  keyword: string
  /** Other keywords the same gifts would fuse into about as well. */
  alsoKeywords: string[]
  ingredients: KeepNote[]
  forecast: PoolForecast
  /** Value given up (sum of the ingredients' keep values). */
  cost: number
  /** chance x expected - cost. */
  gain: number
  superShop: boolean
  /** Aimed at a pack exclusive you won't get another chance at this run. */
  chase: GiftScore | null
}

/** The best random fusion for each keyword your team uses, from the gifts you'd miss least. */
export function fusionIdeas(ctx: RunContext, owned: string[], keywords: string[], pack: ThemePack | null, superShop: boolean): FusionIdea[] {
  // Gifts you'd miss least; gifts kept for a recipe or combo are never suggested.
  const pool = fodder(ctx, owned).filter((f) => !f.keepFor).slice(0, superShop ? 14 : 24)
  const max = superShop ? SUPER_SLOTS : REGULAR_SLOTS
  const last = lastChanceGifts(ctx, pack)
  const cache: PoolCache = new Map()
  // Every set of 2..max spare gifts, once.
  const combos: KeepNote[][] = []
  const walk = (start: number, combo: KeepNote[]) => {
    if (combo.length >= 2) combos.push(combo)
    if (combo.length === max) return
    for (let k = start; k < pool.length; k++) walk(k + 1, [...combo, pool[k]])
  }
  walk(0, [])
  const idea = (keyword: string, combo: KeepNote[], chase: GiftScore | null = null): FusionIdea | null => {
    const f = forecast(ctx, keyword, combo.map((c) => c.gift), pack, superShop, last, cache)
    if (!f.pool.length) return null
    const cost = combo.reduce((s, c) => s + c.value, 0)
    return { keyword, alsoKeywords: [], ingredients: combo, forecast: f, cost, gain: f.chance * f.expected - cost, superShop, chase }
  }

  // Last chances first: for each pack exclusive that fits your team and won't come back this
  // run, the spare gifts that roll it most often (then give up the least).
  const chased: FusionIdea[] = []
  const targets = [...last].map((id) => ctx.giftsById.get(id)!)
    .filter((g) => g.keyword && (FUSION_KEYWORDS as readonly string[]).includes(g.keyword))
  for (const g of targets) {
    let best: FusionIdea | null = null
    for (const combo of combos) {
      if (fusionTier(fusionPoints(combo.map((c) => c.gift)), superShop) !== g.tier) continue
      const i = idea(g.keyword!, combo)
      const target = i?.forecast.lastChance.find((x) => x.gift.id === g.id)
      if (!i || !target || i.gain <= 0) continue
      i.chase = target
      const odds = i.forecast.lastChanceOdds
      if (!best || odds > best.forecast.lastChanceOdds + 1e-9
        || (Math.abs(odds - best.forecast.lastChanceOdds) < 1e-9 && i.cost < best.cost)) best = i
    }
    if (best) chased.push(best)
  }

  const ideas: FusionIdea[] = []
  for (const keyword of keywords) {
    let best: FusionIdea | null = null
    for (const combo of combos) {
      const i = idea(keyword, combo)
      if (i && (!best || i.gain > best.gain)) best = i
    }
    if (best && best.gain > 0) ideas.push(best)
  }
  // The same gifts suggested for several keywords: one idea, with the others as alternatives.
  const out: FusionIdea[] = []
  const sameSet = (a: FusionIdea, b: FusionIdea) =>
    a.ingredients.map((i) => i.gift.id).join() === b.ingredients.map((i) => i.gift.id).join()
  for (const i of chased.sort((a, b) => b.chase!.score - a.chase!.score)) {
    if (!out.some((o) => sameSet(o, i))) out.push(i)
  }
  for (const i of ideas.sort((a, b) => b.gain - a.gain)) {
    const same = out.find((o) => sameSet(o, i))
    if (same) {
      if (same.keyword !== i.keyword) same.alsoKeywords.push(i.keyword)
    } else out.push(i)
  }
  return out
}

export interface RecipePlan {
  fusion: Fusion
  result: Gift
  have: Gift[]
  missing: Gift[]
  /** For "any N of" recipes: how many of those you still need. */
  anyMissing: number
  ready: boolean
  resultScore: number
  giveUp: number
  worthIt: boolean
  /** Ingredients the result does the job of (same keyword): fusing loses little. */
  covered: Gift[]
}

/** Recipes you've started (or whose result is great for you), closest first. */
export function recipePlans(ctx: RunContext, owned: string[]): RecipePlan[] {
  const counts = new Map<string, number>()
  for (const id of owned) counts.set(id, (counts.get(id) ?? 0) + 1)
  const plans: RecipePlan[] = []
  for (const f of ctx.data.fusions) {
    const result = ctx.giftsById.get(f.result)
    if (!result || ctx.owned.has(f.result)) continue
    const fixed = f.ingredients.map((i) => ctx.giftsById.get(i)).filter((g): g is Gift => !!g)
    const have = fixed.filter((g) => counts.has(g.id))
    const missing = fixed.filter((g) => !counts.has(g.id))
    const anyHave = f.any_of ? f.any_of.from.filter((i) => counts.has(i)).length : 0
    const anyMissing = f.any_of ? Math.max(0, f.any_of.count - anyHave) : 0
    const started = have.length + anyHave > 0
    const resultScore = intrinsicScore(result, ctx).score
    // Must-haves (Lunar Memory) are always listed on a run that can fuse them, started or not.
    if (!started && !(mustHave(f.result) && fusableThisRun(f, ctx))) continue
    // Ingredients the result covers (same keyword) count little: it does their job, better.
    const anyGifts = f.any_of ? f.any_of.from.filter((i) => counts.has(i)).map((i) => ctx.giftsById.get(i)).filter((g): g is Gift => !!g) : []
    const { value: giveUp, covered } = recipeGiveUp(result, [...have, ...anyGifts], ctx)
    plans.push({
      fusion: f, result, have, missing, anyMissing, ready: missing.length === 0 && anyMissing === 0,
      resultScore, giveUp, worthIt: resultScore >= giveUp * 0.8, covered,
    })
  }
  return plans.sort((a, b) =>
    Number(b.ready) - Number(a.ready)
    || Number(!!mustHave(b.result.id)) - Number(!!mustHave(a.result.id))
    || (a.missing.length + a.anyMissing) - (b.missing.length + b.anyMissing)
    || b.resultScore - a.resultScore)
}
