/**
 * The Evaluate tab: every reason to take or skip one gift or theme pack, for your
 * team and run. Builds on the same scoring as Best gifts and Theme packs, then adds
 * what a list can't show: where it ranks, alternatives, fusions, combos, the floor.
 */
import { EXTREME_FROM, isGone, packOnFloor, packPool, rankGifts, rankThemePacks, scoreGift, type GiftScore, type PackScore, type Reason, type RunContext } from './scoring'
import { isVestige } from './vestiges'
import { floorCostFrom, shopGift } from './costplan'
import { mustHave } from './musthave'
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
    else if (pos < n * 0.3) notes.unshift(`#${pos + 1} of ${n} gifts for your team (top ${pct((pos + 1) / n)})`)
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
    if (!result || ctx.owned.has(result.id) || isGone(ctx, result.id)) continue
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

  const { verdict, headline } = !team
    ? { verdict: 'maybe' as const, headline: 'Pick your team on the Team tab to judge this for your team.' }
    : judgeGift(gift, s, ctx, ranked, pos, cons)
  void rating
  return { score: s, verdict, headline, pros: dedupe(pros), cons: dedupe(cons), notes: dedupe(notes) }
}

/** How the verdict is set (Finley: "everything is a skip"; a gift that needs Cost, a partner or a
 *  fusion to pay off is a Maybe with that condition, not a Skip). */
export const VERDICT_WEIGHTS = {
  /** Scores are compared with the 5th best gift for your team (must-haves like Lunar Memory aside,
   *  since they'd make everything else look weak). */
  refRank: 5,
  /** Take it: in your top this-many, or at least this share of the reference. */
  takeTop: 10,
  take: 0.8,
  /** Maybe, as a solid pick that just isn't one of the best. */
  maybe: 0.45,
  /** Maybe with a condition (spare Cost, its set, a fusion it goes into): at least this share. */
  conditional: 0.15,
  /** A gift that fits your team's keywords, bought with Cost left over: at least this share. */
  fits: 0.25,
  /** A gift that doesn't fit your team, bought only with plenty of Cost to spare: at least this share. */
  spareCost: 0.3,
  /** Keyword-free sets count as a condition only down to this rank (1 = most important). */
  setRank: 4,
  /** Packs: Go for the best this-many on the floor; Maybe for this top share of the floor's packs. */
  packTakeTop: 3,
  packMaybeShare: 0.5,
  /** A fusion it goes into counts when the result is at least this share of the reference. */
  fusionResult: 0.6,
}

/**
 * Take / Maybe / Skip for one gift, with the headline. A Maybe says what it depends on:
 * Cost to spare after your top picks, the set it belongs to, or the fusion it goes into.
 */
export function judgeGift(gift: Gift, s: Omit<GiftScore, 'rating'>, ctx: RunContext, ranked: GiftScore[], pos: number, cons: string[]): { verdict: Verdict; headline: string } {
  const W = VERDICT_WEIGHTS
  const refs = ranked.filter((g) => !mustHave(g.gift.id))
  const ref = Math.max(1e-9, refs[Math.min(W.refRank, refs.length) - 1]?.score ?? s.score)
  const rel = s.score / ref
  const rank = pos >= 0 ? `#${pos + 1} of ${ranked.length} for your team` : 'for your team'
  const harmful = cons.some((c) => /Un-staggers|Staggers your own/.test(c))
  const spare = floorCostFrom(ranked, ctx.run.floor ?? 1).comfortable

  if (!harmful && ((pos >= 0 && pos < W.takeTop) || rel >= W.take)) {
    return { verdict: 'take', headline: `One of the best gifts for this team (${rank}).` }
  }
  if (!harmful && rel >= W.maybe) {
    return { verdict: 'maybe', headline: `A solid pick, just not one of your best (${rank}). Take it if nothing better is on offer${shopGift(gift) ? `, or buy it if you'll still have Cost left after your top picks (they take about ${spare})` : ''}.` }
  }
  if (rel >= W.conditional) {
    // What it would take to make it worth it.
    const into = (ctx.fusionsByIngredient.get(gift.id) ?? [])
      .map((f) => ctx.giftsById.get(f.result))
      .find((r) => r && !ctx.owned.has(r.id) && !isGone(ctx, r.id) && scoreGift(r, ctx).score >= ref * W.fusionResult)
    const set = (ctx.combosByGift.get(gift.id) ?? []).find((c) => c.any_team
      ? (c.rank ?? 99) <= W.setRank
      : !c.keyword || (ctx.profile.keywordCounts[c.keyword as keyof typeof ctx.profile.keywordCounts] ?? 0) > 0)
    const conditions: string[] = []
    if (into) conditions.push(`you're fusing toward ${into.name} (it's an ingredient)`)
    if (set) conditions.push(`you're building the ${set.name}`)
    if ((s.fit >= 0.5 || s.synergy) && rel >= W.fits) {
      conditions.push(shopGift(gift) ? `you'll still have Cost left after your top picks (they take about ${spare})` : 'nothing better is offered')
    } else if (shopGift(gift) && !harmful && rel >= W.spareCost) {
      conditions.push(`you have plenty of Cost to spare (well over the ${spare} your top picks take)`)
    }
    if (conditions.length) {
      return { verdict: 'maybe', headline: `Worth it if ${joinOr(conditions)} (${rank}).${harmful ? ' Mind the downside below.' : ''}` }
    }
  }
  return {
    verdict: 'skip',
    headline: harmful ? `Its downside hurts your team more than it helps (${rank}).`
      : s.fit === 0 && !s.synergy ? `Little use for this team (${rank}). Sell it or use it as fusion fodder.`
        : `Only if nothing else is on offer (${rank}); as fusion fodder it's fine.`,
  }
}

function joinOr(xs: string[]): string {
  return xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`
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
    if (!r || ctx.owned.has(r.id) || isGone(ctx, r.id)) continue
    const val = scoreGift(r, ctx)
    const text = `Its exclusives fuse into ${r.name}`
    if (team && val.fit > 0.5) pros.push(`${text}, a strong gift for your team`)
    else notes.push(text)
  }
  if (s && s.ownedCount) notes.push(`You already have ${s.ownedCount} of its gifts`)

  // You pick one of the few packs you're offered, so a pack is judged against the others on its
  // floor: the best few are a Go, the upper half a Maybe.
  const n = ranked.length
  // Something only this pack gives that suits your team: an exclusive that fits it.
  const fitsTeam = !!s && s.highlights.some((h) => h.fits && h.kind === 'exclusive')
  const where = run.floor !== null && onThisFloor ? `#${k + 1} of ${n} on floor ${run.floor}` : k >= 0 ? `#${k + 1} of ${n}` : ''
  const verdict: Verdict = !team ? 'maybe'
    : !s || !s.top.length || !onThisFloor ? 'skip'
      : s.verdict === 'go' || k < VERDICT_WEIGHTS.packTakeTop ? 'take'
        : s.verdict === 'maybe' || k < Math.ceil(n * VERDICT_WEIGHTS.packMaybeShare) ? 'maybe' : 'skip'
  const headline = !team ? 'Pick your team on the Team tab to judge this for your team.'
    : !onThisFloor ? `It can't show up on floor ${run.floor}.`
      : !s || !s.top.length ? 'You already have everything it can give.'
        : verdict === 'take' ? `One of the best packs for this team (${where}).`
          : verdict === 'maybe' ? `A good pick when the other packs on offer are weaker (${where})${fitsTeam ? '; it has exclusive gifts for your team' : ''}. Compare the packs you're offered on Pick a pack.`
            : `Only if the other packs on offer are worse (${where}).`
  return { score: s, rank: k >= 0 ? k + 1 : null, of: ranked.length, verdict, headline, pros: dedupe(pros), cons: dedupe(cons), notes: dedupe(notes) }
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)]
}
