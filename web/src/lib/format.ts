import type { Identity } from './types'

/** CSS class for a tier badge: "S+" -> "tier-sp". */
export function tierClass(tier: string): string {
  return `tier-${tier.replace('+', 'p').toLowerCase()}`
}

/** "LCB Sinner Yi Sang" -> "LCB Sinner" (the sinner is shown separately). */
export function shortName(i: Identity): string {
  const trimmed = i.name.endsWith(i.sinner) ? i.name.slice(0, -i.sinner.length).trim() : i.name
  return trimmed || i.name
}

/** Gifts shown per pack before "Show more", and how many more each click adds. */
export const PACK_GIFTS_FIRST = 5
export const PACK_GIFTS_STEP = 30

/** The next count to show: 5 -> 35 -> 65 ..., capped at the total. */
export function nextShown(shown: number, total: number): number {
  return Math.min(total, shown + PACK_GIFTS_STEP)
}

