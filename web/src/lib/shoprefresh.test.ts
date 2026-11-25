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
    // The +15 count is shared, and the 3 free ones count too (Finley, 2026-11-20): paid ones start at +45.
    a.steps.filter((s) => !s.free).forEach((s, i) => expect(s.price).toBe((s.kind === 'keyword' ? 90 : 15) + 15 * (3 + i)))
    // Free ones you haven't used block paying: no paid refresh in a plan that skips a free one.
    const used = refreshAdvice(ctx, ranked, now, moves, { cost: 500, buffs: { 'star-of-the-beginning': 3, 'moon-star-shop': 1 }, freeUsed: { normal: 2, keyword: 1 } })
    expect(used.free).toEqual({ normal: 0, keyword: 0 })
    used.steps.forEach((s, i) => expect(s.price).toBe((s.kind === 'keyword' ? 90 : 15) + 15 * (3 + i)))
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
  it('free refreshes are always used, and a free keyword one still says which keyword (Finley, 2026-11-23)', () => {
    // A sure move far better than any gift: nothing in the shop is worth refreshing for.
    const big = [{ kind: 'enhance', ratio: 1e6, chance: false, cost: 100, key: 'x' }] as never
    const a = refreshAdvice(ctx, ranked, now, big, { cost: 500, buffs: { 'star-of-the-beginning': 1, 'moon-star-shop': 1 } })
    expect(a.wanted).toEqual([])
    expect(a.keyword?.keyword).toBeTruthy()
    expect(a.keyword?.weak).toBe(true)
    expect(a.steps.map((s) => [s.kind, s.free])).toEqual(expect.arrayContaining([['keyword', true], ['normal', true]]))
    expect(a.steps.every((s) => s.free)).toBe(true)
    // Without free ones: don't refresh.
    expect(refreshAdvice(ctx, ranked, now, big, { cost: 500 }).steps).toEqual([])
  })
})

describe('refreshing for one gift (Finley, 2026-11-24)', () => {
  const pf = packsByGift(gameData.themePacks)
  const seen = new Set<string>()
  const team = gameData.identities.filter((i) => i.keywords.includes('Rupture') && !seen.has(i.sinner) && seen.add(i.sinner)).slice(0, 7)
  const ctx = makeContext(gameData, team, ['crown-of-roses'], { run: { difficulty: 'hard', floors: 10, floor: 3, pack: null } })
  const ranked = rankGifts(ctx)
  const now = new Set(gameData.gifts.filter((g) => availability(g, ctx, pf).where === 'now').map((g) => g.id))
  const moves = shopMoves(ctx, ranked, {}, now, planSwaps(team, {}, [], { egos: gameData.egos, run: ctx.run }))
  const a = refreshAdvice(ctx, ranked, now, moves, { cost: 1000 })

  it('gives each wanted gift a point past which refreshing for it alone costs more than it is worth', () => {
    expect(a.hunts.length).toBe(a.wanted.filter((w) => w.price <= 1000).length)
    for (const h of a.hunts) {
      expect(h.stop).not.toBeNull()
      // Prices only go up, and the stop is dearer than every refresh in the plan.
      h.paid.forEach((x, i) => { if (i && x.kind === h.paid[i - 1].kind) expect(x.price).toBeGreaterThan(h.paid[i - 1].price) })
      expect(h.spent).toBe(h.paid.reduce((s, x) => s + x.price, 0))
      expect(h.find).toBeGreaterThanOrEqual(0)
      expect(h.find).toBeLessThanOrEqual(1)
    }
    // A better gift is worth at least as many refreshes as a worse one at the same price and odds.
    const top = a.hunts[0]
    expect(top.paid.length).toBeGreaterThanOrEqual(Math.min(...a.hunts.map((h) => h.paid.length)))
  })

  it('stops for Cost: never plans refreshes that leave too little to buy the gift', () => {
    const tight = refreshAdvice(ctx, ranked, now, moves, { cost: 300 })
    expect(tight.hunts.every((h) => h.price <= 300)).toBe(true)
    for (const h of tight.hunts) expect(300 - h.spent).toBeGreaterThanOrEqual(h.price)
    const broke = tight.hunts.find((h) => h.price > 300 - 15)
    if (broke) { expect(broke.paid.length).toBe(0); expect(broke.stopReason).toBe('cost') }
  })

  it('uses keyword refreshes for a gift when they pay off more', () => {
    const kw = a.hunts.find((h) => h.paid.some((x) => x.kind === 'keyword'))
    if (kw) expect(kw.keyword!).toBeGreaterThan(kw.normal)
  })
})
