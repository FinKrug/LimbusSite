/**
 * The Evaluate tab: every reason to take or skip one gift or theme pack, for your
 * team and run. Builds on the same scoring as Best gifts and Theme packs, then adds
 * what a list can't show: where it ranks, alternatives, fusions, combos, the floor.
 */
import { EXTREME_FROM, packOnFloor, packPool, rankGifts, rankThemePacks, scoreGift, type GiftScore, type PackScore, type Reason, type RunContext } from './scoring'
import { isVestige } from './vestiges'
import { type Gift, type ThemePack, floorText, tierLabel } from './types'

export type Verdict = 'take' | 'maybe' | 'skip'

export interface Evaluation {
  verdict: Verdict
  headline: string
  pros: string[]
  cons: string[]
  notes: string[]
}

const pct = (x: number) => `${Math.round(x * 100)}%`

export function evaluateGift(gift: Gift, ctx: RunContext, packsForGift: Map<string, ThemePack[]>): Evaluation & { score: GiftScore } {
  const s = { ...scoreGift(gift, ctx), rating: 0 }
  const ranked = rankGifts(ctx)
  const pos = ranked.findIndex((g) => g.gift.id === gift.id)
  const rating = pos >= 0 ? ranked[pos].rating : Math.round((s.score / Math.max(1e-9, ranked[0]?.score ?? s.score)) * 100)
  const pros = s.reasons.filter((r) => r.kind === 'good').map((r) => r.text)
  const cons = s.reasons.filter((r) => r.kind === 'bad').map((r) => r.text)
  const notes = s.reasons.filter((r) => r.kind === 'info').map((r) => r.text)
  const team = ctx.profile.size > 0

  if (isVestige(gift.id)) {
    return {
      score: s, verdict: 'skip', headline: 'A Vestige does nothing on its own: sell it or use it as fusion fodder.',
      pros: [`Counts as a Tier ${tierLabel(gift.tier)} gift in fusions (${gift.tier === 4 ? 15 : gift.tier === 3 ? 10 : gift.tier === 2 ? 6 : 3} fusion points)`],
      cons: ['No effect in battle'], notes: [`Sells for about ${Math.round((gift.cost ?? 0) / 2)} Cost`],
    }
  }
  if (ctx.owned.has(gift.id)) notes.unshift('You already have it: another copy becomes a Vestige of its tier.')

  // Where it ranks.
  if (pos >= 0 && team) {
    const n = ranked.length
    if (pos < 10) pros.unshift(`#${pos + 1} of ${n} gifts for your team right now`)
    else if (pos < n * 0.2) notes.unshift(`#${pos + 1} of ${n} gifts for your team (top ${pct((pos + 1) / n)})`)
    else cons.unshift(`#${pos + 1} of ${n} gifts for your team: most gifts suit it better`)
  }
  // Better picks of the same keyword.
  if (team && gift.keyword && pos > 0) {
    const better = ranked.slice(0, pos).filter((g) => g.gift.keyword === gift.keyword).slice(0, 3)
    if (better.length) notes.push(`Better ${gift.keyword} gifts for you: ${better.map((g) => g.gift.name).join(', ')}`)
  }
  // Tier and price.
  notes.push(`Tier ${tierLabel(gift.tier)}${gift.cost ? `, costs ${gift.cost} in shops and sells for ${Math.round(gift.cost / 2)}` : ''}`)
  if (gift.max_level > 0) notes.push(`Can be enhanced ${gift.max_level} time${gift.max_level > 1 ? 's' : ''} at a shop`)

  // Fusions.
  const recipesUsing = ctx.data.fusions.filter((f) => [...f.ingredients, ...(f.any_of?.from ?? [])].includes(gift.id))
  for (const f of recipesUsing.slice(0, 2)) {
    const result = ctx.giftsById.get(f.result)
    if (!result || ctx.owned.has(result.id)) continue
    const r = scoreGift(result, ctx)
    const have = f.ingredients.filter((i) => i !== gift.id && ctx.owned.has(i)).length
    const line = `Ingredient for ${result.name}${have ? ` (you have ${have} of the other ${f.ingredients.length - 1})` : ''}${f.super_shop ? ', a Super Shop recipe' : ''}`
    if (team && r.score > s.score * 1.3) pros.push(`${line}, which is even better for your team`)
    else notes.push(line)
  }
  const recipe = ctx.data.fusions.find((f) => f.result === gift.id)
  if (recipe) {
    const names = recipe.ingredients.map((i) => ctx.giftsById.get(i)?.name ?? i)
    notes.push(`Only from fusing ${names.join(' + ')}${recipe.any_of ? ` + any ${recipe.any_of.count} Sin Fragments` : ''}${recipe.super_shop ? ' (Super Shop only: Hard floors)' : ''}`)
  }

  // Combos not yet started (started ones are already in the reasons).
  for (const c of ctx.combosByGift.get(gift.id) ?? []) {
    const others = c.gifts.filter((id) => id !== gift.id)
    if (others.some((id) => ctx.owned.has(id))) continue
    notes.push(`Combos with ${others.map((id) => ctx.giftsById.get(id)?.name ?? id).join(' and ')}: ${c.why}`)
  }

  // Where to find it on this run.
  const packs = packsForGift.get(gift.id) ?? []
  const run = ctx.run
  if (run.floor !== null && packs.length) {
    const here = packs.filter((p) => packOnFloor(p, run.difficulty, run.floor!))
    if (here.length) notes.push(`On floor ${run.floor}: ${here.slice(0, 3).map((p) => p.name).join(', ')}${here.length > 3 ? ` +${here.length - 3}` : ''} can give it`)
  }
  if (gift.pools.includes('extreme')) notes.push(`EXTREME-only gift: floors ${EXTREME_FROM}–15 of an EXTREME run`)

  const verdict: Verdict = !team ? 'maybe' : rating >= 70 && !cons.some((c) => /Un-staggers|Staggers your own/.test(c)) ? 'take' : rating >= 40 ? 'maybe' : 'skip'
  const headline = !team ? 'Pick your team on the Team tab to judge this for your team.'
    : verdict === 'take' ? `Take it: one of the best gifts for this team (${rating}/100).`
      : verdict === 'maybe' ? `Situational: fine if nothing better is on offer (${rating}/100).`
        : `Skip it unless you need the Cost or fusion fodder (${rating}/100).`
  return { score: s, verdict, headline, pros: dedupe(pros), cons: dedupe(cons), notes: dedupe(notes) }
}

export function evaluatePack(pack: ThemePack, ctx: RunContext): Evaluation & { score: PackScore | null; rank: number | null; of: number } {
  const run = ctx.run
  const peers = run.floor !== null ? ctx.data.themePacks.filter((p) => packOnFloor(p, run.difficulty, run.floor!)) : ctx.data.themePacks
  const ranked = rankThemePacks(ctx, peers.some((p) => p.id === pack.id) ? peers : [...peers, pack])
  const k = ranked.findIndex((p) => p.pack.id === pack.id)
  const s = k >= 0 ? ranked[k] : null
  const pros: string[] = []
  const cons: string[] = []
  const notes: string[] = []
  const team = ctx.profile.size > 0
  const reasons: Reason[] = s?.reasons ?? []
  pros.push(...reasons.filter((r) => r.kind === 'good').map((r) => r.text))
  cons.push(...reasons.filter((r) => r.kind === 'bad').map((r) => r.text))
  notes.push(...reasons.filter((r) => r.kind === 'info').map((r) => r.text))

  // Floors.
  const floors = [['Normal', pack.floors?.normal], ['Hard', pack.floors?.hard], ['EXTREME', pack.floors?.extreme]]
    .filter(([, r]) => r).map(([d, r]) => `${d} ${floorText(r as [number, number])}`)
  if (floors.length) notes.push(`Shows up on ${floors.join(', ')}`)
  if (run.floor !== null) {
    if (packOnFloor(pack, run.difficulty, run.floor)) notes.unshift(`Can be offered on your floor (${run.floor})`)
    else cons.unshift(`Can't show up on floor ${run.floor} of a ${run.difficulty} run`)
  }
  const onThisFloor = run.floor === null || packOnFloor(pack, run.difficulty, run.floor)
  if (s && k >= 0 && team && onThisFloor) {
    const line = `#${k + 1} of ${ranked.length} packs ${run.floor !== null ? `on floor ${run.floor}` : 'overall'} for your team`
    if (k < 3) pros.unshift(line)
    else if (k >= ranked.length / 2) cons.unshift(line)
    else notes.unshift(line)
  }

  // The gifts that carry it.
  if (s) {
    const best = s.top.slice(0, 3)
    if (best.length) notes.push(`Best gifts for you here: ${best.map((g) => `${g.gift.name} (${g.reasons[0]?.text ?? 'general'})`).join('; ')}`)
    const pool = packPool(pack).length
    if (pool > 40) notes.push(`${pool} gifts in its pool, so any one gift is a long shot; its exclusives are more likely`)
  }
  // Recipes its exclusives unlock.
  const unlocks = ctx.data.fusions.filter((f) => f.ingredients.some((i) => pack.gifts.includes(i)))
  for (const f of unlocks.slice(0, 3)) {
    const r = ctx.giftsById.get(f.result)
    if (!r || ctx.owned.has(r.id)) continue
    const val = scoreGift(r, ctx)
    const text = `Its exclusives fuse into ${r.name}`
    if (team && val.fit > 0.5) pros.push(`${text}, a strong gift for your team`)
    else notes.push(text)
  }
  if (s && s.ownedCount) notes.push(`You already have ${s.ownedCount} of its gifts`)

  const verdict: Verdict = !team ? 'maybe' : s?.verdict === 'go' ? 'take' : s?.verdict === 'maybe' ? 'maybe' : 'skip'
  const headline = !team ? 'Pick your team on the Team tab to judge this for your team.'
    : verdict === 'take' ? 'Go: one of the best packs for this team.'
      : verdict === 'maybe' ? 'Maybe: decent, but there are better packs for this team.'
        : 'Skip if you have a better option.'
  return { score: s, rank: k >= 0 ? k + 1 : null, of: ranked.length, verdict, headline, pros: dedupe(pros), cons: dedupe(cons), notes: dedupe(notes) }
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)]
}
