// How good an identity is on its own, separate from how well it fits the team.
// Used to give the strongest units the buffed deployment slots and to prefer
// them when building a team. The Mirror Dungeon ranking in
// src/data/identity_tiers.json is built by scraper/tiers.py from two community
// tier lists; you can override any identity in the app.
import tiersJson from '../data/identity_tiers.json'
import { gameData } from './data'
import type { Identity } from './types'

export const TIERS = ['SSS', 'SS', 'S+', 'S', 'A', 'B', 'C', 'D'] as const
export type Tier = (typeof TIERS)[number]
export type Role = 'Damage' | 'Status' | 'Support' | 'Tank'
/** Your own ratings, by identity id. They win over the ranking. */
export type TierOverrides = Record<string, Tier>

/** Same scale as scraper/tiers.py: SSS 10 … D 2.5. */
const TIER_POINTS: Record<Tier, number> = { SSS: 10, SS: 9, 'S+': 8.5, S: 8, A: 7, B: 5.5, C: 4, D: 2.5 }

interface Ranked { tier: Tier; score: number; role?: Role; prydwen?: string; gll?: string }
export const tierList = tiersJson as unknown as {
  about: string; sources: string[]; updated: string; tiers: Record<string, Ranked>
}

export function isTier(t: unknown): t is Tier {
  return typeof t === 'string' && (TIERS as readonly string[]).includes(t)
}

export interface Rating {
  tier: Tier | null
  /** Where the tier came from: your rating, the ranking, or none (rated by rarity). */
  from: 'you' | 'list' | null
  /** 2.5–10 on the ranking's scale. */
  score: number | null
  role: Role | null
}

export function identityTier(i: Identity, overrides: TierOverrides = {}): Rating {
  const ranked = tierList.tiers[i.id]
  const role = ranked?.role ?? null
  if (isTier(overrides[i.id])) return { tier: overrides[i.id], from: 'you', score: TIER_POINTS[overrides[i.id]], role }
  if (ranked && isTier(ranked.tier)) return { tier: ranked.tier, from: 'list', score: ranked.score, role }
  return { tier: null, from: null, score: null, role }
}

/** Statuses that win clashes: on the unit itself (or allies), and on the enemy. */
const CLASH_SELF = /^(?:Haste|Offense Level Up|Attack Power Up|(?:Slash|Pierce|Blunt) Power Up|Plus Coin Boost|Unbreakable Coin|Clash Power Up)$/
const CLASH_ENEMY = /^(?:Bind|Paralyze|Offense Level Down|Attack Power Down|Clash Power Down)$/

/** The skill's best roll: base power plus every coin's power (a minus-coin skill's best is its base). */
export function maxRoll(s: { base: number | null; coin_power: number | null; coins: number | null }): number {
  const cp = s.coin_power ?? 0
  return (s.base ?? 0) + (cp > 0 ? cp * (s.coins ?? 1) : 0)
}

/** Copy-weighted clash numbers of an identity's attack skills, or null without skill data. */
function clashParts(i: Identity): { roll: number; status: number } | null {
  const skills = (i.skills ?? []).filter((s) => s.base !== null)
  if (!skills.length) return null
  let w = 0, roll = 0, status = 0
  for (const s of skills) {
    const c = s.copies ?? [3, 2, 1][s.slot - 1] ?? 1
    w += c
    roll += c * maxRoll(s)
    if ((s.self ?? []).some((x) => CLASH_SELF.test(x)) || (s.enemy ?? []).some((x) => CLASH_ENEMY.test(x))) status += c
  }
  return { roll: roll / w, status: status / w }
}

let rolls: number[] | null = null
/** Every identity's average best roll, sorted (for percentiles). */
function allRolls(): number[] {
  rolls ??= gameData.identities.map(clashParts).filter((x): x is NonNullable<typeof x> => !!x).map((x) => x.roll).sort((a, b) => a - b)
  return rolls
}

/**
 * How well an identity clashes, 0–1: winning clashes is the most important thing in Mirror Dungeon
 * (Finley), since a unit that wins its clash doesn't get hit. Mostly how high its skills roll
 * (base + coin power x coins, by copies, as a percentile of all identities), plus how many of its
 * skills give itself Haste, Offense Level or Power Up, or put Bind, Paralyze or Offense Level Down
 * on the enemy. Null without skill data.
 */
export function clashRating(i: Identity): number | null {
  const p = clashParts(i)
  if (!p) return null
  const all = allRolls()
  let below = 0
  while (below < all.length && all[below] < p.roll) below++
  const pct = all.length > 1 ? below / (all.length - 1) : 0.5
  return Math.min(1, 0.75 * Math.min(1, pct) + 0.25 * Math.min(1, 2 * p.status))
}

/** Share of strength that comes from clashing (the rest from the ranking or rarity). */
export const CLASH_SHARE = { ranked: 0.25, unranked: 0.4 }

/**
 * 0–1. Ranked identities use their score (SSS 10 → 1, D 2.5 → 0.06). Unranked
 * ones (new releases) fall back to rarity: a 3★ counts as a mid-A. Either way it's
 * blended with how well the identity clashes (clashRating).
 */
export function strength(i: Identity, overrides: TierOverrides = {}): number {
  const { score } = identityTier(i, overrides)
  const clash = clashRating(i)
  const base = score !== null ? Math.max(0.05, Math.min(1, (score - 2) / 8))
    : [0.1, 0.25, 0.6][Math.max(1, Math.min(3, i.rarity ?? 1)) - 1]
  if (clash === null) return base
  const k = score !== null ? CLASH_SHARE.ranked : CLASH_SHARE.unranked
  return (1 - k) * base + k * clash
}

/** Tooltip text: why an identity has its tier. */
export function tierSource(r: Rating, i: Identity): string {
  if (r.from === 'you') return 'Your rating'
  const ranked = tierList.tiers[i.id]
  if (!ranked) return 'Not ranked yet'
  const parts = [ranked.prydwen && `Prydwen ${ranked.prydwen}`, ranked.gll && `GLL ${ranked.gll}`].filter(Boolean)
  return `Mirror Dungeon ranking (${parts.join(', ')}${ranked.role === 'Status' ? ', +status bonus' : ''})`
}

/** A short label for the identity cards: only for clearly strong or weak clashers. */
export function clashLabel(i: Identity): { text: string; strong: boolean; title: string } | null {
  const c = clashRating(i)
  if (c === null || (c > 0.25 && c < 0.7)) return null
  const strong = c >= 0.7
  return {
    text: strong ? 'Strong clash' : 'Weak clash',
    strong,
    title: `${strong ? 'Wins' : 'Loses'} clashes more than most: its skills roll ${strong ? 'high' : 'low'} (base + coin power), counting Haste, Power Up, Bind and Paralyze from its skills. Clash rating ${Math.round(c * 100)}/100.`,
  }
}
