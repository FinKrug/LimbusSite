import { describe, expect, it } from 'vitest'
import { deckCards, defenseCard, levelDamage, offenseLevel, simulate, skillValue } from './battle'
import type { Identity, Skill } from './types'

const sk = (slot: 1 | 2 | 3, sin: Skill['sin'], base: number, cp = 0, coins = 1): Skill =>
  ({ slot, name: `S${slot}`, sin, type: 'Slash', base, coin_power: cp, coins, copies: slot === 1 ? 3 : slot === 2 ? 2 : 1, weight: 1, statuses: [] })
const unit = (id: string, skills: Skill[]): Identity =>
  ({ id, name: id, sinner: 'Yi Sang', rarity: 3, affinities: [], keywords: [], status_effects: [], traits: [], wiki_url: '', skills })

describe('battle model', () => {
  it('uses the wiki Offense Level table and damage formula', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10, 11, 20].map(offenseLevel)).toEqual([0, 1, 3, 3, 5, 5, 7, 11, 13, 13])
    expect(levelDamage(5)).toBeCloseTo(5 / 30)
  })

  it('builds decks with swaps', () => {
    const u = unit('u', [sk(1, 'wrath', 4), sk(2, 'lust', 6), sk(3, 'pride', 9)])
    const count = (d: Skill[]) => [1, 2, 3].map((s) => d.filter((x) => x.slot === s).length)
    expect(count(deckCards(u))).toEqual([3, 2, 1])
    expect(count(deckCards(u, { '1to3': 1 }))).toEqual([2, 2, 2])
    expect(count(deckCards(u, { '1to2': 1, '2to3': 2 }))).toEqual([2, 1, 3])
  })

  it('plays 1 turn in 5 per extra copy of the better skill (the worst card stays in hand)', () => {
    // No sins, so no resonance: value per turn is just which skills get used.
    const u = unit('u', [sk(1, null, 4), sk(2, null, 6), sk(3, null, 9)])
    const v = (s: Skill) => skillValue(s, [])
    const [a, b, c] = u.skills!.map(v)
    const base = simulate([deckCards(u)], [], { turns: 20000 }).valuePerTurn
    expect(base).toBeCloseTo(0.4 * a + 0.4 * b + 0.2 * c, 0)
    const swapped = simulate([deckCards(u, { '1to3': 1 })], [], { turns: 20000 }).valuePerTurn
    expect(swapped - base).toBeCloseTo(0.2 * (c - a), 0)
  })

  it('lines up Absolute Resonance and counts resources by sin', () => {
    const wrath = (id: string) => unit(id, [sk(1, 'wrath', 4), sk(2, 'wrath', 6), sk(3, 'wrath', 9)])
    const team = [wrath('a'), wrath('b'), wrath('c')]
    const r = simulate(team.map((u) => deckCards(u)), [], { turns: 500 })
    expect(r.areson.wrath).toBe(1)
    expect(r.gen.wrath).toBeCloseTo(3)
    expect(r.valuePerTurn).toBeGreaterThan(r.plainPerTurn * 1.1)
    // Two wrath units never reach Absolute Resonance.
    expect(simulate(team.slice(0, 2).map((u) => deckCards(u)), [], { turns: 200 }).areson.wrath).toBe(0)
  })

  it('gives up a little power to line up a resonance block', () => {
    // Each unit has a strong off-sin S3; resonating on the S1/S2 sin can still win.
    const mk = (id: string, off: Skill['sin']) => unit(id, [sk(1, 'gloom', 5), sk(2, 'gloom', 6), sk(3, off, 7)])
    const r = simulate([mk('a', 'wrath'), mk('b', 'lust'), mk('c', 'pride'), mk('d', 'envy')].map((u) => deckCards(u)), [], { turns: 2000 })
    expect(r.areson.gloom).toBeGreaterThanOrEqual(0.75)
  })

  it('puts a defense skill in a chain when the Resonance it completes is worth it, and keeps the hand', () => {
    // Two wrath attackers and a third unit with only gloom attacks but a wrath Counter.
    const wrathy = (id: string) => unit(id, [sk(1, 'wrath', 4, 3, 2), sk(2, 'wrath', 5, 3, 2), sk(3, 'wrath', 6, 3, 2)])
    const third: Identity = { ...unit('c', [sk(1, 'gloom', 4, 3, 2), sk(2, 'gloom', 5, 3, 2), sk(3, 'gloom', 6, 3, 2)]),
      defense: { name: 'Counter', sin: 'wrath', type: 'Slash', kind: 'counter', base: 5, coin_power: 4, coins: 1, statuses: [] } }
    const team = [wrathy('a'), wrathy('b'), third]
    const decks = team.map((u) => deckCards(u))
    const defenses = team.map(defenseCard)
    const none = simulate(decks, [], { turns: 2000 })
    expect(none.areson.wrath).toBe(0)
    // A gift that triggers on Wrath Absolute Resonance makes completing the chain worth it.
    const triggers = { absolute: { wrath: 15, lust: 0, sloth: 0, gluttony: 0, gloom: 0, pride: 0, envy: 0 },
      plain: { wrath: 0, lust: 0, sloth: 0, gluttony: 0, gloom: 0, pride: 0, envy: 0 } }
    const withDef = simulate(decks, [], { turns: 2000, defenses, triggers })
    expect(withDef.areson.wrath).toBeGreaterThan(0.9)
    expect(withDef.defenseUse[2]).toBeGreaterThan(0.9)
    expect(withDef.defenseUse[0]).toBe(0)
    // Even with nothing riding on it, completing Absolute Resonance is worth a weak Counter: the
    // whole chain gains Clash Power, and winning clashes matters most (CLASH_EDGE).
    const plain = simulate(decks, [], { turns: 2000, defenses })
    expect(plain.defenseUse[2]).toBeGreaterThan(0.9)
    // A weak defense skill that completes nothing isn't worth an attack.
    const offSin = [...defenses.slice(0, 2), { ...defenses[2]!, sin: 'pride' as const }]
    expect(simulate(decks, [], { turns: 2000, defenses: offSin }).defenseUse[2]).toBeLessThan(0.2)
    // No defense data: no defense card.
    expect(defenseCard(wrathy('x'))).toBeNull()
  })
})
