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
  intrinsicScore, packOnFloor, WEIGHTS, type GiftScore, type Reason, type RunContext,
} from './scoring'
import type { Combo, Fusion, Gift, ThemePack } from './types'

export type Where = 'now' | 'later' | 'fuse' | 'no'

export interface Availability {
  where: Where
  /** "Shop or fight rewards", "This floor's pack (Season of the Flame)", "From floor 3 (…)" */
  text: string
}

/** Can you get this gift on the floor you're on, and how? */
export function availability(g: Gift, ctx: RunContext, packsForGift: Map<string, ThemePack[]>): Availability {
  if (g.fusion_recipe) return { where: 'fuse', text: 'Fusion only' }
  const { difficulty, floors } = ctx.run
  const floor = ctx.run.floor ?? 1
  const packs = packsForGift.get(g.id) ?? []
  const current = ctx.run.pack ? packs.find((p) => p.id === ctx.run.pack) : undefined
  if (current) return { where: 'now', text: `This floor's pack (${current.name})` }
  if (g.pools.includes('main')) return { where: 'now', text: 'Shops and fight rewards' }
  const here = packs.filter((p) => packOnFloor(p, difficulty, floor))
  if (here.length) {
    return { where: 'now', text: `Theme pack on this floor: ${here.slice(0, 2).map((p) => p.name).join(', ')}${here.length > 2 ? ', …' : ''}` }
  }
  for (let f = floor + 1; f <= floors; f++) {
    const later = packs.filter((p) => packOnFloor(p, difficulty, f))
    if (later.length) return { where: 'later', text: `From floor ${f} (${later[0].name}${later.length > 1 ? ', …' : ''})` }
  }
  return { where: 'no', text: packs.length ? 'Not in this run’s packs' : 'Not in any theme pack' }
}

export interface Pick {
  score: GiftScore
  where: Availability
}

/** The best gifts you can get on this floor. */
export function getNow(ranked: GiftScore[], ctx: RunContext, packsForGift: Map<string, ThemePack[]>, n = 5): Pick[] {
  const out: Pick[] = []
  for (const s of ranked) {
    const where = availability(s.gift, ctx, packsForGift)
    if (where.where !== 'now') continue
    out.push({ score: s, where })
    if (out.length >= n) break
  }
  return out
}

/** The best gifts that only show up on a later floor of this run (theme packs to aim for). */
export function comingUp(ranked: GiftScore[], ctx: RunContext, packsForGift: Map<string, ThemePack[]>, n = 3): Pick[] {
  const out: Pick[] = []
  for (const s of ranked.slice(0, 60)) {
    const where = availability(s.gift, ctx, packsForGift)
    if (where.where === 'later') out.push({ score: s, where })
    if (out.length >= n) break
  }
  return out
}

export interface Piece {
  gift: Gift
  have: boolean
  where: Availability
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
    const used = (gifts as Gift[]).reduce((s, g) => s + intrinsicScore(g, ctx).score, 0)
      + (anyOf ? anyOf.count * Math.min(...anyPieces.map((p) => intrinsicScore(p.gift, ctx).score)) : 0)
    if (r.score < used * WEIGHTS.craftRatio) continue
    const unreachable = [...pieces.filter((p) => !p.have), ...(anyOf && anyOf.have < anyOf.count ? anyPieces.filter((p) => !p.have) : [])]
      .every((p) => p.where.where === 'no')
    if (unreachable && have < total) continue
    const blocked = fusion.super_shop && ctx.run.difficulty === 'normal'
      ? 'Needs a Super Shop, which only appears on Hard floors' : undefined
    const progress = have / total
    const soon = pieces.filter((p) => !p.have && p.where.where === 'now').length / Math.max(1, total - have)
    const rank = r.score * (0.35 + 0.5 * progress + 0.15 * soon) * (blocked ? 0.3 : 1)
    const reasons: Reason[] = r.reasons.filter((x) => x.kind !== 'bad').slice(0, 2)
    out.push({ fusion, result, value: r.score, pieces, anyOf, progress, blocked, reasons, rank })
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, n)
}

/** Gift sets (combos and your own sets) to build, most valuable for your team first.
 *  Your own sets are always listed (after the top `n`), even when complete. */
export function setTargets(ctx: RunContext, packsForGift: Map<string, ThemePack[]>, n = 3): SetTarget[] {
  const out: SetTarget[] = []
  for (const combo of ctx.combos) {
    const gifts = combo.gifts.map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g)
    if (gifts.length < 2) continue
    const pieces = gifts.map((g) => ({ gift: g, have: ctx.owned.has(g.id), where: availability(g, ctx, packsForGift) }))
    if (pieces.every((p) => p.have) && !combo.custom) continue
    const value = gifts.reduce((s, g) => s + intrinsicScore(g, ctx).score, 0) / gifts.length + WEIGHTS.comboPiece
    const progress = done(pieces) / pieces.length
    const soon = pieces.filter((p) => !p.have && p.where.where === 'now').length / Math.max(1, pieces.length - done(pieces))
    out.push({ combo, value, pieces, progress, rank: value * (0.4 + 0.45 * progress + 0.15 * soon) })
  }
  out.sort((a, b) => b.rank - a.rank)
  const top = out.filter((t) => !t.combo.custom).slice(0, n)
  return [...out.filter((t) => t.combo.custom), ...top]
}

/** Reasons to show first: good ones, then info, then bad. */
export function bestReasons(reasons: Reason[]): Reason[] {
  const order = { good: 0, info: 1, bad: 2 }
  return [...reasons].sort((a, b) => order[a.kind] - order[b.kind])
}
