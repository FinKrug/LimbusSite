// Rankings (the Rankings tab): the best of everything for Mirror Dungeon, whatever you own.
//
// Gifts: there's no "team" here, so each gift is scored for the strongest team of every status
// keyword (built from the whole roster, Hard run, nothing owned yet) with the normal gift scoring.
// Each team's scores are divided by the average of its top 10, so 1.0 = "as good as that team's
// best picks". A gift's overall value is its best across the seven teams; "works with any team" is
// how well it does for its worst one (General gifts that help everyone).
//
// Identities: strength (strength.ts: community tier lists with the Mirror Dungeon status bonus,
// plus clash), and "get next": for each keyword, the team you can build from what you own vs.
// from everything; an identity you don't own that would replace a weaker one of yours is a pick.
import { identityTier, strength, type TierOverrides } from './strength'
import { type GiftScore, makeContext, rankGifts, type RunSettings } from './scoring'
import { buildTeam, keywordFit, suggestOrder } from './teambuilder'
import { CORE_KEYWORDS, SINNERS, type CoreKeyword, type GameData, type Gift, type Identity, type Sinner } from './types'

/** A full Hard run before it starts: the usual Mirror Dungeon. */
export const RANKING_RUN: RunSettings = { difficulty: 'hard', floors: 10, floor: null, pack: null }

export interface GiftRanking {
  gift: Gift
  /** Best across the keyword teams (1 ≈ a top-10 pick for that team). */
  overall: number
  /** Worst across the keyword teams: high means it helps any team. */
  anyTeam: number
  /** Value for each keyword team. */
  byKeyword: Record<CoreKeyword, number>
  /** The keyword teams it's a top pick for (≥ 0.8), best first. */
  bestFor: CoreKeyword[]
  /** Why, from the team it's best for. */
  reasons: GiftScore['reasons']
}

/** The strongest team built around a keyword, in a sensible order. */
export function keywordTeam(data: GameData, k: CoreKeyword, tiers: TierOverrides = {}, owned?: Set<string>): Identity[] {
  const built = buildTeam(data, { kind: 'keyword', value: k }, owned, tiers)
  const byId = new Map(data.identities.map((i) => [i.id, i]))
  const ids = SINNERS.map((s) => byId.get(built.team[s] ?? '')).filter((i): i is Identity => !!i)
  const order = suggestOrder(data, ids, 7, [], tiers).order
  return order.map((s) => ids.find((i) => i.sinner === s)).filter((i): i is Identity => !!i)
}

export const ANY_TEAM_MIN = 0.45

export function rankGiftsOverall(data: GameData, tiers: TierOverrides = {}): GiftRanking[] {
  const per = new Map<string, { byKeyword: Partial<Record<CoreKeyword, number>>; reasons: Partial<Record<CoreKeyword, GiftScore['reasons']>> }>()
  for (const k of CORE_KEYWORDS) {
    // Without affiliations: a keyword's best team happens to have three Middle members, which would
    // make Middle gifts look like Burn gifts. Affiliation teams are their own thing.
    const team = keywordTeam(data, k, tiers).map((i) => ({ ...i, traits: [] }))
    const ctx = makeContext(data, team, [], { deployed: 7, tiers, run: RANKING_RUN })
    const ranked = rankGifts(ctx)
    const top = ranked.slice(0, 10).map((g) => g.score)
    const norm = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 1
    for (const g of ranked) {
      const row = per.get(g.gift.id) ?? { byKeyword: {}, reasons: {} }
      row.byKeyword[k] = norm > 0 ? Math.max(0, g.score / norm) : 0
      row.reasons[k] = g.reasons
      per.set(g.gift.id, row)
    }
  }
  const giftsById = new Map(data.gifts.map((g) => [g.id, g]))
  const out: GiftRanking[] = []
  for (const [id, row] of per) {
    const gift = giftsById.get(id)
    if (!gift) continue
    const byKeyword = Object.fromEntries(CORE_KEYWORDS.map((k) => [k, row.byKeyword[k] ?? 0])) as Record<CoreKeyword, number>
    const vals = CORE_KEYWORDS.map((k) => byKeyword[k])
    const overall = Math.max(...vals)
    const best = CORE_KEYWORDS.reduce((a, b) => (byKeyword[b] > byKeyword[a] ? b : a))
    const bestFor = CORE_KEYWORDS.filter((k) => byKeyword[k] >= 0.8).sort((a, b) => byKeyword[b] - byKeyword[a])
    out.push({ gift, overall, anyTeam: Math.min(...vals), byKeyword, bestFor, reasons: row.reasons[best] ?? [] })
  }
  return out.sort((a, b) => b.overall - a.overall || b.anyTeam - a.anyTeam || a.gift.name.localeCompare(b.gift.name))
}

/** The list for a filter: everything, gifts for any team, or one keyword's team. */
export function giftsFor(list: GiftRanking[], filter: 'all' | 'any' | CoreKeyword): GiftRanking[] {
  if (filter === 'all') return list
  if (filter === 'any') return list.filter((g) => g.anyTeam >= ANY_TEAM_MIN).sort((a, b) => b.anyTeam - a.anyTeam)
  return [...list].sort((a, b) => b.byKeyword[filter] - a.byKeyword[filter])
}

// ---------- identities ----------

export interface IdentityRanking {
  identity: Identity
  /** 0-1 (strength.ts). */
  score: number
  tier: string | null
  role: string | null
}

export function rankIdentitiesOverall(identities: readonly Identity[], tiers: TierOverrides = {}): IdentityRanking[] {
  return identities.map((i) => {
    const t = identityTier(i, tiers)
    return { identity: i, score: strength(i, tiers), tier: t.tier, role: t.role }
  }).sort((a, b) => b.score - a.score || a.identity.name.localeCompare(b.identity.name))
}

export interface GetNextPick {
  identity: Identity
  keyword: CoreKeyword
  /** Your current pick for that sinner in that keyword's team (built from what you own). */
  replaces: Identity
  /** How much better the team's spot gets (fit + strength). */
  gain: number
  /** Other keyword teams it would also improve. */
  alsoFor: CoreKeyword[]
}

const spotValue = (i: Identity, k: CoreKeyword, tiers: TierOverrides) => 0.6 * keywordFit(i, k) + 0.4 * strength(i, tiers)

/** Identities you don't own that would improve the teams you can build. */
export function getNextPicks(data: GameData, owned: ReadonlySet<string>, tiers: TierOverrides = {}, max = 8): GetNextPick[] {
  const byId = new Map(data.identities.map((i) => [i.id, i]))
  const best = new Map<string, GetNextPick>()
  for (const k of CORE_KEYWORDS) {
    const mine = buildTeam(data, { kind: 'keyword', value: k }, new Set(owned), tiers).team
    const ideal = buildTeam(data, { kind: 'keyword', value: k }, undefined, tiers).team
    for (const s of SINNERS as readonly Sinner[]) {
      const want = byId.get(ideal[s] ?? ''), have = byId.get(mine[s] ?? '')
      if (!want || !have || owned.has(want.id) || want.id === have.id) continue
      const gain = spotValue(want, k, tiers) - spotValue(have, k, tiers)
      if (gain <= 0.05) continue
      const prev = best.get(want.id)
      if (!prev) best.set(want.id, { identity: want, keyword: k, replaces: have, gain, alsoFor: [] })
      else if (gain > prev.gain) best.set(want.id, { identity: want, keyword: k, replaces: have, gain, alsoFor: [...prev.alsoFor, prev.keyword] })
      else prev.alsoFor.push(k)
    }
  }
  // A pick that helps several teams is worth more.
  return [...best.values()]
    .sort((a, b) => b.gain * (1 + 0.25 * b.alsoFor.length) - a.gain * (1 + 0.25 * a.alsoFor.length))
    .slice(0, max)
}

export interface OwnedTeam {
  keyword: CoreKeyword
  /** 0-1: how well your best 7 for it fit the keyword and how strong they are. */
  score: number
  /** How many of those 7 actually use the keyword. */
  filled: number
}

/** For each keyword, how good a team you can build from what you own (best first). */
export function ownedKeywordTeams(data: GameData, owned: ReadonlySet<string>, tiers: TierOverrides = {}): OwnedTeam[] {
  const byId = new Map(data.identities.map((i) => [i.id, i]))
  return CORE_KEYWORDS.map((k) => {
    const built = buildTeam(data, { kind: 'keyword', value: k }, new Set(owned), tiers).team
    const top = SINNERS.map((s) => byId.get(built[s] ?? '')).filter((i): i is Identity => !!i)
      .sort((a, b) => spotValue(b, k, tiers) - spotValue(a, k, tiers)).slice(0, 7)
    const score = top.reduce((sum, i) => sum + spotValue(i, k, tiers), 0) / 7
    return { keyword: k, score, filled: top.filter((i) => keywordFit(i, k) >= 0.5).length }
  }).sort((a, b) => b.score - a.score)
}
