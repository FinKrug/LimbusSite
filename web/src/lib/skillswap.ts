/**
 * Skill Replacement planner. In Mirror Dungeon shops, Skill Replacement turns one
 * copy of a skill in an identity's deck into a higher skill (wiki: Mirror Dungeon >
 * Shop Functions):
 *   S1 -> S2: 45 Cost, S2 -> S3: 75 Cost, S1 -> S3: 120 Cost
 * A regular shop offers it for a random sinner; a Super Shop's ID Skill Search lets
 * you choose (90 / 150 / 240 Cost). Decks are usually S1 x3, S2 x2, S3 x1.
 *
 * How a swap is valued (battle.ts, ego.ts): the deployed team is played for a
 * few hundred turns with and without the swap, on the same draws. The difference
 * in value per turn covers all of it at once:
 *  - the stronger skill: each swap moves 1 turn in 5 from the weaker skill to the
 *    stronger one (you always end up leaving your worst card in hand);
 *  - Resonance / Absolute Resonance: the new skill may have another sin, which
 *    makes same-sin blocks easier or harder to line up;
 *  - E.G.O: skills make resources of their sin, so a swap changes what your
 *    equipped E.G.O can afford, and turns spent on E.G.O don't use the deck.
 * That gain (as a % of your team's value per turn), per 100 Cost and weighted by
 * the floors left to enjoy it, decides whether it's worth buying.
 */
import { deckCards, skillValue, type Swaps } from './battle'
import { buildBattle, type BattleProfile, type Ego, type EgoLoadout } from './ego'
import type { RunSettings } from './scoring'
import type { Gift, Identity, Sin, Skill } from './types'

export { skillValue }

export type SwapKind = '1to2' | '2to3' | '1to3'
export const SWAPS: { kind: SwapKind; from: 1 | 2 | 3; to: 1 | 2 | 3; cost: number; search: number }[] = [
  { kind: '1to3', from: 1, to: 3, cost: 120, search: 240 },
  { kind: '2to3', from: 2, to: 3, cost: 75, search: 150 },
  { kind: '1to2', from: 1, to: 2, cost: 45, search: 90 },
]
export type SwapLog = Swaps
export type SwapState = Record<string, SwapLog>

export const SWAP_WEIGHTS = {
  /** Turns simulated per version of the team. */
  turns: 1500,
  /** Worth buying at this many % of team value per 100 Cost (10+ floors left). */
  worth: 1.3,
  /** Floors-left weight: floors left / this, between min and max. */
  floorsFull: 8,
  floorsMin: 0.25,
  floorsMax: 1.25,
}

/** Copies of skill 1/2/3 in the deck after the swaps you've made. */
export function deck(i: Identity, log: SwapLog = {}): Record<1 | 2 | 3, number> {
  const d = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>
  if ((i.skills ?? []).length < 3) {
    return { 1: 3 - (log['1to2'] ?? 0) - (log['1to3'] ?? 0), 2: 2 + (log['1to2'] ?? 0) - (log['2to3'] ?? 0), 3: 1 + (log['2to3'] ?? 0) + (log['1to3'] ?? 0) }
  }
  for (const s of deckCards(i, log)) d[s.slot]++
  return d
}

/** How many copies of each sin the deployed team's decks hold. */
export function teamSins(team: Identity[], swaps: SwapState): Map<Sin, number> {
  const out = new Map<Sin, number>()
  for (const i of team) {
    if ((i.skills ?? []).length < 3) continue
    for (const s of deckCards(i, swaps[i.id])) if (s.sin) out.set(s.sin, (out.get(s.sin) ?? 0) + 1)
  }
  return out
}

export interface SwapAdvice {
  kind: SwapKind
  from: Skill
  to: Skill
  cost: number
  search: number
  /** Change in the team's value per turn, as a fraction (0.02 = +2%). */
  gain: number
  /** % of team value per 100 Cost, weighted by floors left. */
  score: number
  worth: boolean
  pros: string[]
  cons: string[]
}

export interface IdentityPlan {
  identity: Identity
  deck: Record<1 | 2 | 3, number>
  skills: Skill[]
  best: SwapAdvice | null
  options: SwapAdvice[]
}

export interface SwapOptions {
  egos?: Ego[]
  loadout?: EgoLoadout
  run?: RunSettings
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const pct = (x: number, sign = true) => `${sign && x > 0 ? '+' : ''}${(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0)}%`
const total = (b: BattleProfile) => b.sim.valuePerTurn + b.ego.gain

/** Floors left to use a swap, as a weight (short runs and late floors count less). */
export function floorsWeight(run?: RunSettings): { floorsLeft: number; weight: number } {
  const floorsLeft = run ? Math.max(1, run.floors - (run.floor ?? 1) + 1) : 10
  const w = Math.min(SWAP_WEIGHTS.floorsMax, Math.max(SWAP_WEIGHTS.floorsMin, floorsLeft / SWAP_WEIGHTS.floorsFull))
  return { floorsLeft, weight: w }
}

export function planSwaps(team: Identity[], swaps: SwapState, owned: Gift[], opts: SwapOptions = {}): IdentityPlan[] {
  const egos = opts.egos ?? []
  const loadout = opts.loadout ?? {}
  const sim = { turns: SWAP_WEIGHTS.turns }
  const base = buildBattle(team, swaps, egos, loadout, owned, sim)
  const baseTotal = total(base) || 1
  const keywords = [...new Set(team.flatMap((i) => i.keywords))]
  const giftSins = new Set(owned.flatMap((g) => g.affinities ?? []))
  const { floorsLeft, weight } = floorsWeight(opts.run)

  return team.map((i) => {
    const skills = [...(i.skills ?? [])].sort((a, b) => a.slot - b.slot)
    const d = deck(i, swaps[i.id])
    const options: SwapAdvice[] = []
    if (skills.length >= 3) {
      for (const sw of SWAPS) {
        const from = skills.find((s) => s.slot === sw.from)
        const to = skills.find((s) => s.slot === sw.to)
        if (!from || !to || d[sw.from] <= 0) continue
        const log = { ...(swaps[i.id] ?? {}), [sw.kind]: (swaps[i.id]?.[sw.kind] ?? 0) + 1 }
        const after = buildBattle(team, { ...swaps, [i.id]: log }, egos, loadout, owned, sim)
        const gain = (total(after) - baseTotal) / baseTotal
        const score = (gain * 100 * weight) / (sw.cost / 100)
        const pros: string[] = []
        const cons: string[] = []

        // Where the gain comes from.
        const skillPart = (after.sim.plainPerTurn - base.sim.plainPerTurn) / baseTotal
        const resonPart = ((after.sim.valuePerTurn - after.sim.plainPerTurn) - (base.sim.valuePerTurn - base.sim.plainPerTurn)) / baseTotal
        const egoPart = (after.ego.gain - base.ego.gain) / baseTotal
        const vFrom = skillValue(from, keywords)
        const vTo = skillValue(to, keywords)
        if (skillPart > 0.002) pros.push(`${to.name} (S${to.slot}) is stronger than ${from.name} (S${from.slot}): ${pct(skillPart)} team damage`)
        else if (vTo <= vFrom * 1.05) cons.push(`${from.name} (S${from.slot}) is about as strong as ${to.name} (S${to.slot})`)
        if (from.sin && to.sin && from.sin === to.sin) {
          pros.push(`Same sin (${cap(from.sin)}), so Resonance is unchanged`)
        } else {
          const sins = new Set<Sin>([from.sin, to.sin].filter((x): x is Sin => !!x))
          const moved = [...sins]
            .map((s) => ({ s, before: base.sim.areson[s], after: after.sim.areson[s] }))
            .filter((x) => Math.abs(x.after - x.before) >= 0.03)
          for (const m of moved) {
            const text = `${cap(m.s)} Absolute Resonance on ${Math.round(m.before * 100)}% → ${Math.round(m.after * 100)}% of turns`
            ;(m.after > m.before ? pros : cons).push(text)
          }
          if (Math.abs(resonPart) >= 0.003) {
            ;(resonPart > 0 ? pros : cons).push(`Resonance overall: ${pct(resonPart)} team damage`)
          }
          if (from.sin && giftSins.has(from.sin) && d[sw.from] === 1 && !skills.some((s) => s.slot !== from.slot && s.sin === from.sin)) {
            cons.push(`Its last ${cap(from.sin)} skill: gifts that check for ${cap(from.sin)} skills stop counting it`)
          }
        }
        if (Math.abs(egoPart) >= 0.003) {
          const sinWord = from.sin && to.sin && from.sin !== to.sin ? ` (${cap(to.sin)} resources instead of ${cap(from.sin)})` : ''
          ;(egoPart > 0 ? pros : cons).push(`E.G.O: ${pct(egoPart)} from what your equipped E.G.O can afford${sinWord}`)
        }
        // Team statuses the old skill applies that the new one doesn't.
        const coreKeywords = keywords as string[]
        const lost = from.statuses.filter((x) => coreKeywords.includes(x) && !to.statuses.includes(x)
          && !skills.some((s) => s.slot !== from.slot && s.statuses.includes(x)))
        if (lost.length && d[sw.from] === 1) {
          cons.push(`Its last skill that applies ${lost.join(', ')}: it may stop counting for gifts like "5+ identities with ${lost[0]} skills"`)
        }
        if (d[sw.from] === 1) cons.push(`Removes your last S${sw.from}`)
        if (base.ego.share >= 0.08) cons.push(`E.G.O take about ${Math.round(base.ego.share * 100)}% of turns, so deck skills matter a bit less`)
        if (floorsLeft <= 3) cons.push(`Only ${floorsLeft} floor${floorsLeft > 1 ? 's' : ''} left to use it`)
        const worth = score >= SWAP_WEIGHTS.worth && gain > 0
        options.push({ kind: sw.kind, from, to, cost: sw.cost, search: sw.search, gain, score, worth, pros, cons })
      }
    }
    options.sort((a, b) => b.score - a.score)
    const best = options.find((o) => o.worth) ?? null
    return { identity: i, deck: d, skills, best, options }
  })
}
