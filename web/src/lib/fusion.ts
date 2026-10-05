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
 */
import { intrinsicScore, scoreGift, type GiftScore, type RunContext } from './scoring'
import { isVestige } from './vestiges'
import type { Combo, Fusion, Gift, ThemePack } from './types'

/** Keyword categories on the fusion screen. */
export const FUSION_KEYWORDS = ['Burn', 'Bleed', 'Tremor', 'Rupture', 'Sinking', 'Poise', 'Charge', 'Slash', 'Pierce', 'Blunt'] as const
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
    g.keyword === keyword && g.tier === tier && !ctx.owned.has(g.id) && !recipeResults.has(g.id) && !isVestige(g.id)
    && (g.pools.includes('main') || (pack !== null && pack.gifts.includes(g.id))))
}

export interface PoolForecast {
  tier: number
  chance: number
  pool: GiftScore[]
  /** Average score of the pool for your team. */
  expected: number
  /** Gifts in the pool only because of the current theme pack. */
  fromPack: GiftScore[]
}

export function forecast(ctx: RunContext, keyword: string, gifts: Gift[], pack: ThemePack | null, superShop: boolean): PoolForecast {
  const tier = fusionTier(fusionPoints(gifts), superShop)
  const pool = randomPool(ctx, keyword, tier, pack)
    .map((g) => ({ ...scoreGift(g, ctx), rating: 0 }))
    .sort((a, b) => b.score - a.score)
  const expected = pool.length ? pool.reduce((s, g) => s + g.score, 0) / pool.length : 0
  const fromPack = pack ? pool.filter((g) => pack.gifts.includes(g.gift.id) && !g.gift.pools.includes('main')) : []
  return { tier, chance: keywordChance(gifts.length), pool, expected, fromPack }
}

/** How much a gift you own is worth keeping (vestiges do nothing on their own). */
export function keepValue(g: Gift, ctx: RunContext): number {
  if (isVestige(g.id)) return 0
  return intrinsicScore(g, ctx).score
}

export interface KeepNote {
  gift: Gift
  value: number
  /** Why to keep it despite a low value, or null. */
  keepFor: string | null
}

/** Owned gifts (one row per copy), cheapest to give up first, with what they're kept for. */
export function fodder(ctx: RunContext, owned: string[]): KeepNote[] {
  const recipeIngredient = (id: string) => ctx.data.fusions.find((f) =>
    !ctx.owned.has(f.result) && [...f.ingredients, ...(f.any_of?.from ?? [])].includes(id)
    && f.ingredients.some((i) => i !== id && ctx.owned.has(i)))
  const comboWith = (id: string): Combo | undefined => ctx.combos.find((c) =>
    c.gifts.includes(id) && c.gifts.some((o) => o !== id && ctx.owned.has(o)))
  return owned
    .map((id) => ctx.giftsById.get(id))
    .filter((g): g is Gift => !!g)
    .map((g) => {
      const r = isVestige(g.id) ? undefined : recipeIngredient(g.id)
      const c = isVestige(g.id) ? undefined : comboWith(g.id)
      const keepFor = r ? `ingredient for ${ctx.giftsById.get(r.result)?.name ?? r.result}`
        : c ? `combo with ${c.gifts.filter((o) => o !== g.id && ctx.owned.has(o)).map((o) => ctx.giftsById.get(o)?.name).join(', ')}`
          : null
      return { gift: g, value: keepValue(g, ctx), keepFor }
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
}

/** The best random fusion for each keyword your team uses, from the gifts you'd miss least. */
export function fusionIdeas(ctx: RunContext, owned: string[], keywords: string[], pack: ThemePack | null, superShop: boolean): FusionIdea[] {
  // Gifts you'd miss least; gifts kept for a recipe or combo are never suggested.
  const pool = fodder(ctx, owned).filter((f) => !f.keepFor).slice(0, superShop ? 14 : 24)
  const max = superShop ? SUPER_SLOTS : REGULAR_SLOTS
  const ideas: FusionIdea[] = []
  for (const keyword of keywords) {
    let best: FusionIdea | null = null
    const tryCombo = (combo: KeepNote[]) => {
      const f = forecast(ctx, keyword, combo.map((c) => c.gift), pack, superShop)
      if (!f.pool.length) return
      const cost = combo.reduce((s, c) => s + c.value, 0)
      const gain = f.chance * f.expected - cost
      if (!best || gain > best.gain) best = { keyword, alsoKeywords: [], ingredients: combo, forecast: f, cost, gain, superShop }
    }
    const pick = (start: number, combo: KeepNote[]) => {
      if (combo.length >= 2) tryCombo(combo)
      if (combo.length === max) return
      for (let k = start; k < pool.length; k++) pick(k + 1, [...combo, pool[k]])
    }
    pick(0, [])
    if (best && (best as FusionIdea).gain > 0) ideas.push(best)
  }
  // The same gifts suggested for several keywords: one idea, with the others as alternatives.
  const out: FusionIdea[] = []
  for (const idea of ideas.sort((a, b) => b.gain - a.gain)) {
    const same = out.find((o) => o.ingredients.map((i) => i.gift.id).join() === idea.ingredients.map((i) => i.gift.id).join())
    if (same) same.alsoKeywords.push(idea.keyword)
    else out.push(idea)
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
    if (!started) continue
    const giveUp = have.reduce((s, g) => s + keepValue(g, ctx), 0)
    plans.push({
      fusion: f, result, have, missing, anyMissing, ready: missing.length === 0 && anyMissing === 0,
      resultScore, giveUp, worthIt: resultScore >= giveUp * 0.8,
    })
  }
  return plans.sort((a, b) =>
    Number(b.ready) - Number(a.ready)
    || (a.missing.length + a.anyMissing) - (b.missing.length + b.anyMissing)
    || b.resultScore - a.resultScore)
}
