import { describe, expect, it } from 'vitest'
import { eventSources, howToGet, packEventOdds } from './acquire'
import { gameData } from './data'
import { packsByGift } from './scoring'

const packs = packsByGift(gameData.themePacks)
const byId = new Map(gameData.gifts.map((g) => [g.id, g]))
const named = (n: string) => gameData.gifts.find((g) => g.name === n)!
const lines = (n: string, owned: string[] = []) => howToGet(named(n), packs, byId, new Set(owned), gameData.events, gameData.themePacks)

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
    expect(pack.text).toBe('Only in this theme pack')
    expect(pack.packs!.map((p) => p.name)).toEqual(['Nocturnal Sweeping BokGak'])
  })

  it('explains the general pool and featured packs', () => {
    const g = gameData.gifts.find((x) => x.pools.includes('main') && !x.fusion_recipe && (packs.get(x.id)?.length ?? 0) > 3)!
    const l = howToGet(g, packs, byId, new Set(), gameData.events, gameData.themePacks)
    expect(l.some((x) => x.kind === 'pool' && /any floor/.test(x.text))).toBe(true)
    expect(l.find((x) => x.kind === 'pack')!.text).toMatch(/^Boosted odds in \d+ theme packs$/)
  })

  it('says how to get a pack exclusive inside its pack: its own event, the choice, and how often', () => {
    const chicken = gameData.themePacks.find((p) => p.name === "Hell's Chicken")!
    expect(packEventOdds(chicken)).toMatch(/^75% of its "\?" event nodes/)
    const src = eventSources(gameData.events!, gameData.themePacks)
    const id = chicken.gifts.find((g) => (src.get(g) ?? []).some((s) => s.pack?.id === chicken.id))!
    const line = howToGet(byId.get(id)!, packs, byId, new Set(), gameData.events, gameData.themePacks)
      .find((l) => l.kind === 'pack' && l.packs?.[0].id === chicken.id)!
    expect(line.details!.some((d) => /^Event ".+": pick "/.test(d))).toBe(true)
    expect(line.details!.some((d) => /75%/.test(d))).toBe(true)
    expect(line.details!.some((d) => /Battle rewards/.test(d))).toBe(true)
  })

  it('marks random "?" events as chance, with the choice to make', () => {
    const l = lines('Wobbling Keg')
    const ev = l.find((x) => x.kind === 'event' && x.text === 'Drunkard')!
    expect(ev.odds).toBe('chance')
    expect(ev.details![0]).toMatch(/^Pick "I don't know how to live without alcohol\.", then pass a Sloth\/Gluttony check/)
  })

  it('shows events and other notes from the wiki', () => {
    const e = lines('Ashes to Ashes')
    expect(e.find((x) => x.kind === 'event')!.text).toBe('Rising Ashes')
    expect(lines('Dark Vestige').some((x) => x.kind === 'other' && /duplicate of a Tier I/.test(x.text))).toBe(true)
  })

  it("says which way Cozy Bed's second roll has to go", () => {
    const how = (n: string) => eventSources(gameData.events!, gameData.themePacks).get(named(n).id)!
      .find((x) => x.event.name === 'Cozy Bed' || /Cozy Bed|Event 2/.test(x.variant.name))!.how
    expect(how('Snuffed Lantern')).toMatch(/then pass a Sloth\/Gluttony check .*, then win the 50% roll/)
    expect(how('Snuffed Candlestick')).toMatch(/then pass a Sloth\/Gluttony check .*, then lose the 50% roll/)
  })
})

