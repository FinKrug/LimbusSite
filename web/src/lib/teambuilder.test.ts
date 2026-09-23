import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { giftSlots, slotText } from './lineup'
import { makeContext, rankGifts, rankThemePacks } from './scoring'
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
    const { order } = suggestOrder(gameData, team, 6)
    const deployed = order.slice(0, 6).map((s) => team.find((i) => i.sinner === s)!)
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
