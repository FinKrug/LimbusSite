import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { canFuse, fodder, isSpare } from './fusion'
import { makeContext } from './scoring'
import { shopFusions } from './shopoverview'

describe('fusing on the shop overview (Finley, 2026-11-15)', () => {
  const run = { difficulty: 'hard' as const, floors: 10, floor: 3, pack: null }
  const seen = new Set<string>()
  const team = gameData.identities.filter((i) => i.keywords.includes('Bleed') && !seen.has(i.sinner) && seen.add(i.sinner)).slice(0, 7)

  it('a recipe you have every piece of is ready, with what goes in', () => {
    const recipe = gameData.fusions.find((f) => !f.super_shop && !f.any_of && f.ingredients.length <= 3
      && gameData.gifts.find((g) => g.id === f.result)?.keyword === 'Bleed')!
    const ctx = makeContext(gameData, team, recipe.ingredients, { run })
    const r = shopFusions(ctx, recipe.ingredients, ['Bleed'], null, false)
    const ready = r.recipes.find((x) => x.plan.result.id === recipe.result)
    expect(ready).toBeTruthy()
    expect(ready!.uses.map((g) => g.id).sort()).toEqual([...recipe.ingredients].sort())
    expect(ready!.move.kind).toBe('fuse')
  })

  it("Wealth can't be fused: never offered as fodder", () => {
    const wealth = gameData.gifts.find((g) => g.name === 'Wealth')!
    expect(canFuse(wealth)).toBe(false)
    const owned = [wealth.id, ...gameData.gifts.filter((g) => g.pools.includes('main') && g.tier === 1).slice(0, 5).map((g) => g.id)]
    const ctx = makeContext(gameData, team, owned, { run })
    expect(fodder(ctx, owned).some((n) => n.gift.id === wealth.id)).toBe(false)
    expect(shopFusions(ctx, owned, ['Bleed'], null, false).ideas.every((i) => i.ingredients.every((n) => n.gift.id !== wealth.id))).toBe(true)
  })
  it('random fusions only use gifts from "Sell or fuse these": none there, none suggested (Finley, 2026-11-20)', () => {
    // Gifts the Bleed team uses: nothing spare, so nothing to fuse.
    const good = gameData.gifts.filter((g) => g.keyword === 'Bleed' && g.pools.includes('main') && !g.fusion_recipe).slice(0, 4).map((g) => g.id)
    const ctx = makeContext(gameData, team, good, { run })
    const spare = fodder(ctx, good).filter(isSpare).map((n) => n.gift.id)
    const r = shopFusions(ctx, good, ['Bleed'], null, false)
    for (const i of r.ideas) expect(i.ingredients.every((n) => spare.includes(n.gift.id))).toBe(true)
    if (spare.length < 2) expect(r.ideas).toEqual([])
    // Off-team gifts are spare: those can be fused.
    const off = gameData.gifts.filter((g) => g.keyword === 'Charge' && g.pools.includes('main') && !g.fusion_recipe && (g.tier ?? 0) <= 2).slice(0, 4).map((g) => g.id)
    const ctx2 = makeContext(gameData, team, off, { run })
    for (const i of shopFusions(ctx2, off, ['Bleed'], null, false).ideas) {
      expect(i.ingredients.every((n) => fodder(ctx2, off).filter(isSpare).some((x) => x.gift.id === n.gift.id))).toBe(true)
    }
  })
})
