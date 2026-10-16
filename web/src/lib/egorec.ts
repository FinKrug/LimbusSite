/**
 * E.G.O recommendations for the Team tab: for each deployed sinner and grade, which
 * of their E.G.O fits the team best.
 *
 * An E.G.O is worth (value of one use over the skill it replaces) x (uses per turn
 * your team can pay for). So it scores well when:
 *  - its skill hits hard and inflicts the team's keywords (Rupture, Poise, ...);
 *  - its cost is in sins your team's skills actually make (battle.ts tracks resources
 *    per sin), after what your other equipped E.G.O already spend.
 *
 * Each slot is judged with the rest of your loadout as it is, so picks spread costs
 * over different sins instead of all fighting over one. Like Build, it doesn't know
 * which E.G.O you own.
 *
 * When a slot's strongest E.G.O is held back only by resources your team doesn't
 * make, the slot gets an `upgrade` note naming the gifts that make those resources.
 * Best gifts marks the same gifts (scoring.ts, egoAdjust), and once you own one its
 * resources count (ego.ts, giftGen), so the suggestion moves to that E.G.O by itself.
 */
import {
  EGO_WEIGHTS, egoCost, egoGiftInfo, egoValue, GRADES, withBase,
  type BattleProfile, type Ego, type EgoLoadout, type Grade,
} from './ego'
import type { SinMap } from './battle'
import { SINS, type Gift, type Identity, type Sin, type Sinner } from './types'

export interface EgoPick {
  ego: Ego
  /** Value per turn this E.G.O adds (uses x gain). */
  score: number
  /** Uses per turn the resources allow (at most EGO_WEIGHTS.usesPerSinner). */
  uses: number
  /** Value of one use over the skill it replaces. */
  gain: number
  /** Team keywords its skill inflicts. */
  fits: string[]
  /** The sin that limits how often it comes out, if resources do. */
  short: { sin: Sin; need: number; have: number } | null
  /** Every sin the team makes too little of to use it often. */
  shortSins: Sin[]
  reasons: string[]
}

/** A stronger E.G.O for a slot that only needs more resources, and gifts that make them. */
export interface EgoUpgrade {
  pick: EgoPick
  sins: Sin[]
  /** Gifts you don't own that make those resources: ones naming the sin first, then random ones. */
  gifts: Gift[]
}

export interface EgoRec {
  sinner: Sinner
  grade: Grade
  current: EgoPick | null
  best: EgoPick
  /** Is switching to `best` worth suggesting? */
  better: boolean
  upgrade: EgoUpgrade | null
}

/** An E.G.O worth getting resources for (scoring.ts marks gifts that make them). */
export interface EgoNeed {
  sinner: Sinner
  ego: Ego
  sins: Sin[]
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const list = (xs: string[]) => xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`

/** Team keywords an E.G.O inflicts ("Tremor Burst" counts for Tremor). */
export function egoFits(e: Ego, keywords: string[]): string[] {
  const statuses = [...e.statuses, ...(e.skill?.statuses ?? [])]
  return keywords.filter((k) => statuses.some((s) => s === k || s.startsWith(`${k} `)))
}

/** Switch only for a clear improvement, so suggestions don't flip on tiny differences. */
const MIN_RATIO = 1.15
const MIN_DIFF = 0.05
/** A held-back E.G.O must be this much stronger per use than the pick to be worth a note. */
const UPGRADE_RATIO = 1.25
const UPGRADE_DIFF = 1

/** Gifts that make E.G.O resources of any of these sins (named ones first, then random). */
export function resourceGifts(gifts: Gift[], sins: Sin[], owned: Set<string> = new Set()): Gift[] {
  const named: Gift[] = []
  const random: Gift[] = []
  for (const g of gifts) {
    if (owned.has(g.id)) continue
    const info = egoGiftInfo(g)
    if (info.resourceShare < 0.3) continue
    if (info.resourceSins.some((s) => sins.includes(s))) named.push(g)
    else if (!info.resourceSins.length) random.push(g)
  }
  const byTier = (a: Gift, b: Gift) => (a.tier ?? 0) - (b.tier ?? 0)
  return [...named.sort(byTier), ...random.sort(byTier)]
}

export function recommendEgos(
  members: Identity[], egos: Ego[], loadout: EgoLoadout, battle: BattleProfile,
  gifts: Gift[] = [], owned: Set<string> = new Set(),
): EgoRec[] {
  const full = withBase(loadout, egos)
  const keywords = [...new Set(members.flatMap((m) => m.keywords))]
  const out: EgoRec[] = []
  members.forEach((m, k) => {
    const avg = battle.sim.unitValue[k] ?? 0
    for (const grade of GRADES) {
      const options = egos.filter((e) => e.sinner === m.sinner && e.grade === grade)
      if (!options.length) continue
      const currentId = full[m.sinner]?.[grade]
      // Resources left for this slot: what the team makes minus what the other E.G.O spend.
      const left: SinMap = { ...battle.ego.gen }
      for (const u of battle.ego.uses) {
        if (u.ego.sinner === m.sinner && u.ego.grade === grade) continue
        for (const [sin, amt] of Object.entries(u.cost) as [Sin, number][]) left[sin] -= u.uses * amt
      }
      const picks = options.map((e) => pick(e, avg, left, keywords))
      const ranked = [...picks].sort((a, b) => b.score - a.score || b.gain - a.gain)
      const best = ranked[0]
      const current = picks.find((p) => p.ego.id === currentId) ?? null
      const strongest = Math.max(...picks.map((p) => p.gain))
      if (best.gain >= strongest && best.gain > 0 && options.length > 1) best.reasons.push('Strongest skill of their ' + grade)
      // An empty slot is only worth filling with something the team can mostly pay for.
      const better = !current
        ? best.score > MIN_DIFF && best.uses >= 0.5 * EGO_WEIGHTS.usesPerSinner
        : best.ego.id !== current.ego.id && best.score >= current.score * MIN_RATIO && best.score - current.score >= MIN_DIFF
      // The strongest one, if only resources keep it from being the pick.
      const top = [...picks].sort((a, b) => b.gain - a.gain)[0]
      const held = top.ego.id !== best.ego.id && top.shortSins.length > 0
        && top.gain >= best.gain * UPGRADE_RATIO && top.gain - best.gain >= UPGRADE_DIFF
      const upgrade = held ? { pick: top, sins: top.shortSins, gifts: resourceGifts(gifts, top.shortSins, owned) } : null
      const up = upgrade?.gifts.length ? upgrade : null
      // You've equipped the held-back one on purpose (to build resources for it): don't suggest switching back.
      const building = !!up && current?.ego.id === up.pick.ego.id
      out.push({ sinner: m.sinner, grade, current, best, better: better && !building, upgrade: up })
    }
  })
  return out
}

function pick(e: Ego, avg: number, left: SinMap, keywords: string[]): EgoPick {
  const fits = egoFits(e, keywords)
  const value = egoValue(e, avg, 1) + 1.5 * fits.length
  const gain = value - avg
  const { cost } = egoCost(e)
  let uses = EGO_WEIGHTS.usesPerSinner
  let short: EgoPick['short'] = null
  const shortSins: Sin[] = []
  for (const [sin, need] of Object.entries(cost) as [Sin, number][]) {
    if (!need) continue
    const n = Math.max(0, left[sin]) / need
    if (n < 0.5 * EGO_WEIGHTS.usesPerSinner) shortSins.push(sin)
    if (n < uses) {
      uses = n
      short = { sin, need, have: Math.max(0, left[sin]) }
    }
  }
  // Small tie-break on raw strength so an unaffordable slot still ranks sensibly.
  const score = uses * Math.max(0, gain) + 0.01 * Math.max(0, gain)
  const reasons: string[] = []
  if (fits.length) reasons.push(`Inflicts ${list(fits)}, which your team uses`)
  const costText = SINS.filter((s) => cost[s]).map((s) => `${cap(s)} ${cost[s]}`).join(' · ')
  if (!short) reasons.push(`Your team makes enough for it (${costText})`)
  else if (uses / EGO_WEIGHTS.usesPerSinner < 0.5) {
    reasons.push(`Short on ${cap(short.sin)}: needs ${short.need}, your team makes about ${short.have.toFixed(1)} a turn`)
  } else reasons.push(`Mostly affordable (${costText})`)
  return { ego: e, score, uses, gain, fits, short, shortSins, reasons }
}

/** E.G.O that would be the better pick with more resources, for marking gifts. */
export function egoNeeds(recs: EgoRec[]): EgoNeed[] {
  return recs.filter((r) => r.upgrade).map((r) => ({ sinner: r.sinner, ego: r.upgrade!.pick.ego, sins: r.upgrade!.sins }))
}

/** The loadout with every suggested change applied. */
export function applyRecs(loadout: EgoLoadout, recs: EgoRec[]): EgoLoadout {
  const out: EgoLoadout = { ...loadout }
  for (const r of recs) {
    if (!r.better) continue
    out[r.sinner] = { ...(out[r.sinner] ?? {}), [r.grade]: r.best.ego.id }
  }
  return out
}
