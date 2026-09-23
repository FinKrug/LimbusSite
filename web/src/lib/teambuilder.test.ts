import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { giftSlots, slotText } from './lineup'
import { holderConditions, holderFactor } from './holder'
import { intrinsicScore, makeContext, rankGifts, rankThemePacks } from './scoring'
import { identityTier, strength } from './strength'
import { buildTeam, suggestOrder, traitOptions } from './teambuilder'
import type { GameData, Gift, Identity } from './types'

function gift(id: string, over: Partial<Gift> = {}): Gift {
  return {
    id, name: id, sin: 'wrath', tier: 3, cost: 100, keyword: null, secondary_keyword: null,
    status_effects: [], traits: [], effect: '', max_level: 0, pools: ['main'], theme_packs: [], events: [],
    fusion_recipe: null, wiki_url: '', ...over,
  }
}
function ident(id: string, sinner: Identity['sinner'], over: Partial<Identity> = {}): Identity {
  return { id, name: id, sinner, rarity: 3, affinities: ['wrath'], keywords: [], status_effects: [], traits: [], attack_types: [], wiki_url: '', ...over }
}

describe('deployment slots', () => {
  it('reads slot limits from effect text', () => {
    expect(giftSlots(gift('a', { effect: '[Effects apply only to #1, #2 Deployed Identities]\n\nBlunt ...' })))
      .toEqual({ slots: [1, 2], whole: true })
    expect(giftSlots(gift('b', { effect: '[Effects apply only to #1, #2, #7, and #8 Deployed Identities]' }))!.slots)
      .toEqual([1, 2, 7, 8])
    expect(giftSlots(gift('c', { effect: 'Max Charge +10.\n\n[#1 Deployed Identity Exclusive Effect] ...' })))
      .toEqual({ slots: [1], whole: false })
    expect(giftSlots(gift('d', { effect: 'Turn Start: inflict 3 Burn' }))).toBeNull()
    expect(slotText([2, 1])).toBe('#1–#2')
    expect(slotText([2, 4])).toBe('#2, #4')
  })

  it('judges a slot gift on the sinners in those slots', () => {
    const crushed = gift('crushed', { keyword: 'Blunt', attack_types: ['Blunt'], effect: '[Effects apply only to #1 and #2 Deployed Identities] Blunt Attack Skills gain Base Power +2' })
    const d: GameData = { gifts: [crushed], themePacks: [], fusions: [], identities: [], generatedAt: null }
    const blunt = ident('b', 'Yi Sang', { attack_types: ['Blunt'] })
    const slash1 = ident('s1', 'Faust', { attack_types: ['Slash'] })
    const slash2 = ident('s2', 'Don Quixote', { attack_types: ['Slash'] })
    const good = rankGifts(makeContext(d, [blunt, slash1, slash2], []))[0]
    const bad = rankGifts(makeContext(d, [slash1, slash2, blunt], []))[0]
    expect(good.reasons[0].text).toBe('Only affects #1–#2: Yi Sang, Faust')
    expect(good.reasons.map((r) => r.text)).toContain('1/2 of your #1–#2 use Blunt skills')
    expect(bad.reasons.map((r) => r.text)).toContain("Your #1–#2 don't use Blunt skills")
    expect(good.score).toBeGreaterThan(bad.score)
    // A #7 gift does nothing when only 6 are deployed
    const seventh = gift('seventh', { effect: '[Effects apply only to #7 Deployed Identity] ...' })
    const r = rankGifts(makeContext({ ...d, gifts: [seventh] }, [blunt, slash1], [], [], [], 6))[0]
    expect(r.fit).toBe(0)
  })
})

describe('theme packs for a faction team (real data)', () => {
  it('puts the Heishou packs on top for a mixed Heishou team', () => {
    const names = ['Heishou Pack - Wu Branch Adept Yi Sang', 'Heishou Pack - Wei Branch Don Quixote',
      'Heishou Pack - You Branch Adept Heathcliff', 'Heishou Pack - Si Branch Rodion',
      'Heishou Pack - You Branch Sinclair', 'Heishou Pack - Si Branch Gregor']
    const team = names.map((n) => gameData.identities.find((i) => i.name === n)!)
    expect(team.every(Boolean)).toBe(true)
    const top = rankThemePacks(makeContext(gameData, team, [])).slice(0, 5).map((p) => p.pack.name)
    expect(top).toEqual(expect.arrayContaining(['Spring Cultivation', 'Nocturnal Sweeping', 'Nocturnal Sweeping BokGak']))
  })

  it("doesn't let huge pools of common gifts win", () => {
    const g = gameData.gifts
    const burners = gameData.identities.filter((i) => i.keywords.includes('Burn') && i.rarity === 3).slice(0, 6)
    const top = rankThemePacks(makeContext(gameData, burners, [])).slice(0, 5)
    expect(top.filter((p) => p.pack.gift_pool.length > 150).length).toBeLessThanOrEqual(1)
    expect(g.length).toBeGreaterThan(100)
  })
})

describe('team builder', () => {
  it('lists affiliations shared by several sinners', () => {
    const names = traitOptions(gameData.identities).map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['Heishou Pack', 'W Corp.', 'The Thumb']))
    expect(names).not.toContain('Fixer') // too broad
  })

  it('builds a Heishou team and deploys Heishou identities first', () => {
    const built = buildTeam(gameData, { kind: 'trait', value: 'Heishou Pack' })
    const byId = new Map(gameData.identities.map((i) => [i.id, i]))
    const team = Object.values(built.team).map((id) => byId.get(id!)!)
    expect(team.filter((i) => i.traits.includes('Heishou Pack')).length).toBe(9)
    const { order } = suggestOrder(gameData, team, 7)
    const deployed = order.slice(0, 7).map((s) => team.find((i) => i.sinner === s)!)
    expect(deployed.every((i) => i.traits.includes('Heishou Pack'))).toBe(true)
  })

  it('only uses owned identities when given', () => {
    const mine = gameData.identities.filter((i) => i.sinner === 'Yi Sang').slice(0, 1)
    const built = buildTeam(gameData, { kind: 'keyword', value: 'Burn' }, new Set(mine.map((i) => i.id)))
    expect(Object.keys(built.team)).toEqual(['Yi Sang'])
  })

  it('puts the right attack type in the slots an owned gift covers', () => {
    const crushed = gift('crushed', { tier: 4, keyword: 'Blunt', attack_types: ['Blunt'], effect: '[Effects apply only to #1 and #2 Deployed Identities] Blunt' })
    const d: GameData = { gifts: [crushed], themePacks: [], fusions: [], identities: [], generatedAt: null }
    const team = [
      ident('s1', 'Yi Sang', { attack_types: ['Slash'], keywords: ['Bleed'] }),
      ident('s2', 'Faust', { attack_types: ['Slash'], keywords: ['Bleed'] }),
      ident('b1', 'Don Quixote', { attack_types: ['Blunt'], keywords: ['Bleed'] }),
      ident('b2', 'Ryōshū', { attack_types: ['Blunt'], keywords: ['Bleed'] }),
    ]
    const { order, notes } = suggestOrder(d, team, 4, ['crushed'])
    expect(order.slice(0, 2).sort()).toEqual(['Don Quixote', 'Ryōshū'])
    expect(notes['Don Quixote']).toMatch(/Blunt skills for crushed/)
  })
})

describe('identity strength', () => {
  const heishouFaust = gameData.identities.find((i) => i.id === 'heishou-pack-mao-branch-adept-faust')!

  it('rates from the tier list, falls back to rarity, and lets you override', () => {
    expect(identityTier(heishouFaust)).toEqual({ tier: 'SSS', from: 'list' })
    expect(strength(heishouFaust)).toBe(1)
    const plain = ident('x', 'Yi Sang', { rarity: 1 })
    expect(identityTier(plain).tier).toBeNull()
    expect(strength(plain)).toBeLessThan(strength(ident('y', 'Yi Sang', { rarity: 3 })))
    expect(identityTier(heishouFaust, { [heishouFaust.id]: 'B' })).toEqual({ tier: 'B', from: 'you' })
    expect(strength(heishouFaust, { [heishouFaust.id]: 'B' })).toBeLessThan(0.5)
  })

  it('puts Heishou Mao Faust in a buffed slot on a Heishou team', () => {
    const built = buildTeam(gameData, { kind: 'trait', value: 'Heishou Pack' })
    expect(built.team.Faust).toBe(heishouFaust.id)
    const byId = new Map(gameData.identities.map((i) => [i.id, i]))
    const team = Object.values(built.team).map((id) => byId.get(id!)!)
    const { order, notes } = suggestOrder(gameData, team, 7)
    expect(order.slice(0, 2)).toContain('Faust')
    expect(notes.Faust).toBeTruthy()
  })

  it('gives the strongest unit the most-buffed slot, even with no gifts owned', () => {
    const slotGift = gift('buff', { tier: 4, effect: '[Effects apply only to #1, #2 Deployed Identities] Damage +10%' })
    const d: GameData = { gifts: [slotGift], themePacks: [], fusions: [], identities: [], generatedAt: null }
    const team = (['Yi Sang', 'Faust', 'Don Quixote', 'Ryōshū', 'Meursault'] as const).map((s) => ident(s, s))
    const before = suggestOrder(d, team, 5).order
    const star = before.at(-1)!
    const after = suggestOrder(d, team, 5, [], { [star]: 'SSS' })
    expect(after.order.slice(0, 2)).toContain(star)
    expect(after.notes[star]).toBe('SSS unit in a buffed slot')
  })

  it('builds with the stronger identity when two fit equally', () => {
    const weak = ident('weak', 'Yi Sang', { keywords: ['Burn'], rarity: 3 })
    const strong = ident('zz-strong', 'Yi Sang', { keywords: ['Burn'], rarity: 3 })
    const d: GameData = { gifts: [], themePacks: [], fusions: [], identities: [weak, strong], generatedAt: null }
    expect(buildTeam(d, { kind: 'keyword', value: 'Burn' }).team['Yi Sang']).toBe('weak') // tie: by name
    expect(buildTeam(d, { kind: 'keyword', value: 'Burn' }, undefined, { 'zz-strong': 'S' }).team['Yi Sang']).toBe('zz-strong')
    // Strength never beats fit.
    const offFocus = ident('off', 'Yi Sang', { keywords: ['Bleed'] })
    const d2 = { ...d, identities: [weak, offFocus] }
    expect(buildTeam(d2, { kind: 'keyword', value: 'Burn' }, undefined, { off: 'SSS' }).team['Yi Sang']).toBe('weak')
  })
})

describe('conditions on the unit in a slot', () => {
  const real = gameData
  const byName = (n: string) => real.gifts.find((g) => g.name === n)!
  const ident2 = (id: string) => real.identities.find((i) => i.id === id)!
  const hierarch = ident2('family-hierarch-candidate-ishmael')

  it('reads them from effect text', () => {
    const cult = holderConditions(byName('Cultivation: Cut, File, Carve, Polish'), real.identities)
    expect(cult).toHaveLength(1)
    expect(cult[0]).toMatchObject({ kind: 'trait', traits: ['Family Hierarch Candidate'], noun: 'a Family Hierarch Candidate' })
    expect(cult[0].share).toBeGreaterThan(0.25)
    expect(cult[0].share).toBeLessThan(0.6)
    expect(holderConditions(byName("Carpenter's Nail"), real.identities)[0]).toMatchObject({ kind: 'attackCount', attack: 'Pierce', min: 2, share: 1 })
    const capo = holderConditions(byName('For the Capo'), real.identities).find((c) => c.kind === 'status')!
    expect(capo).toMatchObject({ status: 'Ammo' })
    expect(capo.share).toBeGreaterThan(0.5)
    const capoMeursault = ident2('the-thumb-east-capo-iiii-meursault') // has "Unique Ammo"
    expect(holderFactor(byName('For the Capo'), capoMeursault, real.identities).met.map((c) => c.kind)).toContain('status')
    // Statuses on the target aren't conditions on the unit.
    expect(holderConditions(byName('Emergency Investigator Badge'), real.identities).map((c) => c.kind)).toEqual(['trait'])
  })

  it('reads more ways of naming a slot', () => {
    expect(giftSlots(byName('Brilliant Lamplight'))).toEqual({ slots: [1], whole: true })
    expect(giftSlots(byName('Bloody Mist'))).toEqual({ slots: [1], whole: false })
    expect(giftSlots(byName('Sorrowful Exhale'))).toEqual({ slots: [5], whole: false })
    expect(giftSlots(byName('The End of all Evil'))).toBeNull() // "earliest Deployment order" among Pequod units, not a slot
  })

  it('counts skills for "2+ Pierce Attack Skills"', () => {
    const nail = byName("Carpenter's Nail")
    const one = ident('one', 'Yi Sang', { attack_types: ['Pierce', 'Slash'], attack_counts: { Pierce: 1, Slash: 2 } })
    const three = ident('three', 'Yi Sang', { attack_types: ['Pierce'], attack_counts: { Pierce: 3 } })
    expect(holderFactor(nail, one, real.identities).factor).toBeCloseTo(0.3)
    expect(holderFactor(nail, three, real.identities).factor).toBe(1)
  })

  it('scores a slot gift higher when the unit in that slot meets its condition', () => {
    const cult = byName('Cultivation: Cut, File, Carve, Polish')
    const rupture = real.identities.filter((i) => i.keywords.includes('Rupture') && i.sinner !== 'Ishmael')
      .filter((i, k, all) => all.findIndex((x) => x.sinner === i.sinner) === k).slice(0, 5)
    const withHierarch = [...rupture, hierarch]
    const other = real.identities.find((i) => i.sinner === 'Ishmael' && i.keywords.includes('Rupture') && i.id !== hierarch.id)!
    const without = [...rupture, other]
    const good = intrinsicScore(cult, makeContext(real, withHierarch, []))
    const bad = intrinsicScore(cult, makeContext(real, without, []))
    expect(good.score).toBeGreaterThan(bad.score)
    expect(good.reasons.map((r) => r.text)).toContain('Ishmael (#6) is a Family Hierarch Candidate, which it wants')
    expect(bad.reasons.map((r) => r.text)).toContain('Part of it needs a Family Hierarch Candidate in #6')
    // On the team but in the wrong slot: say where to move them.
    const misplaced = intrinsicScore(cult, makeContext(real, [hierarch, ...rupture], []))
    expect(misplaced.reasons.map((r) => r.text)).toContain('Part of it needs a Family Hierarch Candidate in #6: move Ishmael there')
  })

  it('suggests the order so the unit meeting the condition gets the slot', () => {
    const rupture = real.identities.filter((i) => i.keywords.includes('Rupture') && i.sinner !== 'Ishmael')
      .filter((i, k, all) => all.findIndex((x) => x.sinner === i.sinner) === k).slice(0, 5)
    const cult = byName('Cultivation: Cut, File, Carve, Polish')
    const { order, notes } = suggestOrder(real, [hierarch, ...rupture], 7, [cult.id])
    expect(order[5]).toBe('Ishmael')
    expect(notes.Ishmael).toMatch(/Family Hierarch Candidate for Cultivation/)
  })
})
