// How good an identity is on its own, separate from how well it fits the team.
// Used to give the strongest units the buffed deployment slots and to prefer
// them when building a team. Ratings come from src/data/identity_tiers.json
// (a community tier list) and can be overridden per identity in the app.
import tiersJson from '../data/identity_tiers.json'
import type { Identity } from './types'

export const TIERS = ['SSS', 'SS', 'S+', 'S', 'A', 'B', 'C', 'D'] as const
export type Tier = (typeof TIERS)[number]
/** Your own ratings, by identity id. They win over the tier list. */
export type TierOverrides = Record<string, Tier>

const TIER_VALUE: Record<Tier, number> = {
  SSS: 1, SS: 0.85, 'S+': 0.75, S: 0.65, A: 0.5, B: 0.35, C: 0.2, D: 0.1,
}

export const tierList = tiersJson as { source: string; updated: string; note: string; tiers: Record<string, Tier> }

export function isTier(t: unknown): t is Tier {
  return typeof t === 'string' && (TIERS as readonly string[]).includes(t)
}

export interface Rating {
  tier: Tier | null
  /** Where the tier came from: your rating, the tier list, or none (rated by rarity). */
  from: 'you' | 'list' | null
}

export function identityTier(i: Identity, overrides: TierOverrides = {}): Rating {
  if (isTier(overrides[i.id])) return { tier: overrides[i.id], from: 'you' }
  const listed = tierList.tiers[i.id]
  if (isTier(listed)) return { tier: listed, from: 'list' }
  return { tier: null, from: null }
}

/**
 * 0–1. Rated identities use their tier. Unrated ones fall back to rarity
 * (3★ ≈ A−, 1★ ≈ C), since the tier list only covers the top units.
 */
export function strength(i: Identity, overrides: TierOverrides = {}): number {
  const { tier } = identityTier(i, overrides)
  if (tier) return TIER_VALUE[tier]
  return 0.15 * Math.max(1, Math.min(3, i.rarity ?? 1))
}
