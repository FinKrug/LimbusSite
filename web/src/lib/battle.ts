/**
 * A small battle model for comparing decks: what your deployed team plays each
 * turn, how often it can line up (Absolute) Resonance, and which sins' E.G.O
 * resources it makes. Used by the skill-swap planner and by gift scoring.
 *
 * Rules it follows (wiki: Sin Resonance; blog.limbus.wiki: Damage Formula):
 *  - Each identity's deck is 6 skill copies (usually S1 x3, S2 x2, S3 x1). Two are
 *    in hand; you use one, keep the other, draw one; the deck reshuffles when empty.
 *  - Resonance: a skill's index is the number of same-sin skills to its left on the
 *    dashboard. Absolute Resonance: 3+ same-sin skills next to each other; each gets
 *    the block's size as its index. Index -> Offense Level: 1 -> +1, 2-3 -> +3,
 *    4-5 -> +5, 6-7 -> +7, 8-9 -> +9, 10 -> +11, 11+ -> +13.
 *  - Offense Level x over the enemy adds x / (|x| + 25) to damage and 1 Clash
 *    Power per 3 levels.
 *  - Each skill used gives 1 E.G.O resource of its sin.
 *
 * Each turn the model picks the combination of hand skills (one per identity) with
 * the most total value, placing same-sin skills together. Skill value is a rough
 * power estimate (see skillValue); special skill effects are ignored.
 */
import { SINS, type Identity, type Sin, type Skill } from './types'

export type Swaps = Partial<Record<'1to2' | '2to3' | '1to3', number>>

const OL_BY_INDEX = [0, 1, 3, 3, 5, 5, 7, 7, 9, 9, 11, 13]
/** Offense Level from a resonance index. */
export function offenseLevel(index: number): number {
  return OL_BY_INDEX[Math.min(index, OL_BY_INDEX.length - 1)]
}
/** Extra damage (as a fraction) from an Offense Level advantage. */
export function levelDamage(ol: number): number {
  return ol / (Math.abs(ol) + 25)
}

/** Rough strength of one use of a skill, before resonance. */
export function skillPower(s: Pick<Skill, 'base' | 'coin_power' | 'coins'>): { power: number; perCoin: number } {
  const base = s.base ?? 0
  const coins = s.coins ?? 1
  const cp = s.coin_power ?? 0
  return { power: cp >= 0 ? base + coins * cp * 0.5 : base, perCoin: 0.8 + 0.2 * coins }
}

/** Value of one use of a skill with this Offense Level from resonance. */
export function skillValue(s: Skill, teamKeywords: string[], ol = 0): number {
  const { power, perCoin } = skillPower(s)
  const statuses = s.statuses.filter((x) => teamKeywords.includes(x)).length
  return (power + Math.floor(ol / 3)) * perCoin * (1 + levelDamage(ol)) + 1.5 * statuses + (s.slot === 3 ? 1 : 0)
}

/** A generic skill for identities without skill data. */
const FILLER: Skill = { slot: 1, name: '?', sin: null, type: null, base: 4, coin_power: 3, coins: 2, copies: 3, weight: 1, statuses: [] }

/** The identity's 6 cards after the swaps you've made. */
export function deckCards(i: Identity, swaps: Swaps = {}): Skill[] {
  const skills = i.skills ?? []
  if (skills.length < 3) return Array.from({ length: 6 }, () => FILLER)
  const copies: Record<number, number> = {}
  for (const s of skills) copies[s.slot] = s.copies ?? (s.slot === 1 ? 3 : s.slot === 2 ? 2 : 1)
  const moves: [keyof Swaps, 1 | 2 | 3, 1 | 2 | 3][] = [['1to2', 1, 2], ['2to3', 2, 3], ['1to3', 1, 3]]
  for (const [k, from, to] of moves) {
    const n = Math.min(swaps[k] ?? 0, copies[from] ?? 0)
    copies[from] -= n
    copies[to] = (copies[to] ?? 0) + n
  }
  return skills.flatMap((s) => Array.from({ length: Math.max(0, copies[s.slot] ?? 0) }, () => s))
}

export type SinMap = Record<Sin, number>
const zeroSins = (): SinMap => ({ wrath: 0, lust: 0, sloth: 0, gluttony: 0, gloom: 0, pride: 0, envy: 0 })

export interface SimResult {
  /** Average total skill value per turn (resonance included). */
  valuePerTurn: number
  /** The same turns without resonance: how much resonance adds. */
  plainPerTurn: number
  /** Average value per turn of each identity's skills (team order). */
  unitValue: number[]
  /** Share of turns with an Absolute Resonance of each sin. */
  areson: SinMap
  /** Share of turns with at least a Resonance (2+) of each sin. */
  reson: SinMap
  /** E.G.O resources of each sin made per turn by the skills used. */
  gen: SinMap
  /** Share of turns with any Absolute Resonance. */
  anyAreson: number
  turns: number
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SIN_INDEX = new Map<Sin, number>(SINS.map((s, k) => [s, k]))

/**
 * Play `turns` turns with these decks. Same seed + same decks = same result, so
 * two versions of a team (before/after a swap) are compared on the same draws.
 */
export function simulate(decks: Skill[][], teamKeywords: string[], opts: { turns?: number; seed?: number } = {}): SimResult {
  const turns = opts.turns ?? 1200
  const rand = rng(opts.seed ?? 7)
  const n = decks.length
  if (!n) {
    return { valuePerTurn: 0, plainPerTurn: 0, unitValue: [], areson: zeroSins(), reson: zeroSins(), gen: zeroSins(), anyAreson: 0, turns }
  }
  // Every distinct card gets a number; its sin (-1 = none) and value at each resonance index.
  const cards: Skill[] = []
  const cardOf = new Map<Skill, number>()
  const deckIds = decks.map((d) => d.map((s) => {
    let id = cardOf.get(s)
    if (id === undefined) { id = cards.length; cards.push(s); cardOf.set(s, id) }
    return id
  }))
  const L = OL_BY_INDEX.length
  const sinOf = Int8Array.from(cards, (s) => (s.sin ? SIN_INDEX.get(s.sin)! : -1))
  const val = new Float64Array(cards.length * L)
  cards.forEach((s, c) => { for (let idx = 0; idx < L; idx++) val[c * L + idx] = skillValue(s, teamKeywords, offenseLevel(idx)) })

  const shuffle = (a: number[]) => {
    for (let k = a.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1))
      const t = a[k]; a[k] = a[j]; a[j] = t
    }
    return a
  }
  const draw = deckIds.map((d) => shuffle([...d]))
  const discard: number[][] = deckIds.map(() => [])
  const pull = (u: number): number => {
    if (!draw[u].length) {
      draw[u] = shuffle(discard[u])
      discard[u] = []
    }
    return draw[u].pop() ?? deckIds[u][0]
  }
  const h0 = new Int32Array(n)
  const h1 = new Int32Array(n)
  for (let u = 0; u < n; u++) { h0[u] = pull(u); h1[u] = pull(u) }

  let total = 0
  let plain = 0
  const unitTotals = new Float64Array(n)
  const aresonN = new Float64Array(7)
  const resonN = new Float64Array(7)
  const genN = new Float64Array(7)
  let anyAreson = 0
  const counts = new Int32Array(7)
  const pos = new Int32Array(7)
  const pick = new Int32Array(n)
  const best = new Int32Array(n)
  const opts2 = new Int32Array(n)

  for (let t = 0; t < turns; t++) {
    let combos = 1
    for (let u = 0; u < n; u++) { opts2[u] = h0[u] === h1[u] ? 1 : 2; combos *= opts2[u] }
    let bestValue = -Infinity
    for (let c = 0; c < combos; c++) {
      let rest = c
      counts.fill(0)
      for (let u = 0; u < n; u++) {
        const o = opts2[u] === 2 ? rest & 1 : 0
        if (opts2[u] === 2) rest >>= 1
        const card = o ? h1[u] : h0[u]
        pick[u] = card
        const k = sinOf[card]
        if (k >= 0) counts[k]++
      }
      pos.fill(0)
      let v = 0
      for (let u = 0; u < n; u++) {
        const card = pick[u]
        const k = sinOf[card]
        const idx = k < 0 ? 0 : counts[k] >= 3 ? counts[k] : pos[k]++
        v += val[card * L + (idx < L ? idx : L - 1)]
      }
      if (v > bestValue) {
        bestValue = v
        best.set(pick)
      }
    }
    // Record the chosen turn.
    counts.fill(0)
    for (let u = 0; u < n; u++) { const k = sinOf[best[u]]; if (k >= 0) counts[k]++ }
    pos.fill(0)
    for (let u = 0; u < n; u++) {
      const card = best[u]
      const k = sinOf[card]
      const idx = k < 0 ? 0 : counts[k] >= 3 ? counts[k] : pos[k]++
      if (k >= 0) genN[k]++
      unitTotals[u] += val[card * L + (idx < L ? idx : L - 1)]
      plain += val[card * L]
    }
    total += bestValue
    let a = false
    for (let k = 0; k < 7; k++) {
      if (counts[k] >= 3) { aresonN[k]++; a = true }
      if (counts[k] >= 2) resonN[k]++
    }
    if (a) anyAreson++
    // Use the chosen card, keep the other, draw one.
    for (let u = 0; u < n; u++) {
      const used = best[u]
      discard[u].push(used)
      const kept = used === h0[u] ? h1[u] : h0[u]
      h0[u] = kept
      h1[u] = pull(u)
    }
  }
  const areson = zeroSins()
  const reson = zeroSins()
  const gen = zeroSins()
  SINS.forEach((s, k) => {
    areson[s] = aresonN[k] / turns
    reson[s] = resonN[k] / turns
    gen[s] = genN[k] / turns
  })
  return {
    valuePerTurn: total / turns,
    plainPerTurn: plain / turns,
    unitValue: Array.from(unitTotals, (x) => x / turns),
    areson, reson, gen,
    anyAreson: anyAreson / turns,
    turns,
  }
}
