import { describe, expect, it } from 'vitest'
import {
  intrinsicScore, makeContext, packOnFloor, packsByGift, planCombos, planFusions, rankGifts, rankThemePacks,
  signatureStatuses, teamFocus, teamProfile,
} from './scoring'
import { gameData } from './data'
import type { GameData, Gift, Identity, ThemePack } from './types'

function gift(id: string, over: Partial<Gift> = {}): Gift {
  return {
    id, name: id, sin: 'wrath', tier: 2, cost: 100, keyword: null, secondary_keyword: null,
    status_effects: [], traits: [], effect: '', max_level: 0, pools: ['main'], theme_packs: [], events: [],
    fusion_recipe: null, wiki_url: '', ...over,
  }
}

function ident(
  id: string, keywords: Identity['keywords'], affinities: Identity['affinities'] = ['wrath'],
  extra: Partial<Identity> = {},
): Identity {
  return { id, name: id, sinner: 'Yi Sang', rarity: 3, affinities, keywords, status_effects: [], traits: [], wiki_url: '', ...extra }
}

function pack(id: string, pool: string[], exclusive: string[] = [], floors: ThemePack['floors'] = null): ThemePack {
  return { id, name: id, pool: 'themed', group: null, floors, gifts: exclusive, gift_pool: [...pool, ...exclusive], wiki_url: null }
}

const data: GameData = {
  gifts: [
    gift('burn-2', { keyword: 'Burn', status_effects: ['Burn'] }),
    gift('bleed-2', { keyword: 'Bleed', status_effects: ['Bleed'] }),
    gift('general-2'),
    gift('burn-4', { keyword: 'Burn', tier: 4 }),
    gift('bleed-4', { keyword: 'Bleed', tier: 4 }),
    gift('a', { keyword: 'Burn', tier: 1 }),
    gift('b', { keyword: 'Burn', tier: 1 }),
    gift('fused', { keyword: 'Burn', tier: 4, pools: ['fusion'] }),
    gift('off-fused', { keyword: 'Tremor', tier: 3, pools: ['fusion'] }),
    gift('pack-burn', { keyword: 'Burn', tier: 3, pools: ['themed'] }),
    gift('pack-bleed', { keyword: 'Bleed', tier: 3, pools: ['themed'] }),
  ],
  themePacks: [pack('fire', [], ['pack-burn']), pack('blood', [], ['pack-bleed'])],
  fusions: [
    { result: 'fused', ingredients: ['a', 'b'] },
    { result: 'off-fused', ingredients: ['burn-4', 'burn-2'] },
  ],
  identities: [],
  generatedAt: null,
}

const burnTeam = [ident('x', ['Burn']), ident('y', ['Burn']), ident('z', ['Bleed'])]

describe('teamProfile', () => {
  it('counts keywords and sins', () => {
    const p = teamProfile(burnTeam)
    expect(p.size).toBe(3)
    expect(p.keywordCounts.Burn).toBe(2)
    expect(p.sinCounts.wrath).toBe(3)
    expect(teamFocus(p).map((f) => f.keyword)).toEqual(['Burn', 'Bleed'])
  })
})

describe('rankGifts', () => {
  it('ranks gifts matching the team keyword first', () => {
    const ranked = rankGifts(makeContext(data, burnTeam, []))
    const pos = (id: string) => ranked.findIndex((g) => g.gift.id === id)
    expect(ranked[0].gift.id).toBe('burn-4')
    expect(ranked[0].rating).toBe(100)
    expect(pos('burn-2')).toBeLessThan(pos('bleed-2'))
    expect(pos('bleed-4')).toBeLessThan(pos('bleed-2')) // tier still matters
  })

  it('pushes off-team keywords below general gifts', () => {
    const ranked = rankGifts(makeContext(data, [ident('x', ['Burn'])], []))
    const pos = (id: string) => ranked.findIndex((g) => g.gift.id === id)
    expect(pos('general-2')).toBeLessThan(pos('bleed-2'))
    const bleed = ranked.find((g) => g.gift.id === 'bleed-2')!
    expect(bleed.reasons.some((r) => r.kind === 'bad')).toBe(true)
  })

  it('leaves out owned gifts', () => {
    const ranked = rankGifts(makeContext(data, burnTeam, ['burn-4']))
    expect(ranked.some((g) => g.gift.id === 'burn-4')).toBe(false)
  })

  it('boosts the last missing fusion ingredient', () => {
    const without = rankGifts(makeContext(data, burnTeam, [])).find((g) => g.gift.id === 'b')!
    const withA = rankGifts(makeContext(data, burnTeam, ['a'])).find((g) => g.gift.id === 'b')!
    expect(withA.score).toBeGreaterThan(without.score)
    expect(withA.reasons[0].text).toMatch(/Last missing piece to fuse fused/)
  })

  it('ranks by tier when no team is picked', () => {
    const ranked = rankGifts(makeContext(data, [], []))
    expect(ranked[0].gift.tier).toBe(4)
    expect(ranked.every((g) => g.reasons.every((r) => r.kind !== 'bad'))).toBe(true)
  })
})

describe('rankThemePacks', () => {
  it('recommends the pack whose gifts fit the team', () => {
    const packs = rankThemePacks(makeContext(data, [ident('x', ['Burn'])], []))
    expect(packs[0].pack.id).toBe('fire')
    expect(packs[0].verdict).toBe('go')
    expect(packs[1].verdict).toBe('skip')
  })

  it('skips packs whose gifts you already own', () => {
    const packs = rankThemePacks(makeContext(data, burnTeam, ['pack-burn']))
    const fire = packs.find((p) => p.pack.id === 'fire')!
    expect(fire.verdict).toBe('skip')
    expect(fire.reasons.some((r) => /already have everything/.test(r.text))).toBe(true)
  })
})

describe('team synergy', () => {
  const synergyData: GameData = {
    ...data,
    gifts: [
      ...data.gifts,
      gift('mao-bolus', { keyword: 'Rupture', tier: 2, traits: ['Heishou Pack - Mao Branch'] }),
      gift('rupture-4', { keyword: 'Rupture', tier: 4 }),
      gift('scorch-2', { keyword: 'Tremor', tier: 2, status_effects: ['Tremor', 'Tremor - Scorch'] }),
      gift('tremor-4', { keyword: 'Tremor', tier: 4, status_effects: ['Tremor'] }),
      gift('haste-2', { keyword: 'Tremor', tier: 2, status_effects: ['Haste'] }),
    ],
    identities: [
      ...Array.from({ length: 12 }, (_, i) => ident(`filler-${i}`, ['Tremor'], ['wrath'], { status_effects: ['Haste'] })),
      ident('thumb-a', ['Tremor', 'Burn'], ['wrath'], { status_effects: ['Tremor - Scorch'], traits: ['The Thumb'] }),
      ident('thumb-b', ['Tremor'], ['wrath'], { status_effects: ['Tremor - Scorch'], traits: ['The Thumb'] }),
    ],
  }
  const mao = (n: string) => ident(n, ['Rupture'], ['gluttony'], { traits: ['Heishou Pack', 'Heishou Pack - Mao Branch'] })

  it('ranks a low-tier gift built for your affiliation above a generic high-tier one', () => {
    const ranked = rankGifts(makeContext(synergyData, [mao('a'), mao('b'), mao('c')], []))
    const pos = (id: string) => ranked.findIndex((g) => g.gift.id === id)
    expect(pos('mao-bolus')).toBeLessThan(pos('rupture-4'))
    const bolus = ranked[pos('mao-bolus')]
    expect(bolus.synergy).toBe(true)
    expect(bolus.reasons[0].text).toBe('Built for Heishou Pack - Mao Branch identities (3 on your team)')
  })

  it('marks down affiliation gifts your team can\'t use', () => {
    const team = [ident('x', ['Rupture']), ident('y', ['Rupture'])]
    const bolus = rankGifts(makeContext(synergyData, team, [])).find((g) => g.gift.id === 'mao-bolus')!
    expect(bolus.reasons.some((r) => r.kind === 'bad' && /doesn't have/.test(r.text))).toBe(true)
  })

  it('treats rare statuses like Tremor - Scorch as team-specific, but not common ones', () => {
    const sig = signatureStatuses(synergyData.identities)
    expect(sig.has('Tremor - Scorch')).toBe(true)
    expect(sig.has('Haste')).toBe(false) // 12 identities have it
    const team = synergyData.identities.filter((i) => i.id.startsWith('thumb'))
    const ranked = rankGifts(makeContext(synergyData, team, []))
    const pos = (id: string) => ranked.findIndex((g) => g.gift.id === id)
    expect(pos('scorch-2')).toBeLessThan(pos('tremor-4'))
    expect(ranked[pos('scorch-2')].reasons[0].text).toBe('Works with Tremor - Scorch (2 of your team apply it)')
  })
})

describe('targets and theme pack pools', () => {
  const poolData: GameData = {
    ...data,
    themePacks: [
      pack('two-targets', ['burn-2', 'bleed-2', 'general-2'], [], { normal: [1, 2], hard: [1, 1] }),
      pack('one-target', ['burn-4', 'burn-2'], ['pack-burn'], { normal: [3, 3], hard: null }),
      pack('no-targets', ['burn-4', 'bleed-4']),
    ],
  }

  it('puts packs with the most targets first', () => {
    const ctx = makeContext(poolData, burnTeam, [], ['bleed-2', 'general-2', 'burn-2'])
    const ranked = rankThemePacks(ctx)
    expect(ranked.map((p) => p.pack.id)).toEqual(['two-targets', 'one-target', 'no-targets'])
    expect(ranked[0].targets).toHaveLength(3)
    expect(ranked[0].reasons[0].text).toMatch(/Has 3 of your targets/)
    expect(ranked[2].reasons.some((r) => r.text === 'None of your targets drop here')).toBe(true)
    expect(ranked.filter((p) => p.targets.length).every((p) => p.verdict !== 'skip')).toBe(true)
  })

  it('ranks by pool quality when there are no targets, and ignores owned targets', () => {
    const ranked = rankThemePacks(makeContext(poolData, burnTeam, ['burn-2'], ['burn-2']))
    expect(ranked[0].pack.id).toBe('one-target') // tier IV Burn + exclusive Burn
    expect(ranked.every((p) => p.targets.length === 0)).toBe(true)
  })

  it('knows which packs give a gift and which floors a pack is on', () => {
    const byGift = packsByGift(poolData.themePacks)
    expect(byGift.get('burn-2')!.map((p) => p.id)).toEqual(['two-targets', 'one-target'])
    const [a, b] = poolData.themePacks
    expect(packOnFloor(a, 'normal', 2)).toBe(true)
    expect(packOnFloor(a, 'hard', 2)).toBe(false)
    expect(packOnFloor(b, 'hard', 3)).toBe(false) // not offered on Hard
    expect(packOnFloor(poolData.themePacks[2], 'normal', 1)).toBe(false) // unknown floors
    expect(packOnFloor({ ...a, floors: { normal: null, hard: null, extreme: [11, 15] } }, 'extreme', 12)).toBe(true)
  })
})

describe('gifts that work beyond their keyword', () => {
  const S = (status: string, when = 'always') => ({ status, when })
  const d: GameData = {
    ...data,
    gifts: [
      gift('spanner', { keyword: 'Tremor', tier: 1, attack_types: ['Blunt'], applies: [S('Tremor', 'attack:Blunt')] }),
      gift('downpour', { keyword: 'Tremor', tier: 4, applies: [S('Tremor'), S('Tremor Burst')] }),
      gift('bell', { keyword: 'Tremor', tier: 3, needs: ['Tremor Burst'], applies: [S('Fragile')] }),
      gift('eyeball', { keyword: 'Tremor', tier: 3, needs: ['Tremor Burst'] }),
      gift('tremor-plain', { keyword: 'Tremor', tier: 3 }),
      gift('gated', { keyword: 'Tremor', tier: 4, team_gate: true, applies: [S('Tremor')] }),
      gift('gloom-coat', { tier: 2, affinities: ['gloom'] }),
    ],
    combos: [{ id: 'c', name: 'Tremor debuffs', gifts: ['downpour', 'eyeball', 'bell'], why: '' }],
  }
  const blunt = [
    ident('a', ['Bleed'], ['wrath'], { attack_types: ['Blunt'] }),
    ident('b', ['Bleed'], ['gloom'], { attack_types: ['Blunt', 'Slash'] }),
  ]
  const find = (ctx: ReturnType<typeof makeContext>, id: string) => rankGifts(ctx).find((g) => g.gift.id === id)!

  it('values an attack-type gift for a team with that attack type', () => {
    const r = find(makeContext(d, blunt, []), 'spanner')
    expect(r.fit).toBe(1)
    expect(r.reasons[0].text).toBe('2/2 of your team use Blunt skills')
    expect(r.reasons.some((x) => /No one on your team uses Tremor/.test(x.text))).toBe(false)
  })

  it('ignores attack types when identity data has none', () => {
    const r = find(makeContext(d, [ident('x', ['Bleed'])], []), 'spanner')
    expect(r.fit).toBe(0)
  })

  it('counts gifts that apply their own status as working for any team', () => {
    const ctx = makeContext(d, blunt, [])
    expect(find(ctx, 'downpour').fit).toBe(0.5)
    expect(find(ctx, 'downpour').reasons[0].text).toMatch(/Works on its own: applies Tremor and Tremor Burst itself/)
    expect(find(ctx, 'tremor-plain').fit).toBe(0)
    expect(find(ctx, 'gated').fit).toBe(0) // only activates with enough identities
  })

  it('writes off a payoff gift until something provides what it needs', () => {
    const before = find(makeContext(d, blunt, []), 'bell')
    expect(before.fit).toBeLessThanOrEqual(0.1)
    expect(before.reasons.map((x) => x.text)).toContain(
      'Needs Tremor Burst on enemies, which nothing on your team or in your gifts provides (downpour would)')
    const after = find(makeContext(d, blunt, ['downpour']), 'bell')
    expect(after.fit).toBe(0.75)
    expect(after.reasons.some((x) => x.text === 'Works with downpour, which you have')).toBe(true)
    expect(after.score).toBeGreaterThan(before.score)
  })

  it('boosts the gift that would make one you own work', () => {
    const plain = intrinsicScore(d.gifts[1], makeContext(d, blunt, []))
    const r = intrinsicScore(d.gifts[1], makeContext(d, blunt, ['bell']))
    expect(r.reasons[0].text).toBe('Makes bell work')
    expect(r.score).toBeGreaterThan(plain.score)
  })

  it('scores sin-affinity conditions', () => {
    const r = find(makeContext(d, blunt, []), 'gloom-coat')
    expect(r.reasons.some((x) => x.text === 'Uses Gloom affinity (1/2 of your team have it)')).toBe(true)
  })

  it('boosts the rest of a combo you have started, including custom combos', () => {
    const ctx = makeContext(d, blunt, ['downpour'], [], [{ id: 'mine', name: 'Mine', gifts: ['spanner', 'gloom-coat'], why: '', custom: true }])
    expect(find(ctx, 'eyeball').reasons[0].text).toBe('Part of the "Tremor debuffs" combo (you have 1/3)')
    const plans = planCombos(ctx)
    expect(plans.map((p) => p.combo.id)).toEqual(['c', 'mine'])
    expect(plans[0].missing.map((g) => g.id)).toEqual(['eyeball', 'bell'])
    const withSpanner = makeContext(d, blunt, ['spanner'], [], ctx.combos.filter((c) => c.custom))
    expect(find(withSpanner, 'gloom-coat').reasons[0].text).toMatch(/"Mine" combo/)
  })
})

describe('planFusions', () => {
  it('says to craft an on-keyword upgrade', () => {
    const plans = planFusions(makeContext(data, burnTeam, ['a', 'b']))
    const p = plans.find((x) => x.result.id === 'fused')!
    expect(p.status).toBe('ready')
    expect(p.verdict).toBe('craft')
  })

  it('says to fuse three on-keyword gifts into one higher-tier payoff', () => {
    const three: GameData = {
      ...data,
      gifts: [...data.gifts, gift('t1', { keyword: 'Burn', tier: 1 }), gift('t3a', { keyword: 'Burn', tier: 3 }),
        gift('t3b', { keyword: 'Burn', tier: 3 }), gift('payoff', { keyword: 'Burn', tier: 4 })],
      fusions: [{ result: 'payoff', ingredients: ['t1', 't3a', 't3b'] }],
    }
    const p = planFusions(makeContext(three, burnTeam, ['t1', 't3a', 't3b']))[0]
    expect(p.verdict).toBe('craft')
  })

  it('says to hold on-keyword ingredients rather than fuse an off-keyword result', () => {
    const plans = planFusions(makeContext(data, [ident('x', ['Burn'])], ['burn-4', 'burn-2']))
    const p = plans.find((x) => x.result.id === 'off-fused')!
    expect(p.verdict).toBe('hold')
  })

  it('reports how close you are', () => {
    const plans = planFusions(makeContext(data, burnTeam, ['a']))
    expect(plans.find((x) => x.result.id === 'fused')!.status).toBe('close')
    expect(plans.some((x) => x.result.id === 'off-fused')).toBe(false) // nothing collected
  })
})

describe('real scraped data', () => {
  it('is internally consistent', () => {
    const ids = new Set(gameData.gifts.map((g) => g.id))
    expect(gameData.gifts.length).toBeGreaterThan(100)
    expect(gameData.identities.length).toBeGreaterThan(50)
    for (const p of gameData.themePacks) for (const g of p.gifts) expect(ids.has(g)).toBe(true)
    for (const f of gameData.fusions) {
      expect(ids.has(f.result)).toBe(true)
      for (const i of f.ingredients) expect(ids.has(i)).toBe(true)
    }
  })

  it('puts Heishou Bolus - Mao near the top for a Heishou Mao team', () => {
    const team = gameData.identities.filter((i) => i.traits.includes('Heishou Pack - Mao Branch'))
    expect(team.length).toBeGreaterThan(0)
    const top = rankGifts(makeContext(gameData, team, [])).slice(0, 10).map((g) => g.gift.name)
    expect(top).toContain('Heishou Bolus - Mao')
  })

  it('puts Tributary Cigar and Tremor - Scorch gifts near the top for a Thumb team', () => {
    const team = gameData.identities.filter((i) => i.traits.includes('The Thumb'))
    expect(team.length).toBeGreaterThan(0)
    const top = rankGifts(makeContext(gameData, team, [])).slice(0, 10)
    expect(top.map((g) => g.gift.name)).toContain('Tributary Cigar')
    expect(top.some((g) => g.gift.status_effects.includes('Tremor - Scorch'))).toBe(true)
  })

  it('ranks Burn gifts first for an all-Burn team', () => {
    const burners = gameData.identities.filter((i) => i.keywords.includes('Burn')).slice(0, 6)
    const top = rankGifts(makeContext(gameData, burners, [])).slice(0, 10)
    expect(top.filter((g) => g.gift.keyword === 'Burn').length).toBeGreaterThanOrEqual(7)
  })
})
