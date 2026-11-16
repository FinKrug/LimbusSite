import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { makeContext, packsByGift, rankGifts } from './scoring'
import { availability } from './plan'
import { LIST_PRICES, pricesFor } from './shopprices'
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
