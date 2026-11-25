import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { makeContext, packsByGift, rankGifts } from './scoring'
import { availability } from './plan'
import { LIST_PRICES, priceScale, pricesFor } from './shopprices'
import { inflationFrom, offerKey, ADVERSITIES } from './adversity'
import { planSwaps } from './skillswap'
import { floorCost } from './costplan'
import { shopBuys } from './shopadvice'
import { planUpgrades, shopValue } from './upgrades'
import { refreshPrice } from './shoprefresh'

describe('shop prices with the gifts you have (Finley, 2026-11-15: Wealth)', () => {
  const g = (n: string) => gameData.gifts.find((x) => x.name === n)!
  const team = gameData.identities.slice(0, 7)
  const run = { difficulty: 'hard' as const, floors: 10, floor: 3, pack: null }
  const base = makeContext(gameData, team, [g('Thrill').id], { run })
  const rich = makeContext(gameData, team, [g('Thrill').id, g('Wealth').id], { run })

  it('Wealth: every gift and every enhance step costs 1', () => {
    const p = pricesFor(rich)
    expect(p.wealth).toBe(true)
    expect(p.gift(g('Thrill'))).toBe(1)
    expect(p.enhance(g('Thrill'), 0, 2)).toBe(2)
    expect(p.swap(120)).toBe(120)
    expect(LIST_PRICES.gift(g('Thrill'))).toBe(g('Thrill').cost)
  })

  it('the -30% gifts', () => {
    const p = pricesFor(makeContext(gameData, team, ['Prestige Card', 'Renewed Merch', 'Trial Plan Guide', 'Pre-order Discount'].map((n) => g(n).id), { run }))
    expect(p.gift(g('Thrill'))).toBe(Math.round(g('Thrill').cost! * 0.7))
    expect(p.swap(120)).toBe(84)
    expect(refreshPrice('normal', 0, p)).toBe(11)
    expect(refreshPrice('keyword', 0, p)).toBe(90)
  })

  it('upgrades, buys and what 100 Cost buys use what you pay', () => {
    expect(planUpgrades(rich).order.every((m) => m.cost <= 2)).toBe(true)
    expect(shopValue(rich)).toBeGreaterThan(shopValue(base) * 50)
    const pf = packsByGift(gameData.themePacks)
    const now = new Set(gameData.gifts.filter((x) => availability(x, rich, pf).where === 'now').map((x) => x.id))
    expect(shopBuys(rich, rankGifts(rich), now, shopValue(rich), 5).every((b) => b.price === 1)).toBe(true)
  })
})

describe('Inflation raises every shop price (Finley, 2026-11-24)', () => {
  const key = (id: string) => offerKey(ADVERSITIES.find((a) => a.id === id)!)
  const team = gameData.identities.slice(0, 7)
  const run = (floor: number, taken: string[]) => ({ difficulty: 'extreme' as const, floors: 15, floor, pack: null, inflation: inflationFrom(taken.map(key)) })
  const gift = gameData.gifts.find((g) => g.pools.includes('main') && g.cost && g.tier === 3)!

  it('counts from the floor after it is chosen: I doubles, II triples', () => {
    expect(inflationFrom([key('inflation-i')])).toEqual([{ from: 11, scale: 2 }])
    expect(priceScale(run(10, ['inflation-i']))).toBe(1)
    expect(priceScale(run(11, ['inflation-i']))).toBe(2)
    expect(priceScale(run(12, ['inflation-i', 'inflation-ii']))).toBe(2)
    expect(priceScale(run(13, ['inflation-i', 'inflation-ii']))).toBe(3)
  })

  it('applies to gifts, enhancing, swaps, refreshes and Skill Search', () => {
    const ctx = makeContext(gameData, team, [], { run: run(11, ['inflation-i']) })
    const p = pricesFor(ctx)
    expect(p.gift(gift)).toBe(gift.cost! * 2)
    expect(p.enhance(gift, 0, 1)).toBe(LIST_PRICES.enhance(gift, 0, 1) * 2)
    expect(p.swap(45)).toBe(90)
    expect(p.refresh('keyword', 90)).toBe(180)
    expect(p.discounts.some((d) => d.name === 'Inflation I')).toBe(true)
    const plans = planSwaps(team.slice(0, 5), {}, [], { egos: gameData.egos, run: ctx.run })
    const o = plans.flatMap((x) => x.options)[0]
    expect(o.cost % 2).toBe(0)
    expect([180, 300, 480]).toContain(o.search)
  })

  it("the floor plan prices each floor with what's in effect there", () => {
    const ctx = makeContext(gameData, team, [], { run: run(10, ['inflation-i']) })
    expect(floorCost(ctx, 12).min).toBeGreaterThan(floorCost(ctx, 10).min * 1.5)
  })
})
