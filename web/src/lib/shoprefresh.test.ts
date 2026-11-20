import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { availability } from './plan'
import { makeContext, packsByGift, rankGifts } from './scoring'
import { shopMoves } from './shopoverview'
import { atLeastOne, refreshAdvice, refreshPrice, shopSlots } from './shoprefresh'
import { planSwaps } from './skillswap'

describe('shop refreshes, both kinds (Finley, 2026-11-15)', () => {
  it('prices: 15 +15 each, keyword 90 +15, the count shared', () => {
    expect([0, 1, 2].map((n) => refreshPrice('normal', n))).toEqual([15, 30, 45])
    expect([0, 2].map((n) => refreshPrice('keyword', n))).toEqual([90, 120])
  })

  it('gift slots: 4, 7 in a Super Shop, +1 each for Star of the Beginning and Binary Star-shop', () => {
    expect(shopSlots({}, false)).toBe(4)
    expect(shopSlots({}, true)).toBe(7)
    expect(shopSlots({ 'star-of-the-beginning': 1, 'binary-star-shop': 2 }, false)).toBe(6)
  })

  it('odds of at least one wanted gift in a roll', () => {
    expect(atLeastOne(10, 0, 4)).toBe(0)
    expect(atLeastOne(10, 1, 4)).toBeCloseTo(0.4)
    expect(atLeastOne(5, 2, 4)).toBe(1)
  })

  const pf = packsByGift(gameData.themePacks)
  const seen = new Set<string>()
  const team = gameData.identities.filter((i) => i.keywords.includes('Burn') && !seen.has(i.sinner) && seen.add(i.sinner)).slice(0, 7)
  const owned = gameData.gifts.filter((g) => g.keyword === 'Burn' && g.pools.includes('main') && (g.tier ?? 9) <= 2).slice(0, 4).map((g) => g.id)
  const ctx = makeContext(gameData, team, owned, { run: { difficulty: 'hard', floors: 10, floor: 3, pack: null } })
  const ranked = rankGifts(ctx)
  const now = new Set(gameData.gifts.filter((g) => availability(g, ctx, pf).where === 'now').map((g) => g.id))
  const moves = shopMoves(ctx, ranked, {}, now, planSwaps(team, {}, owned.map((id) => ctx.giftsById.get(id)!), { egos: gameData.egos, run: ctx.run }))

  it("picks the team's keyword, and a keyword refresh beats a normal one at finding its gifts", () => {
    const a = refreshAdvice(ctx, ranked, now, moves, { cost: 500 })
    expect(a.keyword?.keyword).toBe('Burn')
    expect(a.keyword!.giftChance).toBeGreaterThan(a.normal.giftChance)
    expect(a.wanted.every((w) => w.ratio > a.fallback)).toBe(true)
  })

  it('free ones first, then paid ones that fit the Cost', () => {
    const a = refreshAdvice(ctx, ranked, now, moves, { cost: 500, buffs: { 'star-of-the-beginning': 3, 'moon-star-shop': 1 } })
    const free = a.steps.filter((s) => s.free)
    expect(free.length).toBe(3)
    expect(a.steps.slice(0, 3).every((s) => s.free)).toBe(true)
    const paid = a.steps.filter((s) => !s.free).reduce((x, s) => x + s.price, 0)
    expect(paid).toBeLessThanOrEqual(500)
    // The +15 count is shared: each paid one costs 15 more than the same kind would have before it.
    a.steps.filter((s) => !s.free).forEach((s, i) => expect(s.price).toBe((s.kind === 'keyword' ? 90 : 15) + 15 * i))
  })

  it('with no Cost, no paid refreshes; once some are done, prices go on from there and the free ones are gone', () => {
    expect(refreshAdvice(ctx, ranked, now, moves, { cost: 0 }).steps.filter((s) => !s.free)).toEqual([])
    const later = refreshAdvice(ctx, ranked, now, moves, { cost: 1000, paidDone: 2, buffs: { 'star-of-the-beginning': 3 } })
    expect(later.free.normal).toBe(0)
    expect(later.steps[0].price).toBeGreaterThanOrEqual(45)
  })
  it('free refreshes you marked as used are gone from the plan (Finley, 2026-11-19)', () => {
    const buffs = { 'star-of-the-beginning': 3, 'moon-star-shop': 3 }
    const all = refreshAdvice(ctx, ranked, now, moves, { cost: 500, buffs })
    expect(all.freeTotal).toEqual({ normal: 2, keyword: 2 })
    expect(all.free).toEqual({ normal: 2, keyword: 2 })
    const some = refreshAdvice(ctx, ranked, now, moves, { cost: 500, buffs, freeUsed: { normal: 1, keyword: 2 } })
    expect(some.free).toEqual({ normal: 1, keyword: 0 })
    expect(some.steps.filter((s) => s.free).length).toBeLessThanOrEqual(1)
    // Marked, then a paid one recorded: the free ones left still count.
    expect(refreshAdvice(ctx, ranked, now, moves, { cost: 500, buffs, paidDone: 1, freeUsed: { normal: 1, keyword: 0 } }).free).toEqual({ normal: 1, keyword: 2 })
  })
})
