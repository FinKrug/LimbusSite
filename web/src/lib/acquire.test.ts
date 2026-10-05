import { describe, expect, it } from 'vitest'
import { howToGet } from './acquire'
import { gameData } from './data'
import { packsByGift } from './scoring'

const packs = packsByGift(gameData.themePacks)
const byId = new Map(gameData.gifts.map((g) => [g.id, g]))
const named = (n: string) => gameData.gifts.find((g) => g.name === n)!
const lines = (n: string, owned: string[] = []) => howToGet(named(n), packs, byId, new Set(owned))

describe('how to get a gift', () => {
  it('lists fusion ingredients and which you own', () => {
    const l = lines('Shadowlurking', ['heishou-bolus-mao'])
    expect(l[0].kind).toBe('fusion')
    expect(l[0].ingredients!.map((i) => [i.name, i.owned])).toEqual([
      ['Heishou Bolus - Mao', true], ['Harestride', false], ['Shadow Bamboo Hat', false],
    ])
  })

  it('names the theme pack an exclusive gift comes from, with floors', () => {
    const l = lines('Heishou Bolus - Mao')
    const pack = l.find((x) => x.kind === 'pack')!
    expect(pack.text).toBe('Only from this theme pack')
    expect(pack.packs!.map((p) => p.name)).toEqual(['Nocturnal Sweeping BokGak'])
  })

  it('explains the general pool and featured packs', () => {
    const g = gameData.gifts.find((x) => x.pools.includes('main') && !x.fusion_recipe && (packs.get(x.id)?.length ?? 0) > 3)!
    const l = howToGet(g, packs, byId, new Set())
    expect(l.some((x) => x.kind === 'pool' && /any floor/.test(x.text))).toBe(true)
    expect(l.find((x) => x.kind === 'pack')!.text).toMatch(/^Featured in \d+ theme packs$/)
  })

  it('shows events and other notes from the wiki', () => {
    const e = lines('Ashes to Ashes')
    expect(e.find((x) => x.kind === 'event')!.text).toBe('Rising Ashes')
    expect(lines('Dark Vestige').some((x) => x.kind === 'other' && /duplicate of a Tier I/.test(x.text))).toBe(true)
  })
})
