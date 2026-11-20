import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { availability } from './plan'
import { makeContext, packsByGift, rankGifts } from './scoring'
import { NO_SHOP_SWAPS, SHOP_SWAPS, limitSwaps, shopMoves, shopPlan, swapsLeft, worthLabel, WORTH, type ShopMove } from './shopoverview'
import { planSwaps } from './skillswap'

describe('shop overview: buy, enhance and swap on one list (Finley, 2026-11-15)', () => {
  const pf = packsByGift(gameData.themePacks)
  const sinners = new Set<string>()
  const team = gameData.identities.filter((i) => i.keywords.includes('Bleed') && !sinners.has(i.sinner) && sinners.add(i.sinner)).slice(0, 7)
  const owned = gameData.gifts.filter((g) => g.keyword === 'Bleed' && g.pools.includes('main') && (g.tier ?? 9) <= 2).slice(0, 4).map((g) => g.id)
  const ctx = makeContext(gameData, team, owned, { run: { difficulty: 'hard', floors: 10, floor: 3, pack: null } })
  const now = new Set(gameData.gifts.filter((g) => availability(g, ctx, pf).where === 'now').map((g) => g.id))
  const plans = planSwaps(team, {}, owned.map((id) => ctx.giftsById.get(id)!), { egos: gameData.egos, run: ctx.run })
  const moves = shopMoves(ctx, rankGifts(ctx), {}, now, plans)

  it('lists all three kinds, best value per Cost first', () => {
    expect(new Set(moves.map((m) => m.kind))).toEqual(new Set(['buy', 'enhance', 'swap']))
    for (let i = 1; i < moves.length; i++) expect(moves[i - 1].ratio).toBeGreaterThanOrEqual(moves[i].ratio)
  })

  it("only each gift's next level, gifts you don't have, one swap per identity", () => {
    const enh = moves.filter((m) => m.kind === 'enhance')
    expect(new Set(enh.map((m) => m.gift!.id)).size).toBe(enh.length)
    expect(enh.every((m) => ctx.owned.has(m.gift!.id) && m.from === 0)).toBe(true)
    expect(moves.filter((m) => m.kind === 'buy').every((m) => !ctx.owned.has(m.gift!.id))).toBe(true)
    const sw = moves.filter((m) => m.kind === 'swap')
    expect(new Set(sw.map((m) => m.identity!.id)).size).toBe(sw.length)
  })

  it('the plan fits the Cost, skips what is not worth it, and takes the best first', () => {
    const p = shopPlan(moves, 300)
    expect(p.spent).toBeLessThanOrEqual(300)
    expect(p.moves.every((m) => m.ratio >= WORTH)).toBe(true)
    const first = moves.find((m) => m.ratio >= WORTH && m.cost <= 300)
    expect(p.moves[0]).toBe(first)
    expect(shopPlan(moves, 0).moves).toEqual([])
    // A regular shop offers Skill Replacement for one random sinner: one swap per plan, with the others as stand-ins.
    const big = shopPlan(moves, 2000)
    expect(big.moves.filter((m) => m.kind === 'swap').length).toBeLessThanOrEqual(1)
    if (big.swapFor.length) expect(big.swapFor[0]).toBe(big.moves.find((m) => m.kind === 'swap'))
  })

  it('labels by value per Cost', () => {
    const m = (ratio: number) => ({ ratio } as ShopMove)
    expect(worthLabel(m(1.5).ratio).text).toBe('Top pick')
    expect(worthLabel(m(0.1).ratio).text).toBe('Spare Cost only')
  })

  it('Super Shop: ID Skill Search adds a sure swap you pick, at its own price (Finley, 2026-11-15)', () => {
    const sup = shopMoves(ctx, rankGifts(ctx), {}, now, plans, { superShop: true })
    const picks = sup.filter((m) => m.pick)
    expect(picks.length).toBeGreaterThan(0)
    for (const p of picks) {
      const random = sup.find((m) => m.kind === 'swap' && !m.pick && m.identity!.id === p.identity!.id)!
      expect(p.chance).toBe(false)
      expect(p.cost).toBe(random.cost * 2)
      expect(p.ratio).toBeCloseTo(random.ratio / 2)
    }
    expect(moves.some((m) => m.pick)).toBe(false)
    const plan = shopPlan(sup, 5000, null, { superShop: true })
    const sw = plan.moves.filter((m) => m.kind === 'swap')
    expect(sw.filter((m) => m.pick).length).toBeLessThanOrEqual(1)
    expect(sw.filter((m) => !m.pick).length).toBeLessThanOrEqual(2)
    expect(new Set(sw.map((m) => m.identity!.id)).size).toBe(sw.length)
  })
  it('a regular shop allows 1 skill swap, a Super Shop 3 (2 offered + 1 Skill Search), less what you did there (Finley)', () => {
    expect(SHOP_SWAPS.regular.random + SHOP_SWAPS.regular.search).toBe(1)
    expect(SHOP_SWAPS.super.random + SHOP_SWAPS.super.search).toBe(3)
    expect(swapsLeft(NO_SHOP_SWAPS, false)).toEqual({ random: 1, search: 0, total: 1, max: 1 })
    const usedOne = { floor: 4, random: 1, search: 0 }
    expect(swapsLeft(usedOne, false).total).toBe(0)
    expect(swapsLeft(usedOne, true)).toEqual({ random: 1, search: 1, total: 2, max: 3 })
    // Once it's used, a regular shop's list and plan have no swaps.
    expect(limitSwaps(moves, swapsLeft(usedOne, false)).some((m) => m.kind === 'swap')).toBe(false)
    expect(shopPlan(moves, 2000, null, { done: usedOne }).moves.some((m) => m.kind === 'swap')).toBe(false)
    // A Super Shop with 1 offered swap done: at most 1 more offered + 1 Skill Search.
    const sup = shopMoves(ctx, rankGifts(ctx), {}, now, plans, { superShop: true })
    const plan = shopPlan(sup, 5000, null, { superShop: true, done: usedOne })
    const sw = plan.moves.filter((m) => m.kind === 'swap')
    expect(sw.filter((m) => !m.pick).length).toBeLessThanOrEqual(1)
    expect(sw.length).toBeLessThanOrEqual(2)
  })
})
