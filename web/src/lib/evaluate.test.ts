import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { evaluateGift, evaluatePack } from './evaluate'
import { makeContext, packOnFloor, packsByGift, rankGifts } from './scoring'

const burners = gameData.identities.filter((i) => i.keywords.length === 1 && i.keywords[0] === 'Burn').slice(0, 7)
const gift = (n: string) => gameData.gifts.find((g) => g.name === n)!
const pack = (n: string) => gameData.themePacks.find((p) => p.name === n)!
const byGift = packsByGift(gameData.themePacks)

describe('evaluator', () => {
  it('gives pros, cons and a verdict for a gift', () => {
    const e = evaluateGift(gift('White Gossypium'), makeContext(gameData, burners, []), byGift)
    expect(e.verdict).toBe('skip')
    expect(e.cons.some((c) => /Un-staggers enemies/.test(c))).toBe(true)
    const top = evaluateGift(gift('Glimpse of Flames'), makeContext(gameData, burners, []), byGift)
    expect(top.pros.length).toBeGreaterThan(0)
  })

  it('explains recipe-only gifts and Super Shop needs', () => {
    const e = evaluateGift(gift('Lunar Memory'), makeContext(gameData, burners, []), byGift)
    expect(e.notes.some((n) => /Only from fusing .*Sin Fragments \(Super Shop only/.test(n))).toBe(true)
  })

  it('does not rank a pack on a floor it cannot appear on', () => {
    const ctx = makeContext(gameData, burners, [], { run: { difficulty: 'hard', floors: 10, floor: 1, pack: null } })
    const e = evaluatePack(pack('Spring Cultivation'), ctx)
    expect(e.cons[0]).toMatch(/Can't show up on floor 1/)
    expect([...e.pros, ...e.notes, ...e.cons].some((x) => /packs on floor 1/.test(x))).toBe(false)
  })

  it("isn't a wall of Skips: good gifts that aren't the very best are Take or Maybe", { timeout: 30000 }, () => {
    // Lunar Memory used to set the bar, so even a Burn team's #11 gift read Skip.
    const ctx = makeContext(gameData, burners, [], { run: { difficulty: 'hard', floors: 10, floor: 3, pack: null } })
    const ranked = rankGifts(ctx)
    const verdicts = ranked.slice(0, 40).map((g) => evaluateGift(g.gift, ctx, byGift).verdict)
    expect(verdicts.slice(0, 10).every((v) => v === 'take')).toBe(true)
    expect(verdicts.filter((v) => v === 'skip').length).toBeLessThan(5)
    // Off-team gifts at the bottom are still a Skip.
    const last = evaluateGift(ranked[ranked.length - 1].gift, ctx, byGift)
    expect(last.verdict).toBe('skip')
  })

  it('says what a Maybe depends on', { timeout: 30000 }, () => {
    const ctx = makeContext(gameData, burners, [], { run: { difficulty: 'hard', floors: 10, floor: 3, pack: null } })
    const maybes = rankGifts(ctx).slice(10, 90).map((g) => evaluateGift(g.gift, ctx, byGift)).filter((e) => e.verdict === 'maybe')
    expect(maybes.length).toBeGreaterThan(30)
    expect(maybes.some((e) => /Cost left after your top picks|Cost to spare/.test(e.headline))).toBe(true)
    expect(maybes.every((e) => /^(A solid pick|Worth it if)/.test(e.headline))).toBe(true)
  })

  it('judges a pack against the other packs on its floor', { timeout: 30000 }, () => {
    const ctx = makeContext(gameData, burners, [], { run: { difficulty: 'hard', floors: 10, floor: 5, pack: null } })
    const packs = gameData.themePacks.filter((p) => packOnFloor(p, 'hard', 5))
    const v = packs.map((p) => evaluatePack(p, ctx).verdict)
    expect(v.filter((x) => x === 'take').length).toBeGreaterThanOrEqual(3)
    expect(v.filter((x) => x === 'maybe').length).toBeGreaterThan(packs.length / 4)
  })
})
