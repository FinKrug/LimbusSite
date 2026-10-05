/**
 * Recommendation logic. Pure functions with no React, so the website and a
 * future desktop overlay can share it, and it's easy to unit test.
 *
 * The model, in short:
 *  - Team profile: what share of your identities use each core keyword
 *    (Burn, Bleed, ...) and each sin affinity, plus their affiliations
 *    ("traits", e.g. The Thumb) and signature statuses (e.g. Tremor - Scorch).
 *  - Gift value = tier value x fit, where fit is mostly "does my team use this
 *    gift's keyword", plus smaller bonuses for sin affinity, other statuses the
 *    team applies, and gifts of that keyword you already have.
 *  - Team synergy on top: a flat bonus when a gift is built for one of your
 *    team's affiliations or signature statuses (Heishou Bolus - Mao for a Mao
 *    Branch team, Tremor - Scorch gifts for The Thumb). Flat, so a low-tier
 *    gift that's made for your team can outrank a generic high-tier one.
 *  - Affiliation gifts are split in two (src/lib/traitparts.ts): the part of
 *    the effect anyone can use is scored on the usual fit, the part only that
 *    affiliation's identities get is scored on how many of them you deploy,
 *    weighted by how strong they are. Bloodflame Sword is mostly a You Branch
 *    gift with a small Burn part, so a plain Burn team gets little from it.
 *  - Fusion ingredients get extra value when you're collecting that recipe.
 *  - Theme packs are worth the best gifts in their gift pool for your team.
 *  - A fusion is worth crafting when the result beats what you give up.
 *
 * All weights live in WEIGHTS so they're easy to tune.
 */
import {
  CORE_KEYWORDS,
  type CoreKeyword,
  type Fusion,
  type GameData,
  type Gift,
  type Identity,
  type Combo,
  type Sin,
  type ThemePack,
  isCoreKeyword,
  tierLabel,
} from './types'
import { DEFAULT_DEPLOYED, giftSlots, slotText } from './lineup'
import { strength, type TierOverrides } from './strength'
import { traitShare } from './traitparts'
import { holderConditions, holderFactor, meets } from './holder'
import { buildBattle, EGO_WEIGHTS, egoGiftInfo, resonanceTriggers, type BattleProfile, type EgoLoadout } from './ego'
import type { Swaps } from './battle'

export const WEIGHTS = {
  /** Value of each tier before fit is applied. */
  tier: { 1: 1, 2: 1.6, 3: 2.3, 4: 3, 5: 3.6, 6: 3.6 } as Record<number, number>,
  /** Every gift gets this much fit just for existing. */
  base: 0.15,
  /** Fit of gifts with no core keyword (general, Slash/Pierce/Blunt). */
  general: 0.4,
  /** Multiplier on the share of the team with the gift's sin affinity. */
  sin: 0.25,
  /** Bonus per other status the team also applies, capped. */
  statusEach: 0.05,
  statusMax: 0.15,
  /** Bonus per owned gift of the same keyword, capped. */
  momentumEach: 0.05,
  momentumMax: 0.2,
  /** Flat bonus for a gift built for a team affiliation, at 3+ members with it. */
  traitSynergy: 2.2,
  traitFullAt: 3,
  /** Flat bonus for a gift using a team's signature status, at 3+ members with it. */
  statusSynergy: 2.2,
  statusFullAt: 3,
  /** A status is "signature" if at most this many identities in the game have it. */
  signatureMaxIdentities: 8,
  /** Each deployed member counts this much + traitStrength x its strength (0-1)
   *  toward traitFullAt, so a strong carry counts more than a filler unit. */
  traitMember: 0.6,
  traitStrength: 0.8,
  /** Fit of a gift that works on its own (applies its status itself, no team condition). */
  standalone: 0.5,
  /** Fit of a gift whose needs are met by gifts you own (not by your team). */
  comboFit: 0.75,
  /** Fit cap for a gift whose needs nothing on your team or in your gifts provides. */
  unmetCap: 0.1,
  /** Affinity-condition fit is the team share times this. */
  affinityFit: 0.8,
  /** Flat bonus per owned gift this one would make work (max 2). */
  enabler: 1.5,
  /** Flat bonus for a piece of a combo you've started, scaled by how much you have. */
  comboPiece: 1.8,
  /** Share of a fusion result's value passed to its ingredients. */
  fusionShare: 0.5,
  /** Starting a recipe you have no pieces of counts this much of a piece you'd have with one
   *  owned, and only when the result is worth fusionStartOver x this gift to your team. */
  fusionStart: 0.5,
  fusionStartOver: 1.3,
  /** Upgrade potential: (upgraded value - value) x this x gift price / (gift price + enhance Cost). */
  upgrade: 0.8,
  /** A gift (or the part of it) that needs "N or more Identities with X skills" and your
   *  deployed team has fewer: value x this. */
  gateMiss: 0.12,
  /** Craft if the result is worth at least this fraction of all its ingredients
   *  combined. Below 1 because fusion results are built to be payoffs and one
   *  strong gift is usually better than several weaker ones. */
  craftRatio: 0.45,
  /** Theme pack value = best gift + decay x 2nd best + decay^2 x 3rd ... */
  packDecay: 0.6,
  packTopN: 5,
  /** How much a pool gift counts toward a pack, by how many packs give it:
   *  exclusive = packExclusive, otherwise min(1, packRareAt / packsWithIt), at least packCommonFloor.
   *  A gift in 60 packs is no reason to pick any particular one of them. */
  packExclusive: 1.5,
  packRareAt: 6,
  packCommonFloor: 0.25,
  /** Flat bonus per gift in the pool that's built for your team, times its rarity weight. */
  packSynergy: 1.5,
  /** Synergy credit for a gift built for another branch of your team's faction
   *  (e.g. a Heishou Pack - You Branch gift for a Heishou Pack team). */
  familySynergy: 0.35,
  /** Pack verdicts relative to the best pack in the list. */
  packGo: 0.75,
  packSkip: 0.5,
  /** Other routes to a keyword gift's fit (attack type, affinity, "applies it itself", combos)
   *  count x (altFloor + altSlope x share of the team using the keyword), so a Rupture gift
   *  isn't rated like a Burn gift for a Burn team just because everyone uses Slash. */
  altFloor: 0.3,
  altSlope: 0.4,
  /** Slot gifts ("#1, #2 Deployed") are worth x (slotBase + (1 - slotBase) x share of the
   *  deployed units in those slots): a gift for one unit counts less than one for seven. */
  slotBase: 0.45,
  /** Shop/Cost gifts, x tier value x (floors left / 10, 0.2-1.5). */
  economy: 0.6,
  /** "Survive a lethal hit" gifts, x tier value; x1.5 on the last 5 floors of a 10+ floor run. */
  survival: 0.45,
  /** General (non-keyword) gifts' fit in a 5-floor run. */
  shortRunGeneral: 0.8,
  /** Gifts that un-stagger enemies (White Gossypium): whole value x this, or x staggerBleed
   *  for a team that's at least half Bleed (the only teams that want the trade). */
  staggerPenalty: 0.35,
  staggerBleed: 0.85,
  /** Gifts that stagger your own units. */
  selfStagger: 0.5,
  /** Effects that pay off when your own units die: value x (1 - allyDeath x share of the text). */
  allyDeath: 0.7,
}

/** A gift's effect gives or saves Cost (Golden Urn, Prestige Card, Wealth ...). */
export function isEconomy(g: Gift): boolean {
  return /\bCost\b/.test(g.effect)
}
/** A gift's effect keeps a unit alive through a lethal hit. */
export function isSurvival(g: Gift): boolean {
  // Not "revive": the only gift that says it (Spiderweb Entangled in Red) stops revives.
  return /lethal damage|does not drop below 1|not take that damage/i.test(g.effect)
}
/** Parts of a gift's effect that only work for one named identity:
 *  "[Effects apply only to Blade of the House of Spiders Ryōshū] ...". */
export function namedSections(g: Gift, identities: Identity[]): { identity: Identity; text: string }[] {
  const out: { identity: Identity; text: string }[] = []
  const re = /\[Effects apply only to ([^\]]+)\]/g
  const marks = [...g.effect.matchAll(re)]
  marks.forEach((m, k) => {
    const identity = identities.find((i) => i.name === m[1].trim())
    if (!identity) return
    const end = k + 1 < marks.length ? marks[k + 1].index! : g.effect.length
    out.push({ identity, text: g.effect.slice(m.index!, end) })
  })
  return out
}

/** Effect text outside named-identity sections, with identity names taken out
 *  (so "Blade of the House of Spiders Ryōshū" doesn't read as a House of Spiders mention). */
function generalText(g: Gift, named: { identity: Identity; text: string }[]): string {
  let t = g.effect
  for (const n of named) {
    t = t.replace(n.text, ' ')
    t = t.split(n.identity.name).join(' ')
  }
  return t
}

const ALLY_DEATH = /for every defeated all(?:y|ies)|when an ally (?:dies|is killed)|ally dies in an Encounter|no surviving allies|defeated Identities|not be revived/i

/** Share (0-1) of a gift's sentences that only pay off when your own units die. */
export function allyDeathShare(text: string): number {
  const sentences = text.split(/\n+|(?<=\.)\s+/).map((x) => x.trim())
    .filter((x) => x.length > 8 && !/^\[Effects apply only to [^\]]*\]$/.test(x))
  if (!sentences.length) return 0
  return sentences.filter((x) => ALLY_DEATH.test(x)).length / sentences.length
}

/** A gift's effect un-staggers enemies or staggers your own units. */
export function staggerHarm(g: Gift): 'unstagger' | 'self' | null {
  if (/un-Stagger enemies|recover(?:s)? enemies from Stagger/i.test(g.effect)) return 'unstagger'
  if (/ally[^.]*forced Stagger/i.test(g.effect)) return 'self'
  return null
}

export interface TeamGate {
  /** Identities needed. */
  n: number
  /** The status their attack skills must apply/gain ("Poise", "Bloodfeast"). */
  status: string
  /** The whole gift switches on or off ("This Gift activates for the whole Encounter when ..."). */
  whole: boolean
  /** Share of the effect behind the gate when not whole. */
  share: number
}

const GATE = /(\d+) or more Identities (?:that |have |with )?(?:Attack )?(?:Skills? that )?(?:apply or gain|apply|gain|inflict|consume) ([A-Z][\w-]*)/

/** "... when 5 or more Identities have Attack Skills that apply Tremor ..." (deployed units only). */
export function teamGate(g: Gift): TeamGate | null {
  const sentences = g.effect.split(/\n+|(?<=\.)\s+(?=[A-Z-])/).map((x) => x.trim()).filter((x) => x.length > 6)
  const k = sentences.findIndex((x) => GATE.test(x))
  if (k < 0) return null
  const m = sentences[k].match(GATE)!
  const whole = /This Gift activates/i.test(sentences[k])
  return { n: Number(m[1]), status: m[2], whole, share: whole ? 1 : 1 / sentences.length }
}

/** Does this identity have attack skills that apply/gain this status? */
export function hasSkillStatus(i: Identity, status: string): boolean {
  const is = (st: string) => st === status || st.startsWith(`${status} - `)
  if (i.skills?.some((s) => s.statuses.some(is))) return true
  return (i.keywords as string[]).includes(status) || i.status_effects.some(is)
}

/** Buff/debuff statuses lots of gifts touch; never treated as signature. */
const GENERIC_STATUS = /(Power (Up|Down)|DMG Up|Damage (Up|Down)|Resist Down|Fragility|Protection|Level (Up|Down)|Heal|Crit|Coin (Boost|Drop)|Atk Weight)/i

// -- team profile ---------------------------------------------------------------

export interface TeamProfile {
  size: number
  keywordCounts: Record<CoreKeyword, number>
  sinCounts: Record<Sin, number>
  /** Every status any team member applies (core keywords included). */
  statuses: Set<string>
  /** How many team members have each status / affiliation. */
  statusCounts: Map<string, number>
  traitCounts: Map<string, number>
  /** How many team members have skills of each attack type. */
  attackCounts: Map<string, number>
  /** Team members whose attack types are known. */
  attackKnown: number
}

export function teamProfile(team: Identity[]): TeamProfile {
  const keywordCounts = Object.fromEntries(CORE_KEYWORDS.map((k) => [k, 0])) as Record<CoreKeyword, number>
  const sinCounts = { wrath: 0, lust: 0, sloth: 0, gluttony: 0, gloom: 0, pride: 0, envy: 0 } as Record<Sin, number>
  const statuses = new Set<string>()
  const statusCounts = new Map<string, number>()
  const traitCounts = new Map<string, number>()
  const attackCounts = new Map<string, number>()
  let attackKnown = 0
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  for (const id of team) {
    for (const k of id.keywords) keywordCounts[k] += 1
    for (const s of id.affinities) sinCounts[s] += 1
    for (const s of new Set([...id.status_effects, ...id.keywords])) {
      statuses.add(s)
      bump(statusCounts, s)
    }
    for (const t of id.traits ?? []) bump(traitCounts, t)
    if (id.attack_types?.length) attackKnown += 1
    for (const a of id.attack_types ?? []) bump(attackCounts, a)
  }
  return { size: team.length, keywordCounts, sinCounts, statuses, statusCounts, traitCounts, attackCounts, attackKnown }
}

export function keywordShare(p: TeamProfile, k: CoreKeyword): number {
  return p.size ? p.keywordCounts[k] / p.size : 0
}

/** Keywords the team leans on, most used first. */
export function teamFocus(p: TeamProfile): { keyword: CoreKeyword; count: number; share: number }[] {
  return CORE_KEYWORDS.map((keyword) => ({ keyword, count: p.keywordCounts[keyword], share: keywordShare(p, keyword) }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
}

/**
 * Statuses few identities have, like "Tremor - Scorch" or "Strider -Mao-".
 * A gift that uses one is built for those specific units.
 */
export function signatureStatuses(identities: Identity[]): Set<string> {
  const counts = new Map<string, number>()
  for (const i of identities) for (const s of i.status_effects) counts.set(s, (counts.get(s) ?? 0) + 1)
  const out = new Set<string>()
  for (const [s, n] of counts) {
    if (n <= WEIGHTS.signatureMaxIdentities && !isCoreKeyword(s) && !GENERIC_STATUS.test(s)) out.add(s)
  }
  return out
}

// -- context ------------------------------------------------------------------------

export interface RunContext {
  data: GameData
  profile: TeamProfile
  owned: Set<string>
  /** How many of each owned gift (vestiges can stack). */
  ownedCounts: Map<string, number>
  run: RunSettings
  giftsById: Map<string, Gift>
  fusionsByIngredient: Map<string, Fusion[]>
  ownedKeywordCounts: Map<string, number>
  signature: Set<string>
  /** status -> owned gifts that apply it (under a condition your team meets). */
  giftSupply: Map<string, Gift[]>
  /** status -> owned gifts that need it and don't get it from your team or other gifts. */
  unmetOwned: Map<string, Gift[]>
  /** status -> gifts in the game that apply it on their own, best first. */
  enablers: Map<string, Gift[]>
  combos: Combo[]
  combosByGift: Map<string, Combo[]>
  /** The team in deployment order (#1 first). */
  lineup: Identity[]
  /** How many of the lineup actually fight. */
  deployed: number
  /** The identities that fight (the profile is built from these). */
  members: Identity[]
  /** Your identity ratings (see strength.ts). */
  tiers: TierOverrides
  /** What the deployed team plays: Resonance odds, E.G.O resources and E.G.O lean (ego.ts). */
  battle: BattleProfile
}

/** Does your team (not your gifts) put this status on enemies? */
export function teamSupplies(p: TeamProfile, status: string): boolean {
  if (isCoreKeyword(status)) return p.keywordCounts[status] > 0
  return p.statusCounts.has(status)
}

/** Is the condition on a gift's "applies" entry met by this team? */
export function conditionMet(p: TeamProfile, when: string): boolean {
  const [kind, value] = when.split(':')
  switch (kind) {
    case 'always': return true
    case 'keyword': return teamSupplies(p, value)
    case 'attack': return (p.attackCounts.get(value) ?? 0) > 0
    case 'sin': return p.sinCounts[value.toLowerCase() as Sin] > 0
    default: return false
  }
}

export function worksAlone(g: Gift): boolean {
  return !(g.needs?.length) && !g.team_gate && !!g.applies?.some((a) => a.when === 'always')
}

/** The run you're playing: difficulty, length, the floor you're on and its theme pack. */
export interface RunSettings {
  difficulty: Difficulty
  /** 5, 10 or 15 floors. */
  floors: number
  /** The floor you're on (or choosing a pack for); null = not in a run. */
  floor: number | null
  /** The current floor's theme pack id, if chosen. */
  pack: string | null
}
export const RUN_LENGTHS = [5, 10, 15] as const
/** Normal runs are 5 floors, Hard 10, EXTREME 15; short Hard/EXTREME runs exist too. */
export function defaultFloors(d: Difficulty): number {
  return d === 'normal' ? 5 : d === 'hard' ? 10 : 15
}
export const DEFAULT_RUN: RunSettings = { difficulty: 'normal', floors: 5, floor: null, pack: null }

export interface ContextOptions {
  combos?: Combo[]
  deployed?: number
  tiers?: TierOverrides
  run?: RunSettings
  /** Equipped E.G.O per sinner (Team tab). */
  loadout?: EgoLoadout
  /** Skill Replacements made this run, per identity id. */
  swaps?: Record<string, Swaps>
}

export function makeContext(
  data: GameData, team: Identity[], owned: Iterable<string>, opts: ContextOptions = {},
): RunContext {
  const { combos: customCombos = [], deployed = DEFAULT_DEPLOYED, tiers = {}, run = DEFAULT_RUN, loadout = {}, swaps = {} } = opts
  const giftsById = new Map(data.gifts.map((g) => [g.id, g]))
  const ownedList = [...owned].filter((id) => giftsById.has(id))
  const ownedSet = new Set(ownedList)
  const ownedCounts = new Map<string, number>()
  for (const id of ownedList) ownedCounts.set(id, (ownedCounts.get(id) ?? 0) + 1)
  const fusionsByIngredient = new Map<string, Fusion[]>()
  for (const f of data.fusions) {
    for (const i of [...f.ingredients, ...(f.any_of?.from ?? [])]) {
      const list = fusionsByIngredient.get(i) ?? []
      list.push(f)
      fusionsByIngredient.set(i, list)
    }
  }
  const ownedKeywordCounts = new Map<string, number>()
  for (const id of ownedSet) {
    const k = giftsById.get(id)?.keyword
    if (isCoreKeyword(k ?? null)) ownedKeywordCounts.set(k!, (ownedKeywordCounts.get(k!) ?? 0) + 1)
  }
  // Only deployed sinners fight, so they decide what the team needs.
  const members = team.length > deployed ? team.slice(0, deployed) : team
  const profile = teamProfile(members)

  const giftSupply = new Map<string, Gift[]>()
  for (const id of ownedSet) {
    const g = giftsById.get(id)!
    for (const a of g.applies ?? []) {
      if (!conditionMet(profile, a.when)) continue
      const list = giftSupply.get(a.status) ?? []
      if (!list.includes(g)) list.push(g)
      giftSupply.set(a.status, list)
    }
  }
  const unmetOwned = new Map<string, Gift[]>()
  for (const id of ownedSet) {
    const g = giftsById.get(id)!
    for (const n of g.needs ?? []) {
      if (teamSupplies(profile, n) || (giftSupply.get(n) ?? []).some((x) => x.id !== g.id)) continue
      unmetOwned.set(n, [...(unmetOwned.get(n) ?? []), g])
    }
  }
  const enablers = new Map<string, Gift[]>()
  for (const g of data.gifts) {
    if (!worksAlone(g)) continue
    for (const a of g.applies ?? []) {
      if (a.when !== 'always') continue
      enablers.set(a.status, [...(enablers.get(a.status) ?? []), g])
    }
  }
  for (const list of enablers.values()) list.sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0))

  const combos = [...(data.combos ?? []), ...customCombos]
    .map((c) => ({ ...c, gifts: c.gifts.filter((id) => giftsById.has(id)) }))
    .filter((c) => c.gifts.length >= 2)
  const combosByGift = new Map<string, Combo[]>()
  for (const c of combos) for (const id of c.gifts) combosByGift.set(id, [...(combosByGift.get(id) ?? []), c])

  const battle = buildBattle(members, swaps, data.egos ?? [], loadout, [...ownedSet].map((id) => giftsById.get(id)!))

  return {
    data, profile, owned: ownedSet, ownedCounts, run, giftsById,
    fusionsByIngredient, ownedKeywordCounts, signature: signatureStatuses(data.identities),
    giftSupply, unmetOwned, enablers, combos, combosByGift, lineup: team, deployed, members, tiers, battle,
  }
}

// -- gifts ----------------------------------------------------------------------------

export type ReasonKind = 'good' | 'bad' | 'info'
export interface Reason {
  kind: ReasonKind
  text: string
}

/** Where a gift's score comes from, for "why this rank". */
export type PartKind = 'core' | 'bonus' | 'synergy' | 'enabler' | 'fusion' | 'combo' | 'run' | 'upgrade'
export interface ScorePart {
  kind: PartKind
  label: string
  /** Points this part adds to the score. */
  value: number
  detail?: string
  /** For the core part: the reason for its fit ("3/6 of your team use Rupture"). */
  fitReason?: string
}

export interface GiftScore {
  gift: Gift
  /** Raw value; comparable across gifts in the same run. */
  score: number
  /** 0-100, relative to the best gift in the list it was ranked in. */
  rating: number
  /** 0-1: how well the gift's keyword fits the team. */
  fit: number
  /** Built for this team's affiliations or signature statuses. */
  synergy: boolean
  reasons: Reason[]
  /** The score split into its parts, largest first. */
  parts: ScorePart[]
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Value of a gift to this team, ignoring fusion bonuses. */
export function intrinsicScore(gift: Gift, ctx: RunContext): Omit<GiftScore, 'rating'> {
  const { profile } = ctx
  const reasons: Reason[] = []
  const tierValue = WEIGHTS.tier[gift.tier ?? 1] ?? 1

  // How well does it fit? Take the best of several routes, so a Tremor gift
  // that's really about Blunt skills (Oil-gunked Spanner) or one that applies
  // its own status (Downpour) isn't written off for a team without Tremor.
  // Gifts limited to deployment slots ("#1, #2 Deployed") are judged on the
  // sinners in those slots, not the whole team.
  let fp = profile
  let who = 'your team'
  let slotCap: number | null = null
  let slotFactor = 1
  let affected = ctx.members
  const slotInfo = giftSlots(gift)
  const slotReasons: Reason[] = []
  if (profile.size && slotInfo?.whole && ctx.lineup.length) {
    const label = slotText(slotInfo.slots)
    const inSlots = slotInfo.slots.filter((n) => n <= ctx.deployed).map((n) => ctx.lineup[n - 1]).filter(Boolean)
    affected = inSlots
    if (inSlots.length) {
      fp = teamProfile(inSlots)
      who = `your ${label}`
      slotFactor = WEIGHTS.slotBase + (1 - WEIGHTS.slotBase) * inSlots.length / Math.max(1, ctx.members.length)
      slotReasons.push({ kind: 'info', text: `Only affects ${label}: ${inSlots.map((i) => i.sinner).join(', ')}` })
    } else {
      slotCap = 0
      slotReasons.push({ kind: 'bad', text: `Only affects ${label}, and you don't deploy that many sinners` })
    }
  }

  // Team synergy first: it's the most specific reason, so it's listed first.
  // For an affiliation gift, only the affiliation's part of the effect depends
  // on its members; `share` is how much of the gift that is.
  let synergyBonus = 0
  const parts: ScorePart[] = []
  let share = 0
  let traitFit = 0
  // Sections for one named identity ("[Effects apply only to Blade of the House of Spiders
  // Ryōshū]") only count if that identity is on the team (backups included: "Team loadout").
  const named = namedSections(gift, ctx.data.identities)
  const namedHere = named.filter((n) => ctx.lineup.some((i) => i.id === n.identity.id))
  const namedMissing = named.filter((n) => !namedHere.includes(n))
  const general = generalText(gift, namedMissing)
  const namedShare = namedMissing.reduce((sum, n) => sum + n.text.length, 0) / Math.max(1, gift.effect.length)
  if (profile.size) {
    for (const n of namedHere) {
      synergyBonus += WEIGHTS.traitSynergy
      parts.push({ kind: 'synergy', label: `Built for ${n.identity.name}`, value: WEIGHTS.traitSynergy, detail: 'On your team' })
      reasons.push({ kind: 'good', text: `Built for ${n.identity.name}, who's on your team` })
    }
    for (const n of namedMissing) {
      reasons.push({ kind: 'bad', text: `${namedShare >= 0.4 ? 'Most' : 'Part'} of it only works for ${n.identity.name}, who isn't on your team` })
    }
  }
  // An affiliation named only inside a missing identity's section isn't a reason to take it.
  const traits = (gift.traits ?? []).filter((t) => !namedMissing.length || general.includes(t))
  if (profile.size && traits.length) {
    share = traitShare(gift)
    const matched = traits
      .map((t) => {
        const who = affected.filter((i) => i.traits?.includes(t))
        const weight = who.reduce((sum, i) => sum + WEIGHTS.traitMember + WEIGHTS.traitStrength * strength(i, ctx.tiers), 0)
        return { t, who, weight }
      })
      .filter((x) => x.who.length > 0)
      .sort((a, b) => b.weight - a.weight)
    // "Heishou Pack - You Branch" belongs to the "Heishou Pack" family.
    const family = traits
      .map((t) => {
        const parent = [...profile.traitCounts.keys()].find((p) => p !== t && t.startsWith(p + ' '))
        return parent ? { t, parent, n: profile.traitCounts.get(parent)! } : null
      })
      .find((x) => x !== null)
    const most = share >= 0.5 ? 'Most of it' : 'Part of it'
    if (matched.length) {
      const { t, who, weight } = matched[0]
      traitFit = Math.min(1, weight / WEIGHTS.traitFullAt)
      synergyBonus += WEIGHTS.traitSynergy * traitFit
      const names = who.map((i) => i.sinner).join(', ')
      parts.push({ kind: 'synergy', label: `Built for ${t} identities`, value: WEIGHTS.traitSynergy * traitFit,
        detail: `${who.length} on your team: ${names}` })
      reasons.push({ kind: 'good', text: `Built for ${t} identities (${who.length} on your team: ${names})` })
    } else if (family) {
      synergyBonus += WEIGHTS.traitSynergy * WEIGHTS.familySynergy
      parts.push({ kind: 'synergy', label: `Built for ${family.t}, a branch of your ${family.parent} team`,
        value: WEIGHTS.traitSynergy * WEIGHTS.familySynergy, detail: 'Counts for a little: your team is the same faction, not that branch' })
      reasons.push({ kind: 'info', text: `Built for ${family.t}; your team has ${family.n} ${family.parent} identities` })
      reasons.push({ kind: 'bad', text: `${most} only works for ${family.t} identities` })
    } else {
      reasons.push({ kind: 'bad', text: `${most} only works for ${traits.join(' / ')} identities, which your team doesn't have` })
    }
  }
  const signatureHits = profile.size
    ? gift.status_effects
      .filter((s) => ctx.signature.has(s) && profile.statusCounts.has(s))
      .map((s) => ({ s, n: profile.statusCounts.get(s)! }))
      .sort((a, b) => b.n - a.n)
    : []
  if (signatureHits.length) {
    const { s, n } = signatureHits[0]
    // Full credit at 3 users (or the whole team, if it's smaller): one unit of seven gets a third.
    const full = Math.min(WEIGHTS.statusFullAt, profile.size)
    synergyBonus += WEIGHTS.statusSynergy * Math.min(n, full) / full
    parts.push({ kind: 'synergy', label: `Uses ${s}, a status few identities have`,
      value: WEIGHTS.statusSynergy * Math.min(n, full) / full,
      detail: n === 1 ? '1 of your team applies it' : `${n} of your team apply it` })
    reasons.push({ kind: 'good', text: `Works with ${s} (${n === 1 ? '1 of your team applies' : `${n} of your team apply`} it)` })
  }

  reasons.push(...slotReasons)

  const routes: { fit: number; reason?: Reason }[] = []
  let keywordReason: Reason | undefined
  if (isCoreKeyword(gift.keyword)) {
    const k = gift.keyword
    const count = fp.keywordCounts[k]
    if (profile.size === 0) {
      routes.push({ fit: WEIGHTS.general })
    } else if (count === 0) {
      routes.push({ fit: 0 })
      keywordReason = { kind: 'bad', text: fp === profile ? `No one on your team uses ${k}` : `${cap(who)} don't use ${k}` }
    } else {
      routes.push({ fit: keywordShare(fp, k), reason: { kind: 'good', text: `${count}/${fp.size} of ${who} use ${k}` } })
    }
  } else {
    routes.push({
      fit: WEIGHTS.general,
      reason: synergyBonus ? undefined : {
        kind: 'info', text: gift.keyword ? `${gift.keyword} damage gift` : 'General gift that works with any team',
      },
    })
  }
  if (fp.size && fp.attackKnown && gift.attack_types?.length) {
    const best = gift.attack_types
      .map((t) => ({ t, n: fp.attackCounts.get(t) ?? 0 }))
      .sort((a, b) => b.n - a.n)[0]
    if (best.n > 0) {
      routes.push({ fit: best.n / fp.attackKnown, reason: { kind: 'good', text: `${best.n}/${fp.attackKnown} of ${who} use ${best.t} skills` } })
    } else if (fp !== profile && !isCoreKeyword(gift.keyword)) {
      keywordReason = { kind: 'bad', text: `${cap(who)} don't use ${gift.attack_types.join('/')} skills` }
      routes[0] = { fit: 0 }
    }
  }
  if (fp.size && gift.affinities?.length) {
    const best = gift.affinities
      .map((a) => ({ a, n: fp.sinCounts[a] ?? 0 }))
      .sort((x, y) => y.n - x.n)[0]
    if (best.n > 0) {
      routes.push({
        fit: WEIGHTS.affinityFit * best.n / fp.size,
        reason: { kind: 'good', text: `Uses ${cap(best.a)} affinity (${best.n}/${fp.size} of ${who} have it)` },
      })
    }
  }
  if (profile.size && worksAlone(gift)) {
    const applied = [...new Set(gift.applies!.filter((a) => a.when === 'always').map((a) => a.status))]
    routes.push({ fit: WEIGHTS.standalone, reason: { kind: 'good', text: `Works on its own: applies ${applied.slice(0, 2).join(' and ')} itself` } })
  }

  const needs = gift.needs ?? []
  const unmet: string[] = []
  const via: Gift[] = []
  for (const n of needs) {
    if (teamSupplies(profile, n)) continue
    const from = (ctx.giftSupply.get(n) ?? []).filter((g) => g.id !== gift.id)
    if (from.length) via.push(...from.filter((g) => !via.includes(g)))
    else unmet.push(n)
  }
  if (profile.size && via.length && !unmet.length) {
    routes.push({ fit: WEIGHTS.comboFit, reason: { kind: 'good', text: `Works with ${via.slice(0, 2).map((g) => g.name).join(' and ')}, which you have` } })
  }

  // A keyword gift's other routes only count fully when the team uses the keyword:
  // "7/7 use Slash skills" shouldn't make a Rupture gift as good as a Burn gift for Burn.
  const kw = isCoreKeyword(gift.keyword) ? gift.keyword : null
  const kwShare = kw && fp.size ? keywordShare(fp, kw) : 0
  if (kw && profile.size) {
    const factor = WEIGHTS.altFloor + WEIGHTS.altSlope * kwShare
    for (const r of routes.slice(1)) r.fit *= factor
  }
  // On a tie prefer the later, more specific route (attack type, affinity, combo).
  const best = routes.reduce((a, b) => (b.fit >= a.fit && b.reason ? b : a))
  let fit = slotCap === null ? best.fit : Math.min(best.fit, slotCap)
  if (best.reason) reasons.push(best.reason)
  else if (keywordReason && fit === 0) reasons.push(keywordReason)
  if (kw && profile.size && best !== routes[0] && kwShare < 0.5) {
    const n = fp.keywordCounts[kw]
    reasons.push({ kind: 'info', text: n
      ? `But only ${n}/${fp.size} of ${who} use ${kw}, so its ${kw} part helps few units`
      : `But ${who === 'your team' ? 'no one on your team uses' : `${who} don't use`} ${kw}, so its ${kw} part is wasted` })
  }
  if (!kw && profile.size && ctx.run.floors <= 5) {
    fit *= WEIGHTS.shortRunGeneral
    reasons.push({ kind: 'info', text: 'Short run (5 floors): a general gift counts a bit less than a keyword gift' })
  }

  // Conditions on the unit in the slot: "If this unit is a Family Hierarch
  // Candidate", "2+ Pierce Attack Skills", "a Skill that spends Ammo".
  const conds = profile.size && slotInfo?.whole ? holderConditions(gift, ctx.data.identities) : []
  if (conds.length && ctx.lineup.length && affected.length) {
    const factors = affected.map((i) => holderFactor(gift, i, ctx.data.identities).factor)
    fit *= factors.reduce((a, b) => a + b, 0) / factors.length
    const where = slotText(slotInfo!.slots)
    const named = (i: Identity) => `${i.sinner} (#${ctx.lineup.indexOf(i) + 1})`
    for (const c of conds.slice(0, 2)) {
      const ok = affected.filter((i) => meets(i, c) >= 0.99)
      if (ok.length) {
        const pred = ok.length > 1 ? c.pred.replace(/^is /, 'are ').replace(/^has /, 'have ').replace(/^uses /, 'use ') : c.pred
        reasons.push({ kind: 'good', text: `${ok.map(named).join(' and ')} ${pred}, which it wants` })
        continue
      }
      const how = c.share >= 0.95 ? 'It needs' : c.share >= 0.5 ? 'Most of it needs' : 'Part of it needs'
      const other = ctx.lineup.find((i) => !affected.includes(i) && meets(i, c) >= 0.99)
      reasons.push(other
        ? { kind: 'info', text: `${how} ${c.noun} in ${where}: move ${other.sinner} there` }
        : { kind: 'bad', text: `${how} ${c.noun} in ${where}` })
    }
  } else if (conds.length && ctx.members.length) {
    // No lineup (e.g. while planning the order): assume the best unit takes the slot.
    fit *= Math.max(...ctx.members.map((i) => holderFactor(gift, i, ctx.data.identities).factor))
  }
  if (profile.size && unmet.length) {
    fit = Math.min(fit, WEIGHTS.unmetCap)
    const helper = ctx.enablers.get(unmet[0])?.find((g) => g.id !== gift.id)
    reasons.push({
      kind: 'bad',
      text: `Needs ${unmet[0]} on enemies, which nothing on your team or in your gifts provides`
        + (helper ? ` (${helper.name} would)` : ''),
    })
  }

  // Would it make a gift you own work?
  let enablerBonus = 0
  if (profile.size) {
    const enabled: Gift[] = []
    for (const a of gift.applies ?? []) {
      if (!conditionMet(profile, a.when)) continue
      for (const g of ctx.unmetOwned.get(a.status) ?? []) if (g.id !== gift.id && !enabled.includes(g)) enabled.push(g)
    }
    if (enabled.length) {
      enablerBonus = WEIGHTS.enabler * Math.min(enabled.length, 2)
      parts.push({ kind: 'enabler', label: `Makes ${enabled.slice(0, 2).map((g) => g.name).join(' and ')} work`, value: enablerBonus,
        detail: 'You own these, but nothing on your team sets up what they need' })
      reasons.unshift({ kind: 'good', text: `Makes ${enabled.slice(0, 2).map((g) => g.name).join(' and ')} work` })
    }
  }

  let bonus = 0
  if (gift.sin && profile.size) {
    const share = profile.sinCounts[gift.sin] / profile.size
    bonus += WEIGHTS.sin * share
    if (share > 0) {
      parts.push({ kind: 'bonus', label: `${cap(gift.sin)} affinity`, value: tierValue * WEIGHTS.sin * share,
        detail: `${profile.sinCounts[gift.sin]}/${profile.size} of your team have it` })
    }
    if (share >= 0.5) reasons.push({ kind: 'good', text: `${cap(gift.sin)} affinity is common on your team` })
  }

  const extras = gift.status_effects.filter(
    (s) => s !== gift.keyword && profile.statuses.has(s) && !signatureHits.some((h) => h.s === s),
  )
  if (extras.length && profile.size) {
    bonus += Math.min(WEIGHTS.statusMax, extras.length * WEIGHTS.statusEach)
    parts.push({ kind: 'bonus', label: `Also uses ${extras.slice(0, 3).join(', ')}`,
      value: tierValue * Math.min(WEIGHTS.statusMax, extras.length * WEIGHTS.statusEach), detail: 'Your team applies these too' })
    reasons.push({ kind: 'good', text: `Also uses ${extras.slice(0, 3).join(', ')}, which your team applies` })
  }

  if (isCoreKeyword(gift.keyword)) {
    const n = ctx.ownedKeywordCounts.get(gift.keyword) ?? 0
    if (n > 0) {
      bonus += Math.min(WEIGHTS.momentumMax, n * WEIGHTS.momentumEach)
      parts.push({ kind: 'bonus', label: `You already have ${n} ${gift.keyword} gift${n > 1 ? 's' : ''}`,
        value: tierValue * Math.min(WEIGHTS.momentumMax, n * WEIGHTS.momentumEach) })
      reasons.push({ kind: 'info', text: `You already have ${n} ${gift.keyword} gift${n > 1 ? 's' : ''}` })
    }
  }

  // The general part uses the usual fit; the affiliation part uses how many
  // (and how strong) of its members you deploy.
  if (share) fit = (1 - share) * fit + share * traitFit
  if (namedShare > 0) fit *= 1 - namedShare

  // The run: Cost gifts pay off over the floors left; "survive a lethal hit" gifts matter
  // most on the last floors of a long run.
  const run = ctx.run
  const floorsLeft = Math.max(1, run.floors - (run.floor ?? 1) + 1)
  let runBonus = 0
  if (isEconomy(gift)) {
    const f = Math.min(1.5, Math.max(0.2, floorsLeft / 10))
    const v = WEIGHTS.economy * tierValue * f
    runBonus += v
    parts.push({ kind: 'run', label: 'Gives or saves Cost', value: v,
      detail: `${floorsLeft} floor${floorsLeft > 1 ? 's' : ''} left in a ${run.floors}-floor run to use it` })
    reasons.push(f >= 1
      ? { kind: 'good', text: `Gives or saves Cost: best early in a long run (${floorsLeft} floors left)` }
      : f < 0.5
        ? { kind: 'bad', text: `Gives or saves Cost, but only ${floorsLeft} floor${floorsLeft > 1 ? 's are' : ' is'} left to use it` }
        : { kind: 'info', text: `Gives or saves Cost (${floorsLeft} floors left)` })
  }
  if (isSurvival(gift)) {
    const late = run.floors >= 10 && (run.floor ?? 1) > run.floors - 5
    const f = run.floors <= 5 ? 0.5 : late ? 1.5 : 1
    const v = WEIGHTS.survival * tierValue * f
    runBonus += v
    parts.push({ kind: 'run', label: 'Keeps a unit alive through a lethal hit', value: v,
      detail: late ? 'Late floors of a long run, where units get one-shot' : run.floors <= 5 ? 'Short run: fewer deadly fights' : undefined })
    reasons.push({ kind: late ? 'good' : 'info', text: late
      ? 'Survives a lethal hit: most valuable now, on the late floors where units get one-shot'
      : 'Survives a lethal hit: gets more valuable on the late floors of a long run' })
  }

  for (const p of parts) if (p.kind === 'bonus') p.value *= slotFactor
  let score = tierValue * (WEIGHTS.base + fit + bonus) * slotFactor + synergyBonus + enablerBonus + runBonus
  // The core: the gift's tier times how well it fits. Everything else is added on top.
  const fitWhy = best.reason?.text ?? (fit === 0 ? keywordReason?.text
    : !isCoreKeyword(gift.keyword) ? 'Not tied to a status keyword, so it partly fits any team' : undefined)
  parts.unshift({
    kind: 'core',
    label: `Tier ${tierLabel(gift.tier)} gift, ${Math.round(Math.min(1, fit) * 100)}% fit with ${who}`,
    value: tierValue * (WEIGHTS.base + fit) * slotFactor,
    fitReason: fitWhy,
    detail: [
      `Higher tiers count for more (Tier ${tierLabel(gift.tier)} ×${tierValue})`,
      fitWhy,
      share && traitFit < 1 ? `${Math.round(share * 100)}% of its effect is for its affiliation` : undefined,
      slotFactor < 1 ? `Only helps ${affected.length} of your ${ctx.members.length} deployed units, so it counts ×${slotFactor.toFixed(2)}` : undefined,
    ].filter(Boolean).join('. '),
  })

  // Staggered enemies take more damage and can't act, and you never want your own units
  // staggered. A gift that works against that is a real cost.
  const harm = profile.size ? staggerHarm(gift) : null
  if (harm) {
    const bleedy = keywordShare(profile, 'Bleed') >= 0.5
    const f = harm === 'self' ? WEIGHTS.selfStagger : bleedy ? WEIGHTS.staggerBleed : WEIGHTS.staggerPenalty
    score *= f
    for (const p of parts) p.value *= f
    reasons.unshift(harm === 'self'
      ? { kind: 'bad', text: 'Staggers your own units: you want them never staggered' }
      : bleedy
        ? { kind: 'info', text: 'Un-staggers enemies, which usually hurts; a Bleed team can still use the Bleed it adds' }
        : { kind: 'bad', text: 'Un-staggers enemies: you want enemies staggered (more damage, no actions), so this usually hurts' })
  }
  // Effects that pay off when your own units die: you'd rather they didn't, unless the
  // team has the unit it's built around (Blade of the House of Spiders Ryōshū).
  const death = profile.size && !namedHere.length ? allyDeathShare(general) : 0
  if (death > 0) {
    const f = 1 - WEIGHTS.allyDeath * death
    score *= f
    for (const p of parts) p.value *= f
    reasons.push({ kind: death >= 0.75 ? 'bad' : 'info', text: death >= 0.75
      ? 'Only pays off when your own units die, which you want to avoid'
      : 'Part of it only pays off when your own units die' })
  }
  // E.G.O and Resonance: parts that only work when you use E.G.O, make E.G.O resources,
  // or trigger on a sin's (Absolute) Resonance count as much as your team will use them.
  const ego = profile.size ? egoAdjust(gift, ctx) : null
  if (ego && Math.abs(ego.factor - 1) > 0.01) {
    score *= ego.factor
    for (const p of parts) p.value *= ego.factor
  }
  if (ego) reasons.push(...ego.reasons)
  // "Activates when 5 or more Identities have Attack Skills that apply X": count your deployed units.
  const gate = profile.size ? teamGate(gift) : null
  if (gate) {
    const who = ctx.members.filter((i) => hasSkillStatus(i, gate.status))
    const names = who.map((i) => i.sinner).join(', ')
    if (who.length >= gate.n) {
      reasons.push({ kind: 'good', text: `Switches on: ${who.length} of your deployed identities have ${gate.status} skills (needs ${gate.n})` })
    } else {
      const f = 1 - gate.share + gate.share * WEIGHTS.gateMiss
      score *= f
      for (const p of parts) p.value *= f
      reasons.unshift({ kind: 'bad', text: `${gate.whole ? 'Stays off' : 'Part of it stays off'}: needs ${gate.n} deployed identities with ${gate.status} skills, you have ${who.length}${names ? ` (${names})` : ''}` })
    }
  }
  parts.sort((a, b) => b.value - a.value)
  return { gift, score, fit, synergy: synergyBonus > 0 || enablerBonus > 0, reasons, parts }
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/** How much a gift's E.G.O and Resonance parts are worth to this team (a multiplier), and why. */
export function egoAdjust(gift: Gift, ctx: RunContext): { factor: number; reasons: Reason[] } {
  const reasons: Reason[] = []
  const { ego, sim, costShare } = ctx.battle
  const info = egoGiftInfo(gift)
  let factor = 1
  const egoF = EGO_WEIGHTS.floor + EGO_WEIGHTS.slope * ego.lean
  const lean = ego.lean >= 0.55 ? 'high' : ego.lean < 0.35 ? 'low' : 'medium'
  const how = ego.known
    ? `your equipped E.G.O come out on about ${pct(ego.share)} of turns`
    : 'pick your E.G.O on the Team tab to judge this better'
  if (info.skillShare > 0) {
    factor += info.skillShare * (egoF - 1)
    const most = info.skillShare >= 0.75 ? 'Only works' : info.skillShare >= 0.4 ? 'Mostly works' : 'Part of it works'
    reasons.push({
      kind: lean === 'high' ? 'good' : lean === 'low' ? 'bad' : 'info',
      text: `${most} when you use E.G.O skills; E.G.O lean ${lean} (${how})`,
    })
  }
  if (info.resourceShare > 0) {
    let resF = egoF
    let named = ''
    if (ego.known && info.resourceSins.length) {
      const need = info.resourceSins.reduce((a, s) => a + costShare[s], 0)
      resF *= 0.5 + 0.5 * Math.min(1, need * 3)
      named = need >= 0.2
        ? `; your E.G.O use ${info.resourceSins.map(cap).join('/')}`
        : `, but your E.G.O barely use ${info.resourceSins.map(cap).join('/')}`
    }
    factor += info.resourceShare * (resF - 1)
    reasons.push({
      kind: resF >= 0.95 ? 'good' : resF < 0.6 ? 'bad' : 'info',
      text: `Gives E.G.O resources: worth it if you spend them (E.G.O lean ${lean}${named})`,
    })
  }
  for (const t of resonanceTriggers(gift)) {
    const chance = t.absolute ? sim.areson[t.sin] : sim.reson[t.sin]
    const tf = Math.min(1.2, 0.15 + (t.absolute ? 1.5 : 1.2) * chance)
    factor *= 1 - t.share + t.share * tf
    const what = `${cap(t.sin)} ${t.absolute ? 'Absolute Resonance' : 'Resonance'}`
    reasons.push(chance >= 0.35
      ? { kind: 'good', text: `Triggers on ${what}: your team lines it up on about ${pct(chance)} of turns` }
      : chance >= 0.1
        ? { kind: 'info', text: `Triggers on ${what}, which your team lines up on about ${pct(chance)} of turns` }
        : { kind: 'bad', text: `Triggers on ${what}, which your team rarely lines up (${pct(chance)} of turns)` })
  }
  return { factor, reasons }
}

/** Enhance Cost per tier for + and ++ (wiki: Mirror Dungeon, shops). */
export const ENHANCE_COST: Record<number, [number, number]> = { 1: [50, 100], 2: [60, 120], 3: [75, 150], 4: [100, 200] }

/**
 * How much stronger an upgraded effect is, from its text: sentences that are the same
 * apart from their numbers are compared number by number ("Inflict 1 Rupture Potency"
 * -> "Inflict 3 ..."), slot numbers like "#4" left out, and the median change is the
 * ratio; sentences only the upgrade has count as an extra effect.
 * mag = 1 + 0.6 x (ratio - 1) + 0.35 x extra share.
 */
export function upgradeMagnitude(base: string, up: string): { mag: number; ratio: number; extra: number } {
  const split = (t: string) => t.split(/\n+|(?<=[.)])\s+(?=[A-Z[])/).map((x) => x.trim()).filter((x) => x.length > 6)
  const shape = (t: string) => t.replace(/(?<![#\w.])\d+(?:\.\d+)?/g, 'N').replace(/\s+/g, ' ').toLowerCase()
  const nums = (t: string) => [...t.matchAll(/(?<![#\w.])\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
  const bs = split(base)
  const us = split(up)
  const used = new Set<number>()
  const ratios: number[] = []
  for (const b of bs) {
    const k = us.findIndex((u, n) => !used.has(n) && shape(u) === shape(b))
    if (k < 0) continue
    used.add(k)
    const nb = nums(b)
    const nu = nums(us[k])
    ratios.push(...nb.map((x, n) => (x > 0 && nu[n] ? nu[n] / x : 1)))
  }
  const extraText = us.filter((_, n) => !used.has(n) && !bs.includes(us[n])).join(' ')
  const matchedAll = bs.every((b) => us.some((u) => shape(u) === shape(b)))
  // An upgrade that rewrites a sentence (not just its numbers) counts as an extra effect too.
  const extra = Math.min(1, extraText.length / Math.max(1, base.length)) * (matchedAll ? 1 : 0.6)
  // Median of the number changes, so one big jump (1 -> 10 Superbattery) doesn't dominate.
  const sorted = [...ratios].sort((a, b) => a - b)
  const median = sorted.length ? (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2 : 1
  const ratio = Math.min(2.5, Math.max(0.8, median))
  return { mag: 1 + 0.6 * (ratio - 1) + 0.35 * extra, ratio, extra }
}

export interface UpgradeValue {
  /** Upgrade level it's worth going to: 1 = +, 2 = ++. */
  level: number
  /** Enhance Cost to get there. */
  cost: number
  /** Score added for the potential. */
  add: number
  /** The upgraded gift's value to your team. */
  value: number
  reason: Reason
  label: string
}

/**
 * What enhancing a gift would add. Each upgrade level is scored as if it were the gift
 * (so "#6 Deployed" becoming "#4, #6 Deployed" counts twice the units), times how much
 * its numbers grow, then weighed by what enhancing costs next to the gift's price and
 * by how many floors are left to visit shops.
 */
export function upgradeValue(gift: Gift, ctx: RunContext, base: number): UpgradeValue | null {
  const ups = gift.upgrades ?? []
  if (!ups.length || !ctx.profile.size || base <= 0) return null
  const costs = ENHANCE_COST[gift.tier ?? 0]
  if (!costs) return null
  const floorsLeft = Math.max(1, ctx.run.floors - (ctx.run.floor ?? 1) + 1)
  const floors = Math.min(1, Math.max(1 / 3, floorsLeft / 3))
  let best: UpgradeValue | null = null
  ups.forEach((text, k) => {
    const level = k + 1
    if (!text || text === gift.effect || level > costs.length) return
    const variant: Gift = { ...gift, id: `${gift.id}~${level}`, effect: text, upgrades: [] }
    const m = upgradeMagnitude(gift.effect, text)
    const value = intrinsicScore(variant, ctx).score * m.mag
    const cost = costs.slice(0, level).reduce((a, b) => a + b, 0)
    const w = WEIGHTS.upgrade * (gift.cost ?? 100) / ((gift.cost ?? 100) + cost) * floors
    const add = w * (value - base)
    if (add <= 0.02 * base || (best && add <= best.add)) return
    const plus = '+'.repeat(level)
    const before = giftSlots(gift)
    const after = giftSlots(variant)
    const wider = before && after && after.slots.length > before.slots.length
    const text2 = wider
      ? `Upgraded to ${plus} it covers ${slotText(after!.slots)} instead of ${slotText(before!.slots)} (${cost} Cost to enhance)`
      : m.ratio >= 1.25
        ? `Much stronger upgraded: its numbers go up about ${m.ratio.toFixed(1)}× at ${plus}${m.extra >= 0.2 ? ', plus an extra effect' : ''} (${cost} Cost to enhance)`
        : m.extra >= 0.2
          ? `Gains an extra effect when upgraded to ${plus} (${cost} Cost to enhance)`
          : `Gets better upgraded to ${plus} (${cost} Cost to enhance)`
    best = {
      level, cost, add, value,
      reason: { kind: value >= base * 1.3 ? 'good' : 'info', text: text2 },
      label: wider ? `Covers ${slotText(after!.slots)} when upgraded to ${plus}` : `Gets stronger upgraded to ${plus}`,
    }
  })
  return best
}

/** Full value: intrinsic plus progress toward fusions it's an ingredient of. */
export function scoreGift(gift: Gift, ctx: RunContext): Omit<GiftScore, 'rating'> {
  const s = intrinsicScore(gift, ctx)
  let score = s.score
  const reasons = [...s.reasons]
  const parts = [...s.parts]
  const up = upgradeValue(gift, ctx, s.score)
  if (up) {
    score += up.add
    parts.push({ kind: 'upgrade', label: up.label, value: up.add,
      detail: `Upgraded it's worth about ${(up.value / s.score).toFixed(1)}× as much to your team; enhancing costs ${up.cost}, and it needs a shop visit` })
    reasons.push(up.reason)
  }
  // Recipes you haven't started: only the best one counts, and only when the result is
  // clearly better for your team than this gift (a Poise piece for a payoff you'd use).
  let start: { f: Fusion; result: Gift; value: number; add: number } | null = null
  for (const f of ctx.fusionsByIngredient.get(gift.id) ?? []) {
    if (ctx.owned.has(f.result) || !f.ingredients.includes(gift.id)) continue
    const result = ctx.giftsById.get(f.result)
    if (!result) continue
    const others = f.ingredients.filter((i) => i !== gift.id)
    if (others.some((i) => ctx.owned.has(i))) continue
    const value = intrinsicScore(result, ctx).score
    if (value < s.score * WEIGHTS.fusionStartOver) continue
    const add = value * WEIGHTS.fusionShare * WEIGHTS.fusionStart / f.ingredients.length * (f.super_shop ? 0.5 : 1)
    if (!start || add > start.add) start = { f, result, value, add }
  }
  if (start && ctx.profile.size) {
    const { f, result, add } = start
    const rest = f.ingredients.filter((i) => i !== gift.id).map((i) => ctx.giftsById.get(i)?.name ?? i)
    score += add
    parts.push({ kind: 'fusion', label: `Starts a fusion into ${result.name}`, value: add,
      detail: `Also needs ${rest.join(' and ')}${f.super_shop ? ' (Super Shop only)' : ''}; counts a little until you have more pieces` })
    reasons.push({
      kind: s.fit < 0.5 ? 'good' : 'info',
      text: s.fit < 0.5
        ? `Fuses into ${result.name} with ${rest.join(' and ')}, which suits your team better than this gift does`
        : `Can also fuse into ${result.name} (with ${rest.join(' and ')})`,
    })
  }
  for (const f of ctx.fusionsByIngredient.get(gift.id) ?? []) {
    if (ctx.owned.has(f.result)) continue
    const result = ctx.giftsById.get(f.result)
    if (!result) continue
    const others = f.ingredients.filter((i) => i !== gift.id)
    const have = others.filter((i) => ctx.owned.has(i)).length
    if (have === 0) continue
    const resultValue = intrinsicScore(result, ctx).score
    score += resultValue * WEIGHTS.fusionShare * ((have + 1) / f.ingredients.length)
    parts.push({
      kind: 'fusion', label: `Ingredient for ${result.name}`,
      value: resultValue * WEIGHTS.fusionShare * ((have + 1) / f.ingredients.length),
      detail: `You have ${have} of the other ${others.length}; worth more the closer you are to fusing it`,
    })
    reasons.unshift({
      kind: 'good',
      text: have === others.length
        ? `Last missing piece to fuse ${result.name}`
        : `Fusion ingredient for ${result.name} (you have ${have}/${f.ingredients.length})`,
    })
  }
  for (const c of ctx.combosByGift.get(gift.id) ?? []) {
    const have = c.gifts.filter((id) => id !== gift.id && ctx.owned.has(id)).length
    if (!have || ctx.owned.has(gift.id)) continue
    score += WEIGHTS.comboPiece * have / (c.gifts.length - 1)
    const partners = c.gifts.filter((id) => id !== gift.id && ctx.owned.has(id)).map((id) => ctx.giftsById.get(id)?.name ?? id)
    parts.push({ kind: 'combo', label: `Combos with ${partners.join(' and ')}`, value: WEIGHTS.comboPiece * have / (c.gifts.length - 1),
      detail: c.why || `"${c.name}" (you have ${have}/${c.gifts.length})` })
    reasons.unshift({ kind: 'good', text: `Combos with ${partners.join(' and ')}, which you have ("${c.name}")` })
  }
  parts.sort((a, b) => b.value - a.value)
  return { ...s, score, synergy: s.synergy || parts.some((p) => p.kind === 'combo'), reasons, parts }
}

function withRatings<T extends { score: number }>(items: T[]): (T & { rating: number })[] {
  const max = Math.max(0, ...items.map((i) => i.score))
  return items.map((i) => ({ ...i, rating: max > 0 ? Math.round((i.score / max) * 100) : 0 }))
}

/** Every gift you don't own yet, best first. */
export function rankGifts(ctx: RunContext): GiftScore[] {
  const scored = ctx.data.gifts.filter((g) => !ctx.owned.has(g.id)).map((g) => scoreGift(g, ctx))
  scored.sort((a, b) => b.score - a.score || a.gift.name.localeCompare(b.gift.name))
  return withRatings(scored)
}

// -- theme packs ---------------------------------------------------------------------

/** The gifts a pack can give: its pool, or just its exclusives if the pool is unknown. */
export function packPool(pack: ThemePack): string[] {
  return pack.gift_pool?.length ? pack.gift_pool : pack.gifts
}

/** gift id -> theme packs whose pool contains it. */
export function packsByGift(packs: ThemePack[]): Map<string, ThemePack[]> {
  const map = new Map<string, ThemePack[]>()
  for (const p of packs) {
    for (const id of packPool(p)) {
      const list = map.get(id) ?? []
      list.push(p)
      map.set(id, list)
    }
  }
  return map
}

export type Difficulty = 'normal' | 'hard' | 'extreme'
/** Can this pack show up on `floor` at `difficulty`? Unknown floors count as no. */
/** Floors 1–10 of an EXTREME run are ordinary Hard floors; 11–15 use the Extreme-exclusive packs. */
export const EXTREME_FROM = 11

export function packOnFloor(pack: ThemePack, difficulty: Difficulty, floor: number): boolean {
  // "Parallel Superposition EXTREME" is a Hard run extended to 15 floors, so its first
  // 10 floors draw from the packs' Hard floor ranges; the wiki's "Extreme" range is 11–15.
  const d: Difficulty = difficulty === 'extreme' && floor < EXTREME_FROM ? 'hard' : difficulty
  const range = pack.floors?.[d]
  return !!range && floor >= range[0] && floor <= range[1]
}

/** Can this pack show up at all on this difficulty? Packs with no floor data are kept. */
export function packInDifficulty(pack: ThemePack, difficulty: Difficulty): boolean {
  if (!pack.floors) return true
  const ranges = difficulty === 'extreme' ? [pack.floors.hard, pack.floors.extreme] : [pack.floors[difficulty]]
  return ranges.some((r) => !!r)
}

export type PackVerdict = 'go' | 'maybe' | 'skip'
export interface PackScore {
  pack: ThemePack
  score: number
  rating: number
  verdict: PackVerdict
  /** Best unowned gifts in the pool, best first. */
  top: GiftScore[]
  ownedCount: number
  reasons: Reason[]
  /** What each gift adds to the pack's score, largest first. */
  parts: PackPart[]
  /** The score split two ways: its best gifts, and gifts built for your team. */
  split: { best: number; team: number }
}

/** One gift's share of a theme pack's score. */
export interface PackPart {
  gift: GiftScore
  value: number
  /** How it was counted: rarity, pick order, team-built. */
  notes: string[]
}

/** How much a gift in a pack counts, by how many packs can give it. */
function packRarity(pack: ThemePack, id: string, packCount: Map<string, number>): { value: number; note: string } {
  if (pack.gifts.includes(id)) return { value: WEIGHTS.packExclusive, note: `only in this pack (×${WEIGHTS.packExclusive})` }
  const n = packCount.get(id) ?? 1
  const value = Math.max(WEIGHTS.packCommonFloor, Math.min(1, WEIGHTS.packRareAt / n))
  if (value >= 1) return { value, note: `in ${n} pack${n > 1 ? 's' : ''}` }
  return { value, note: `in ${n} packs, so it counts ×${+value.toFixed(2)}` }
}

export function rankThemePacks(ctx: RunContext, packs: ThemePack[] = ctx.data.themePacks): PackScore[] {
  // How many packs (of all of them, not just those in view) can give each gift.
  const packCount = new Map<string, number>()
  for (const p of ctx.data.themePacks) for (const id of packPool(p)) packCount.set(id, (packCount.get(id) ?? 0) + 1)
  const raw = packs.map((pack) => {
    const gifts = packPool(pack).map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g)
    const ownedCount = gifts.filter((g) => ctx.owned.has(g.id)).length
    const scored = gifts
      .filter((g) => !ctx.owned.has(g.id))
      .map((g) => ({ ...scoreGift(g, ctx), rating: 0 }))
      .sort((a, b) => b.score - a.score)
    const rarity = (g: GiftScore) => packRarity(pack, g.gift.id, packCount).value
    const weight = (g: GiftScore) => g.score * rarity(g)
    const partOf = new Map<string, PackPart>()
    const credit = (g: GiftScore, value: number, note: string) => {
      const p = partOf.get(g.gift.id) ?? { gift: g, value: 0, notes: [packRarity(pack, g.gift.id, packCount).note] }
      p.value += value
      p.notes.push(note)
      partOf.set(g.gift.id, p)
    }
    const best = [...scored].sort((a, b) => weight(b) - weight(a)).slice(0, WEIGHTS.packTopN)
    best.forEach((g, i) => credit(g, weight(g) * WEIGHTS.packDecay ** i,
      i === 0 ? 'its best gift for you' : `#${i + 1} best here (counts ×${+(WEIGHTS.packDecay ** i).toFixed(2)})`))
    const bestValue = best.reduce((sum, g, i) => sum + weight(g) * WEIGHTS.packDecay ** i, 0)
    const teamBuilt = scored.filter((g) => g.synergy)
    teamBuilt.forEach((g) => credit(g, WEIGHTS.packSynergy * rarity(g), 'built for your team'))
    const teamValue = teamBuilt.reduce((sum, g) => sum + WEIGHTS.packSynergy * rarity(g), 0)
    // List gifts in the order they counted toward the pack: rare, team-built ones first.
    const top = [...scored].sort((a, b) => weight(b) + (b.synergy ? WEIGHTS.packSynergy * rarity(b) : 0)
      - (weight(a) + (a.synergy ? WEIGHTS.packSynergy * rarity(a) : 0)))
    const parts = [...partOf.values()].sort((a, b) => b.value - a.value)
    return {
      pack, score: bestValue + teamValue, top, ownedCount, parts,
      split: { best: bestValue, team: teamValue },
    }
  })
  const max = Math.max(0, ...raw.map((r) => r.score))
  const ranked = raw.map((r): PackScore => {
    const rel = max > 0 ? r.score / max : 0
    const reasons: Reason[] = []
    let verdict: PackVerdict = rel >= WEIGHTS.packGo ? 'go' : rel < WEIGHTS.packSkip ? 'skip' : 'maybe'
    if (r.top.length === 0) {
      verdict = 'skip'
      reasons.push({ kind: 'bad', text: 'You already have everything it can give' })
    } else {
      const fitting = r.top.filter((g) => g.fit > 0 || g.synergy)
      const synergy = r.top.filter((g) => g.synergy)
      if (synergy.length) {
        reasons.push({ kind: 'good', text: `Built for your team: ${synergy.slice(0, 2).map((g) => g.gift.name).join(', ')}` })
      }
      if (ctx.profile.size && fitting.length === 0) {
        reasons.push({ kind: 'bad', text: "None of its gifts match your team's keywords" })
      } else if (!synergy.length) {
        reasons.push({ kind: r.top[0].fit > 0 ? 'good' : 'info', text: `Best gift: ${r.top[0].gift.name}` })
      }
    }
    const exclusivesLeft = r.pack.gifts.filter((id) => !ctx.owned.has(id)).length
    if (exclusivesLeft) {
      reasons.push({ kind: 'info', text: `${exclusivesLeft} exclusive gift${exclusivesLeft > 1 ? 's' : ''}` })
    }
    if (r.pack.pool !== 'themed') reasons.push({ kind: 'info', text: `${cap(r.pack.pool)} pack` })
    const rate = (g: GiftScore) => ({ ...g, rating: max > 0 ? Math.round((g.score / max) * 100) : 0 })
    return {
      ...r, rating: Math.round(rel * 100), verdict, reasons, top: r.top.map(rate),
      parts: r.parts.map((p) => ({ ...p, gift: rate(p.gift) })),
    }
  })
  ranked.sort((a, b) =>
    b.score - a.score || a.pack.name.localeCompare(b.pack.name))
  return ranked
}

// -- fusions ----------------------------------------------------------------------------

export type FusionStatus = 'ready' | 'close' | 'started'
export interface FusionPlan {
  fusion: Fusion
  result: Gift
  status: FusionStatus
  owned: Gift[]
  missing: Gift[]
  resultScore: number
  /** Value of the owned ingredients you'd give up. */
  ingredientScore: number
  verdict: 'craft' | 'hold'
  reasons: Reason[]
}

/** Fusions you've started collecting, most complete first. Ignores ones whose result you own. */
export function planFusions(ctx: RunContext): FusionPlan[] {
  const plans: FusionPlan[] = []
  for (const fusion of ctx.data.fusions) {
    if (ctx.owned.has(fusion.result)) continue
    const result = ctx.giftsById.get(fusion.result)
    const ingredients = fusion.ingredients.map((i) => ctx.giftsById.get(i))
    if (!result || ingredients.some((g) => !g)) continue
    const owned = (ingredients as Gift[]).filter((g) => ctx.owned.has(g.id))
    const missing = (ingredients as Gift[]).filter((g) => !ctx.owned.has(g.id))
    if (owned.length === 0) continue
    const status: FusionStatus = missing.length === 0 ? 'ready' : missing.length === 1 ? 'close' : 'started'
    const r = intrinsicScore(result, ctx)
    const resultScore = r.score
    const allIngredientsScore = (ingredients as Gift[]).reduce((s, g) => s + intrinsicScore(g, ctx).score, 0)
    const ingredientScore = owned.reduce((s, g) => s + intrinsicScore(g, ctx).score, 0)
    const worthIt = resultScore >= allIngredientsScore * WEIGHTS.craftRatio
    const reasons: Reason[] = [...r.reasons.slice(0, 2)]
    reasons.push(
      worthIt
        ? { kind: 'good', text: `${result.name} is worth more to this team than its ingredients` }
        : { kind: 'bad', text: `The ingredients are worth more to this team than ${result.name}` },
    )
    plans.push({
      fusion, result, status, owned, missing, resultScore, ingredientScore,
      verdict: worthIt ? 'craft' : 'hold', reasons,
    })
  }
  const order: Record<FusionStatus, number> = { ready: 0, close: 1, started: 2 }
  plans.sort((a, b) =>
    order[a.status] - order[b.status]
    || Number(b.verdict === 'craft') - Number(a.verdict === 'craft')
    || b.resultScore - a.resultScore)
  return plans
}

// -- combos ------------------------------------------------------------------------------

export interface ComboPlan {
  combo: Combo
  owned: Gift[]
  missing: Gift[]
}

/** Every combo, the ones you've started first (most complete first). */
export function planCombos(ctx: RunContext): ComboPlan[] {
  return ctx.combos
    .map((combo) => {
      const gifts = combo.gifts.map((id) => ctx.giftsById.get(id)!).filter(Boolean)
      return { combo, owned: gifts.filter((g) => ctx.owned.has(g.id)), missing: gifts.filter((g) => !ctx.owned.has(g.id)) }
    })
    .sort((a, b) =>
      Number(b.owned.length > 0) - Number(a.owned.length > 0)
      || b.owned.length / (b.owned.length + b.missing.length) - a.owned.length / (a.owned.length + a.missing.length)
      || a.combo.name.localeCompare(b.combo.name))
}
