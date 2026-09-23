// Deployment order: which sinner is #1, #2, ... Some gifts only affect certain slots
// ("[Effects apply only to #1, #2 Deployed Identities]").
import type { Gift } from './types'

/** How many sinners fight in Mirror Dungeon (#1–#7); #8 onward are backups. */
export const DEFAULT_DEPLOYED = 7

const SLOT_RE = /Effects? appl(?:y|ies) only to (?:the )?((?:#\d+\s*(?:,\s*)?(?:and\s+)?)+)\s*Deployed/i
const EXCLUSIVE_RE = /\[\s*#(\d+) Deployed Identity Exclusive/i
// "[Effects apply only to the Identity with the earliest Deployment order]" is #1.
const EARLIEST_RE = /Effects? appl(?:y|ies) only to the Identity with the earliest Deployment order/i
// Part of the gift for one slot: "The ally highest in the Deployment order: ...", "If the #5 Deployed ally has ...".
const HIGHEST_RE = /The ally highest in the Deployment order/i
const ALLY_RE = /#(\d+) Deployed ally/i

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
  } else if (EARLIEST_RE.test(g.effect)) {
    out = { slots: [1], whole: EARLIEST_RE.exec(g.effect)!.index < 10 }
  } else {
    const e = EXCLUSIVE_RE.exec(g.effect) ?? ALLY_RE.exec(g.effect)
    if (e) out = { slots: [Number(e[1])], whole: false }
    else if (HIGHEST_RE.test(g.effect)) out = { slots: [1], whole: false }
  }
  cache.set(g.id, out)
  return out
}

/** Is this line where a gift's slot-limited part starts? */
export function isSlotHeader(line: string): boolean {
  return SLOT_RE.test(line) || EARLIEST_RE.test(line) || EXCLUSIVE_RE.test(line) || HIGHEST_RE.test(line) || ALLY_RE.test(line)
}

/** "#1", "#1–#2", "#1, #3" */
export function slotText(slots: number[]): string {
  const sorted = [...slots].sort((a, b) => a - b)
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1)
  if (sorted.length > 1 && contiguous) return `#${sorted[0]}–#${sorted.at(-1)}`
  return sorted.map((n) => `#${n}`).join(', ')
}
