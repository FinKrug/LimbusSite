import { describe, expect, it } from 'vitest'
import { floorNotes, freeRefreshes, shopNotes, shopTierCost, shopVestigeTiers, startingCost } from './buffeffects'
import { floorCostFrom } from './costplan'

describe('Starlight buffs during the run (Finley: Faint Vestiges at every shop)', () => {
  it("Chance Comet's shop gift is a Vestige of the tiers its level allows, with buttons to add it", () => {
    expect(shopVestigeTiers({ 'chance-comet': 1 }, 2)).toEqual([1, 2, 3])
    expect(shopVestigeTiers({ 'chance-comet': 2 }, 7)).toEqual([2, 3])
    expect(shopVestigeTiers({ 'chance-comet': 3 }, 7)).toEqual([3, 4])
    expect(shopVestigeTiers({}, 2)).toEqual([])
    const [n] = shopNotes({ 'chance-comet': 1 }, 2, [])
    expect(n.vestiges).toEqual(['dark-vestige', 'faint-vestige', 'twinkling-vestige'])
  })

  it('counts the starting Cost, free refreshes and Binary Star-shop Cost', () => {
    expect(startingCost({})).toBe(200)
    expect(startingCost({ 'star-of-the-beginning': 3, 'star-shower': 3 })).toBe(1150)
    expect(freeRefreshes({ 'star-of-the-beginning': 3 })).toBe(2)
    expect(shopTierCost({ 'binary-star-shop': 1 }, [3, 3])).toBeNull()
    expect(shopTierCost({ 'binary-star-shop': 2 }, [3, 2, 1])).toEqual({ cost: 6, sum: 6, cap: 75 })
    expect(shopTierCost({ 'binary-star-shop': 3 }, Array(60).fill(3))!.cost).toBe(150)
  })

  it('takes free refreshes and Binary Star-shop Cost off the Cost to have at the shop', () => {
    const plain = floorCostFrom([], 1)
    const buffed = floorCostFrom([], 1, { freeRefreshes: 2, onEntry: 20 })
    expect(plain.min).toBe(45)
    expect(buffed.min).toBe(0)
    expect(floorCostFrom([], 1, { freeRefreshes: 1 }).min).toBe(15)
  })

  it('says what you got on entering a floor', () => {
    const f1 = floorNotes({ 'perfected-possibility': 3, 'moon-star-shop': 2 }, 1, 'Rupture')
    expect(f1.find((n) => n.buff.startsWith('Perfected'))!.allVestiges).toEqual(['dark-vestige', 'faint-vestige', 'twinkling-vestige'])
    expect(f1.some((n) => n.text.includes('2 random Tier I gifts'))).toBe(true)
    expect(floorNotes({ 'chance-comet': 3 }, 5, 'Rupture')[0].text).toMatch(/Tier IV Rupture gift/)
    expect(floorNotes({ 'chance-comet': 1 }, 5, null)).toHaveLength(0)
  })
})
