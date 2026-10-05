import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { bestFilter, matches, searchOptions } from './giftsearch'

const packs = gameData.themePacks

describe('gift search', () => {
  it('understands theme packs, sins, keywords and tiers', () => {
    expect(bestFilter('spring cultivation', packs)).toMatchObject({ kind: 'pack', pack: { name: 'Spring Cultivation' } })
    expect(bestFilter('Wrath', packs)).toEqual({ kind: 'sin', sin: 'wrath' })
    expect(bestFilter('rupture', packs)).toEqual({ kind: 'keyword', keyword: 'Rupture' })
    expect(bestFilter('tier iv', packs)).toEqual({ kind: 'tier', tier: 4 })
    expect(bestFilter('lunar', packs)).toEqual({ kind: 'text', text: 'lunar' })
  })

  it('offers pack suggestions while typing', () => {
    expect(searchOptions('spring', packs).some((o) => o.kind === 'pack' && o.pack.name === 'Spring Cultivation')).toBe(true)
  })

  it('filters a pack to its pool', () => {
    const f = bestFilter('spring cultivation', packs)!
    const hits = gameData.gifts.filter((g) => matches(g, f)).map((g) => g.name)
    expect(hits).toContain('Virtue - Zhi (智)')
  })
})
