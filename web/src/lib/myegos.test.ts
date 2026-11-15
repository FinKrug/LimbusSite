import { describe, expect, it } from 'vitest'
import { encodeKey } from './cloud'
import { gameData } from './data'
import {
  OWNED_EGOS_KEY, groupEgosBySinner, gradeRank, hasMarkedEgos, isBaseEgo, normalizeOwnedEgos, ownedEgoSet, setOwnedEgo,
  setSinnerEgos,
} from './myegos'
import { isShared } from './transfer'

const all = gameData.egos ?? []
const starting = all.filter(isBaseEgo)
const gregor = all.filter((e) => e.sinner === 'Gregor' && !isBaseEgo(e))

describe('owned E.G.O', () => {
  it('always owns each sinner\'s starting E.G.O', () => {
    expect(starting).toHaveLength(12)
    expect(new Set(starting.map((e) => e.sinner)).size).toBe(12)
    expect(ownedEgoSet([], all).size).toBe(12)
  })

  it('stores only non-starting ids once, and drops unknown ones', () => {
    expect(normalizeOwnedEgos([gregor[0].id, gregor[0].id, starting[0].id, 'gone'], all)).toEqual([gregor[0].id])
    expect(ownedEgoSet(['gone'], all).has('gone')).toBe(false)
  })

  it('marks, unmarks and selects a whole sinner', () => {
    let s = setOwnedEgo([], gregor[0].id, true, all)
    expect(hasMarkedEgos(s, all)).toBe(true)
    s = setOwnedEgo(s, gregor[0].id, false, all)
    expect(s).toEqual([])
    s = setSinnerEgos(s, 'Gregor', true, all)
    expect(s).toHaveLength(gregor.length)
    expect(setSinnerEgos(s, 'Gregor', false, all)).toEqual([])
  })

  it('groups by sinner: starting E.G.O first, then by grade', () => {
    const g = groupEgosBySinner(all, ownedEgoSet([], all)).find((x) => x.sinner === 'Gregor')!
    expect(isBaseEgo(g.list[0])).toBe(true)
    const ranks = g.list.slice(1).map((e) => gradeRank(e.grade))
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
  })

  it('is synced to the account as egos_owned_v1, separate from the equipped E.G.O', () => {
    expect(isShared(OWNED_EGOS_KEY)).toBe(true)
    expect(encodeKey(OWNED_EGOS_KEY)).toBe('egos_owned_v1')
    expect(encodeKey('limbussite.egos.v1')).not.toBe(encodeKey(OWNED_EGOS_KEY))
  })
})
