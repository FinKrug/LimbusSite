/**
 * Rare finds worth a celebration (Finley, 2026-11-15: "a type of celebration thing that shows up on
 * the screen if they get a really rare gift like wealth"). A gift is a rare find when this run only
 * gives it by luck (plan.ts `availability` → 'luck'): EX gifts (Wealth, A Certain Philosophy) from
 * an event gamble, a hidden pack's gifts (The B.E.: about 1 in 5,000), an EXTREME hidden boss's
 * reward.
 */
import { availability } from './plan'
import type { RunContext } from './scoring'
import type { Gift, ThemePack } from './types'

export type RareStyle = 'coins' | 'stars'

export interface RareFind {
  gift: Gift
  /** Coins for Wealth (it's money), stars for the rest. */
  style: RareStyle
  /** Why it's rare, from where it comes from. */
  why: string
}

/** Wealth rains coins; every other rare find, stars. */
export function rareStyle(g: Gift): RareStyle {
  return /^wealth$/i.test(g.name) ? 'coins' : 'stars'
}

/** The first rare find among gifts just added (`added`), judged before you had them. */
export function rareFind(added: string[], ctx: RunContext, packsForGift: Map<string, ThemePack[]>): RareFind | null {
  for (const id of added) {
    const g = ctx.giftsById.get(id)
    if (!g) continue
    const a = availability(g, ctx, packsForGift)
    if (a.where === 'luck' || (g.tier ?? 0) >= 6) {
      return { gift: g, style: rareStyle(g), why: (g.tier ?? 0) >= 6 ? `An EX gift. ${a.text}.` : `${a.text}.` }
    }
  }
  return null
}
