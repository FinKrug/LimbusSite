import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { rareFind } from './rare'
import { makeContext, packsByGift } from './scoring'

describe('rare finds get a celebration (Finley, 2026-11-15)', () => {
  const pf = packsByGift(gameData.themePacks)
  const ctx = makeContext(gameData, gameData.identities.slice(0, 7), [], { run: { difficulty: 'hard', floors: 10, floor: 3, pack: null } })
  const id = (name: string) => gameData.gifts.find((g) => g.name === name)!.id

  it('Wealth rains coins; other luck-only gifts, stars', () => {
    expect(rareFind([id('Wealth')], ctx, pf)?.style).toBe('coins')
    expect(rareFind([id('A Certain Philosophy')], ctx, pf)?.style).toBe('stars')
    expect(rareFind([id('Bongy Plush')], ctx, pf)?.style).toBe('stars')
  })

  it('ordinary gifts are not', () => {
    const shop = gameData.gifts.filter((g) => g.pools.includes('main') && (g.tier ?? 9) <= 4).slice(0, 20).map((g) => g.id)
    expect(rareFind(shop, ctx, pf)).toBeNull()
  })
})
