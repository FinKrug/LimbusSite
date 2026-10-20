/**
 * The Best gifts tab's plan for right now: which gifts to grab on this floor, which
 * fusions to work toward (Lunar Memory and the rest), and which gift sets to build.
 *
 * It reuses the gift scores (team fit, E.G.O, gates, upgrades, floor), and adds where
 * each gift can come from on the floor you're on:
 *  - main-pool gifts: shops and fight rewards on any floor;
 *  - theme-pack gifts: only from a pack that can show up on this floor (the pack you
 *    picked for the floor first);
 *  - fusion results: only by fusing; Super Shop recipes (Lunar Memory) only on Hard floors.
 */
import {
  intrinsicScore, isGone, isHiddenPack, playedPacks, setHas, setRankWeight, packOnFloor, rarityText, recipeGiveUp, WEIGHTS, type GiftScore, type Reason, type RunContext,
} from './scoring'
import { fusableKeyword, type Combo, type Fusion, type Gift, type ThemePack } from './types'
import { mustHave } from './musthave'

export type Where = 'now' | 'later' | 'fuse' | 'luck' | 'no'

export interface Availability {
  where: Where
  /** "Shop or fight rewards", "This floor's pack (Season of the Flame)", "From floor 3 (…)" */
  text: string
}

/** Can you get this gift on the floor you're on, and how? */
const recipeResults = new WeakMap<Fusion[], Set<string>>()
/** Gifts made by a recipe can only be had by fusing (Lunar Memory is listed in the main pool but isn't). */
function isRecipeResult(id: string, fusions: Fusion[]): boolean {
  let set = recipeResults.get(fusions)
  if (!set) recipeResults.set(fusions, set = new Set(fusions.map((f) => f.result)))
  return set.has(id)
}

export function availability(g: Gift, ctx: RunContext, packsForGift: Map<string, ThemePack[]>): Availability {
  if (isGone(ctx, g.id)) return { where: 'no', text: `Gone: you have ${ctx.gone.get(g.id)}, which it fuses into` }
  // EX gifts (Wealth, A Certain Philosophy) don't show up in shops or rewards: only a rare
  // event gamble gives them, so plans never count on them.
  if ((g.tier ?? 0) >= 6) {
    const ev = g.events?.[0]?.name
    return { where: 'luck', text: ev ? `Rare: only from the ${ev} event, if you win it` : 'Rare EX gift: not in shops or rewards' }
  }
  if (g.fusion_recipe || isRecipeResult(g.id, ctx.data.fusions)) {
    const f = ctx.data.fusions.find((x) => x.result === g.id)
    return { where: 'fuse', text: f?.super_shop ? 'Fusion only (Super Shop, Hard)' : 'Fusion only' }
  }
  const { difficulty, floors } = ctx.run
  const floor = ctx.run.floor ?? 1
  // Packs you've already played (and this floor's pack, once picked) don't come back.
  const played = playedPacks(ctx.run)
  const inPacks = packsForGift.get(g.id) ?? []
  const allPacks = inPacks.filter((p) => !played.has(p.id))
  const current = ctx.run.pack ? allPacks.find((p) => p.id === ctx.run.pack) : undefined
  if (current) return { where: 'now', text: `This floor's pack (${current.name})` }
  if (g.pools.includes('main')) return { where: 'now', text: 'Shops and fight rewards' }
  // Hidden packs (The B.E.) almost never show up: their gifts are luck, not a plan.
  const packs = allPacks.filter((p) => !isHiddenPack(p))
  const hidden = allPacks.filter(isHiddenPack)
  if (!packs.length && hidden.length) {
    return { where: 'luck', text: `Only from ${hidden[0].name}, a rare hidden pack (${rarityText(hidden[0])}): take it if you find it` }
  }
  // Once this floor's pack is picked, other packs' gifts wait for a later floor.
  const here = ctx.run.pack ? [] : packs.filter((p) => packOnFloor(p, difficulty, floor))
  if (here.length) {
    return { where: 'now', text: `Theme pack on this floor: ${here.slice(0, 2).map((p) => p.name).join(', ')}${here.length > 2 ? ', …' : ''}` }
  }
  for (let f = floor + 1; f <= floors; f++) {
    const later = packs.filter((p) => p.id !== ctx.run.pack && packOnFloor(p, difficulty, f))
    if (later.length) return { where: 'later', text: `From floor ${f} (${later[0].name}${later.length > 1 ? ', …' : ''})` }
  }
  const gone = inPacks.filter((p) => played.has(p.id) && p.gifts.includes(g.id))
  if (!packs.length && gone.length) {
    return { where: 'no', text: `Only in ${gone[0].name}, which you played on floor ${played.get(gone[0].id)}: a pack can't be picked twice` }
  }
  return { where: 'no', text: packs.length ? 'Not in this run’s packs' : 'Not in any theme pack' }
}

export interface Pick {
  score: GiftScore
  where: Availability
}

/** Which to go for first: a General (keywordless) theme-pack gift beats a keyword one of about the
 *  same value, since fusing can roll the keyword one but never the General one. */
export const UNFUSABLE_PRIORITY = 0.2
export function pickPriority(s: GiftScore): number {
  const themedOnly = !s.gift.pools.includes('main') && s.gift.pools.includes('themed')
  return s.score * (themedOnly && !fusableKeyword(s.gift) ? 1 + UNFUSABLE_PRIORITY : 1)
}

function bestPicks(ranked: GiftScore[], ctx: RunContext, packsForGift: Map<string, ThemePack[]>, where: Where, n: number, look: number): Pick[] {
  const found: Pick[] = []
  for (const s of ranked.slice(0, look)) {
    const w = availability(s.gift, ctx, packsForGift)
    if (w.where === where) found.push({ score: s, where: w })
    // Enough candidates that a General gift a little lower down can still move up.
    if (found.length >= n * 3) break
  }
  return found.sort((a, b) => pickPriority(b.score) - pickPriority(a.score)).slice(0, n)
}

/** The best gifts you can get on this floor. */
export function getNow(ranked: GiftScore[], ctx: RunContext, packsForGift: Map<string, ThemePack[]>, n = 5): Pick[] {
  return bestPicks(ranked, ctx, packsForGift, 'now', n, ranked.length)
}

/** The best gifts that only show up on a later floor of this run (theme packs to aim for). */
export function comingUp(ranked: GiftScore[], ctx: RunContext, packsForGift: Map<string, ThemePack[]>, n = 3): Pick[] {
  return bestPicks(ranked, ctx, packsForGift, 'later', n, 60)
}

export interface Piece {
  gift: Gift
  have: boolean
  where: Availability
  /** Gift sets: you don't have it, but a gift you own that it fused into covers it. */
  via?: Gift
}

export interface FusionTarget {
  fusion: Fusion
  result: Gift
  /** The result's value to your team. */
  value: number
  pieces: Piece[]
  /** "Any 2 of the Sin Fragments" for Lunar Memory. */
  anyOf?: { count: number; have: number; pieces: Piece[] }
  progress: number
  /** Blocked on this run (Super Shop recipe on a Normal run). */
  blocked?: string
  reasons: Reason[]
  rank: number
}

export interface SetTarget {
  combo: Combo
  value: number
  pieces: Piece[]
  progress: number
  rank: number
}

const done = (p: Piece[]) => p.filter((x) => x.have).length

/**
 * Fusions worth working toward: the result suits your team, is worth more than what it
 * uses up, and you can get the pieces this run. Started ones and ones with pieces on this
 * floor come first.
 */
export function fusionTargets(ctx: RunContext, packsForGift: Map<string, ThemePack[]>, n = 4): FusionTarget[] {
  const out: FusionTarget[] = []
  const piece = (g: Gift): Piece => ({ gift: g, have: ctx.owned.has(g.id), where: availability(g, ctx, packsForGift) })
  for (const fusion of ctx.data.fusions) {
    if (ctx.owned.has(fusion.result)) continue
    const result = ctx.giftsById.get(fusion.result)
    const gifts = fusion.ingredients.map((id) => ctx.giftsById.get(id))
    if (!result || gifts.some((g) => !g)) continue
    const pieces = (gifts as Gift[]).map(piece)
    const from = (fusion.any_of?.from ?? []).map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g)
    const anyPieces = from.map(piece)
    const anyOf = fusion.any_of ? { count: fusion.any_of.count, have: Math.min(fusion.any_of.count, done(anyPieces)), pieces: anyPieces } : undefined
    const total = pieces.length + (anyOf?.count ?? 0)
    const have = done(pieces) + (anyOf?.have ?? 0)
    const r = intrinsicScore(result, ctx)
    const must = mustHave(fusion.result)
    const used = recipeGiveUp(result, gifts as Gift[], ctx).value
      + (anyOf ? anyOf.count * Math.min(...anyPieces.map((p) => intrinsicScore(p.gift, ctx).score)) : 0)
    if (!must && r.score < used * WEIGHTS.craftRatio) continue
    const unreachable = [...pieces.filter((p) => !p.have), ...(anyOf && anyOf.have < anyOf.count ? anyPieces.filter((p) => !p.have) : [])]
      .every((p) => p.where.where === 'no')
    // A must-have (Lunar Memory) is always listed: its pieces can turn up on later runs' floors too.
    if (!must && unreachable && have < total) continue
    const blocked = fusion.super_shop && ctx.run.difficulty === 'normal'
      ? 'Needs a Super Shop, which only appears on Hard floors' : undefined
    const progress = have / total
    const soon = pieces.filter((p) => !p.have && p.where.where === 'now').length / Math.max(1, total - have)
    const rank = must && !blocked ? Infinity : r.score * (0.35 + 0.5 * progress + 0.15 * soon) * (blocked ? 0.3 : 1)
    const reasons: Reason[] = must
      ? [{ kind: 'good', text: must.why }, ...(blocked ? [] : [{ kind: 'info' as const,
        text: 'Build toward it even if you can\'t fuse it yet: take its pieces whenever they show up, and keep them' }])]
      : r.reasons.filter((x) => x.kind !== 'bad').slice(0, 2)
    out.push({ fusion, result, value: r.score, pieces, anyOf, progress, blocked, reasons, rank })
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, n)
}

/** Gift sets (src/data/combos.json) to build, most valuable for your team first. */
export function setTargets(ctx: RunContext, packsForGift: Map<string, ThemePack[]>, n = 3): SetTarget[] {
  const out: SetTarget[] = []
  for (const combo of ctx.combos) {
    const gifts = combo.gifts.map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g)
    if (gifts.length < 2) continue
    // A piece you fused into a gift you own that works with your team still counts.
    const pieces = gifts.map((g): Piece => ({
      gift: g, have: setHas(ctx, g.id), where: availability(g, ctx, packsForGift),
      via: !ctx.owned.has(g.id) ? ctx.fusedInto.get(g.id) : undefined,
    }))
    if (pieces.every((p) => p.have)) continue
    // Keyword-free sets: the higher the set, the more it's worth to the run.
    const value = (gifts.reduce((s, g) => s + intrinsicScore(g, ctx).score, 0) / gifts.length + WEIGHTS.comboPiece)
      * (combo.any_team ? 0.6 + 0.6 * setRankWeight(combo) : 1)
    const progress = done(pieces) / pieces.length
    const soon = pieces.filter((p) => !p.have && p.where.where === 'now').length / Math.max(1, pieces.length - done(pieces))
    out.push({ combo, value, pieces, progress, rank: value * (0.4 + 0.45 * progress + 0.15 * soon) })
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, n)
}

/** Reasons to show first: good ones, then info, then bad. */
export function bestReasons(reasons: Reason[]): Reason[] {
  const order = { good: 0, info: 1, bad: 2 }
  return [...reasons].sort((a, b) => order[a.kind] - order[b.kind])
}
