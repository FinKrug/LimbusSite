import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { availability, comingUp, fusionTargets, getNow, pickPriority, setTargets } from './plan'
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

  it("once this floor's pack is picked, other packs' gifts wait, and played packs don't come back", () => {
    const bolus = gameData.gifts.find((g) => g.id === 'heishou-bolus-mao')!
    // Floor 5, Spring Cultivation picked: Nocturnal Sweeping BokGak's gift isn't on this floor.
    const picked = makeContext(gameData, team, [], { run: run({ floor: 5, pack: 'spring-cultivation' }) })
    expect(availability(bolus, picked, pfg).where).toBe('later')
    // BokGak already played on floor 4: no other pack has it.
    const played = makeContext(gameData, team, [], {
      run: run({ floor: 5, pack: 'spring-cultivation', visited: { 4: 'nocturnal-sweeping-bokgak', 5: 'spring-cultivation' } }),
    })
    expect(availability(bolus, played, pfg).where).toBe('no')
  })

  it("treats a hidden pack's exclusive as luck, not something to plan for", () => {
    const bongy = gameData.gifts.find((g) => g.id === 'bongy-plush')!
    const c = makeContext(gameData, team, [], { run: run({ floor: 5 }) })
    const w = availability(bongy, c, pfg)
    expect(w.where).toBe('luck')
    expect(w.text).toMatch(/The B\.E\., a rare hidden pack \(about 1 in 5,000 times\)/)
    // Once you're in it, it's right here.
    const inIt = makeContext(gameData, team, [], { run: run({ floor: 5, pack: 'the-b-e' }) })
    expect(availability(bongy, inIt, pfg).where).toBe('now')
  })

  it('puts a General theme-pack gift ahead of a keyword one worth about the same', () => {
    const base = gameData.gifts.find((g) => g.pools.includes('themed') && !g.pools.includes('main') && g.keyword === null)!
    const score = (keyword: string | null) => ({ gift: { ...base, keyword }, score: 10, rating: 0, fit: 1, synergy: false, reasons: [], parts: [] })
    expect(pickPriority(score(null))).toBeGreaterThan(pickPriority(score('Burn')) * 1.1)
    // Main-pool gifts are in shops anywhere: no change.
    const main = { ...score(null), gift: { ...base, keyword: null, pools: ['main'] as typeof base.pools } }
    expect(pickPriority(main)).toBe(10)
  })

  it('shows set pieces you fused into a working gift as had', () => {
    const rupture = gameData.identities.filter((i) => i.keywords.includes('Rupture'))
      .filter((i, k, a) => a.findIndex((x) => x.sinner === i.sinner) === k).slice(0, 7)
    const c = makeContext(gameData, rupture, ['enrapturing-trance', 'thrill'], { run: run({ floor: 4 }) })
    const set = setTargets(c, pfg, 10).find((t) => t.combo.id === 'rupture-set')!
    const talisman = set.pieces.find((p) => p.gift.id === 'talisman-bundle')!
    expect(talisman.have).toBe(true)
    expect(talisman.via?.id).toBe('enrapturing-trance')
    expect(set.pieces.filter((p) => p.have)).toHaveLength(3)
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
})
