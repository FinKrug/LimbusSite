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
 *  - Fusion ingredients get extra value when you're collecting that recipe.
 *  - Theme packs are worth the best gifts in their gift pool, and much more
 *    when they contain gifts you've marked as targets.
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
} from './types'
import { DEFAULT_DEPLOYED, giftSlots, slotText } from './lineup'

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
  /** Flat bonus for a gift using a team's signature status, at 2+ members with it. */
  statusSynergy: 2.2,
  statusFullAt: 2,
  /** A status is "signature" if at most this many identities in the game have it. */
  signatureMaxIdentities: 8,
  /** Score multiplier for a gift built for an affiliation your team doesn't have. */
  offTrait: 0.7,
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
  /** Each target gift in a pack's pool adds this much plus its own value. */
  packTargetFlat: 2.5,
  /** Pack verdicts relative to the best pack in the list. */
  packGo: 0.75,
  packSkip: 0.5,
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
  /** Gifts the player is hunting for. */
  targets: Set<string>
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

export function makeContext(
  data: GameData, team: Identity[], owned: Iterable<string>, targets: Iterable<string> = [],
  customCombos: Combo[] = [],
  deployed: number = DEFAULT_DEPLOYED,
): RunContext {
  const giftsById = new Map(data.gifts.map((g) => [g.id, g]))
  const ownedSet = new Set([...owned].filter((id) => giftsById.has(id)))
  const targetSet = new Set([...targets].filter((id) => giftsById.has(id) && !ownedSet.has(id)))
  const fusionsByIngredient = new Map<string, Fusion[]>()
  for (const f of data.fusions) {
    for (const i of f.ingredients) {
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
  const profile = teamProfile(team.length > deployed ? team.slice(0, deployed) : team)

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

  return {
    data, profile, owned: ownedSet, targets: targetSet, giftsById,
    fusionsByIngredient, ownedKeywordCounts, signature: signatureStatuses(data.identities),
    giftSupply, unmetOwned, enablers, combos, combosByGift, lineup: team, deployed,
  }
}

// -- gifts ----------------------------------------------------------------------------

export type ReasonKind = 'good' | 'bad' | 'info'
export interface Reason {
  kind: ReasonKind
  text: string
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
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Value of a gift to this team, ignoring fusion bonuses. */
export function intrinsicScore(gift: Gift, ctx: RunContext): Omit<GiftScore, 'rating'> {
  const { profile } = ctx
  const reasons: Reason[] = []
  const tierValue = WEIGHTS.tier[gift.tier ?? 1] ?? 1

  // Team synergy first: it's the most specific reason, so it's listed first.
  let synergyBonus = 0
  let offTrait = false
  const traits = gift.traits ?? []
  if (profile.size && traits.length) {
    const matched = traits
      .map((t) => ({ t, n: profile.traitCounts.get(t) ?? 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
    // "Heishou Pack - You Branch" belongs to the "Heishou Pack" family.
    const family = traits
      .map((t) => {
        const parent = [...profile.traitCounts.keys()].find((p) => p !== t && t.startsWith(p + ' '))
        return parent ? { t, parent, n: profile.traitCounts.get(parent)! } : null
      })
      .find((x) => x !== null)
    if (matched.length) {
      const { t, n } = matched[0]
      synergyBonus += WEIGHTS.traitSynergy * Math.min(n, WEIGHTS.traitFullAt) / WEIGHTS.traitFullAt
      reasons.push({ kind: 'good', text: `Built for ${t} identities (${n} on your team)` })
    } else if (family) {
      synergyBonus += WEIGHTS.traitSynergy * WEIGHTS.familySynergy
      reasons.push({ kind: 'info', text: `Built for ${family.t}; your team has ${family.n} ${family.parent} identities` })
    } else {
      offTrait = true
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
    synergyBonus += WEIGHTS.statusSynergy * Math.min(n, WEIGHTS.statusFullAt) / WEIGHTS.statusFullAt
    reasons.push({ kind: 'good', text: `Works with ${s} (${n === 1 ? '1 of your team applies' : `${n} of your team apply`} it)` })
  }

  // How well does it fit? Take the best of several routes, so a Tremor gift
  // that's really about Blunt skills (Oil-gunked Spanner) or one that applies
  // its own status (Downpour) isn't written off for a team without Tremor.
  // Gifts limited to deployment slots ("#1, #2 Deployed") are judged on the
  // sinners in those slots, not the whole team.
  let fp = profile
  let who = 'your team'
  let slotCap: number | null = null
  const slotInfo = giftSlots(gift)
  if (profile.size && slotInfo?.whole && ctx.lineup.length) {
    const label = slotText(slotInfo.slots)
    const inSlots = slotInfo.slots.filter((n) => n <= ctx.deployed).map((n) => ctx.lineup[n - 1]).filter(Boolean)
    if (inSlots.length) {
      fp = teamProfile(inSlots)
      who = `your ${label}`
      reasons.push({ kind: 'info', text: `Only affects ${label}: ${inSlots.map((i) => i.sinner).join(', ')}` })
    } else {
      slotCap = 0
      reasons.push({ kind: 'bad', text: `Only affects ${label}, and you don't deploy that many sinners` })
    }
  }

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

  // On a tie prefer the later, more specific route (attack type, affinity, combo).
  const best = routes.reduce((a, b) => (b.fit >= a.fit && b.reason ? b : a))
  let fit = slotCap === null ? best.fit : Math.min(best.fit, slotCap)
  if (best.reason) reasons.push(best.reason)
  else if (keywordReason && fit === 0) reasons.push(keywordReason)
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
      reasons.unshift({ kind: 'good', text: `Makes ${enabled.slice(0, 2).map((g) => g.name).join(' and ')} work` })
    }
  }

  let bonus = 0
  if (gift.sin && profile.size) {
    const share = profile.sinCounts[gift.sin] / profile.size
    bonus += WEIGHTS.sin * share
    if (share >= 0.5) reasons.push({ kind: 'good', text: `${cap(gift.sin)} affinity is common on your team` })
  }

  const extras = gift.status_effects.filter(
    (s) => s !== gift.keyword && profile.statuses.has(s) && !signatureHits.some((h) => h.s === s),
  )
  if (extras.length && profile.size) {
    bonus += Math.min(WEIGHTS.statusMax, extras.length * WEIGHTS.statusEach)
    reasons.push({ kind: 'good', text: `Also uses ${extras.slice(0, 3).join(', ')}, which your team applies` })
  }

  if (isCoreKeyword(gift.keyword)) {
    const n = ctx.ownedKeywordCounts.get(gift.keyword) ?? 0
    if (n > 0) {
      bonus += Math.min(WEIGHTS.momentumMax, n * WEIGHTS.momentumEach)
      reasons.push({ kind: 'info', text: `You already have ${n} ${gift.keyword} gift${n > 1 ? 's' : ''}` })
    }
  }

  let score = tierValue * (WEIGHTS.base + fit + bonus) + synergyBonus + enablerBonus
  if (offTrait) {
    score *= WEIGHTS.offTrait
    reasons.push({ kind: 'bad', text: `Built for ${traits.join(' / ')} identities, which your team doesn't have` })
  }
  return { gift, score, fit, synergy: synergyBonus > 0 || enablerBonus > 0, reasons }
}

/** Full value: intrinsic plus progress toward fusions it's an ingredient of. */
export function scoreGift(gift: Gift, ctx: RunContext): Omit<GiftScore, 'rating'> {
  const s = intrinsicScore(gift, ctx)
  let score = s.score
  const reasons = [...s.reasons]
  for (const f of ctx.fusionsByIngredient.get(gift.id) ?? []) {
    if (ctx.owned.has(f.result)) continue
    const result = ctx.giftsById.get(f.result)
    if (!result) continue
    const others = f.ingredients.filter((i) => i !== gift.id)
    const have = others.filter((i) => ctx.owned.has(i)).length
    if (have === 0) continue
    const resultValue = intrinsicScore(result, ctx).score
    score += resultValue * WEIGHTS.fusionShare * ((have + 1) / f.ingredients.length)
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
    reasons.unshift({ kind: 'good', text: `Part of the "${c.name}" combo (you have ${have}/${c.gifts.length})` })
  }
  return { ...s, score, synergy: s.synergy || reasons.some((r) => r.text.startsWith('Part of the')), reasons }
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
export function packOnFloor(pack: ThemePack, difficulty: Difficulty, floor: number): boolean {
  const range = pack.floors?.[difficulty]
  return !!range && floor >= range[0] && floor <= range[1]
}

export type PackVerdict = 'go' | 'maybe' | 'skip'
export interface PackScore {
  pack: ThemePack
  score: number
  rating: number
  verdict: PackVerdict
  /** Target gifts you can get here. */
  targets: GiftScore[]
  /** Best unowned gifts in the pool, best first. */
  top: GiftScore[]
  ownedCount: number
  reasons: Reason[]
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
    const rarity = (g: GiftScore) => pack.gifts.includes(g.gift.id) ? WEIGHTS.packExclusive
      : Math.max(WEIGHTS.packCommonFloor, Math.min(1, WEIGHTS.packRareAt / (packCount.get(g.gift.id) ?? 1)))
    const weight = (g: GiftScore) => g.score * rarity(g)
    const poolValue = [...scored]
      .sort((a, b) => weight(b) - weight(a))
      .slice(0, WEIGHTS.packTopN)
      .reduce((sum, g, i) => sum + weight(g) * WEIGHTS.packDecay ** i, 0)
      + scored.filter((g) => g.synergy).reduce((sum, g) => sum + WEIGHTS.packSynergy * rarity(g), 0)
    const targets = scored.filter((g) => ctx.targets.has(g.gift.id))
    const targetValue = targets.reduce((sum, g) => sum + WEIGHTS.packTargetFlat + g.score, 0)
    // List gifts in the order they counted toward the pack: rare, team-built ones first.
    const top = [...scored].sort((a, b) => weight(b) + (b.synergy ? WEIGHTS.packSynergy * rarity(b) : 0)
      - (weight(a) + (a.synergy ? WEIGHTS.packSynergy * rarity(a) : 0)))
    return { pack, score: poolValue + targetValue, top, targets, ownedCount }
  })
  const max = Math.max(0, ...raw.map((r) => r.score))
  const huntingTargets = ctx.targets.size > 0
  const ranked = raw.map((r): PackScore => {
    const rel = max > 0 ? r.score / max : 0
    const reasons: Reason[] = []
    let verdict: PackVerdict = rel >= WEIGHTS.packGo ? 'go' : rel < WEIGHTS.packSkip ? 'skip' : 'maybe'
    // A pack that can give something you're hunting for is never a flat skip.
    if (r.targets.length && verdict === 'skip') verdict = 'maybe'
    if (r.targets.length) {
      const names = r.targets.map((g) => g.gift.name)
      reasons.push({
        kind: 'good',
        text: `Has ${r.targets.length} of your targets: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`,
      })
    } else if (huntingTargets) {
      reasons.push({ kind: 'info', text: 'None of your targets drop here' })
    }
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
      } else if (!r.targets.length && !synergy.length) {
        reasons.push({ kind: r.top[0].fit > 0 ? 'good' : 'info', text: `Best gift: ${r.top[0].gift.name}` })
      }
    }
    const exclusivesLeft = r.pack.gifts.filter((id) => !ctx.owned.has(id)).length
    if (exclusivesLeft) {
      reasons.push({ kind: 'info', text: `${exclusivesLeft} exclusive gift${exclusivesLeft > 1 ? 's' : ''}` })
    }
    if (r.pack.pool !== 'themed') reasons.push({ kind: 'info', text: `${cap(r.pack.pool)} pack` })
    const rate = (g: GiftScore) => ({ ...g, rating: max > 0 ? Math.round((g.score / max) * 100) : 0 })
    return { ...r, rating: Math.round(rel * 100), verdict, reasons, top: r.top.map(rate), targets: r.targets.map(rate) }
  })
  ranked.sort((a, b) =>
    b.targets.length - a.targets.length || b.score - a.score || a.pack.name.localeCompare(b.pack.name))
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
