/**
 * Plain-language "why this rank" text for the Best gifts and Theme packs tabs,
 * built from the score parts in scoring.ts.
 */
import type { GiftScore, PackScore, PartKind, ScorePart } from './scoring'
import { tierLabel } from './types'

const pct = (x: number) => `${Math.round(Math.min(1, Math.max(0, x)) * 100)}%`
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Each part's share of the score (0-1). */
export function shares<T extends { value: number }>(parts: T[]): (T & { share: number })[] {
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0)
  return parts.map((p) => ({ ...p, share: total > 0 ? Math.max(0, p.value) / total : 0 }))
}

function byKind(parts: ScorePart[]): Map<PartKind, number> {
  const out = new Map<PartKind, number>()
  for (const p of parts) out.set(p.kind, (out.get(p.kind) ?? 0) + p.value)
  return out
}

/** "Mostly: built for Heishou Pack identities (55%), Tier IV gift … (35%)" */
export function giftSummary(s: GiftScore): string {
  const top = shares(s.parts).filter((p) => p.share >= 0.12).slice(0, 2)
  if (!top.length) return ''
  return `Mostly from: ${top.map((p) => `${lower(p.label)} (${pct(p.share)})`).join('; ')}`
}

/** What `a` has over `b`, for the part kind where it gains the most. */
function giftEdge(a: GiftScore, b: GiftScore, kind: PartKind): string {
  const labelOf = (k: PartKind) => a.parts.find((p) => p.kind === k)?.label ?? ''
  switch (kind) {
    case 'core': {
      const ta = a.gift.tier ?? 1
      const tb = b.gift.tier ?? 1
      const fitGap = a.fit - b.fit
      if (ta > tb && fitGap >= -0.1) {
        return `it's a higher tier (${tierLabel(ta)} vs ${tierLabel(tb)})${fitGap > 0.1 ? ' and fits your team better' : ''}`
      }
      if (fitGap > 0) {
        const why = a.parts.find((p) => p.kind === 'core')?.fitReason
        return `it fits your team better (${pct(a.fit)} vs ${pct(b.fit)}${why ? `: ${lower(why)}` : ''})`
      }
      return `it's a higher tier (${tierLabel(ta)} vs ${tierLabel(tb)}), which outweighs ${b.gift.name}'s better fit`
    }
    case 'synergy': {
      const label = lower(labelOf('synergy'))
      const had = b.parts.some((p) => p.kind === 'synergy')
      return had ? `it's more tied to your team (${label})` : label.startsWith('built') ? `it's ${label}` : `it ${label}`
    }
    case 'enabler': return `it ${lower(labelOf('enabler'))}`
    case 'fusion': {
      const label = labelOf('fusion')
      return label.startsWith('Starts') ? `it ${lower(label)}` : `it's an ${lower(label)}, which you've started`
    }
    case 'upgrade': return `it ${lower(labelOf('upgrade'))}`
    case 'combo': return `it ${lower(labelOf('combo'))}, which you have`
    case 'run': return `it ${lower(labelOf('run'))}, which matters at this point of your run`
    case 'bonus': {
      const labels = a.parts.filter((p) => p.kind === 'bonus').map((p) => lower(p.label))
      return `of small extras (${labels.join('; ') || 'affinity and statuses'})`
    }
  }
}

/** Why `a` is ranked above `b` ("it's a higher tier (IV vs II)"), or null if they're about even. */
export function giftEdgeReason(a: GiftScore, b: GiftScore): string | null {
  const ka = byKind(a.parts)
  const kb = byKind(b.parts)
  const kinds = new Set<PartKind>([...ka.keys(), ...kb.keys()])
  const gains = [...kinds]
    .map((k) => ({ k, d: (ka.get(k) ?? 0) - (kb.get(k) ?? 0) }))
    .filter((x) => x.d > 0.05)
    .sort((x, y) => y.d - x.d)
  if (!gains.length || a.score - b.score < 0.05) return null
  const lead = giftEdge(a, b, gains[0].k)
  const second = gains[1] && gains[1].d >= gains[0].d * 0.4 ? giftEdge(a, b, gains[1].k) : null
  return `${lead}${second ? `, and ${second}` : ''}`
}

/** "Most of its value: Gift A (45%), Gift B (20%)" */
export function packSummary(p: PackScore): string {
  const top = shares(p.parts).filter((x) => x.share >= 0.1).slice(0, 3)
  if (!top.length) return ''
  return `Most of its value: ${top.map((x) => `${x.gift.gift.name} (${pct(x.share)})`).join(', ')}`
}

/** Why pack `a` is ranked above pack `b`, or null if they're about even. */
export function packEdgeReason(a: PackScore, b: PackScore): string | null {
  const gains = ([
    ['team', a.split.team - b.split.team],
    ['best', a.split.best - b.split.best],
  ] as const).filter(([, d]) => d > 0.05).sort((x, y) => y[1] - x[1])
  if (!gains.length || a.score - b.score < 0.05) return null
  const topA = a.parts[0]?.gift.gift
  const topB = b.parts[0]?.gift.gift
  const why = (k: 'team' | 'best') => {
    if (k === 'team') {
      const n = (p: PackScore) => p.parts.filter((x) => x.gift.synergy).length
      return n(a) > n(b)
        ? `it has more gifts built for your team (${n(a)} vs ${n(b)})`
        : 'its gifts built for your team are rarer, so they count for more'
    }
    const exclusive = topA && a.pack.gifts.includes(topA.id)
    if (topA && topB && topA.id !== topB.id) {
      return `its best gift for you, ${topA.name}${exclusive ? ' (only in this pack)' : ''}, beats ${b.pack.name}'s best, ${topB.name}`
    }
    return 'its other gifts are better for your team'
  }
  const second = gains[1] && gains[1][1] >= gains[0][1] * 0.4 ? why(gains[1][0]) : null
  return `${why(gains[0][0])}${second ? `, and ${second}` : ''}`
}

/** "Ranked above X because …" / "X ranks higher because …" lines for a list item. */
export function neighbourLines<T>(
  item: T, prev: T | undefined, next: T | undefined, name: (t: T) => string, edge: (a: T, b: T) => string | null,
): { above?: string; below?: string } {
  const out: { above?: string; below?: string } = {}
  if (next) {
    const r = edge(item, next)
    out.above = r ? `Ranked above ${name(next)} because ${r}.` : `About the same value as ${name(next)}, just below it.`
  }
  if (prev) {
    const r = edge(prev, item)
    out.below = r ? `${name(prev)} ranks higher because ${r}.` : `About the same value as ${name(prev)}, just above it.`
  }
  return out
}
