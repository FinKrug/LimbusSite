import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { buildBattle, egoGiftInfo, resonanceTriggers, type Ego } from './ego'
import type { Gift, Identity, Skill } from './types'

const byName = (n: string) => gameData.gifts.find((g) => g.name === n)!
const sk = (slot: 1 | 2 | 3, sin: Skill['sin'], base: number): Skill =>
  ({ slot, name: `S${slot}`, sin, type: 'Slash', base, coin_power: 3, coins: 2, copies: slot === 1 ? 3 : slot === 2 ? 2 : 1, weight: 1, statuses: [] })
const unit = (id: string, sinner: Identity['sinner'], sins: Skill['sin'][]): Identity =>
  ({ id, name: id, sinner, rarity: 3, affinities: [], keywords: ['Burn'], status_effects: [], traits: [], wiki_url: '',
    skills: [sk(1, sins[0], 4), sk(2, sins[1], 5), sk(3, sins[2], 7)] })
const ego = (id: string, sinner: Ego['sinner'], cost: Ego['cost'], grade: Ego['grade'] = 'HE'): Ego =>
  ({ id, name: id, sinner, grade, sin: 'wrath', cost, sanity: 20, skill: null, statuses: [], wiki_url: '' })

describe('E.G.O gifts', () => {
  it('finds gifts that only work with E.G.O skills', () => {
    expect(egoGiftInfo(byName('Fragment of Hellfire')).skillShare).toBe(1)
    expect(egoGiftInfo(byName('Chance & Choice')).skillShare).toBe(1)
    // "(including E.G.O Skills)" works with every skill.
    expect(egoGiftInfo(byName('Embers')).skillShare).toBe(0)
    expect(egoGiftInfo(byName('Crushed Memory')).skillShare).toBe(0)
  })

  it('finds E.G.O resource gifts and their sins', () => {
    const zippo = egoGiftInfo(byName('Blue Zippo Lighter'))
    expect(zippo.resourceShare).toBeGreaterThan(0.5)
    expect(zippo.resourceSins).toContain('gloom')
    expect(egoGiftInfo(byName('Grand Welcome')).resourceSins).toContain('pride')
  })

  it('finds Absolute Resonance triggers', () => {
    expect(resonanceTriggers(byName('Crown of Roses'))).toEqual([expect.objectContaining({ sin: 'gluttony', absolute: true })])
    expect(resonanceTriggers(byName('Phantom Pain'))[0].sin).toBe('gloom')
    expect(resonanceTriggers(byName('Embers'))).toEqual([])
  })
})

describe('E.G.O lean', () => {
  const team = [unit('a', 'Yi Sang', ['wrath', 'wrath', 'lust']), unit('b', 'Faust', ['wrath', 'lust', 'lust']), unit('c', 'Gregor', ['pride', 'wrath', 'envy'])]
  const egos = [ego('cheap', 'Yi Sang', { wrath: 2 }), ego('pricey', 'Faust', { envy: 12 }, 'WAW')]

  it('uses affordable E.G.O and not ones the team makes no resources for', () => {
    const b = buildBattle(team, {}, egos, { 'Yi Sang': { HE: 'cheap' }, Faust: { WAW: 'pricey' } }, [])
    expect(b.ego.known).toBe(true)
    const uses = Object.fromEntries(b.ego.uses.map((u) => [u.ego.id, u.uses]))
    expect(uses.cheap).toBeGreaterThan(0.2)
    expect(uses.pricey).toBeLessThan(0.05)
    expect(b.ego.gain).toBeGreaterThan(0)
  })

  it('leans more on E.G.O with affordable E.G.O and E.G.O gifts owned', () => {
    const none = buildBattle(team, {}, egos, {}, []).ego.lean
    const some = buildBattle(team, {}, egos, { 'Yi Sang': { HE: 'cheap' } }, []).ego.lean
    const gifts: Gift[] = ['Fragment of Hellfire', 'Blue Zippo Lighter', 'Child within a Flask', 'Grand Welcome'].map(byName)
    const more = buildBattle(team, {}, egos, { 'Yi Sang': { HE: 'cheap' } }, gifts).ego.lean
    expect(some).toBeGreaterThan(none)
    expect(more).toBeGreaterThan(some)
  })

  it('leans less on E.G.O when the team resonates easily', () => {
    const mono = [0, 1, 2, 3].map((k) => unit(`m${k}`, 'Yi Sang', ['wrath', 'wrath', 'wrath']))
    const mixed = [0, 1, 2, 3].map((k) => unit(`x${k}`, 'Yi Sang', (['wrath', 'lust', 'sloth', 'gloom', 'pride', 'envy'] as const).slice(k, k + 3) as Skill['sin'][]))
    expect(buildBattle(mono, {}, [], {}, []).ego.lean).toBeLessThan(buildBattle(mixed, {}, [], {}, []).ego.lean)
  })
})
