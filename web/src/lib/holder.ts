// Conditions on the sinner in a slot. Slot-limited gifts often only pay off
// for certain units: Cultivation (#6) gives much more to a Family Hierarch
// Candidate, Carpenter's Nail (#4) needs 2+ Pierce skills, For the Capo (#1)
// needs a unit that spends Ammo, High-tensility Shoes (#3) wants 3+ Haste.
// These steer both how a gift scores for your lineup and who the suggested
// order puts in that slot.
import { giftSlots, isSlotHeader } from './lineup'
import { isCoreKeyword, type AttackType, type Gift, type Identity, type Sin } from './types'

export type HolderCondition = {
  share: number
  /** "a Family Hierarch Candidate", "a unit with 2+ Pierce skills" */
  noun: string
  /** "is a Family Hierarch Candidate", "has 2+ Pierce skills" */
  pred: string
} & (
  | { kind: 'trait'; traits: string[] }
  | { kind: 'status'; status: string }
  | { kind: 'attackCount'; attack: AttackType; min: number; scaled: boolean }
  | { kind: 'sin'; sin: Sin }
)

type Draft = HolderCondition extends infer T ? T extends unknown ? Omit<T, 'share'> : never : never

const SINS: Record<string, Sin> = {
  wrath: 'wrath', lust: 'lust', sloth: 'sloth', gluttony: 'gluttony', gloom: 'gloom', pride: 'pride', envy: 'envy',
}

interface Vocab { traits: string[]; statuses: Set<string> }
const vocabCache = new WeakMap<Identity[], Vocab>()
function vocab(identities: Identity[]): Vocab {
  let v = vocabCache.get(identities)
  if (!v) {
    v = {
      traits: [...new Set(identities.flatMap((i) => i.traits ?? []))],
      statuses: new Set(identities.flatMap((i) => i.status_effects)),
    }
    vocabCache.set(identities, v)
  }
  return v
}

/** The lines of a gift that only apply to its slot(s), without the "[Effects apply only to …]" header. */
export function slotLines(g: Gift): string[] {
  const slots = giftSlots(g)
  if (!slots) return []
  const lines = g.effect.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const header = (l: string) => /^\[?\s*Effects? appl(?:y|ies) only to/i.test(l)
  if (slots.whole) return mergeSubLines(lines.filter((l) => !header(l)))
  // Part of the gift: a "[… Deployed …]" block runs to the next "[" section; an
  // inline one ("The ally highest in the Deployment order: …") takes its "- " sub-lines.
  const out: string[] = []
  let mode: 'off' | 'block' | 'inline' = 'off'
  for (const l of lines) {
    if (isSlotHeader(l)) {
      mode = l.startsWith('[') ? 'block' : 'inline'
      const rest = l.replace(/^\[[^\]]*\]\s*/, '')
      if (rest) out.push(rest)
    } else if (mode === 'block' && !l.startsWith('[')) {
      out.push(l)
    } else if (mode === 'inline' && l.startsWith('- ')) {
      out.push(l)
    } else {
      mode = 'off'
    }
  }
  return mergeSubLines(out)
}

/** "When using a Skill that spends Ammo, activate the following:" gates the "- " lines under it. */
function mergeSubLines(lines: string[]): string[] {
  const merged: string[] = []
  let open = false
  for (const l of lines) {
    if (open && l.startsWith('- ')) {
      merged[merged.length - 1] += ' ' + l
    } else {
      merged.push(l)
      open = l.trimEnd().endsWith(':')
    }
  }
  return merged
}

const fold = (s: string) => s.toLowerCase().replace(/\.$/, '').trim()

function findTraits(candidate: string, known: string[]): string[] {
  const c = fold(candidate)
  if (c.length < 3) return []
  return known.filter((t) => {
    const f = fold(t)
    return f === c || f.startsWith(c + ' ') || f.startsWith(c + '.')
  })
}

const cache = new WeakMap<Gift, HolderCondition[]>()

/** Conditions on the unit in the gift's slot, with the share of the slot effect each one gates. */
export function holderConditions(g: Gift, identities: Identity[]): HolderCondition[] {
  const hit = cache.get(g)
  if (hit) return hit
  const lines = slotLines(g)
  const total = lines.reduce((s, l) => s + l.length, 0)
  const { traits, statuses } = vocab(identities)
  const found = new Map<string, HolderCondition>()
  const add = (key: string, line: string, c: Draft) => {
    // A "- If this unit is …: also …" rider is a bonus on top of the line above,
    // so it never counts for more than half the gift.
    const share = line.startsWith('- ') ? Math.min(0.5, line.length / total) : line.length / total
    const prev = found.get(key)
    found.set(key, { ...c, share: Math.min(1, (prev?.share ?? 0) + share) } as HolderCondition)
  }
  for (const line of lines) {
    // "If this unit is a Family Hierarch Candidate:", "is a T Corp. employee", "is a Lobotomy Corp. Identity"
    for (const m of line.matchAll(/\bis (?:a|an) ([A-Z][^:,;]*?)( Identity| Identities| employee)?\s*(?::|,|;|\.(?:\s|$))/g)) {
      const ts = findTraits(m[1], traits)
      const name = m[1].trim().replace(/\.$/, '')
      const noun = m[2] ? `a ${name} identity` : `a ${name}`
      if (ts.length) add(`trait:${ts.join('|')}`, line, { kind: 'trait', traits: ts, noun, pred: `is ${noun}` })
    }
    // "If this unit has 2+ Pierce Attack Skills"
    for (const m of line.matchAll(/(\d+)\+ (Slash|Pierce|Blunt) (?:Base )?Attack Skills/gi)) {
      const attack = (m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()) as AttackType
      add(`atk:${attack}`, line, {
        kind: 'attackCount', attack, min: Number(m[1]), scaled: false,
        noun: `a unit with ${m[1]}+ ${attack} skills`, pred: `has ${m[1]}+ ${attack} skills`,
      })
    }
    // "gain +(# of Pierce Base Attack Skills) Offense Level"
    for (const m of line.matchAll(/# of (Slash|Pierce|Blunt) (?:Base )?Attack Skills/gi)) {
      const attack = (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) as AttackType
      add(`atk:${attack}`, line, {
        kind: 'attackCount', attack, min: 3, scaled: true,
        noun: `a unit with lots of ${attack} skills`, pred: `has lots of ${attack} skills`,
      })
    }
    // "Pride Pierce Skills", "Gloom Affinity Attack Skill", "For Pride Skills"
    for (const m of line.matchAll(/\b(Wrath|Lust|Sloth|Gluttony|Gloom|Pride|Envy)(?: Affinity)?(?: (?:Slash|Pierce|Blunt))?(?: Attack)? Skills?\b/g)) {
      const sin = SINS[m[1].toLowerCase()]
      add(`sin:${sin}`, line, { kind: 'sin', sin, noun: `a unit with ${m[1]} skills`, pred: `has ${m[1]} skills` })
    }
    // Statuses the unit itself has to use: "a Skill that spends Ammo", "At 3+ Haste", "if a different Skill was Discarded"
    const statusHits = [
      ...[...line.matchAll(/\bspends? ([A-Z][\w' -]*?)(?=[,.:;)]| \(|$)/g)].map((m) => m[1]),
      ...[...line.matchAll(/\bAt \d+\+ ([A-Z][\w -]*?)(?=[,.:;]| on | when )/g)].map((m) => m[1]),
      ...[...line.matchAll(/\b(?:unit|Identity|ally|self) has (?:a Skill that (?:gains|consumes|gains or consumes|inflicts|applies) )?([A-Z][\w -]*?)(?: Stacks| Count| Potency)?(?=[,.:;]| or | and )/g)].map((m) => m[1]),
      ...(/was Discarded/.test(line) ? ['Discard'] : []),
    ]
    for (const s of statusHits) {
      if (!statuses.has(s) || isCoreKeyword(s)) continue
      add(`status:${s}`, line, { kind: 'status', status: s, noun: `a unit that uses ${s}`, pred: `uses ${s}` })
    }
  }
  const out = [...found.values()]
  cache.set(g, out)
  return out
}

/** 0–1: how well this identity meets one condition. */
export function meets(i: Identity, c: HolderCondition): number {
  switch (c.kind) {
    case 'trait': return c.traits.some((t) => i.traits?.includes(t)) ? 1 : 0
    case 'status': return i.status_effects.includes(c.status) || i.status_effects.includes(`Unique ${c.status}`) ? 1 : 0
    case 'sin': return i.affinities.includes(c.sin) ? 1 : 0
    case 'attackCount': {
      const known = i.attack_counts && Object.keys(i.attack_counts).length > 0
      const n = known ? i.attack_counts![c.attack] ?? 0 : i.attack_types?.includes(c.attack) ? 1 : 0
      if (c.scaled) return Math.min(1, n / c.min)
      return n >= c.min ? 1 : n > 0 ? 0.3 : 0
    }
  }
}

/** Share of the slot effect this identity gets, 0–1, and which conditions it meets or misses. */
export function holderFactor(g: Gift, i: Identity, identities: Identity[]): {
  factor: number; met: HolderCondition[]; missed: HolderCondition[]
} {
  const conds = holderConditions(g, identities)
  let factor = 1
  const met: HolderCondition[] = []
  const missed: HolderCondition[] = []
  for (const c of conds) {
    const m = meets(i, c)
    factor -= c.share * (1 - m)
    if (m >= 0.99) met.push(c)
    else missed.push(c)
  }
  return { factor: Math.max(0, factor), met, missed }
}
