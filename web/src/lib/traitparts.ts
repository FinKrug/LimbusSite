// How much of a gift's effect only works for one affiliation's identities.
// Bloodflame Sword gives every Burn identity 5 Burn and 8 SP, but most of its
// text is a You Branch-only effect, so it's mostly a You Branch gift.
import type { Gift } from './types'

/** Paragraphs that mention the trait (or its short forms) count as the trait's part. */
function aliases(trait: string): string[] {
  const out = [trait]
  const m = /^(.+?) - (.+?)(?: Branch)?$/.exec(trait)
  if (m) {
    const [, parent, key] = m
    const firstWord = parent.split(' ')[0]
    out.push(`${key} Branch`, `${parent} - ${key}`, `${firstWord} - ${key}`, `-${key}-`)
  }
  return out
}

const cache = new Map<string, number>()

/** Share of the effect text, 0–1, that only works for the gift's affiliations. */
export function traitShare(g: Gift): number {
  if (!g.traits?.length) return 0
  const hit = cache.get(g.id)
  if (hit !== undefined) return hit
  const names = g.traits.flatMap(aliases)
  // "- …" lines belong to the paragraph above them.
  const paras: string[] = []
  for (const line of g.effect.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith('- ') && paras.length) paras[paras.length - 1] += ' ' + line
    else paras.push(line)
  }
  const total = paras.reduce((s, p) => s + p.length, 0)
  const own = paras.filter((p) => names.some((n) => p.includes(n))).reduce((s, p) => s + p.length, 0)
  // Nothing matched: the wording is unusual, so assume half. Otherwise keep it
  // between 0.2 (a small rider) and 0.9 (the general part still counts a little).
  const share = !total || !own ? 0.5 : Math.min(0.9, Math.max(0.2, own / total))
  cache.set(g.id, share)
  return share
}
