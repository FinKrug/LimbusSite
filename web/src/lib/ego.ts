/**
 * E.G.O (the sinners' E.G.O skills) and how much your team leans on them.
 *
 * E.G.O cost Sanity and E.G.O resources, and each skill you use makes 1 resource
 * of its sin (see battle.ts). So whether a team can use its E.G.O depends on its
 * skills' sins, the E.G.O you equip (Team tab) and gifts that give resources.
 *
 * "E.G.O lean" (0-1) sums it up and moves gifts (scoring.ts) and skill swaps
 * (skillswap.ts):
 *  - high when your E.G.O are affordable and add a lot, when you own several
 *    E.G.O gifts, and when the team can't line up Absolute Resonance anyway;
 *  - low when the team resonates easily and has little to spend resources on.
 * With no E.G.O picked it stays near the middle-low and says so.
 */
import { deckCards, simulate, skillPower, skillValue, type SimResult, type SinMap, type Swaps } from './battle'
import { SINS, type Gift, type Identity, type Sin, type Sinner } from './types'

export const GRADES = ['ZAYIN', 'TETH', 'HE', 'WAW', 'ALEPH'] as const
export type Grade = (typeof GRADES)[number]

export interface EgoSkill {
  type: string | null
  base: number | null
  coin_power: number | null
  coins: number | null
  weight: number | null
  statuses: string[]
}

export interface Ego {
  id: string
  name: string
  sinner: Sinner
  grade: Grade
  sin: Sin | null
  /** Resources per sin; null when the wiki page couldn't be read (typical values are used). */
  cost: Partial<Record<Sin, number>> | null
  sanity: number | null
  skill: EgoSkill | null
  statuses: string[]
  /** The sinner's starting E.G.O (always owned; fills the ZAYIN slot by default). */
  base?: boolean
  wiki_url: string
}

/** Equipped E.G.O: sinner -> grade -> E.G.O id (one per grade, like in game). */
export type EgoLoadout = Partial<Record<Sinner, Partial<Record<Grade, string>>>>

/** Typical values when the wiki data is missing. `power` is relative to the
 *  sinner's strongest skill. */
export const TYPICAL: Record<Grade, { cost: number; sanity: number; power: number }> = {
  ZAYIN: { cost: 4, sanity: 10, power: 1.2 },
  TETH: { cost: 6, sanity: 15, power: 1.45 },
  HE: { cost: 8, sanity: 20, power: 1.75 },
  WAW: { cost: 11, sanity: 30, power: 2.2 },
  ALEPH: { cost: 14, sanity: 40, power: 2.7 },
}

export const EGO_WEIGHTS = {
  /** At most this many E.G.O uses per sinner per turn (Sanity and corrosion keep it low). */
  usesPerSinner: 0.25,
  /** Resources per turn from an owned resource gift: to each sin it names, and to every sin. */
  giftNamed: 0.5,
  giftSpread: 0.1,
  giftUnnamed: 0.2,
  /** Owned "when using E.G.O Skills" gifts (Fragments ...) make each E.G.O use worth this much more, max 3. */
  egoGiftBoost: 0.15,
  /** E.G.O on this share of unit-turns counts as leaning fully on E.G.O. */
  fullShare: 0.18,
  /** E.G.O adding this share of the team's skill value counts as fully worth it. */
  fullGain: 0.15,
  /** Absolute Resonance on this share of turns counts as a resonance team. */
  fullAreson: 0.5,
  /** Lean = access x .55 + owned E.G.O gifts x .25 + no-resonance x .2 */
  access: 0.55,
  gifts: 0.25,
  noReson: 0.2,
  /** Lean with no E.G.O picked, before gifts and resonance. */
  unknownBase: 0.2,
  /** E.G.O-only gift parts are worth x (floor + slope x lean). */
  floor: 0.3,
  slope: 0.9,
}

// -- gifts ---------------------------------------------------------------------------

function sentences(text: string): string[] {
  return text.split(/\n+|(?<=[.)])\s+(?=[A-Z[])/).map((x) => x.trim()).filter((x) => x.length > 6)
}

const EGO_SKILL = /E\.G\.O (?:Awakening |Corrosion )?Skills?/gi
const NOT_EGO_ONLY = /(?:including|includes|except|excluding|non-[\w-]*|don't count|and Counters?)\W*(?:\w+\W+){0,2}$/i
const RESOURCE = /E\.G\.O resources?/i

export interface EgoGiftInfo {
  /** Share of the effect that only works when you use E.G.O skills. */
  skillShare: number
  /** Share of the effect that gives E.G.O resources. */
  resourceShare: number
  /** Sins the resources are for, if it names them. */
  resourceSins: Sin[]
}

/** How much of a gift is about using E.G.O (Fragments, Chance & Choice) or making resources. */
export function egoGiftInfo(g: Gift): EgoGiftInfo {
  const text = g.effect.replace(/\[Effects apply only to [^\]]+\]/g, ' ')
  if (/^\s*Activates when using E\.G\.O/i.test(text)) return { skillShare: 1, resourceShare: 0, resourceSins: [] }
  const all = sentences(text)
  if (!all.length) return { skillShare: 0, resourceShare: 0, resourceSins: [] }
  let skill = 0
  let resource = 0
  const sins = new Set<Sin>()
  for (const s of all) {
    if (RESOURCE.test(s) && /gain/i.test(s)) {
      resource++
      for (const sin of SINS) if (new RegExp(`\\b${sin} E\\.G\\.O resource`, 'i').test(s)) sins.add(sin)
      continue
    }
    const onlyEgo = [...s.matchAll(EGO_SKILL)].some((m) => !NOT_EGO_ONLY.test(s.slice(Math.max(0, m.index! - 30), m.index!)))
    if (onlyEgo) skill++
  }
  return { skillShare: skill / all.length, resourceShare: resource / all.length, resourceSins: [...sins] }
}

export function isEgoGift(g: Gift): boolean {
  const i = egoGiftInfo(g)
  return i.skillShare >= 0.3 || i.resourceShare >= 0.3
}

export interface ResonanceTrigger {
  sin: Sin
  absolute: boolean
  /** Share of the effect that needs it. */
  share: number
}

/** "When activating Wrath Absolute Resonance, ..." parts of a gift. */
export function resonanceTriggers(g: Gift): ResonanceTrigger[] {
  const all = sentences(g.effect)
  const out: ResonanceTrigger[] = []
  const re = /\b(Wrath|Lust|Sloth|Gluttony|Gloom|Pride|Envy)(?: Affinity)? (Absolute |A-)?(?:Sin )?Reson(?:ance|\.)/i
  for (const s of all) {
    const m = s.match(re)
    if (!m) continue
    const sin = m[1].toLowerCase() as Sin
    const absolute = !!m[2]
    const prev = out.find((x) => x.sin === sin && x.absolute === absolute)
    if (prev) prev.share += 1 / all.length
    else out.push({ sin, absolute, share: 1 / all.length })
  }
  // A trigger sentence that also has an "or using a Skill that ..." route doesn't fully depend on it.
  for (const t of out) if (/Resonance or /i.test(g.effect)) t.share *= 0.5
  return out
}

// -- the E.G.O layer ----------------------------------------------------------------

export interface EgoUse {
  ego: Ego
  /** Uses per turn the resources allow. */
  uses: number
  /** Value of one use over the skill it replaces. */
  gain: number
  /** The cost used (typical values when the wiki's is missing). */
  cost: Partial<Record<Sin, number>>
  estimated: boolean
}

export interface EgoProfile {
  /** Were any E.G.O picked for the deployed sinners? */
  known: boolean
  uses: EgoUse[]
  /** Share of unit-turns spent on E.G.O. */
  share: number
  /** Value per turn E.G.O add over the skills they replace. */
  gain: number
  /** Resources per turn: from skills, and from owned gifts. */
  gen: SinMap
  giftGen: SinMap
  /** E.G.O gifts you own. */
  egoGifts: Gift[]
  /** Best sin's Absolute Resonance share of turns. */
  bestAreson: { sin: Sin | null; share: number }
  /** 0-1: how much the team leans on E.G.O. */
  lean: number
}

export function egoCost(e: Ego): { cost: Partial<Record<Sin, number>>; estimated: boolean } {
  if (e.cost && Object.keys(e.cost).length) return { cost: e.cost, estimated: false }
  const total = TYPICAL[e.grade].cost
  return { cost: e.sin ? { [e.sin]: Math.round(total * 0.75) } : { wrath: total }, estimated: true }
}

function egoValue(e: Ego, unitBest: number, boost: number): number {
  const s = e.skill
  if (s && (s.base !== null || s.coin_power !== null)) {
    const { power, perCoin } = skillPower(s)
    return power * perCoin * boost
  }
  return unitBest * TYPICAL[e.grade].power * boost
}

const zero = (): SinMap => ({ wrath: 0, lust: 0, sloth: 0, gluttony: 0, gloom: 0, pride: 0, envy: 0 })
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/**
 * How your deployed team uses its E.G.O, given what `sim` says it plays.
 * `unitBest[k]`: the best single-skill value of the k-th deployed identity.
 */
export function egoProfile(
  members: Identity[], sim: SimResult, unitBest: number[], egos: Ego[], loadout: EgoLoadout, owned: Gift[],
): EgoProfile {
  const byId = new Map(egos.map((e) => [e.id, e]))
  const giftGen = zero()
  const egoGifts: Gift[] = []
  let boostGifts = 0
  for (const g of owned) {
    const info = egoGiftInfo(g)
    if (info.skillShare >= 0.3 || info.resourceShare >= 0.3) egoGifts.push(g)
    if (info.skillShare >= 0.5) boostGifts++
    if (info.resourceShare > 0) {
      if (info.resourceSins.length) {
        for (const s of info.resourceSins) giftGen[s] += EGO_WEIGHTS.giftNamed
        for (const s of SINS) giftGen[s] += EGO_WEIGHTS.giftSpread
      } else {
        for (const s of SINS) giftGen[s] += EGO_WEIGHTS.giftUnnamed
      }
    }
  }
  const gen = zero()
  for (const s of SINS) gen[s] = sim.gen[s] + giftGen[s]
  const boost = 1 + EGO_WEIGHTS.egoGiftBoost * Math.min(3, boostGifts)

  const candidates: { e: Ego; k: number; gain: number; cost: Partial<Record<Sin, number>>; estimated: boolean }[] = []
  members.forEach((m, k) => {
    for (const id of Object.values(loadout[m.sinner] ?? {})) {
      const e = id ? byId.get(id) : undefined
      if (!e) continue
      const { cost, estimated } = egoCost(e)
      const avg = sim.unitValue[k] ?? 0
      const gain = egoValue(e, unitBest[k] ?? avg, boost) - avg
      if (gain > 0) candidates.push({ e, k, gain, cost, estimated })
    }
  })
  const totalCost = (c: Partial<Record<Sin, number>>) => Object.values(c).reduce((a, b) => a + (b ?? 0), 0) || 1
  candidates.sort((a, b) => b.gain / totalCost(b.cost) - a.gain / totalCost(a.cost))
  const left = { ...gen }
  const sinnerLeft = members.map(() => EGO_WEIGHTS.usesPerSinner)
  const uses: EgoUse[] = []
  for (const c of candidates) {
    let n = sinnerLeft[c.k]
    for (const [sin, amt] of Object.entries(c.cost) as [Sin, number][]) if (amt > 0) n = Math.min(n, left[sin] / amt)
    n = Math.max(0, n)
    for (const [sin, amt] of Object.entries(c.cost) as [Sin, number][]) left[sin] -= n * amt
    sinnerLeft[c.k] -= n
    uses.push({ ego: c.e, uses: n, gain: c.gain, cost: c.cost, estimated: c.estimated })
  }
  const known = members.some((m) => Object.values(loadout[m.sinner] ?? {}).some((id) => id && byId.has(id)))
  const share = members.length ? uses.reduce((a, u) => a + u.uses, 0) / members.length : 0
  const gain = uses.reduce((a, u) => a + u.uses * u.gain, 0)
  const best = SINS.map((s) => ({ sin: s as Sin, share: sim.areson[s] })).sort((a, b) => b.share - a.share)[0]
  const bestAreson = best && best.share > 0 ? best : { sin: null, share: 0 }

  const giftPush = Math.min(1, egoGifts.length / 4)
  const noReson = 1 - Math.min(1, bestAreson.share / EGO_WEIGHTS.fullAreson)
  const access = 0.5 * Math.min(1, share / EGO_WEIGHTS.fullShare)
    + 0.5 * Math.min(1, sim.valuePerTurn ? gain / (EGO_WEIGHTS.fullGain * sim.valuePerTurn) : 0)
  const lean = known
    ? clamp01(EGO_WEIGHTS.access * access + EGO_WEIGHTS.gifts * giftPush + EGO_WEIGHTS.noReson * noReson)
    : clamp01(EGO_WEIGHTS.unknownBase + EGO_WEIGHTS.gifts * giftPush + EGO_WEIGHTS.noReson * noReson)
  return { known, uses, share, gain, gen, giftGen, egoGifts, bestAreson, lean }
}

/** Resources the equipped E.G.O of the deployed sinners want, per sin (share of all). */
export function costShare(members: Identity[], egos: Ego[], loadout: EgoLoadout): SinMap {
  const byId = new Map(egos.map((e) => [e.id, e]))
  const out = zero()
  let total = 0
  for (const m of members) {
    for (const id of Object.values(loadout[m.sinner] ?? {})) {
      const e = id ? byId.get(id) : undefined
      if (!e) continue
      for (const [sin, n] of Object.entries(egoCost(e).cost) as [Sin, number][]) {
        out[sin] += n
        total += n
      }
    }
  }
  if (total) for (const s of SINS) out[s] /= total
  return out
}

// -- the whole battle picture --------------------------------------------------------

export interface BattleProfile {
  sim: SimResult
  ego: EgoProfile
  /** Share of the equipped E.G.O's cost in each sin. */
  costShare: SinMap
}


/** The loadout with each sinner's base E.G.O in the ZAYIN slot unless you picked another,
 *  like in game (the ZAYIN slot is never empty). */
export function withBase(loadout: EgoLoadout, egos: Ego[]): EgoLoadout {
  const out: EgoLoadout = { ...loadout }
  for (const e of egos) {
    if (!e.base || e.grade !== 'ZAYIN') continue
    if (!out[e.sinner]?.ZAYIN) out[e.sinner] = { ...(out[e.sinner] ?? {}), ZAYIN: e.id }
  }
  return out
}

/** Simulate the deployed team (with its swaps) and work out its E.G.O use. */
export function buildBattle(
  members: Identity[], swaps: Record<string, Swaps>, egos: Ego[], loadout: EgoLoadout, owned: Gift[],
  opts: { turns?: number; seed?: number } = {},
): BattleProfile {
  const keywords = [...new Set(members.flatMap((m) => m.keywords))]
  const decks = members.map((m) => deckCards(m, swaps[m.id]))
  const sim = simulate(decks, keywords, opts)
  const unitBest = decks.map((d) => Math.max(0, ...d.map((s) => skillValue(s, keywords))))
  const full = withBase(loadout, egos)
  return { sim, ego: egoProfile(members, sim, unitBest, egos, full, owned), costShare: costShare(members, egos, full) }
}
