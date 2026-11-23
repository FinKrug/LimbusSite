import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { makeContext, packsByGift, rankGifts } from './scoring'
import { meterAfter, saveAdvice, SAVE } from './costsave'
import { shopPlan, type ShopMove } from './shopoverview'

const byId = (id: string) => gameData.identities.find((x) => x.id === id)!
const heishou = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
  'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion', 'heishou-pack-si-branch-gregor'].map(byId)
const pf = packsByGift(gameData.themePacks)
const advice = (difficulty: 'normal' | 'hard' | 'extreme', floors: number, floor: number, meter: number | null = null) => {
  const ctx = makeContext(gameData, heishou, [], { run: { difficulty, floors, floor, pack: null }, deployed: 7 })
  return saveAdvice(ctx, rankGifts(ctx), pf, { meter })
}

describe('save Cost early, spend it by the end (Finley, 2026-11-23)', () => {
  it('early floors save for later packs\' gifts; the bar falls toward the last floor, where anything that helps goes', () => {
    const bars = Array.from({ length: 10 }, (_, k) => advice('hard', 10, k + 1))
    expect(bars[0].stage).toBe('save')
    expect(bars[0].bar).toBeGreaterThan(0.8)
    expect(bars[0].later.some((x) => x.pack)).toBe(true)
    for (let k = 1; k < 9; k++) expect(bars[k].bar).toBeLessThanOrEqual(bars[k - 1].bar + 0.05)
    expect(bars[8].bar).toBeLessThan(bars[0].bar - 0.3)
    expect(bars[9]).toMatchObject({ stage: 'last', bar: SAVE.lastFloorBar, reserve: 0 })
  })

  it('a 15-floor run spends most by floor 10, keeping some for 11-15; floor 15 spends what\'s left', () => {
    const f10 = advice('extreme', 15, 10)
    expect(f10.spendBy).toBe(10)
    expect(f10.stage).toBe('last')
    expect(f10.reserve).toBeGreaterThan(0)
    expect(advice('extreme', 15, 12)).toMatchObject({ stage: 'late', bar: SAVE.lateBar })
    expect(advice('extreme', 15, 15).bar).toBe(SAVE.lastFloorBar)
    expect(advice('normal', 5, 5)).toMatchObject({ stage: 'last', reserve: 0 })
  })

  it('on Hard, spending counts toward the Super Shop chance (3% + 1% per 20 Cost)', () => {
    expect(advice('hard', 10, 3).meterBonus).toBeGreaterThan(0)
    expect(advice('normal', 5, 3).meterBonus).toBe(0)
    expect(advice('hard', 10, 3, 100).meterBonus).toBe(0)
    expect(meterAfter(30, 200)).toBe(40)
    expect(meterAfter(95, 400)).toBe(100)
  })

  it('the shop plan only spends on what beats the bar, less the reserve', () => {
    const m = (key: string, ratio: number, cost: number) => ({ key, kind: 'buy', ratio, cost, chance: true }) as unknown as ShopMove
    const moves = [m('a', 1.4, 200), m('b', 0.7, 150), m('c', 0.4, 150)]
    expect(shopPlan(moves, 1000, null, { save: { bar: 1.1, meterBonus: 0, reserve: 0 } }).moves.map((x) => x.key)).toEqual(['a'])
    expect(shopPlan(moves, 1000, null, { save: { bar: 0.05, meterBonus: 0, reserve: 0 } }).moves.map((x) => x.key)).toEqual(['a', 'b', 'c'])
    expect(shopPlan(moves, 500, null, { save: { bar: 0.05, meterBonus: 0, reserve: 200 } }).moves.map((x) => x.key)).toEqual(['a', 'b'])
  })
})
