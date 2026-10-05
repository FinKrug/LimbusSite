import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { availability, comingUp, fusionTargets, getNow, setTargets } from './plan'
import { makeContext, packOnFloor, packsByGift, rankGifts, type RunSettings } from './scoring'
import type { Identity } from './types'

const pfg = packsByGift(gameData.themePacks)
const heishou = gameData.identities.filter((i) => i.traits.some((t) => t.startsWith('Heishou Pack')))
const seen = new Set<string>()
const team: Identity[] = heishou.filter((i) => !seen.has(i.sinner) && !!seen.add(i.sinner)).slice(0, 7)
const run = (over: Partial<RunSettings> = {}): RunSettings => ({ difficulty: 'hard', floors: 10, floor: 1, pack: null, ...over })

describe('where a gift can come from', () => {
  const ctx = makeContext(gameData, team, [], { run: run() })
  it('main-pool gifts come from shops and rewards; fusion results only by fusing', () => {
    const main = gameData.gifts.find((g) => g.pools.includes('main') && !g.fusion_recipe)!
    expect(availability(main, ctx, pfg).where).toBe('now')
    const fused = gameData.gifts.find((g) => g.fusion_recipe)!
    expect(availability(fused, ctx, pfg).where).toBe('fuse')
  })

  it('theme-pack gifts only when one of their packs can show up on this floor', () => {
    const themed = gameData.gifts.filter((g) => g.pools.includes('themed') && !g.fusion_recipe)
    for (const g of themed.slice(0, 40)) {
      const onFloor = (pfg.get(g.id) ?? []).some((p) => packOnFloor(p, 'hard', 1))
      expect(availability(g, ctx, pfg).where === 'now').toBe(onFloor)
    }
  })

  it('a picked pack makes its pool available', () => {
    const pack = gameData.themePacks.find((p) => p.gift_pool.length > 0)!
    const g = gameData.gifts.find((x) => pack.gift_pool.includes(x.id) && !x.fusion_recipe)!
    const c = makeContext(gameData, team, [], { run: run({ pack: pack.id }) })
    expect(availability(g, c, pfg).text).toMatch(/This floor's pack/)
  })
})

describe('your plan', () => {
  it('gets only what this floor offers, and lists later-floor picks separately', () => {
    const ctx = makeContext(gameData, team, [], { run: run() })
    const ranked = rankGifts(ctx)
    const now = getNow(ranked, ctx, pfg)
    expect(now.length).toBeGreaterThan(0)
    expect(now.every((p) => p.where.where === 'now')).toBe(true)
    expect(comingUp(ranked, ctx, pfg).every((p) => p.where.where === 'later')).toBe(true)
  })

  it('Lunar Memory needs a Super Shop, so a Normal run marks it blocked', () => {
    const memories = ['sundered-memory', 'punctured-memory', 'crushed-memory']
    const normal = makeContext(gameData, team, memories, { run: run({ difficulty: 'normal', floors: 5 }) })
    const lunar = fusionTargets(normal, pfg, 60).find((f) => f.result.id === 'lunar-memory')
    expect(lunar?.blocked).toMatch(/Super Shop/)
    expect(lunar?.anyOf?.count).toBe(2)
    const hard = makeContext(gameData, team, memories, { run: run() })
    expect(fusionTargets(hard, pfg, 60).find((f) => f.result.id === 'lunar-memory')?.blocked).toBeUndefined()
  })

  it('always lists your own gift sets', () => {
    const mine = { id: 'custom-x', name: 'Mine', gifts: ['downpour', 'melted-eyeball'], why: '', custom: true }
    const ctx = makeContext(gameData, team, ['downpour', 'melted-eyeball'], { run: run(), combos: [mine] })
    expect(setTargets(ctx, pfg, 0).map((t) => t.combo.id)).toEqual(['custom-x'])
  })
})
