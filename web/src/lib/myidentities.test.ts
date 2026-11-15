import { describe, expect, it } from 'vitest'
import { encodeKey } from './cloud'
import { gameData } from './data'
import { shortName } from './format'
import {
  OWNED_IDENTITIES_KEY, groupBySinner, hasMarkedIdentities, isBaseIdentity, normalizeOwned, ownedIdentitySet, setOwned,
  setSinnerOwned,
} from './myidentities'
import { isShared } from './transfer'

const all = gameData.identities
const base = all.filter(isBaseIdentity)
const faust = all.filter((i) => i.sinner === 'Faust' && !isBaseIdentity(i))
const someone = faust[0]

describe('owned identities', () => {
  it('always owns the 12 base identities, one per sinner', () => {
    expect(base).toHaveLength(12)
    expect(new Set(base.map((i) => i.sinner)).size).toBe(12)
    const owned = ownedIdentitySet([], all)
    expect(owned.size).toBe(12)
    for (const i of base) expect(owned.has(i.id)).toBe(true)
  })

  it('stores only non-base ids, once each, in data order, and drops ids that no longer exist', () => {
    const stored = normalizeOwned([someone.id, someone.id, base[0].id, 'removed-identity'], all)
    expect(stored).toEqual([someone.id])
    expect(ownedIdentitySet(['removed-identity', someone.id], all).has('removed-identity')).toBe(false)
  })

  it('marks and unmarks one identity; base ones stay owned', () => {
    let stored = setOwned([], someone.id, true, all)
    expect(stored).toEqual([someone.id])
    expect(hasMarkedIdentities(stored, all)).toBe(true)
    stored = setOwned(stored, someone.id, false, all)
    expect(stored).toEqual([])
    expect(hasMarkedIdentities(stored, all)).toBe(false)
    stored = setOwned(stored, base[0].id, false, all)
    expect(ownedIdentitySet(stored, all).has(base[0].id)).toBe(true)
  })

  it('selects all of one sinner and clears them again without touching others', () => {
    const other = all.find((i) => i.sinner === 'Rodion' && !isBaseIdentity(i))!
    let stored = setSinnerOwned([other.id], 'Faust', true, all)
    expect(stored).toHaveLength(faust.length + 1)
    expect(stored).toContain(other.id)
    stored = setSinnerOwned(stored, 'Faust', false, all)
    expect(stored).toEqual([other.id])
  })

  it('repeated taps give the same saved list (no duplicate saves)', () => {
    const once = setOwned([], someone.id, true, all)
    const twice = setOwned(once, someone.id, true, all)
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })

  it('groups by sinner in game order, base identity first, then 000 before 00', () => {
    const groups = groupBySinner(all, ownedIdentitySet([someone.id], all), shortName)
    expect(groups.map((g) => g.sinner)[0]).toBe('Yi Sang')
    expect(groups).toHaveLength(12)
    const f = groups.find((g) => g.sinner === 'Faust')!
    expect(isBaseIdentity(f.list[0])).toBe(true)
    expect(f.owned).toBe(2)
    const rarities = f.list.slice(1).map((i) => i.rarity ?? 1)
    expect([...rarities].sort((a, b) => b - a)).toEqual(rarities)
  })

  it('is synced to the account as the identities_v1 field', () => {
    expect(isShared(OWNED_IDENTITIES_KEY)).toBe(true)
    expect(encodeKey(OWNED_IDENTITIES_KEY)).toBe('identities_v1')
  })

  it('fits well inside the security rule size limit even with everything marked', () => {
    const everything = normalizeOwned(all.map((i) => i.id), all)
    expect(JSON.stringify(everything).length).toBeLessThan(20000)
  })
})
