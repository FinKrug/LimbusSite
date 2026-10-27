import { describe, expect, it } from 'vitest'
import { howToGet } from './acquire'
import { gameData } from './data'
import { randomPool } from './fusion'
import { availability } from './plan'
import { DEFAULT_RUN, makeContext, packsByGift } from './scoring'

// Burning Fate is given for clearing Bearers of Weight (EXTREME floors 11-15): you can't fuse
// for it, buy it or get it as a battle reward (Finley couldn't fuse it, 2026-10-27).
const burners = gameData.identities.filter((i) => i.keywords.length === 1 && i.keywords[0] === 'Burn').slice(0, 7)
const gift = (n: string) => gameData.gifts.find((g) => g.name === n)!
const pack = (id: string) => gameData.themePacks.find((p) => p.id === id)!
const byGift = packsByGift(gameData.themePacks)
const fate = gift('Burning Fate')

describe('reward-only gifts', () => {
  it('are marked in the data: EXTREME clear rewards and hidden boss rewards', () => {
    expect(fate.reward_only).toBe('clear')
    expect(gift('The Abandoned Oracle').reward_only).toBe('hidden_boss')
    const bow = pack('bearers-of-weight')
    expect(bow.reward_auto).toBe(true)
    expect(bow.clear_rewards).toContain(fate.id)
    expect(bow.gifts).not.toContain(fate.id)
    expect(bow.gift_pool).not.toContain(fate.id)
    expect(gameData.gifts.filter((g) => g.reward_only)).toHaveLength(14)
  })

  it('never come out of a random fusion, even in their own pack', () => {
    const run = { ...DEFAULT_RUN, difficulty: 'extreme' as const, floors: 15, floor: 12, pack: 'bearers-of-weight' }
    const ctx = makeContext(gameData, burners, [], { run })
    expect(randomPool(ctx, 'Burn', 4, pack('bearers-of-weight')).map((g) => g.id)).not.toContain(fate.id)
    for (const g of gameData.gifts.filter((x) => x.reward_only && x.keyword && x.tier)) {
      expect(randomPool(ctx, g.keyword!, g.tier!, null).map((x) => x.id)).not.toContain(g.id)
    }
  })

  it('say where they really come from', () => {
    const hard = makeContext(gameData, burners, [], { run: { ...DEFAULT_RUN, difficulty: 'hard', floors: 10, floor: 5 } })
    expect(availability(fate, hard, byGift)).toMatchObject({ where: 'no' })
    expect(availability(fate, hard, byGift).text).toMatch(/Bearers of Weight.*EXTREME/)
    const inPack = makeContext(gameData, burners, [], { run: { ...DEFAULT_RUN, difficulty: 'extreme', floors: 15, floor: 12, pack: 'bearers-of-weight' } })
    expect(availability(fate, inPack, byGift)).toMatchObject({ where: 'now' })
    // On the run's last floor the clear reward comes after the run ends.
    const last = makeContext(gameData, burners, [], { run: { ...DEFAULT_RUN, difficulty: 'extreme', floors: 15, floor: 15, pack: 'bearers-of-weight' } })
    expect(availability(fate, last, byGift)).toMatchObject({ where: 'no' })
    expect(availability(fate, last, byGift).text).toMatch(/after the run ends/)
    const lines = howToGet(fate, byGift, new Map(gameData.gifts.map((g) => [g.id, g])), new Set(), gameData.events, gameData.themePacks)
    expect(lines[0]).toMatchObject({ text: 'Clear reward' })
    expect(lines.some((l) => l.kind === 'fusion')).toBe(false)
    expect(lines[0].details!.join(' ')).toMatch(/Not from shops, battle rewards or fusing/)
  })
})
