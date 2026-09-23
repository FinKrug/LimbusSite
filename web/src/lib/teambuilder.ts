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

/** How well an identity fits a focus; 0 = not at all. Stronger units score higher. */
export function focusScore(
  i: Identity, focus: Focus, partner?: CoreKeyword | null, tiers: TierOverrides = {},
): number {
  let s = 0
  if (focus.kind === 'keyword') {
    if (i.keywords.includes(focus.value)) s += 3
  } else {
    if (i.traits?.includes(focus.value)) s += 3
    // Branch identities count a little for their parent faction's focus and vice versa.
    else if (i.traits?.some((t) => t.startsWith(focus.value + ' ') || focus.value.startsWith(t + ' '))) s += 1.5
    if (partner && i.keywords.includes(partner)) s += 1
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
  // For an affiliation, the keyword most of its members share helps pick the rest.
  let partner: CoreKeyword | null = null
  if (focus.kind === 'trait') {
    const members = pool.filter((i) => i.traits?.includes(focus.value))
    const counts = CORE_KEYWORDS.map((k) => ({ k, n: members.filter((i) => i.keywords.includes(k)).length }))
      .sort((a, b) => b.n - a.n)
    partner = counts[0]?.n ? counts[0].k : null
  }
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
function identityGiftFit(g: Gift, i: Identity, identities: Identity[]): { fit: number; why: string } {
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
 * 1. Who's deployed: the identities most central to the team (its keywords and
 *    affiliations), then the strongest, nudged by slot-limited gift value.
 * 2. Who goes where: the best assignment of deployed identities to slots,
 *    maximising
 *      - slot-limited gifts they can use (owned count double, then the best ones
 *        you could still pick up), scaled up for stronger units so the buffs go
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
  const ctx = makeContext(data, team, ownedSet, [], [], team.length, tiers)
  ctx.lineup = []
  const profile = teamProfile(team)
  const str = new Map(team.map((i) => [i.id, strength(i, tiers)]))
  const power = (i: Identity) => str.get(i.id)!

  // How central each identity is to the team: shares its keywords and affiliations.
  const core = (i: Identity) =>
    i.keywords.reduce((s, k) => s + profile.keywordCounts[k] / profile.size, 0)
    + (i.traits ?? []).reduce((s, t) => s + Math.max(0, (profile.traitCounts.get(t) ?? 0) - 1) / profile.size, 0)

  const slotGifts = data.gifts
    .map((g) => ({ g, slots: giftSlots(g) }))
    .filter((x) => x.slots)
    // A gift only partly limited to a slot ("[#1 Deployed Identity Exclusive Effect]") counts half.
    .map((x) => ({ ...x, weight: intrinsicScore(x.g, ctx).score * (ownedSet.has(x.g.id) ? 2 : 1) * (x.slots!.whole ? 1 : 0.5) }))
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
        why = `${f.why} for ${g.name} (${slotText(slots!.slots)})`
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
  const deployScore = (i: Identity) => core(i) + 0.6 * power(i) + 0.5 * reach(i) / maxReach
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
