import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { resonanceTriggers } from './ego'
import { deck, multiTarget, planSwaps, teamSins } from './skillswap'
import type { Identity, Skill } from './types'

const sk = (slot: 1 | 2 | 3, sin: Skill['sin'], base: number, cp: number, coins: number, statuses: string[] = []): Skill =>
  ({ slot, name: `S${slot}`, sin, type: 'Slash', base, coin_power: cp, coins, copies: slot === 1 ? 3 : slot === 2 ? 2 : 1, weight: 1, statuses })
const unit = (id: string, skills: Skill[]): Identity =>
  ({ id, name: id, sinner: 'Yi Sang', rarity: 3, affinities: [], keywords: ['Burn'], status_effects: [], traits: [], wiki_url: '', skills })

describe('skill swaps', () => {
  it('tracks the deck after swaps', () => {
    const u = unit('u', [sk(1, 'wrath', 4, 3, 2), sk(2, 'lust', 5, 4, 2), sk(3, 'pride', 6, 5, 3)])
    expect(deck(u)).toEqual({ 1: 3, 2: 2, 3: 1 })
    expect(deck(u, { '1to3': 1, '2to3': 1 })).toEqual({ 1: 2, 2: 1, 3: 3 })
  })

  it('suggests a swap into a much stronger skill of the same sin', () => {
    const u = unit('u', [sk(1, 'wrath', 3, 2, 2), sk(2, 'wrath', 4, 3, 2), sk(3, 'wrath', 12, 6, 3, ['Burn'])])
    const other = (id: string) => unit(id, [sk(1, 'gloom', 4, 3, 2), sk(2, 'lust', 5, 3, 2), sk(3, 'envy', 7, 4, 3)])
    const [plan] = planSwaps([u, other('b'), other('c')], {}, [])
    expect(plan.best).not.toBeNull()
    expect(plan.best!.gain).toBeGreaterThan(0)
    expect(plan.best!.pros.some((p) => /Same sin/.test(p))).toBe(true)
  })

  it('shows the Absolute Resonance a swap costs', () => {
    const wrathy = (id: string) => unit(id, [sk(1, 'wrath', 4, 3, 2), sk(2, 'wrath', 4, 3, 2), sk(3, 'gloom', 5, 3, 2)])
    const team = [wrathy('a'), wrathy('b'), wrathy('c')]
    expect([...teamSins(team, {}).entries()][0]).toEqual(['wrath', 15])
    const [plan] = planSwaps(team, {}, [])
    const s1to3 = plan.options.find((o) => o.kind === '1to3')!
    expect(s1to3.cons.some((c) => /Wrath Absolute Resonance/.test(c))).toBe(true)
    // Skill 3 is still the default without a gift that needs Wrath Resonance...
    expect(s1to3.worth).toBe(true)
    // ...but not when a gift you own triggers on it.
    const wrathGift = gameData.gifts.find((g) => resonanceTriggers(g).some((t) => t.sin === 'wrath'))!
    const [withGift] = planSwaps(team, {}, [wrathGift])
    const again = withGift.options.find((o) => o.kind === '1to3')!
    expect(again.worth).toBe(false)
    expect(again.cons[0]).toMatch(/Less Wrath Resonance/)
  })

  it('takes Skill 3 by default, and Skill 2 only for something Skill 3 lacks', () => {
    const plain = unit('u', [sk(1, 'wrath', 4, 3, 2), sk(2, 'lust', 5, 4, 2), sk(3, 'pride', 6, 5, 3)])
    const [p] = planSwaps([plain], {}, [])
    expect(p.best?.to.slot).toBe(3)
    expect(p.options.find((o) => o.kind === '1to2')!.worth).toBe(false)
    expect(p.options.find((o) => o.kind === '1to2')!.cons[0]).toMatch(/Skill 3 hits harder/)
  })

  it('suggests Dawn Office Fixer Sinclair S1 -> S2 for multi-target damage when nothing else has it', () => {
    const dawn = gameData.identities.find((i) => i.id === 'dawn-office-fixer-sinclair')!
    expect(dawn.skills!.find((s) => s.slot === 2)!.weight_bonus).toBeGreaterThan(0)
    const single = gameData.identities.filter((i) => i.sinner !== 'Sinclair' && (i.skills ?? []).length === 3
      && i.skills!.every((s) => !multiTarget(s))).slice(0, 4)
    const [plan] = planSwaps([dawn, ...single], {}, [])
    expect(plan.best?.kind).toBe('1to2')
    expect(plan.best!.pros[0]).toMatch(/several targets/)
    // With a multi-target unit already on the team, Skill 3 is back to the default.
    const aoeUnit = gameData.identities.find((i) => i.sinner !== 'Sinclair' && (i.skills ?? []).some((s) => (s.weight ?? 1) > 1))!
    const [withAoe] = planSwaps([dawn, aoeUnit, ...single.slice(0, 3)], {}, [])
    expect(withAoe.best?.to.slot).toBe(3)
  })

  it('counts less near the end of a run', () => {
    const u = unit('u', [sk(1, 'wrath', 3, 2, 2), sk(2, 'wrath', 4, 3, 2), sk(3, 'wrath', 12, 6, 3)])
    const early = planSwaps([u], {}, [], { run: { difficulty: 'hard', floors: 10, floor: 1, pack: null } })[0].options[0]
    const late = planSwaps([u], {}, [], { run: { difficulty: 'hard', floors: 10, floor: 9, pack: null } })[0].options[0]
    expect(late.score).toBeLessThan(early.score)
    expect(late.cons.some((c) => /floors? left/.test(c))).toBe(true)
  })

  it('works on real identities', () => {
    const team = gameData.identities.filter((i) => i.skills?.length === 3).slice(0, 7)
    const plans = planSwaps(team, {}, [])
    expect(plans).toHaveLength(7)
    expect(plans.every((p) => p.options.length > 0)).toBe(true)
  })
})
