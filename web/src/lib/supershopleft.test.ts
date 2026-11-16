import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { fodder } from './fusion'
import { fusableThisRun } from './musthave'
import { makeContext } from './scoring'

describe("no Super Shop left: Lunar Memory's pieces aren't kept (Finley, 2026-11-15)", () => {
  const lunar = gameData.fusions.find((f) => gameData.gifts.find((g) => g.id === f.result)?.name === 'Lunar Memory')!
  const crushed = gameData.gifts.find((g) => g.name === 'Crushed Memory')!
  const team = gameData.identities.slice(0, 7)
  const run = { difficulty: 'hard' as const, floors: 10, floor: 10, pack: null }

  it('kept while a Super Shop can still come, not at the last floor\'s regular shop', () => {
    expect(crushed).toBeTruthy()
    const before = makeContext(gameData, team, [crushed.id], { run })
    const after = makeContext(gameData, team, [crushed.id], { run: { ...run, noSuperShopLeft: true } })
    expect(fusableThisRun(lunar, before)).toBe(true)
    expect(fusableThisRun(lunar, after)).toBe(false)
    expect(fodder(before, [crushed.id])[0].keepFor).toMatch(/Lunar Memory/)
    expect(fodder(after, [crushed.id])[0].keepFor).toBeNull()
  })
})
