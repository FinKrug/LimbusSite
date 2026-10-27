import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { availability } from './plan'
import { makeContext, packsByGift, rankGifts } from './scoring'
import { shopAdvice } from './shopadvice'

const burners = gameData.identities.filter((i) => (i.keywords as string[]).includes('Burn')).slice(0, 7)
const run = { difficulty: 'hard' as const, floors: 10, floor: 4, pack: null }
const advise = (owned: string[], levels: Record<string, number> = {}, cost: number | null = null) => {
  const ctx = makeContext(gameData, burners, owned, { run })
  const pfg = packsByGift(gameData.themePacks)
  const now = new Set(gameData.gifts.filter((g) => availability(g, ctx, pfg).where === 'now').map((g) => g.id))
  return shopAdvice(ctx, rankGifts(ctx), levels, now, cost)
}

describe('shop advice: enhance or buy (Finley)', () => {
  it('says to enhance first when an upgrade beats buying your top picks', () => {
    const a = advise(['thunderbranch', 'rest', 'glimpse-of-flames', 'pink-bouquet', 'downpour'])
    expect(a.kind).toBe('enhance')
    expect(a.enhance[0].gift.id).toBe('glimpse-of-flames')
    expect(a.versusBuy!).toBeGreaterThan(1)
    // Once it's maxed, the advice moves on.
    expect(advise(['thunderbranch', 'rest', 'glimpse-of-flames', 'pink-bouquet', 'downpour'], { 'glimpse-of-flames': 2 }).enhance
      .some((m) => m.gift.id === 'glimpse-of-flames')).toBe(false)
  }, 30000)

  it('says to buy first when shop gifts do more per Cost', () => {
    const a = advise(['burning-intellect', 'dust-to-dust', 'ashes-to-ashes', 'fiery-down', 'sunshower'])
    expect(a.kind).toBe('buy')
    expect(a.better.length).toBeGreaterThan(0)
    expect(a.better.every((b) => b.ratio > a.enhance[0].ratio)).toBe(true)
  }, 30000)

  it('has nothing to say without gifts to enhance', () => {
    expect(advise([]).kind).toBe('none')
  }, 30000)
})
