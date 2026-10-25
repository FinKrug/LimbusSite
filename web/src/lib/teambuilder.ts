/**
 * Team building: pick an identity per sinner for a focus (a keyword like
 * Rupture, or an affiliation like Heishou Pack), then suggest a deployment
 * order so slot-limited gifts (e.g. "#1, #2 Deployed") land on sinners who can
 * use them.
 *
 * Identity strength (src/lib/strength.ts) matters too: the best units are
 * preferred when building and get the most-buffed slots in the order.
 *
 * The builder doesn't know which identities you own, so treat it as a starting
 * point and swap in what you have.
 */
import { holderFactor } from './holder'
import { giftSlots, slotText } from './lineup'
import { intrinsicScore, makeContext, teamProfile } from './scoring'
import { identityTier, strength, type TierOverrides } from './strength'
import {
  CORE_KEYWORDS, SINNERS, isCoreKeyword,
  type CoreKeyword, type GameData, type Gift, type Identity, type Sinner,
} from './types'

export type Focus = { kind: 'keyword'; value: CoreKeyword } | { kind: 'trait'; value: string }

export function focusKey(f: Focus): string {
  return `${f.kind}:${f.value}`
}

export function parseFocus(key: string): Focus | null {
  const [kind, ...rest] = key.split(':')
  const value = rest.join(':')
  if (kind === 'keyword' && isCoreKeyword(value)) return { kind, value }
  if (kind === 'trait' && value) return { kind, value }
  return null
}

/** Affiliations worth building around: shared by several sinners, but not so broad they mean nothing. */
export function traitOptions(identities: Identity[]): { name: string; count: number; sinners: number }[] {
  const by = new Map<string, Identity[]>()
  for (const i of identities) for (const t of i.traits ?? []) by.set(t, [...(by.get(t) ?? []), i])
  return [...by.entries()]
    .map(([name, ids]) => ({ name, count: ids.length, sinners: new Set(ids.map((i) => i.sinner)).size }))
    .filter((t) => t.sinners >= 3 && t.count <= 30)
    .sort((a, b) => b.sinners - a.sinners || b.count - a.count || a.name.localeCompare(b.name))
}

/** Statuses a unit puts on itself rather than on the enemy. */
const SELF_STATUS: ReadonlySet<CoreKeyword> = new Set(['Poise', 'Charge'])

/** "Tremor", "Tremor - Scorch" and "Tremor Burst" all belong to Tremor. */
function isKeywordStatus(name: string, k: string): boolean {
  return name === k || name.startsWith(k + ' ')
}

/**
 * How much of an identity's deck works with a keyword, 0–1: the share of skill
 * copies (S1 ×3, S2 ×2, S3 ×1) that inflict or trigger it on the enemy (or gain
 * it, for Poise and Charge). An identity that only has the keyword on paper (it
 * gains Tremor itself, like Spicebush Yi Sang, or a passive mentions it, like
 * The Middle Big Brother Heathcliff) scores a little; one with no skill data
 * falls back to its keyword list. Skills that spread three or more keywords at
 * once count for less of each.
 */
export function keywordFit(i: Identity, k: CoreKeyword): number {
  const skills = i.skills?.filter((s) => s.enemy) ?? []
  if (!skills.length) return i.keywords.includes(k) ? 1 : 0
  let total = 0
  let hit = 0
  for (const s of skills) {
    const w = s.copies ?? [3, 2, 1][s.slot - 1] ?? 1
    total += w
    const names = SELF_STATUS.has(k) ? [...s.enemy!, ...(s.self ?? [])] : s.enemy!
    if (!names.some((n) => isKeywordStatus(n, k))) continue
    // A skill that spreads five statuses at once (The Ring Pointillist Student) builds none of them up.
    const spread = CORE_KEYWORDS.filter((c) => names.some((n) => isKeywordStatus(n, c))).length
    hit += w * Math.min(1, 2 / spread)
  }
  const share = total ? hit / total : 0
  if (share > 0) return 0.4 + 0.6 * share
  if (!i.keywords.includes(k)) return 0
  // Poise and Charge often come from passives (not read here); Tremor on paper only is worth little.
  return SELF_STATUS.has(k) ? 0.5 : 0.15
}

/** What an affiliation's members do in battle, so the rest of the team can pair with them. */
export interface TraitPartner {
  /** Keywords most members inflict (The Thumb: Burn and Tremor). */
  keywords: CoreKeyword[]
  /** Statuses of those keywords that are the affiliation's own (The Thumb: Tremor - Scorch). */
  signature: string[]
}

export function traitPartner(members: Identity[]): TraitPartner {
  if (!members.length) return { keywords: [], signature: [] }
  const counts = CORE_KEYWORDS
    .map((k) => ({ k, n: members.filter((i) => keywordFit(i, k) >= 0.4).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
  const top = counts[0]?.n ?? 0
  // The main keyword and any other most members also inflict (at most two).
  const keywords = counts.filter((x) => x.n >= Math.max(1, top * 0.6) && x.n >= members.length * 0.4).slice(0, 2).map((x) => x.k)
  if (!keywords.length && counts[0]) keywords.push(counts[0].k)
  // Named variants of those keywords at least a third of the members inflict.
  const by = new Map<string, number>()
  for (const i of members) {
    const mine = new Set((i.skills ?? []).flatMap((s) => s.enemy ?? []))
    for (const n of mine) {
      if (keywords.some((k) => n !== k && isKeywordStatus(n, k) && !/ Burst$/.test(n))) by.set(n, (by.get(n) ?? 0) + 1)
    }
  }
  const signature = [...by.entries()].filter(([, n]) => n >= members.length / 3).map(([n]) => n)
  return { keywords, signature }
}

/** How well an identity pairs with an affiliation's members, 0–1 (more with their signature status). */
export function partnerFit(i: Identity, partner: TraitPartner): number {
  if (!partner.keywords.length) return 0
  const fit = partner.keywords.reduce((s, k) => s + keywordFit(i, k), 0) / partner.keywords.length
  const sig = partner.signature.length && (i.skills ?? []).some((s) => s.enemy?.some((n) => partner.signature.includes(n)))
  return Math.min(1, fit * (sig ? 1 : 0.8))
}

/** How well an identity fits a focus; 0 = not at all. Stronger units score higher. */
export function focusScore(
  i: Identity, focus: Focus, partner?: TraitPartner | null, tiers: TierOverrides = {},
): number {
  let s = 0
  if (focus.kind === 'keyword') {
    s += 3 * keywordFit(i, focus.value)
  } else {
    const pair = partner ? partnerFit(i, partner) : 0
    // Members first; among them, the ones that do what the affiliation does.
    if (i.traits?.includes(focus.value)) s += 4 + 0.5 * pair
    // Branch identities count a little for their parent faction's focus and vice versa.
    else if (i.traits?.some((t) => t.startsWith(focus.value + ' ') || focus.value.startsWith(t + ' '))) s += 1.5 + pair
    // Everyone else by how well they pair with the members (The Thumb: Burn and Tremor, Tremor - Scorch).
    else s += 2.5 * pair
  }
  // Strength counts for less than fit: a strong unit that doesn't fit the focus scores 0.
  if (s > 0) s += 2 * strength(i, tiers)
  return s
}

export interface BuiltTeam {
  team: Partial<Record<Sinner, string>>
  /** Sinners with nothing that fits the focus (filled with their best general pick). */
  unmatched: Sinner[]
}

/** Best identity for each sinner. With `owned`, only those identities are used. */
export function buildTeam(
  data: GameData, focus: Focus, owned?: Set<string>, tiers: TierOverrides = {},
): BuiltTeam {
  const pool = owned?.size ? data.identities.filter((i) => owned.has(i.id)) : data.identities
  // For an affiliation, what its members inflict picks the rest (all members, owned or not).
  const partner = focus.kind === 'trait'
    ? traitPartner(data.identities.filter((i) => i.traits?.includes(focus.value)))
    : null
  const team: BuiltTeam['team'] = {}
  const unmatched: Sinner[] = []
  for (const sinner of SINNERS) {
    const options = pool.filter((i) => i.sinner === sinner)
    if (!options.length) continue
    const scored = options
      .map((i) => ({ i, s: focusScore(i, focus, partner, tiers) }))
      // With no fit, the strongest unit fills the spot.
      .sort((a, b) => b.s - a.s || strength(b.i, tiers) - strength(a.i, tiers) || a.i.name.localeCompare(b.i.name))
    const best = scored[0]
    if (best.s === 0) unmatched.push(sinner)
    team[sinner] = best.i.id
  }
  return { team, unmatched }
}

export interface OrderSuggestion {
  order: Sinner[]
  /** Why a sinner got its slot, e.g. "Blunt skills for Crushed Memory". */
  notes: Partial<Record<Sinner, string>>
}

/** How well one identity fits a gift on its own (for slot-limited gifts). */
export function identityGiftFit(g: Gift, i: Identity, identities: Identity[]): { fit: number; why: string } {
  const base = baseGiftFit(g, i)
  // Conditions on the unit in the slot: a Family Hierarch Candidate for Cultivation.
  const h = holderFactor(g, i, identities)
  const cond = h.met.filter((c) => c.share >= 0.25).sort((a, b) => b.share - a.share)[0]
  const fit = base.fit * h.factor
  return { fit, why: cond ? cond.pred.replace(/^is /, '').replace(/^(has|uses) /, '') : base.why }
}

function baseGiftFit(g: Gift, i: Identity): { fit: number; why: string } {
  const trait = g.traits?.find((t) => i.traits?.includes(t))
  if (trait) return { fit: 1, why: trait }
  const attack = g.attack_types?.find((t) => i.attack_types?.includes(t))
  if (attack) return { fit: 1, why: `${attack} skills` }
  if (isCoreKeyword(g.keyword) && i.keywords.includes(g.keyword)) return { fit: 1, why: g.keyword }
  const aff = g.affinities?.find((a) => i.affinities.includes(a))
  if (aff) return { fit: 0.8, why: `${aff[0].toUpperCase()}${aff.slice(1)} affinity` }
  if (!g.keyword && !g.attack_types?.length) return { fit: 0.3, why: '' }
  return { fit: 0, why: '' }
}

/**
 * Deployment order for a team.
 *
 * 1. Who's deployed: mostly the strongest on the Mirror Dungeon ranking, with
 *    fit to the team's keywords and affiliations breaking close calls.
 * 2. Who goes where: the best assignment of deployed identities to slots,
 *    maximising
 *      - slot-limited gifts they can use (gifts you own count most; the best ones
 *        you could still find count a little), scaled up for stronger units so the buffs go
 *        to the carries, plus
 *      - strength × how buffed the slot is in general (#1–#2 get the most
 *        slot-limited gifts), so top units sit there even before you own any.
 */
export function suggestOrder(
  data: GameData, team: Identity[], deployed: number, owned: Iterable<string> = [], tiers: TierOverrides = {},
): OrderSuggestion {
  if (!team.length) return { order: [], notes: {} }
  const ownedSet = new Set(owned)
  // Score gifts for the whole team, not per slot or for whoever happens to be listed first.
  const ctx = makeContext(data, team, ownedSet, { deployed: team.length, tiers })
  ctx.lineup = []
  const profile = teamProfile(team)
  const str = new Map(team.map((i) => [i.id, strength(i, tiers)]))
  const power = (i: Identity) => str.get(i.id)!

  // How central each identity is to the team: inflicts what the others inflict, shares their affiliations.
  // By what skills do, so a unit tagged with five keywords (The Ring Pointillist Student) isn't the most central.
  const fits = new Map(team.map((i) => [i.id, CORE_KEYWORDS.map((k) => keywordFit(i, k))]))
  const teamFit = CORE_KEYWORDS.map((_, n) => team.reduce((s, i) => s + fits.get(i.id)![n], 0))
  const core = (i: Identity) =>
    fits.get(i.id)!.reduce((s, f, n) => s + f * (teamFit[n] - f) / profile.size, 0)
    + (i.traits ?? []).reduce((s, t) => s + Math.max(0, (profile.traitCounts.get(t) ?? 0) - 1) / profile.size, 0)

  const slotGifts = data.gifts
    .map((g) => ({ g, slots: giftSlots(g) }))
    .filter((x) => x.slots)
    // A gift only partly limited to a slot ("[#1 Deployed Identity Exclusive Effect]") counts half.
    // Gifts you own drive the order; ones you might find later only nudge it.
    .map((x) => ({ ...x, weight: intrinsicScore(x.g, ctx).score * (ownedSet.has(x.g.id) ? 2 : 0.4) * (x.slots!.whole ? 1 : 0.5) }))
    .sort((a, b) => b.weight - a.weight)
  const relevant = [...slotGifts.filter((x) => ownedSet.has(x.g.id)), ...slotGifts.filter((x) => !ownedSet.has(x.g.id)).slice(0, 12)]

  const giftValue = (i: Identity, slot: number) => {
    let v = 0
    let why = ''
    let bestPart = 0
    for (const { g, slots, weight } of relevant) {
      if (!slots!.slots.includes(slot)) continue
      const f = identityGiftFit(g, i, data.identities)
      const part = f.fit * weight
      v += part
      if (f.why && part > bestPart) {
        bestPart = part
        why = ownedSet.has(g.id)
          ? `${f.why} for your ${g.name} (${slotText(slots!.slots)})`
          : `${f.why} · ${g.name} (${slotText(slots!.slots)}) if found`
      }
    }
    return { v, why }
  }

  // How buffed each slot is across every slot-limited gift (higher tiers count more).
  const maxSlot = Math.max(deployed, 1)
  const buff = Array.from({ length: maxSlot }, (_, k) => data.gifts.reduce((sum, g) => {
    const gs = giftSlots(g)
    return gs?.slots.includes(k + 1) ? sum + (gs.whole ? 1 : 0.5) * (g.tier ?? 1) ** 2 : sum
  }, 0))
  const maxBuff = Math.max(1e-9, ...buff)
  const priority = buff.map((b) => b / maxBuff)
  const topWeight = Math.max(1, ...relevant.map((x) => x.weight))

  // 1. Who's deployed.
  const reach = (i: Identity) => Math.max(0, ...Array.from({ length: maxSlot }, (_, k) => giftValue(i, k + 1).v))
  const maxReach = Math.max(1e-9, ...team.map(reach))
  // Strength counts most: a D-tier unit shouldn't be deployed over a B-tier one
  // just because it shares the team's keyword. Fit breaks close calls.
  const deployScore = (i: Identity) => core(i) + 2 * power(i) + 0.3 * reach(i) / maxReach
  const ranked = [...team].sort((a, b) => deployScore(b) - deployScore(a))
  const deployedSet = ranked.slice(0, deployed)
  const bench = ranked.slice(deployed)

  // 2. Best assignment of deployed identities to slots (exact: at most 7 slots).
  const n = deployedSet.length
  const value = deployedSet.map((i) => Array.from({ length: n }, (_, k) =>
    giftValue(i, k + 1).v * (0.5 + power(i)) + topWeight * priority[k] * power(i) ** 2 + 0.001 * core(i) * (n - k)))
  // best[mask] = max value placing the identities in `mask` into slots 0..popcount-1.
  const size = 1 << n
  const best = new Float64Array(size).fill(-Infinity)
  const pick = new Int8Array(size).fill(-1)
  best[0] = 0
  for (let mask = 0; mask < size; mask++) {
    if (best[mask] === -Infinity) continue
    let slot = 0
    for (let m = mask; m; m &= m - 1) slot++
    if (slot >= n) continue
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) continue
      const next = mask | (1 << i)
      const v = best[mask] + value[i][slot]
      if (v > best[next]) { best[next] = v; pick[next] = i }
    }
  }
  const slots: Identity[] = []
  for (let mask = size - 1; mask; mask &= ~(1 << pick[mask])) slots.unshift(deployedSet[pick[mask]])

  const notes: OrderSuggestion['notes'] = {}
  slots.forEach((i, k) => {
    const why = giftValue(i, k + 1).why
    const { tier } = identityTier(i, tiers)
    if (why) notes[i.sinner] = why
    else if (tier && power(i) >= 0.65 && priority[k] >= 0.5) notes[i.sinner] = `${tier} unit in a buffed slot`
  })
  return { order: [...slots, ...bench].map((i) => i.sinner), notes }
}
