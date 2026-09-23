// Deployment order: which sinner is #1, #2, ... Some gifts only affect certain slots
// ("[Effects apply only to #1, #2 Deployed Identities]").
import type { Gift } from './types'

/** How many sinners fight by default; the rest are backups. */
export const DEFAULT_DEPLOYED = 6

const SLOT_RE = /Effects? appl(?:y|ies) only to (?:the )?((?:#\d+\s*(?:,\s*)?(?:and\s+)?)+)\s*Deployed/i
const EXCLUSIVE_RE = /\[\s*#(\d+) Deployed Identity Exclusive/i

export interface GiftSlots {
  slots: number[]
  /** True if the whole gift is limited to these slots, false if only part of it. */
  whole: boolean
}

const cache = new Map<string, GiftSlots | null>()

export function giftSlots(g: Gift): GiftSlots | null {
  if (cache.has(g.id)) return cache.get(g.id)!
  let out: GiftSlots | null = null
  const m = SLOT_RE.exec(g.effect)
  if (m) {
    out = { slots: [...m[1].matchAll(/#(\d+)/g)].map((x) => Number(x[1])), whole: m.index < 10 }
  } else {
    const e = EXCLUSIVE_RE.exec(g.effect)
    if (e) out = { slots: [Number(e[1])], whole: false }
  }
  cache.set(g.id, out)
  return out
}

/** "#1", "#1–#2", "#1, #3" */
export function slotText(slots: number[]): string {
  const sorted = [...slots].sort((a, b) => a - b)
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1)
  if (sorted.length > 1 && contiguous) return `#${sorted[0]}–#${sorted.at(-1)}`
  return sorted.map((n) => `#${n}`).join(', ')
}
