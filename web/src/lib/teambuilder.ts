/**
 * Team building: pick an identity per sinner for a focus (a keyword like
 * Rupture, or an affiliation like Heishou Pack), then suggest a deployment
 * order so slot-limited gifts (e.g. "#1, #2 Deployed") land on sinners who can
 * use them.
 *
 * The builder doesn't know which identities you own, so treat it as a starting
 * point and swap in what you have.
 */
import { giftSlots, slotText } from './lineup'
import { intrinsicScore, makeContext, teamProfile } from './scoring'
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

/** How well an identity fits a focus; 0 = not at all. */
export function focusScore(i: Identity, focus: Focus, partner?: CoreKeyword | null): number {
  let s = 0
  if (focus.kind === 'keyword') {
    if (i.keywords.includes(focus.value)) s += 3
  } else {
    if (i.traits?.includes(focus.value)) s += 3
    // Branch identities count a little for their parent faction's focus and vice versa.
    else if (i.traits?.some((t) => t.startsWith(focus.value + ' ') || focus.value.startsWith(t + ' '))) s += 1.5
    if (partner && i.keywords.includes(partner)) s += 1
  }
  if (s > 0) s += 0.3 * ((i.rarity ?? 1) - 1)
  return s
}

export interface BuiltTeam {
  team: Partial<Record<Sinner, string>>
  /** Sinners with nothing that fits the focus (filled with their best general pick). */
  unmatched: Sinner[]
}

/** Best identity for each sinner. With `owned`, only those identities are used. */
export function buildTeam(data: GameData, focus: Focus, owned?: Set<string>): BuiltTeam {
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
      .map((i) => ({ i, s: focusScore(i, focus, partner) }))
      .sort((a, b) => b.s - a.s || (b.i.rarity ?? 0) - (a.i.rarity ?? 0) || a.i.name.localeCompare(b.i.name))
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
function identityGiftFit(g: Gift, i: Identity): { fit: number; why: string } {
  const attack = g.attack_types?.find((t) => i.attack_types?.includes(t))
  if (attack) return { fit: 1, why: `${attack} skills` }
  if (isCoreKeyword(g.keyword) && i.keywords.includes(g.keyword)) return { fit: 1, why: g.keyword }
  const aff = g.affinities?.find((a) => i.affinities.includes(a))
  if (aff) return { fit: 0.8, why: `${aff[0].toUpperCase()}${aff.slice(1)} affinity` }
  if (!g.keyword && !g.attack_types?.length) return { fit: 0.3, why: '' }
  return { fit: 0, why: '' }
}

/**
 * Deployment order for a team. The strongest fits for the team's main keywords
 * and affiliations are deployed first. Within the deployed slots, sinners are
 * placed to suit slot-limited gifts: ones you own count double, then the best
 * ones you could still pick up.
 */
export function suggestOrder(
  data: GameData, team: Identity[], deployed: number, owned: Iterable<string> = [],
): OrderSuggestion {
  if (!team.length) return { order: [], notes: {} }
  const ownedSet = new Set(owned)
  const ctx = makeContext(data, team, ownedSet)
  ctx.lineup = [] // score gifts for the whole team here, not per slot
  const profile = teamProfile(team)

  // How central each identity is to the team: shares its keywords and affiliations.
  const core = (i: Identity) =>
    i.keywords.reduce((s, k) => s + profile.keywordCounts[k] / profile.size, 0)
    + (i.traits ?? []).reduce((s, t) => s + Math.max(0, (profile.traitCounts.get(t) ?? 0) - 1) / profile.size, 0)
    + 0.2 * (i.rarity ?? 1)

  const slotGifts = data.gifts
    .map((g) => ({ g, slots: giftSlots(g) }))
    .filter((x) => x.slots?.whole)
    .map((x) => ({ ...x, weight: intrinsicScore(x.g, ctx).score * (ownedSet.has(x.g.id) ? 2 : 1) }))
    .sort((a, b) => b.weight - a.weight)
  const relevant = [...slotGifts.filter((x) => ownedSet.has(x.g.id)), ...slotGifts.filter((x) => !ownedSet.has(x.g.id)).slice(0, 12)]

  const slotValue = (i: Identity, slot: number) => {
    let v = 0
    let why = ''
    let bestPart = 0
    for (const { g, slots, weight } of relevant) {
      if (!slots!.slots.includes(slot)) continue
      const f = identityGiftFit(g, i)
      const part = f.fit * weight
      v += part
      if (f.why && part > bestPart) {
        bestPart = part
        why = `${f.why} for ${g.name} (${slotText(slots!.slots)})`
      }
    }
    return { v, why }
  }

  // 1. Who's deployed: the most central identities, nudged by slot-gift value.
  const maxSlot = Math.max(deployed, 1)
  const reach = (i: Identity) => Math.max(0, ...Array.from({ length: maxSlot }, (_, k) => slotValue(i, k + 1).v))
  const maxReach = Math.max(1e-9, ...team.map(reach))
  const ranked = [...team].sort((a, b) => core(b) + 0.5 * reach(b) / maxReach - (core(a) + 0.5 * reach(a) / maxReach))
  const deployedSet = ranked.slice(0, deployed)
  const bench = ranked.slice(deployed)

  // 2. Fill slots #1..#N greedily, most constrained slot first.
  const notes: OrderSuggestion['notes'] = {}
  const slots: (Identity | null)[] = Array(deployedSet.length).fill(null)
  const free = new Set(deployedSet)
  const slotOrder = [...slots.keys()].sort((a, b) =>
    Math.max(0, ...deployedSet.map((i) => slotValue(i, b + 1).v)) - Math.max(0, ...deployedSet.map((i) => slotValue(i, a + 1).v)))
  for (const k of slotOrder) {
    let best: Identity | null = null
    let bestV = -1
    for (const i of free) {
      const v = slotValue(i, k + 1).v + 0.01 * core(i)
      if (v > bestV) { bestV = v; best = i }
    }
    if (!best) continue
    slots[k] = best
    free.delete(best)
    const why = slotValue(best, k + 1).why
    if (why) notes[best.sinner] = why
  }
  return { order: [...(slots.filter(Boolean) as Identity[]), ...bench].map((i) => i.sinner), notes }
}
