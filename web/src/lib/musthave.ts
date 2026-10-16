/**
 * Must-have gifts (src/data/must_have.json): gifts so strong for any team that you
 * should always build toward them, like Lunar Memory (every enemy resistance becomes
 * Fatal). They're hand-picked, not scraped.
 *
 * - The gift itself scores at the top for every team (scoring.ts, intrinsicScore).
 * - Every piece of its recipe gets a "builds toward" bonus, more the more pieces you
 *   have, even when the piece does nothing for your team on its own (scoring.ts,
 *   scoreGift). For "any 2 of" pieces (Lunar Memory's Sin Fragments) only the ones
 *   you still need count.
 * - Your plan and the Fusion tab always list it and keep its pieces (plan.ts, fusion.ts).
 *
 * Recipes that need a Super Shop (5 gifts) can only be fused on Hard, so on a Normal
 * run they're shown as blocked and their pieces get no bonus.
 */
import mustHaveJson from '../data/must_have.json'
import type { Fusion, Gift } from './types'
import type { RunContext } from './scoring'

export interface MustHave {
  gift: string
  /** A few words for lists: "every enemy resistance becomes Fatal". */
  short: string
  why: string
}

export const MUST_HAVE: MustHave[] = mustHaveJson as MustHave[]
const byId = new Map(MUST_HAVE.map((m) => [m.gift, m]))

export function mustHave(id: string): MustHave | null {
  return byId.get(id) ?? null
}

/** A must-have scores this many times its tier value: above any regular gift. */
export const MUST_HAVE_MULT = 3.5
/** Each piece is worth this share of the result, scaled up as you collect pieces. */
export const PIECE_SHARE = 0.2

export interface RecipeProgress {
  total: number
  have: number
  /** "Any N of" pieces still needed. */
  anyMissing: number
}

export function recipeProgress(f: Fusion, owned: Set<string>): RecipeProgress {
  const fixed = f.ingredients.filter((i) => owned.has(i)).length
  const any = f.any_of ? Math.min(f.any_of.count, f.any_of.from.filter((i) => owned.has(i)).length) : 0
  return {
    total: f.ingredients.length + (f.any_of?.count ?? 0),
    have: fixed + any,
    anyMissing: f.any_of ? f.any_of.count - any : 0,
  }
}

/** Can this run fuse it at all? Super Shop recipes need Hard. */
export function fusableThisRun(f: Fusion, ctx: RunContext): boolean {
  return !f.super_shop || ctx.run.difficulty !== 'normal'
}

/** Is this owned or offered gift still a needed piece of the must-have recipe? */
export function neededPiece(f: Fusion, g: Gift, owned: Set<string>): boolean {
  if (f.ingredients.includes(g.id)) return true
  if (!f.any_of?.from.includes(g.id)) return false
  // An "any of" piece you own is needed if it's among the first N you have; one you
  // don't own is needed while you still lack some.
  if (owned.has(g.id)) return f.any_of.from.filter((i) => owned.has(i)).indexOf(g.id) < f.any_of.count
  return recipeProgress(f, owned).anyMissing > 0
}

/** Must-have recipes this gift is a piece of (whose result you don't own yet). */
export function mustHaveRecipes(g: Gift, ctx: RunContext): Fusion[] {
  return (ctx.fusionsByIngredient.get(g.id) ?? []).filter((f) => mustHave(f.result) && !ctx.owned.has(f.result))
}
