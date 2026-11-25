import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { makeContext } from './scoring'
import { HIDDEN_STAGES, hiddenStageAdvice, hiddenStagesFor } from './hiddenstage'
import { inflationFrom, offerKey, ADVERSITIES } from './adversity'

describe('hidden stages: the Dimension Reversal Zone (Finley, 2026-11-24)', () => {
  const team = gameData.identities.filter((i) => i.keywords.includes('Rupture')).slice(0, 7)
  const zone = HIDDEN_STAGES[0]
  const base = { difficulty: 'extreme' as const, floors: 15, floor: 12, pack: 'line-4-section-3' }

  it('belongs to Line 4 - Section #3, which is in the data', () => {
    expect(hiddenStagesFor('line-4-section-3')).toEqual([zone])
    expect(hiddenStagesFor('line-5')).toEqual([])
    expect(gameData.themePacks.some((p) => p.id === 'line-4-section-3')).toBe(true)
  })

  it('says enter, with what the 1000 Cost buys, unless fights are going badly', () => {
    const ok = hiddenStageAdvice(makeContext(gameData, team, [], { run: base }), zone)
    expect(ok.verdict).toBe('enter')
    expect(ok.gifts).toBeGreaterThanOrEqual(2)
    expect(ok.superShop).toBe(50)
    expect(ok.why.join(' ')).toMatch(/can't leave/)
    const bad = hiddenStageAdvice(makeContext(gameData, team, [], { run: { ...base, struggling: true } }), zone)
    expect(bad.verdict).toBe('skip')
  })

  it('counts Inflation: the Cost buys fewer gifts', () => {
    const key = offerKey(ADVERSITIES.find((a) => a.id === 'inflation-i')!)
    const plain = hiddenStageAdvice(makeContext(gameData, team, [], { run: base }), zone)
    const inflated = hiddenStageAdvice(makeContext(gameData, team, [], { run: { ...base, inflation: inflationFrom([key]) } }), zone)
    expect(inflated.scale).toBe(2)
    expect(inflated.gifts).toBeLessThan(plain.gifts)
  })

  it('no Super Shop bonus on the last floor', () => {
    expect(hiddenStageAdvice(makeContext(gameData, team, [], { run: { ...base, floor: 15 } }), zone).superShop).toBe(0)
  })
})

describe('the hidden boss also gives A Maestro\'s Ring-Turned-Artwork (Finley, 2026-11-24)', () => {
  const team = gameData.identities.filter((i) => i.keywords.includes('Rupture')).slice(0, 7)
  const run = { difficulty: 'extreme' as const, floors: 15, floor: 12, pack: 'line-4-section-3' }
  it('counts the gift, valued for your team, and drops it once you have it', () => {
    const a = hiddenStageAdvice(makeContext(gameData, team, [], { run }), HIDDEN_STAGES[0])
    expect(a.rewardGifts.map((r) => r.gift.id)).toEqual(['a-maestro-s-ring-turned-artwork'])
    expect(a.rewardGifts[0].score).toBeGreaterThan(0)
    expect(a.rewardGifts[0].costWorth).toBeGreaterThan(0)
    expect(a.why.join(' ')).toMatch(/Maestro/)
    const had = hiddenStageAdvice(makeContext(gameData, team, ['a-maestro-s-ring-turned-artwork'], { run }), HIDDEN_STAGES[0])
    expect(had.rewardGifts).toEqual([])
  })
})

