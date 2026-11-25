// Parallel Superposition EXTREME: which Mounting Adversities to take (PRO150 requirement 4).
//
// How the game does it (wiki, Mirror Dungeon › Mounting Adversities; scraped into
// data/adversities.json): after clearing each of floors 10 to 14 of a 15-floor EXTREME run, that
// floor's 6 adversities are offered and you take any of them. Each one stays for the rest of the
// run and adds its Adversity Score. Level Boost and Frailness are on every floor, so they stack up
// to 5 times ("level 0–5"); some come in two tiers (Mark of Fire I on floor 10, II on floor 13), the
// higher one replacing the lower one's effect. At the end of the run every point of Adversity Score
// gives 15 Starlight and 15 Projection Rate; Projection Rate stops at the weekly cap of 1000, and a
// 15-floor run already earns 645 from its floors, so past about 24 points only Starlight is left.
// Achievements (not capped) pay for the first clear with each named adversity and for 5/15/25/35/50
// points.
//
// The model: each adversity costs "harm" per floor it's active on, rated for the team (clash
// strength for Level Boost / Brutality / Nerve Acceleration, E.G.O lean for Ego Interference,
// Tremor for Tremor Barrier...). Its value is its score in Starlight, plus Projection Rate while
// under the cap, plus any achievement it completes. A plan for the rest of the run takes the best
// value per harm first, until the team's risk budget (how strong the deployed team is × the risk
// setting) runs out. Late adversities cost less (fewer floors left), so the plan leans late.
import adversitiesJson from '@data/adversities.json'
import { clashRating, strength } from './strength'
import type { RunContext } from './scoring'

export interface Adversity {
  /** Slug of the full name ("mark-of-fire-ii"); the same adversity on several floors keeps its id. */
  id: string
  name: string
  /** Name without the tier numeral ("Mark of Fire"). */
  family: string
  family_id: string
  tier: number | null
  /** Offered after clearing this floor (10–14). */
  floor: number
  effect: string
  score: number
  /** The wiki says a higher tier overwrites a lower tier's effect. */
  replaces_lower: boolean
}

export const ADVERSITIES = adversitiesJson as Adversity[]

/** One adversity on one floor: `${floor}:${id}`. */
export type OfferKey = string
export const offerKey = (a: { floor: number; id: string }): OfferKey => `${a.floor}:${a.id}`

export type Risk = 'safe' | 'balanced' | 'push'

export interface AdversityState {
  /** Adversities taken this run (offer keys). Cleared with the run. */
  taken: OfferKey[]
  risk: Risk
  /** Projection Rate already earned this week before this run (the weekly cap is 1000). */
  prBefore: number
  /** Does Projection Rate still matter to you (false once the season's rewards are all claimed)? */
  wantPR: boolean
  /** Adversity achievements already done this season: family ids and 'score-5', 'score-15'... */
  achievements: string[]
}

export const EMPTY_ADVERSITY: AdversityState = { taken: [], risk: 'balanced', prBefore: 0, wantPR: true, achievements: [] }

export function normalizeAdversity(s: Partial<AdversityState> | null | undefined): AdversityState {
  const ok = new Set(ADVERSITIES.map(offerKey))
  return {
    taken: Array.isArray(s?.taken) ? [...new Set(s!.taken.filter((k) => typeof k === 'string' && ok.has(k)))] : [],
    risk: s?.risk === 'safe' || s?.risk === 'push' ? s.risk : 'balanced',
    prBefore: typeof s?.prBefore === 'number' && Number.isFinite(s.prBefore) ? Math.max(0, Math.min(PR_CAP, Math.round(s.prBefore))) : 0,
    wantPR: s?.wantPR !== false,
    achievements: Array.isArray(s?.achievements) ? s!.achievements.filter((x) => typeof x === 'string') : [],
  }
}

// -- rewards (wiki: Mirror of Sisyphe › Projection Rate and Achievements) -------------------
export const LAST_FLOOR = 15
export const FIRST_OFFER = 10
export const STARLIGHT_PER_POINT = 15
export const PR_PER_POINT = 15
export const PR_CAP = 1000
/** Projection Rate a 15-floor run earns from its floors (Hard 1–5 at 10 each, then 15, 15, 20,
 *  20, 30, 40, 50, 80, 125, 200). */
export const RUN_PR = 645
/** "Clear Mirror Dungeon with 1 or more 'X' Adversities": 50 Projection Rate each. */
export const FAMILY_ACHIEVEMENTS = ['level-boost', 'frailness', 'mark-of-fire', 'inflation', 'ego-interference', 'mental-psychosis',
  'nerve-acceleration', 'sp-fatigue', 'tremor-barrier', 'vitality-boost', 'brutality']
export const FAMILY_ACHIEVEMENT_PR = 50
/** "Clear Mirror Dungeon with N or higher Adversity Score". */
export const SCORE_ACHIEVEMENTS: { score: number; pr: number }[] = [
  { score: 5, pr: 100 }, { score: 15, pr: 100 }, { score: 25, pr: 150 }, { score: 35, pr: 150 }, { score: 50, pr: 200 },
]
export const scoreAchievementId = (n: number) => `score-${n}`

/** Points that still earn Projection Rate this week. */
export function prPointsLeft(state: Pick<AdversityState, 'prBefore'>): number {
  return Math.max(0, Math.floor((PR_CAP - state.prBefore - RUN_PR) / PR_PER_POINT))
}

// -- harm -----------------------------------------------------------------------------------

/** What the team brings to how much each adversity hurts. */
export interface TeamRead {
  /** 0–1 average clash rating of the deployed team (0.5 when unknown). */
  clash: number
  /** 0–1 average strength (tier list + clash). */
  strength: number
  /** 0–1 how much the team leans on E.G.O (ego.ts); null when no E.G.O are picked. */
  egoLean: number | null
  /** Share of the deployed team with Tremor. */
  tremor: number
  size: number
  struggling: boolean
}

export function readTeam(ctx: RunContext): TeamRead {
  const m = ctx.members
  const clash = m.map((i) => clashRating(i)).filter((x): x is number => x !== null)
  return {
    clash: clash.length ? clash.reduce((a, b) => a + b, 0) / clash.length : 0.5,
    strength: m.length ? m.reduce((a, i) => a + strength(i, ctx.tiers), 0) / m.length : 0.5,
    egoLean: ctx.battle?.ego?.known ? ctx.battle.ego.lean : null,
    tremor: ctx.profile.size ? (ctx.profile.keywordCounts.Tremor ?? 0) / ctx.profile.size : 0,
    size: ctx.profile.size,
    struggling: !!ctx.run.struggling,
  }
}

interface Model {
  /** Harm per floor it's active on, for this team (the tier's own effect, not on top of a lower tier). */
  harm: (t: TeamRead, tier: number) => number
  /** One-line reason, what the adversity does to this team. */
  why: (t: TeamRead, tier: number) => string
}

const byTier = <T,>(tier: number, one: T, two: T): T => (tier >= 2 ? two : one)
const clashWord = (t: TeamRead) => (t.clash >= 0.62 ? 'your team clashes well, so it hurts less' : t.clash <= 0.42 ? 'your team already struggles in clashes' : 'fights get harder')

/** Rough harm per floor (1 ≈ a floor with enemies 3 levels higher), tuned so a strong team on
 *  Balanced lands around the 24 points that still earn Projection Rate. */
const MODELS: Record<string, Model> = {
  'level-boost': {
    harm: (t) => 0.9 * (1.25 - 0.5 * t.clash),
    why: (t) => `Enemies 3 levels higher (it stacks): ${clashWord(t)}.`,
  },
  frailness: {
    harm: () => 0.7,
    why: () => '10% less Max HP for everyone (it stacks); fine if fights stay short.',
  },
  'mark-of-fire': {
    harm: (_, tier) => byTier(tier, 1.4, 2.6),
    why: (_, tier) => `Fixed damage to every ally each turn, growing to ${byTier(tier, 20, 30)}: long fights (EXTREME's Long Battle packs) wear you down.`,
  },
  inflation: {
    harm: (_, tier) => byTier(tier, 0.45, 0.8),
    why: (_, tier) => `Shops cost ${byTier(tier, 'double', 'triple')} (selling isn't affected): cheap if your gifts are already set.`,
  },
  'ego-interference': {
    harm: (t, tier) => byTier(tier, 1, 1.7) * (t.egoLean === null ? 0.6 : 0.35 + 1.3 * t.egoLean),
    why: (t, tier) => `E.G.O cost ${byTier(tier, 'twice', 'three times')} the resources: ${t.egoLean === null ? 'no E.G.O picked on Team, so rated as average'
      : t.egoLean >= 0.5 ? 'your team leans on E.G.O, so it hurts' : t.egoLean <= 0.2 ? 'your team rarely uses E.G.O, so it barely matters' : 'your team uses some E.G.O'}.`,
  },
  'force-redistribution': {
    harm: () => 0.8,
    why: () => 'Each kill gives the other enemies 3 Offense Level Up: kill groups together or it snowballs.',
  },
  'mental-psychosis': {
    harm: (_, tier) => byTier(tier, 1.1, 1.9),
    why: (_, tier) => `Every ally loses ${byTier(tier, 3, 5)} SP each turn, so coins land heads less often.`,
  },
  'nerve-acceleration': {
    harm: (t, tier) => byTier(tier, 1.1, 2) * (1.2 - 0.4 * t.clash),
    why: (t, tier) => `Enemies ${byTier(tier, 1, 2)} Speed faster: they act first and pick their clashes; ${clashWord(t)}.`,
  },
  'sp-fatigue': {
    harm: (_, tier) => byTier(tier, 2.1, 3.4),
    why: (_, tier) => `SP can't heal past ${byTier(tier, 35, 30)}, so heads chance stays well below its usual 95%: hurts every team.`,
  },
  'psychological-elation': {
    harm: () => 1.3,
    why: () => 'Enemies heal 20 SP each turn, so they win more clashes.',
  },
  'tremor-barrier': {
    harm: (t) => 0.9 + 1.4 * t.tremor,
    why: (t) => `Enemies lose their first Stagger Threshold: ${t.tremor >= 0.3 ? 'bad for your Tremor team, which plays for staggers' : 'staggers come later, a small loss for your team'}.`,
  },
  'shield-generation': {
    harm: () => 1.9,
    why: () => '3000 Shield on every enemy (only the core in Focused fights), and it doesn\'t wear off.',
  },
  'vitality-boost': {
    harm: () => 1.4,
    why: () => 'Enemies have 30% more HP: every fight lasts longer.',
  },
  brutality: {
    harm: (t) => 2.2 * (1.3 - 0.6 * t.clash),
    why: (t) => `Enemy coins +2 (and minus coins −2): clashes swing their way; ${clashWord(t)}.`,
  },
  'fracture-proliferation': {
    harm: () => 1.5,
    why: () => 'Enemies inflict twice the Burn, Bleed, Tremor, Rupture and Sinking.',
  },
  'status-infliction': {
    harm: () => 0.6,
    why: () => '5 Potency of a random status on every ally each turn.',
  },
}

/** Adversities the site doesn't know yet (a new season): rated by their score. */
const UNKNOWN: Model = { harm: () => 0.75, why: () => 'New adversity: rated from its score only.' }

function model(a: Adversity): Model {
  return MODELS[a.family_id] ?? { ...UNKNOWN, harm: () => 0.75 * a.score }
}

/** Harm per floor of one adversity on its own. */
export function harmPerFloor(a: Adversity, t: TeamRead): number {
  return model(a).harm(t, a.tier ?? 1)
}

export function whyLine(a: Adversity, t: TeamRead): string {
  return model(a).why(t, a.tier ?? 1)
}

const floorsAfter = (floor: number) => Math.max(0, LAST_FLOOR - floor)

/** Total harm a set of adversities does on floors after `from` (the floors still to play).
 *  A higher tier that replaces a lower one only adds the difference from its floor on. */
export function setHarm(set: Adversity[], t: TeamRead, from: number): number {
  let total = 0
  const families = new Map<string, Adversity[]>()
  for (const a of set) families.set(a.family_id, [...(families.get(a.family_id) ?? []), a])
  for (const list of families.values()) {
    const tiered = list.filter((a) => a.tier !== null).sort((x, y) => x.floor - y.floor)
    for (const a of list.filter((x) => x.tier === null)) total += harmPerFloor(a, t) * floorsAfter(Math.max(a.floor, from))
    for (let k = 0; k < tiered.length; k++) {
      const a = tiered[k]
      const start = Math.max(a.floor, from)
      // Replaced by a later, higher tier from that one's floor on.
      const next = tiered.slice(k + 1).find((b) => b.replaces_lower && (b.tier ?? 0) > (a.tier ?? 0))
      const end = next ? Math.max(next.floor, from) : LAST_FLOOR
      total += harmPerFloor(a, t) * Math.max(0, end - start)
    }
  }
  return total
}

/** How much harm (floors × harm) the team can take on for the rest of the run. */
export const RISK_BUDGET: Record<Risk, number> = { safe: 7, balanced: 14, push: 24 }

export function budget(t: TeamRead, risk: Risk): number {
  const team = 0.55 + 0.9 * Math.max(0, Math.min(1, t.strength))
  return RISK_BUDGET[risk] * team * (t.struggling ? 0.5 : 1)
}

// -- value ----------------------------------------------------------------------------------

/** Value of a set's rewards, in points of Starlight (15 Starlight = 1). Projection Rate counts the
 *  same per 15, only while under the weekly cap; achievements not done yet add theirs. */
export function setValue(set: Adversity[], state: AdversityState): number {
  const score = set.reduce((s, a) => s + a.score, 0)
  let value = score
  if (state.wantPR) {
    value += Math.min(score, prPointsLeft(state))
    const done = new Set(state.achievements)
    const families = new Set(set.map((a) => a.family_id))
    for (const f of FAMILY_ACHIEVEMENTS) if (families.has(f) && !done.has(f)) value += FAMILY_ACHIEVEMENT_PR / PR_PER_POINT
    for (const s of SCORE_ACHIEVEMENTS) if (score >= s.score && !done.has(scoreAchievementId(s.score))) value += s.pr / PR_PER_POINT
  }
  return value
}

export interface Rewards {
  score: number
  starlight: number
  /** Projection Rate from the score (capped) and from achievements. */
  pr: number
  prFromScore: number
  prFromAchievements: number
  /** Points past the weekly Projection Rate cap (Starlight only). */
  pastCap: number
  achievements: string[]
}

export function rewards(set: Adversity[], state: AdversityState): Rewards {
  const score = set.reduce((s, a) => s + a.score, 0)
  const left = prPointsLeft(state)
  const prFromScore = Math.min(score, left) * PR_PER_POINT
  const done = new Set(state.achievements)
  const families = new Set(set.map((a) => a.family_id))
  const achievements: string[] = []
  let prFromAchievements = 0
  for (const f of FAMILY_ACHIEVEMENTS) {
    if (families.has(f) && !done.has(f)) { achievements.push(ADVERSITIES.find((a) => a.family_id === f)?.family ?? f); prFromAchievements += FAMILY_ACHIEVEMENT_PR }
  }
  for (const s of SCORE_ACHIEVEMENTS) {
    if (score >= s.score && !done.has(scoreAchievementId(s.score))) { achievements.push(`${s.score}+ score`); prFromAchievements += s.pr }
  }
  return {
    score, starlight: score * STARLIGHT_PER_POINT, prFromScore, prFromAchievements, pr: prFromScore + prFromAchievements,
    pastCap: Math.max(0, score - left), achievements,
  }
}

// -- the plan -------------------------------------------------------------------------------

export type Verdict = 'take' | 'maybe' | 'skip' | 'taken'

export interface OfferAdvice {
  adversity: Adversity
  key: OfferKey
  verdict: Verdict
  /** Floors it would be active on. */
  floors: number
  /** Harm it adds on top of what's taken and planned before it. */
  harm: number
  /** Value per harm (higher is better). */
  ratio: number
  why: string
  /** "Take" / "Maybe" / "Skip" reasoning, in one line. */
  reason: string
}

export interface Plan {
  team: TeamRead
  /** The floor whose offer you're choosing from next (10–14), or null when none are left. */
  nextFloor: number | null
  taken: Adversity[]
  /** Taken plus the recommended ones still to come. */
  planned: Adversity[]
  budget: number
  /** Harm of the plan on the floors still to play. */
  used: number
  /** Every offer from `nextFloor` on, with its verdict. */
  offers: OfferAdvice[]
  /** Per family: how many (Level Boost 0–5) or which tier, taken and planned. */
  levels: { family: string; family_id: string; taken: number; planned: number; max: number; tiered: boolean; maxTier: number }[]
  rewards: Rewards
  takenRewards: Rewards
}

/**
 * Inflation from the adversities taken, for shop prices (Finley, 2026-11-24): each one counts from
 * the floor after the one it was chosen on (you choose after clearing that floor).
 */
export function inflationFrom(taken: OfferKey[], all: Adversity[] = ADVERSITIES): { from: number; scale: number }[] {
  const byKey = new Map(all.map((a) => [offerKey(a), a]))
  return taken.map((k) => byKey.get(k)).filter((a): a is Adversity => !!a && a.family_id === 'inflation')
    .map((a) => ({ from: a.floor + 1, scale: (a.tier ?? 1) + 1 }))
}

/** The floor whose adversities come next: after clearing floor N (10–14) you choose from N's.
 *  Before floor 10 the plan starts at 10; on floor 15 nothing is left. */
export function nextOfferFloor(floor: number | null): number | null {
  if (floor === null || floor < FIRST_OFFER) return FIRST_OFFER
  return floor < LAST_FLOOR ? floor : null
}

const RATIO_MIN = 0.55

/** Recommend which adversities to take on the floors still to come. */
export function planAdversities(t: TeamRead, state: AdversityState, floor: number | null, all: Adversity[] = ADVERSITIES): Plan {
  const byKey = new Map(all.map((a) => [offerKey(a), a]))
  const taken = state.taken.map((k) => byKey.get(k)).filter((a): a is Adversity => !!a)
  const nextFloor = nextOfferFloor(floor)
  // Harm counts on floors not yet played: after the next offer's floor (or the current floor).
  const from = nextFloor ?? LAST_FLOOR
  const takenKeys = new Set(state.taken)
  const open = nextFloor === null ? [] : all.filter((a) => a.floor >= nextFloor && !takenKeys.has(offerKey(a)))
  const cap = budget(t, state.risk)
  const push = budget(t, 'push')

  const pick = (limit: number): Adversity[] => {
    const chosen = [...taken]
    let harm = setHarm(chosen, t, from)
    let value = setValue(chosen, state)
    const left = [...open]
    for (;;) {
      let best: { a: Adversity; h: number; v: number; r: number } | null = null
      for (const a of left) {
        const h = setHarm([...chosen, a], t, from) - harm
        const v = setValue([...chosen, a], state) - value
        const r = v / Math.max(0.05, h)
        if (harm + h <= limit && r >= RATIO_MIN && (!best || r > best.r)) best = { a, h, v, r }
      }
      if (!best) return chosen
      chosen.push(best.a)
      harm += best.h
      value += best.v
      left.splice(left.indexOf(best.a), 1)
    }
  }
  const planned = pick(cap)
  const pushed = state.risk === 'push' ? planned : pick(push)
  const plannedKeys = new Set(planned.map(offerKey))
  const pushedKeys = new Set(pushed.map(offerKey))
  const used = setHarm(planned, t, from)

  const offers: OfferAdvice[] = (nextFloor === null ? [] : all.filter((a) => a.floor >= nextFloor)).map((a) => {
    const key = offerKey(a)
    const others = planned.filter((p) => offerKey(p) !== key)
    const h = setHarm([...others, a], t, from) - setHarm(others, t, from)
    const v = setValue([...others, a], state) - setValue(others, state)
    const ratio = v / Math.max(0.05, h)
    const floors = floorsAfter(Math.max(a.floor, from))
    const verdict: Verdict = takenKeys.has(key) ? 'taken' : plannedKeys.has(key) ? 'take' : pushedKeys.has(key) ? 'maybe' : 'skip'
    return { adversity: a, key, verdict, floors, harm: h, ratio, why: whyLine(a, t), reason: reasonFor(verdict, a, floors, ratio, v, h) }
  })

  const levels = families(all).map((f) => {
    const count = (list: Adversity[]) => list.filter((a) => a.family_id === f.family_id)
    const tierOf = (list: Adversity[]) => Math.max(0, ...count(list).map((a) => a.tier ?? 0))
    return {
      ...f,
      taken: f.tiered ? tierOf(taken) : count(taken).length,
      planned: f.tiered ? tierOf(planned) : count(planned).length,
    }
  })
  return { team: t, nextFloor, taken, planned, budget: cap, used, offers, levels, rewards: rewards(planned, state), takenRewards: rewards(taken, state) }
}

function reasonFor(verdict: Verdict, a: Adversity, floors: number, ratio: number, value: number, harm: number): string {
  const span = floors <= 1 ? 'only the last floor' : `${floors} floors`
  if (verdict === 'taken') return `Taken: on for ${span}.`
  if (verdict === 'take') return harm < 0.6 ? `Cheap points: it only matters for ${span}.` : `Worth it: ${a.score} point${a.score === 1 ? '' : 's'} for ${span} of it.`
  if (verdict === 'maybe') return 'Only if the run is going well: it would push past your risk setting.'
  if (value <= 0.01) return 'Nothing left to gain from it.'
  return ratio < RATIO_MIN ? `Too much for ${a.score} point${a.score === 1 ? '' : 's'} over ${span}.` : 'Over your risk setting: better points elsewhere.'
}

function families(all: Adversity[]) {
  const out = new Map<string, { family: string; family_id: string; max: number; tiered: boolean; maxTier: number }>()
  for (const a of all) {
    const f = out.get(a.family_id) ?? { family: a.family, family_id: a.family_id, max: 0, tiered: a.tier !== null, maxTier: 0 }
    f.max += 1
    f.maxTier = Math.max(f.maxTier, a.tier ?? 0)
    out.set(a.family_id, f)
  }
  return [...out.values()]
}

/** Floors that offer adversities, with their offers. */
export function offersByFloor(all: Adversity[] = ADVERSITIES): Map<number, Adversity[]> {
  const out = new Map<number, Adversity[]>()
  for (const a of all) out.set(a.floor, [...(out.get(a.floor) ?? []), a])
  return out
}

/** Adversities only exist in a 15-floor EXTREME run. */
export function hasAdversities(run: { difficulty: string; floors: number }): boolean {
  return run.difficulty === 'extreme' && run.floors >= LAST_FLOOR
}
