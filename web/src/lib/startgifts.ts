/**
 * Starting gifts: right before a Mirror Dungeon run you can buy a few E.G.O gifts
 * (START_RULES: up to 3, Tier I–III). Which ones, in order?
 *
 * A gift is worth buying up front when:
 *  - it lets you skip a theme pack: it's exclusive to a pack and is most of what that
 *    pack offers your team, so with it in hand you never need to enter that pack;
 *  - it's strong for your team and hard to find: exclusive to one or a few packs (that
 *    may not even show up), rather than a main-pool gift any shop or reward can give;
 *  - plus how good it is for your team on its own (Best gifts' score).
 *
 *   value = score x 0.5 + score x findFactor + skip
 *   findFactor = 0.25 for main-pool gifts, else min(1, 3 / packs in this difficulty that have it)
 *   skip       = 0.8 x score x (its share of the pack's exclusives that fit your team), when that share >= 0.6
 *
 * Picks are greedy: after each pick the rest are scored again as if you owned it, so a
 * second gift that applies the same status, or a gift that combos with the first, moves.
 */
import { isGone, isHiddenPack, makeContext, packInDifficulty, scoreGift, type GiftScore, type RunContext } from './scoring'
import type { Gift, ThemePack } from './types'

/** The pre-run purchase as the game offers it. Change these if the game does. */
export const START_RULES = { count: 3, maxTier: 3 }

export const START_WEIGHTS = {
  base: 0.5,
  mainFind: 0.25,
  rareAt: 3,
  skip: 0.8,
  skipShare: 0.6,
}

export interface StartPick {
  score: GiftScore
  value: number
  /** Packs this gift lets you skip. */
  skips: ThemePack[]
  /** Short reasons, best first. */
  why: string[]
}

function candidates(ctx: RunContext): Gift[] {
  const recipe = new Set(ctx.data.fusions.map((f) => f.result))
  return ctx.data.gifts.filter((g) => (g.tier ?? 0) >= 1 && (g.tier ?? 0) <= START_RULES.maxTier && !g.fusion_recipe
    && !recipe.has(g.id) && !g.pools.includes('cursed') && !g.pools.includes('extreme') && !ctx.owned.has(g.id) && !isGone(ctx, g.id))
}

function judge(g: Gift, ctx: RunContext, packsForGift: Map<string, ThemePack[]>): StartPick | null {
  const s = { ...scoreGift(g, ctx), rating: 0 }
  if (!(s.fit > 0 || s.synergy) || s.score <= 0) return null
  const W = START_WEIGHTS
  // Hidden packs (The B.E.) are too rare to count as a place to find it.
  const packs = (packsForGift.get(g.id) ?? []).filter((p) => packInDifficulty(p, ctx.run.difficulty) && !isHiddenPack(p))
  const main = g.pools.includes('main')
  const find = main ? W.mainFind : packs.length ? Math.min(1, W.rareAt / packs.length) : 0
  const why: string[] = []
  // Packs whose value for your team is mostly this gift.
  const skips: ThemePack[] = []
  let skip = 0
  for (const p of packs.filter((x) => x.gifts.includes(g.id))) {
    const fitting = p.gifts.filter((id) => !ctx.owned.has(id)).map((id) => ctx.giftsById.get(id))
      .filter((x): x is Gift => !!x).map((x) => (x.id === g.id ? s : scoreGift(x, ctx)))
      .filter((x) => x.fit > 0 || x.synergy)
    const total = fitting.reduce((a, x) => a + x.score, 0)
    const share = total ? s.score / total : 0
    if (share >= W.skipShare) {
      skips.push(p)
      skip = Math.max(skip, W.skip * s.score * share)
    }
  }
  if (skips.length) {
    why.push(skips.length === 1
      ? `Lets you skip ${skips[0].name}: it's ${fittingWord(skips[0], g)} there for your team`
      : `Lets you skip ${skips.map((p) => p.name).slice(0, 2).join(' and ')}: it's what they offer your team`)
  }
  if (!main && packs.length) {
    why.push(packs.length === 1 ? `Only in ${packs[0].name}, which may not show up: buying it guarantees it`
      : `Only in ${packs.length} theme packs: buying it guarantees it`)
  } else if (main) {
    why.push('Shops and rewards can also give it, so it counts a bit less here')
  }
  const reason = s.reasons.find((r) => r.kind === 'good')
  if (reason) why.push(reason.text)
  return { score: s, value: s.score * W.base + s.score * find + skip, skips, why }
}

function fittingWord(p: ThemePack, g: Gift): string {
  return p.gifts.length === 1 || p.gifts[0] === g.id ? 'the only gift' : 'most of what’s'
}

/** How many other options to list after the picks (the panel shows a few and can expand to all). */
export const START_OPTIONS = 30

/**
 * The best gifts to buy before the run, in order (count from START_RULES), plus other options:
 * the rest of the last round's ranking (scored as if you bought the picks before the last one).
 */
export function startingPicks(
  ctx: RunContext, packsForGift: Map<string, ThemePack[]>,
  /** The same context with other gifts owned (keeps your E.G.O, swaps, etc.). */
  rebuild: (owned: string[]) => RunContext = (owned) =>
    makeContext(ctx.data, ctx.lineup, owned, { deployed: ctx.deployed, tiers: ctx.tiers, run: ctx.run }),
  alternatives = START_OPTIONS,
): StartPlan {
  const picks: StartPick[] = []
  let cur = ctx
  let alts: StartPick[] = []
  for (let k = 0; k < START_RULES.count; k++) {
    const ranked = candidates(cur).map((g) => judge(g, cur, packsForGift)).filter((x): x is StartPick => !!x)
      .sort((a, b) => b.value - a.value)
    if (!ranked.length) break
    picks.push(ranked[0])
    alts = ranked.slice(1, 1 + alternatives)
    if (k < START_RULES.count - 1) cur = rebuild([...cur.owned, ranked[0].score.gift.id])
  }
  return { picks, alternatives: alts, together: together(ctx, picks.map((p) => p.score.gift.id)) }
}

export interface StartPlan {
  picks: StartPick[]
  alternatives: StartPick[]
  /** What the picks do together: recipes they complete, packs they let you skip. */
  together: string[]
}

/** Recipes the picks complete (with what you own), and packs whose exclusives they all cover. */
function together(ctx: RunContext, ids: string[]): string[] {
  const have = new Set([...ctx.owned, ...ids])
  const out: string[] = []
  for (const f of ctx.data.fusions) {
    if (have.has(f.result) || f.any_of || !f.ingredients.some((i) => ids.includes(i))) continue
    if (f.ingredients.every((i) => have.has(i))) {
      out.push(`Together they fuse into ${ctx.giftsById.get(f.result)?.name ?? f.result}: fuse it at the first shop`)
    }
  }
  for (const p of ctx.data.themePacks) {
    if (!packInDifficulty(p, ctx.run.difficulty) || isHiddenPack(p)) continue
    const mine = p.gifts.filter((id) => ids.includes(id))
    if (mine.length < 2) continue
    const fitting = p.gifts.filter((id) => !ctx.owned.has(id)).filter((id) => {
      const g = ctx.giftsById.get(id)
      if (!g) return false
      const s = scoreGift(g, ctx)
      return s.fit > 0 || s.synergy
    })
    if (fitting.every((id) => ids.includes(id))) out.push(`Together they cover everything ${p.name} has for your team: you can skip it`)
  }
  return out
}
