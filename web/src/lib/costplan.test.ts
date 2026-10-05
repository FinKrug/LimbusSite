import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { costPlan, floorCost, shopGift } from './costplan'
import { makeContext } from './scoring'

const burnTeam = gameData.identities.filter((i) => i.keywords.includes('Burn') && i.skills?.length === 3).slice(0, 7)

describe('Cost to have at each shop', () => {
  it('only counts gifts a regular shop sells', () => {
    const g = gameData.gifts[0]
    expect(shopGift({ ...g, pools: ['fusion'] })).toBe(false)
    expect(shopGift({ ...g, pools: ['main'], tier: 5 })).toBe(false)
    expect(shopGift({ ...g, pools: ['main'], tier: 2, cost: 200 })).toBe(true)
  })

  it('covers your best-value shop gift, refreshes, and a heal from floor 3', () => {
    const ctx = makeContext(gameData, burnTeam, [], { run: { difficulty: 'normal', floors: 5, floor: 1, pack: null } })
    const f1 = floorCost(ctx, 1)
    const f3 = floorCost(ctx, 3)
    expect(f1.value && shopGift(f1.value)).toBe(true)
    expect(f1.min).toBe(Math.ceil((f1.value!.cost! + 45) / 5) * 5)
    expect(f1.comfortable).toBeGreaterThanOrEqual(f1.min)
    expect(f3.parts.some((p) => p.label === 'A heal')).toBe(true)
    expect(f1.parts.some((p) => p.label === 'A heal')).toBe(false)
  })

  it('has a row for every floor of the run', () => {
    const ctx = makeContext(gameData, burnTeam, [], { run: { difficulty: 'hard', floors: 10, floor: null, pack: null } })
    const plan = costPlan(ctx)
    expect(plan.map((f) => f.floor)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})
