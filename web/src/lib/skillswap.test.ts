import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { resonanceTriggers } from './ego'
import { deck, multiTarget, planBackupSwaps, planSwaps, teamSins, triggerWorth } from './skillswap'
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
    // Ardent Flower's Wrath part is Clash Power: worth keeping Resonance for.
    const wrathGift = gameData.gifts.find((g) => g.id === 'ardent-flower')!
    expect(resonanceTriggers(wrathGift).some((t) => t.sin === 'wrath')).toBe(true)
    const [withGift] = planSwaps(team, {}, [wrathGift])
    const again = withGift.options.find((o) => o.kind === '1to3')!
    expect(again.worth).toBe(false)
    expect(again.cons[0]).toMatch(/Less Wrath Resonance/)
  })

  it("doesn't chase Resonance for a gift that only adds a status the team has plenty of", () => {
    const crown = gameData.gifts.find((g) => g.id === 'crown-of-roses')!
    const ruptureUnit = (id: string, s2: Skill['sin']) => ({
      ...unit(id, [sk(1, 'wrath', 4, 3, 2, ['Rupture']), sk(2, s2, 5, 3, 2, ['Rupture']), sk(3, 'pride', 9, 5, 3, ['Rupture'])]),
      keywords: ['Rupture'] as Identity['keywords'],
    })
    // Skill 2 is Gluttony, so S1 -> S2 lines up more Gluttony Absolute Resonance for Crown of Roses.
    const team = [ruptureUnit('a', 'gluttony'), ruptureUnit('b', 'gluttony'), ruptureUnit('c', 'gluttony')]
    const t = resonanceTriggers(crown)[0]
    const w = triggerWorth(crown, t, team, [crown])
    expect(w.minor).toBe(true)
    expect(w.why).toMatch(/already apply Rupture/)
    const [plan] = planSwaps(team, {}, [crown])
    expect(plan.best?.to.slot).toBe(3)
    const s1to2 = plan.options.find((o) => o.kind === '1to2')!
    expect(s1to2.special).toBe(false)
    // A gift whose Resonance part is a real buff still steers the pick.
    const phantom = gameData.gifts.find((g) => g.id === 'ardent-flower')!
    expect(triggerWorth(phantom, resonanceTriggers(phantom)[0], team, [phantom]).minor).toBe(false)
    // With no other Rupture source the extra Rupture is worth it.
    const burnUnit = (id: string) => ({ ...unit(id, [sk(1, 'gloom', 4, 3, 2), sk(2, 'gluttony', 5, 3, 2), sk(3, 'envy', 9, 5, 3)]), keywords: ['Burn'] as Identity['keywords'] })
    const lone = [ruptureUnit('a', 'gluttony'), burnUnit('x'), burnUnit('y')]
    expect(triggerWorth(crown, t, lone, [crown]).minor).toBe(false)
  })

  it('counts the defense skill: same-sin defense keeps a chain going after a swap', () => {
    const ardent = gameData.gifts.find((g) => g.id === 'ardent-flower')!
    const wrathy = (id: string, def: boolean): Identity => ({
      ...unit(id, [sk(1, 'wrath', 4, 3, 2), sk(2, 'wrath', 4, 3, 2), sk(3, 'gloom', 5, 3, 2)]),
      defense: def ? { name: 'Wrath Guard', sin: 'wrath', type: 'Guard', kind: 'guard', base: 6, coin_power: 4, coins: 1, statuses: [] } : null,
    })
    const [plain] = planSwaps([wrathy('a', false), wrathy('b', false), wrathy('c', false)], {}, [ardent])
    const [withDef] = planSwaps([wrathy('a', true), wrathy('b', true), wrathy('c', true)], {}, [ardent])
    const loss = (p: typeof plain) => p.options.find((o) => o.kind === '1to3')!
    expect(withDef.defense?.sin).toBe('wrath')
    expect(loss(withDef).pros.some((x) => /defense skill \(Wrath Guard\) is Wrath too/.test(x))).toBe(true)
    // Either way the advice is the same: losing a Wrath skill from a Wrath team isn't worth it.
    expect(loss(withDef).worth).toBe(false)
    expect(loss(plain).worth).toBe(false)
  })

  it("doesn't keep skills for a Resonance the team can't line up, or that switches on another way", () => {
    const byId = (id: string) => gameData.identities.find((i) => i.id === id)!
    // Demo Heishou team: only Faust and Outis have Sloth skills; Rodion and Ishmael have multi-target Skill 3s.
    const team = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
      'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion',
      'heishou-pack-si-branch-gregor'].map(byId)
    const sunshower = gameData.gifts.find((g) => g.id === 'sunshower')!
    const w = triggerWorth(sunshower, resonanceTriggers(sunshower)[0], team, [sunshower])
    expect(w).toMatchObject({ minor: true, kind: 'alternative' })
    expect(w.why).toMatch(/Ishmael and Rodion's skills with 2\+ Atk Weight/)
    const faust = planSwaps(team, {}, [sunshower]).find((p) => p.identity.sinner === 'Faust')!
    expect(faust.best?.kind).toBe('1to3')
    expect(faust.options.every((o) => !o.hurts || !o.cons.some((c) => /Sunshower triggers on/.test(c)))).toBe(true)
    // Without the multi-target units, two Sloth users still can't make Sloth Absolute Resonance.
    const noAoe = team.filter((i) => i.sinner !== 'Rodion' && i.sinner !== 'Ishmael')
    const w2 = triggerWorth(sunshower, resonanceTriggers(sunshower)[0], noAoe, [sunshower])
    expect(w2).toMatchObject({ minor: true, kind: 'unreachable' })
    expect(w2.why).toMatch(/only Faust and Outis have Sloth skills/)
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

  it('always offers a swap for Cost to spare, unless every swap would hurt', () => {
    const u = unit('u', [sk(1, 'wrath', 3, 2, 2), sk(2, 'wrath', 4, 3, 2), sk(3, 'wrath', 12, 6, 3)])
    // On the last floor nothing is "worth it", but a swap that doesn't hurt is still offered.
    const [last] = planSwaps([u], {}, [], { run: { difficulty: 'hard', floors: 10, floor: 10, pack: null } })
    expect(last.best).toBeNull()
    expect(last.spare).not.toBeNull()
    expect(last.spare!.hurts).toBe(false)
    expect(last.spare!.to.slot).toBe(3)
    // A real team: every identity gets a best or spare swap unless all of its swaps hurt.
    const team = gameData.identities.filter((i) => i.skills?.length === 3).slice(0, 7)
    for (const p of planSwaps(team, {}, [])) {
      if (!p.best && !p.spare) expect(p.options.every((o) => o.hurts)).toBe(true)
      if (p.spare) expect(p.spare.hurts).toBe(false)
    }
  })

  it('works on real identities', () => {
    const team = gameData.identities.filter((i) => i.skills?.length === 3).slice(0, 7)
    const plans = planSwaps(team, {}, [])
    expect(plans).toHaveLength(7)
    expect(plans.every((p) => p.options.length > 0)).toBe(true)
  })

  it('plans backups by playing each one in place of the last deployed unit', () => {
    const byId = (id: string) => gameData.identities.find((i) => i.id === id)!
    const deployed = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
      'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion', 'heishou-pack-si-branch-gregor'].map(byId)
    const backups = ['heishou-pack-you-branch-sinclair', 'heishou-pack-wu-branch-adept-yi-sang'].map(byId)
    const plans = planBackupSwaps(deployed, backups, {}, [])
    expect(plans.map((p) => p.identity.sinner)).toEqual(['Sinclair', 'Yi Sang'])
    expect(plans.every((p) => p.options.length > 0)).toBe(true)
    expect(planSwaps(deployed, {}, [], { only: [deployed[0].id] })).toHaveLength(1)
  })
})

