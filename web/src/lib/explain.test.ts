import { describe, expect, it } from 'vitest'
import { makeContext, rankGifts, rankThemePacks } from './scoring'
import { giftEdgeReason, giftSummary, neighbourLines, packEdgeReason, packSummary, shares } from './explain'
import type { GameData, Gift, Identity, ThemePack } from './types'

function gift(id: string, over: Partial<Gift> = {}): Gift {
  return {
    id, name: id, sin: 'wrath', tier: 2, cost: 100, keyword: null, secondary_keyword: null,
    status_effects: [], traits: [], effect: '', max_level: 0, pools: ['main'], theme_packs: [], events: [],
    fusion_recipe: null, wiki_url: '', ...over,
  }
}
const ident = (id: string, keywords: Identity['keywords'], extra: Partial<Identity> = {}): Identity =>
  ({ id, name: id, sinner: 'Yi Sang', rarity: 3, affinities: ['wrath'], keywords, status_effects: [], traits: [], wiki_url: '', ...extra })
const pack = (id: string, pool: string[], exclusive: string[] = []): ThemePack =>
  ({ id, name: id, pool: 'themed', group: null, floors: null, gifts: exclusive, gift_pool: [...pool, ...exclusive], wiki_url: null })

const data: GameData = {
  gifts: [
    gift('burn-4', { keyword: 'Burn', tier: 4 }),
    gift('burn-2', { keyword: 'Burn', tier: 2 }),
    gift('bleed-2', { keyword: 'Bleed', tier: 2 }),
    gift('pack-gift', { keyword: 'Burn', tier: 1, traits: ['Pack'], effect: 'Pack allies gain Power' }),
    gift('a', { keyword: 'Burn', tier: 1 }),
    gift('b', { keyword: 'Burn', tier: 1 }),
    gift('fused', { keyword: 'Burn', tier: 4, pools: ['fusion'] }),
  ],
  themePacks: [pack('hot', ['burn-2'], ['burn-4']), pack('cold', ['bleed-2', 'burn-2'])],
  fusions: [{ result: 'fused', ingredients: ['a', 'b'] }],
  identities: [],
  generatedAt: null,
}
const team = [ident('x', ['Burn'], { traits: ['Pack'] }), ident('y', ['Burn'], { traits: ['Pack'] }), ident('z', ['Burn'], { traits: ['Pack'] })]
const byId = (list: ReturnType<typeof rankGifts>, id: string) => list.find((g) => g.gift.id === id)!

describe('gift score parts', () => {
  it('add up to the score', () => {
    for (const g of rankGifts(makeContext(data, team, ['a']))) {
      const sum = g.parts.reduce((s, p) => s + p.value, 0)
      expect(sum).toBeCloseTo(g.score, 6)
    }
  })

  it('explains a higher tier', () => {
    const ranked = rankGifts(makeContext(data, team, []))
    expect(giftEdgeReason(byId(ranked, 'burn-4'), byId(ranked, 'burn-2'))).toMatch(/higher tier \(IV vs II\)/)
  })

  it('explains a better fit', () => {
    const ranked = rankGifts(makeContext(data, team, []))
    expect(giftEdgeReason(byId(ranked, 'burn-2'), byId(ranked, 'bleed-2'))).toMatch(/fits your team better \(\d+% vs 0%: 3\/3 of your team use Burn\)/)
  })

  it('explains team-built gifts and fusion progress', () => {
    const ranked = rankGifts(makeContext(data, team, ['a']))
    expect(giftEdgeReason(byId(ranked, 'pack-gift'), byId(ranked, 'burn-2'))).toMatch(/built for Pack identities/i)
    expect(giftEdgeReason(byId(ranked, 'b'), byId(ranked, 'bleed-2'))).toMatch(/ingredient for fused/)
    expect(giftSummary(byId(ranked, 'pack-gift'))).toMatch(/^Mostly from: built for Pack identities \(\d+%\)/)
  })

  it('writes neighbour lines both ways', () => {
    const ranked = rankGifts(makeContext(data, team, []))
    // burn-4 and fused tie, so start below them: fused > pack-gift > burn-2.
    const [, first, second, third] = ranked
    const lines = neighbourLines(second, first, third, (g) => g.gift.name, giftEdgeReason)
    expect(lines.above).toMatch(new RegExp(`^Ranked above ${third.gift.name} because `))
    expect(lines.below).toMatch(new RegExp(`^${first.gift.name} ranks higher because `))
    const tie = neighbourLines(ranked[1], ranked[0], undefined, (g) => g.gift.name, giftEdgeReason)
    expect(tie.below).toBe(`About the same value as ${ranked[0].gift.name}, just above it.`)
  })
})

describe('pack parts', () => {
  it('add up to the pack score and credit exclusives', () => {
    const packs = rankThemePacks(makeContext(data, team, []))
    for (const p of packs) {
      expect(p.parts.reduce((s, x) => s + x.value, 0)).toBeCloseTo(p.score, 6)
      expect(p.split.best + p.split.team).toBeCloseTo(p.score, 6)
    }
    const hot = packs.find((p) => p.pack.id === 'hot')!
    expect(hot.parts[0].gift.gift.id).toBe('burn-4')
    expect(hot.parts[0].notes).toContain('only in this pack (×1.5)')
    expect(packSummary(hot)).toMatch(/^Most of its value: burn-4 \(\d+%\)/)
  })

  it('explains why one pack beats another', () => {
    const packs = rankThemePacks(makeContext(data, team, []))
    const hot = packs.find((p) => p.pack.id === 'hot')!
    const cold = packs.find((p) => p.pack.id === 'cold')!
    expect(packEdgeReason(hot, cold)).toMatch(/best gift for you, burn-4 \(only in this pack\), beats cold's best, burn-2/)
  })
})

describe('shares', () => {
  it('splits into fractions of the total', () => {
    expect(shares([{ value: 3 }, { value: 1 }]).map((x) => x.share)).toEqual([0.75, 0.25])
    expect(shares([{ value: 0 }]).map((x) => x.share)).toEqual([0])
  })
})
