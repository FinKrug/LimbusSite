/**
 * Best gifts search: typing a theme pack name, a sin, a keyword or a tier filters
 * to it ("spring cultivation", "wrath", "rupture", "tier 4"); anything else
 * searches names and effects.
 */
import { CORE_KEYWORDS, SINS, type Gift, type Sin, type ThemePack } from './types'
import { packPool } from './scoring'

export type SearchFilter =
  | { kind: 'pack'; pack: ThemePack }
  | { kind: 'sin'; sin: Sin }
  | { kind: 'keyword'; keyword: string }
  | { kind: 'tier'; tier: number }
  | { kind: 'text'; text: string }

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 }

/** Filters the query could mean, most specific first. */
export function searchOptions(query: string, packs: ThemePack[]): SearchFilter[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: SearchFilter[] = []
  const tier = q.match(/^(?:tier\s*)?(i{1,3}|iv|v|[1-5])$/)
  if (tier) out.push({ kind: 'tier', tier: ROMAN[tier[1]] ?? Number(tier[1]) })
  for (const s of SINS) if (s === q || (q.length >= 3 && s.startsWith(q))) out.push({ kind: 'sin', sin: s })
  for (const k of CORE_KEYWORDS) {
    const kl = k.toLowerCase()
    if (kl === q || (q.length >= 3 && kl.startsWith(q))) out.push({ kind: 'keyword', keyword: k })
  }
  if (q.length >= 3) {
    const hits = packs
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q))
        || a.name.length - b.name.length)
    out.push(...hits.slice(0, 4).map((pack) => ({ kind: 'pack' as const, pack })))
  }
  return out
}

/** The filter to apply: an exact pack, sin, keyword or tier match; otherwise text. */
export function bestFilter(query: string, packs: ThemePack[]): SearchFilter | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const opts = searchOptions(query, packs)
  const exact = opts.find((o) =>
    (o.kind === 'pack' && o.pack.name.toLowerCase() === q)
    || (o.kind === 'sin' && o.sin === q)
    || (o.kind === 'keyword' && o.keyword.toLowerCase() === q)
    || o.kind === 'tier')
  return exact ?? { kind: 'text', text: q }
}

export function matches(g: Gift, f: SearchFilter): boolean {
  switch (f.kind) {
    case 'pack': return packPool(f.pack).includes(g.id)
    case 'sin': return g.sin === f.sin
    case 'keyword': return g.keyword === f.keyword || g.status_effects.includes(f.keyword)
    case 'tier': return g.tier === f.tier
    case 'text': return g.name.toLowerCase().includes(f.text) || g.effect.toLowerCase().includes(f.text)
  }
}

export function filterLabel(f: SearchFilter): string {
  switch (f.kind) {
    case 'pack': return `Theme pack: ${f.pack.name}`
    case 'sin': return `${f.sin[0].toUpperCase()}${f.sin.slice(1)} affinity`
    case 'keyword': return `${f.keyword} gifts`
    case 'tier': return `Tier ${['I', 'II', 'III', 'IV', 'V'][f.tier - 1]}`
    case 'text': return `“${f.text}”`
  }
}
