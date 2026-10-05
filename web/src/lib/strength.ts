// How good an identity is on its own, separate from how well it fits the team.
// Used to give the strongest units the buffed deployment slots and to prefer
// them when building a team. The Mirror Dungeon ranking in
// src/data/identity_tiers.json is built by scraper/tiers.py from two community
// tier lists; you can override any identity in the app.
import tiersJson from '../data/identity_tiers.json'
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

/**
 * 0–1. Ranked identities use their score (SSS 10 → 1, D 2.5 → 0.06). Unranked
 * ones (new releases) fall back to rarity: a 3★ counts as a mid-A.
 */
export function strength(i: Identity, overrides: TierOverrides = {}): number {
  const { score } = identityTier(i, overrides)
  if (score !== null) return Math.max(0.05, Math.min(1, (score - 2) / 8))
  return [0.1, 0.25, 0.6][Math.max(1, Math.min(3, i.rarity ?? 1)) - 1]
}

/** Tooltip text: why an identity has its tier. */
export function tierSource(r: Rating, i: Identity): string {
  if (r.from === 'you') return 'Your rating'
  const ranked = tierList.tiers[i.id]
  if (!ranked) return 'Not ranked yet'
  const parts = [ranked.prydwen && `Prydwen ${ranked.prydwen}`, ranked.gll && `GLL ${ranked.gll}`].filter(Boolean)
  return `Mirror Dungeon ranking (${parts.join(', ')}${ranked.role === 'Status' ? ', +status bonus' : ''})`
}
