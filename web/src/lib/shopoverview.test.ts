import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { availability } from './plan'
import { makeContext, packsByGift, rankGifts } from './scoring'
import { shopMoves, shopPlan, worthLabel, WORTH, type ShopMove } from './shopoverview'
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
})
