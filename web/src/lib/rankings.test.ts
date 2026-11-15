import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { ownedIdentitySet } from './myidentities'
import { ANY_TEAM_MIN, getNextPicks, giftsFor, ownedKeywordTeams, rankGiftsOverall, rankIdentitiesOverall } from './rankings'
import { CORE_KEYWORDS } from './types'

describe('best gifts for any team', () => {
  const list = rankGiftsOverall(gameData)

  it('ranks every gift, best first', () => {
    expect(list.length).toBeGreaterThan(gameData.gifts.length * 0.8)
    for (let k = 1; k < list.length; k++) expect(list[k - 1].overall).toBeGreaterThanOrEqual(list[k].overall)
    // Lunar Memory helps any team, and is the best gift there is.
    expect(list[0].gift.name).toBe('Lunar Memory')
  })

  it('filters by keyword and by "any team"', () => {
    const burn = giftsFor(list, 'Burn').slice(0, 10)
    expect(burn.filter((g) => g.gift.keyword === 'Burn').length).toBeGreaterThanOrEqual(3)
    const any = giftsFor(list, 'any')
    expect(any.length).toBeGreaterThan(0)
    expect(any.every((g) => g.anyTeam >= ANY_TEAM_MIN)).toBe(true)
  })
})

describe('identities', () => {
  it('ranks all of them', () => {
    const r = rankIdentitiesOverall(gameData.identities)
    expect(r).toHaveLength(gameData.identities.length)
    expect(r[0].score).toBeGreaterThanOrEqual(r[r.length - 1].score)
  })

  it('suggests identities you do not own that improve your teams', () => {
    const owned = ownedIdentitySet([], gameData.identities)
    const picks = getNextPicks(gameData, owned)
    expect(picks.length).toBeGreaterThan(0)
    for (const p of picks) {
      expect(owned.has(p.identity.id)).toBe(false)
      expect(owned.has(p.replaces.id)).toBe(true)
      expect(p.identity.sinner).toBe(p.replaces.sinner)
    }
    // With everything owned there is nothing left to get.
    expect(getNextPicks(gameData, new Set(gameData.identities.map((i) => i.id)))).toEqual([])
  })

  it('rates the teams you can build from what you own', () => {
    const base = ownedKeywordTeams(gameData, ownedIdentitySet([], gameData.identities))
    const all = ownedKeywordTeams(gameData, new Set(gameData.identities.map((i) => i.id)))
    expect(base.map((t) => t.keyword).sort()).toEqual([...CORE_KEYWORDS].sort())
    const best = (ts: typeof base) => Math.max(...ts.map((t) => t.score))
    expect(best(all)).toBeGreaterThan(best(base))
  })
})
