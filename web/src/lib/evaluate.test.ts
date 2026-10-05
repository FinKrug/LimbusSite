import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { evaluateGift, evaluatePack } from './evaluate'
import { makeContext, packsByGift } from './scoring'

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
})
