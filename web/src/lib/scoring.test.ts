import { describe, expect, it } from 'vitest'
import {
  intrinsicScore, isSurvival, makeContext, packInDifficulty, packOnFloor, packPool, packsByGift, planCombos, planFusions, rankGifts, rankThemePacks,
  activates, scoreGift, setHas, signatureStatuses, teamFocus, teamGate, teamProfile, upgradeMagnitude, upgradeValue,
} from './scoring'
import { gameData } from './data'
import { traitShare } from './traitparts'
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
    expect(bolus.reasons[0].text).toMatch(/^Built for Heishou Pack - Mao Branch identities \(3 on your team: /)
  })

  it('marks down affiliation gifts your team can\'t use', () => {
    const team = [ident('x', ['Rupture']), ident('y', ['Rupture'])]
    const bolus = rankGifts(makeContext(synergyData, team, [])).find((g) => g.gift.id === 'mao-bolus')!
    expect(bolus.reasons.some((r) => r.kind === 'bad' && /none are deployed/.test(r.text))).toBe(true)
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

  it('ranks by pool quality for the team', () => {
    const ranked = rankThemePacks(makeContext(poolData, burnTeam, ['burn-2']))
    expect(ranked[0].pack.id).toBe('one-target') // tier IV Burn + exclusive Burn
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

  it('values an attack-type route less when no one uses the gift\'s keyword', () => {
    const r = find(makeContext(d, blunt, []), 'spanner')
    expect(r.fit).toBeCloseTo(0.3) // 2/2 use Blunt, but 0/2 use Tremor: x (0.3 + 0.4 x 0)
    expect(r.reasons[0].text).toBe('2/2 of your team use Blunt skills')
    expect(r.reasons.some((x) => /No one on your team uses Tremor/.test(x.text))).toBe(false)
  })

  it('ignores attack types when identity data has none', () => {
    const r = find(makeContext(d, [ident('x', ['Bleed'])], []), 'spanner')
    expect(r.fit).toBe(0)
  })

  it('counts gifts that apply their own status as partly working for any team', () => {
    const ctx = makeContext(d, blunt, [])
    expect(find(ctx, 'downpour').fit).toBeCloseTo(0.15) // standalone 0.5 x 0.3: a Bleed team gets little from a Tremor gift
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
    expect(after.fit).toBeCloseTo(0.225) // works with downpour (0.75), x 0.3 for a team without Tremor
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

  it('boosts the rest of a combo you have started', () => {
    const ctx = makeContext(d, blunt, ['downpour'], { combos: [{ id: 'mine', name: 'Mine', gifts: ['spanner', 'gloom-coat'], why: '' }] })
    expect(find(ctx, 'eyeball').reasons[0].text).toBe('Combos with downpour, which you have ("Tremor debuffs")')
    const plans = planCombos(ctx)
    expect(plans.map((p) => p.combo.id)).toEqual(['c', 'mine'])
    expect(plans[0].missing.map((g) => g.id)).toEqual(['eyeball', 'bell'])
    const withSpanner = makeContext(d, blunt, ['spanner'], { combos: ctx.combos.filter((c) => c.id === 'mine') })
    expect(find(withSpanner, 'gloom-coat').reasons[0].text).toMatch(/Combos with spanner.*"Mine"/)
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

describe('affiliation-only effects', () => {
  const real = gameData
  const byId = (id: string) => real.identities.find((i) => i.id === id)!
  const burnTeam = real.identities.filter((i) => i.keywords.includes('Burn') && !i.traits?.includes('Heishou Pack - You Branch'))
    .filter((i, k, all) => all.findIndex((x) => x.sinner === i.sinner) === k).slice(0, 6)
  const youTeam = [
    byId('heishou-pack-you-branch-adept-heathcliff'), byId('heishou-pack-you-branch-sinclair'),
    ...burnTeam.filter((i) => i.sinner !== 'Heathcliff' && i.sinner !== 'Sinclair').slice(0, 4),
  ]
  const bloodflame = real.gifts.find((g) => g.id === 'bloodflame-sword')!

  it('splits Bloodflame Sword into a small Burn part and a big You Branch part', () => {
    expect(traitShare(bloodflame)).toBeGreaterThan(0.5)
    expect(traitShare(real.gifts.find((g) => g.id === 'uniform-liu-assoc')!)).toBeLessThan(0.3)
  })

  it('is worth much more with You Branch identities deployed than on a plain Burn team', () => {
    const plain = intrinsicScore(bloodflame, makeContext(real, burnTeam, []))
    const withYou = intrinsicScore(bloodflame, makeContext(real, youTeam, []))
    expect(withYou.score).toBeGreaterThan(2 * plain.score)
    expect(plain.reasons.map((r) => r.text)).toContain(
      'Most of it only works for Heishou Pack - You Branch identities (Heathcliff, Sinclair), and none are deployed')
    expect(withYou.reasons[0].text).toBe('Built for Heishou Pack - You Branch identities (2 on your team: Heathcliff, Sinclair)')
  })

  it('gives other Heishou branches no credit for a You Branch gift', () => {
    // The demo lineup: five Heishou units deployed (Mao, Si), the You Branch pair on the bench.
    const ids = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
      'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion',
      'heishou-pack-si-branch-gregor', 'heishou-pack-you-branch-sinclair', 'heishou-pack-you-branch-adept-heathcliff']
    const lineup = ids.map(byId)
    const heishou = intrinsicScore(bloodflame, makeContext(real, lineup, [], { deployed: 7 }))
    const texts = heishou.reasons.map((r) => r.text)
    expect(texts.some((t) => /5 Heishou/.test(t))).toBe(false)
    expect(texts).toContain('Most of it only works for Heishou Pack - You Branch identities (Heathcliff, Sinclair), and yours (Sinclair, Heathcliff) are backups')
    expect(heishou.parts.some((p) => p.kind === 'synergy')).toBe(false)
    const deployedYou = intrinsicScore(bloodflame, makeContext(real, lineup, [], { deployed: 9 }))
    expect(deployedYou.score).toBeGreaterThan(heishou.score)
  })

  it('counts strong members for more', () => {
    const rated = (tier: 'SSS' | 'D') => intrinsicScore(bloodflame, makeContext(real, youTeam, [], { deployed: 6, tiers: {
      'heishou-pack-you-branch-adept-heathcliff': tier, 'heishou-pack-you-branch-sinclair': tier,
    } })).score
    expect(rated('SSS')).toBeGreaterThan(rated('D'))
  })

  it('only counts members that are deployed', () => {
    const benched = [...youTeam.slice(2), ...youTeam.slice(0, 2)]
    const ctx = makeContext(real, benched, [], { deployed: 4 })
    expect(intrinsicScore(bloodflame, ctx).reasons.some((r) => r.text.startsWith('Built for'))).toBe(false)
  })
})

describe('floors on EXTREME', () => {
  const real = gameData.themePacks
  const named = (n: string) => real.find((p) => p.name === n)!

  it('uses Hard floors for 1–10 and the Extreme packs for 11–15', () => {
    expect(packOnFloor(named('Line 3'), 'extreme', 6)).toBe(packOnFloor(named('Line 3'), 'hard', 6))
    expect(packOnFloor(named('Bridle of Infinity'), 'extreme', 6)).toBe(false)
    expect(packOnFloor(named('Bridle of Infinity'), 'extreme', 12)).toBe(true)
    for (let floor = 1; floor <= 15; floor++) {
      expect(real.filter((p) => packOnFloor(p, 'extreme', floor)).length, `floor ${floor}`).toBeGreaterThan(0)
    }
  })

  it('ranks packs for every EXTREME floor', () => {
    const ctx = makeContext(gameData, gameData.identities.filter((i) => i.keywords.includes('Rupture')).slice(0, 7), [])
    for (const floor of [1, 5, 10, 11, 15]) {
      const ranked = rankThemePacks(ctx, real.filter((p) => packOnFloor(p, 'extreme', floor)))
      expect(ranked.length, `floor ${floor}`).toBeGreaterThan(0)
      expect(ranked[0].verdict).toBe('go')
    }
  })

  it('"any floor" keeps to packs that can show up on that difficulty', () => {
    const normalOnly = real.find((p) => p.floors?.normal && !p.floors.hard && !p.floors.extreme)
    if (normalOnly) expect(packInDifficulty(normalOnly, 'extreme')).toBe(false)
    expect(packInDifficulty(named('Line 3'), 'extreme')).toBe(true)
  })
})

describe('weights by how many units a gift helps, and by the run', () => {
  const byName = (n: string) => gameData.identities.find((i) => i.name === n)!
  const scorch = ['Dawn Office Fixer Faust', 'The Thumb East Capo IIII Meursault', 'The House of Spiders: The Thumb Apprentice Heathcliff',
    'The House of Spiders: The Thumb Nursefather Rodion', 'The Thumb East Soldato II Sinclair', 'Dawn Office Rep Gregor',
    'Heishou Pack - Mao Branch Outis'].map(byName)
  const gift = (n: string) => gameData.gifts.find((g) => g.name === n)!
  const score = (n: string, ctx: ReturnType<typeof makeContext>) => intrinsicScore(gift(n), ctx).score

  it('keeps one Rupture unit from pulling Rupture gifts above Burn and Tremor ones', () => {
    const top = rankGifts(makeContext(gameData, scorch, [])).slice(0, 12)
    expect(top.filter((g) => g.gift.keyword === 'Rupture').map((g) => g.gift.name)).toEqual([])
    const shadow = rankGifts(makeContext(gameData, scorch, [])).find((g) => g.gift.name === 'Shadowlurking')!
    expect(shadow.reasons.some((r) => /only 1\/7 of your team use Rupture/.test(r.text))).toBe(true)
  })

  it('counts a slot gift for one unit less than the same effect for the whole team', () => {
    const ctx = makeContext(gameData, scorch, [])
    const slotted = intrinsicScore(gift('Sundered Memory'), ctx)
    expect(slotted.parts.find((p) => p.kind === 'core')!.detail).toMatch(/Only helps \d of your 7 deployed units/)
  })

  it('values Cost gifts by the floors left', () => {
    const at = (floors: number, floor: number) =>
      score('Golden Urn', makeContext(gameData, scorch, [], { run: { difficulty: 'extreme', floors, floor, pack: null } }))
    expect(at(15, 1)).toBeGreaterThan(at(15, 12))
    expect(at(15, 1)).toBeGreaterThan(at(5, 1))
  })

  it('values "survive a lethal hit" gifts most late in a long run', () => {
    const at = (floors: number, floor: number) =>
      score('Swishing Fuel Tank', makeContext(gameData, scorch, [], { run: { difficulty: 'extreme', floors, floor, pack: null } }))
    expect(at(15, 13)).toBeGreaterThan(at(15, 2))
    expect(at(15, 2)).toBeGreaterThan(at(5, 2))
  })

  it('treats Spiderweb Entangled in Red as a Blade of the House of Spiders Ryoshu gift', () => {
    const spiders = scorch // has House of Spiders Heathcliff and Rodion, no Blade Ryoshu
    const without = intrinsicScore(gift('Spiderweb Entangled in Red'), makeContext(gameData, spiders, []))
    expect(without.reasons.some((r) => /Built for The House of Spiders/.test(r.text))).toBe(false)
    expect(without.reasons.some((r) => /only works for Blade of the House of Spiders Ryōshū, who isn't on your team/.test(r.text))).toBe(true)
    expect(without.reasons.some((r) => /Only pays off when your own units die/.test(r.text))).toBe(true)
    const blade = byName('Blade of the House of Spiders Ryōshū')
    const withBlade = intrinsicScore(gift('Spiderweb Entangled in Red'), makeContext(gameData, [...spiders.slice(0, 6), blade], []))
    expect(withBlade.reasons[0].text).toMatch(/Built for Blade of the House of Spiders Ryōshū, who's on your team/)
    expect(withBlade.score).toBeGreaterThan(without.score * 2)
    const rank = (ctx: ReturnType<typeof makeContext>) => rankGifts(ctx).findIndex((g) => g.gift.name === 'Spiderweb Entangled in Red')
    expect(rank(makeContext(gameData, spiders, []))).toBeGreaterThan(40)
  })

  it('marks down gifts that only pay off when your own units die', () => {
    const r = intrinsicScore(gift('Value Disposal'), makeContext(gameData, scorch, []))
    expect(r.reasons.some((x) => /own units die/.test(x.text))).toBe(true)
  })

  it('does not count "will not be revived" as a survival gift', () => {
    expect(isSurvival(gift('Spiderweb Entangled in Red'))).toBe(false)
    expect(isSurvival(gift('Swishing Fuel Tank'))).toBe(true)
  })

  it('marks White Gossypium down unless the team is built on Bleed', () => {
    const bleeders = gameData.identities.filter((i) => i.keywords.length === 1 && i.keywords[0] === 'Bleed').slice(0, 7)
    const forScorch = intrinsicScore(gift('White Gossypium'), makeContext(gameData, scorch, []))
    expect(forScorch.reasons[0]).toEqual(expect.objectContaining({ kind: 'bad', text: expect.stringMatching(/Un-staggers enemies/) }))
    const forBleed = intrinsicScore(gift('White Gossypium'), makeContext(gameData, bleeders, []))
    expect(forBleed.reasons[0].kind).toBe('info')
  })
})

describe('E.G.O and Resonance in gift scores', () => {
  const real = (n: string) => gameData.gifts.find((g) => g.name === n)!
  const sk = (slot: 1 | 2 | 3, sin: Identity['affinities'][number], base: number) =>
    ({ slot, name: `S${slot}`, sin, type: 'Slash', base, coin_power: 3, coins: 2, copies: slot === 1 ? 3 : slot === 2 ? 2 : 1, weight: 1, statuses: [] })
  const unit = (id: string, sinner: Identity['sinner'], sins: Identity['affinities']) =>
    ident(id, ['Burn'], [...new Set(sins)], { sinner, skills: [sk(1, sins[0], 4), sk(2, sins[1], 5), sk(3, sins[2], 7)] as Identity['skills'] })

  it('an E.G.O-only gift is worth more to a team that uses its E.G.O', () => {
    const team = [unit('a', 'Yi Sang', ['wrath', 'wrath', 'lust']), unit('b', 'Faust', ['lust', 'wrath', 'pride']), unit('c', 'Gregor', ['envy', 'wrath', 'gloom'])]
    const egos = [{ id: 'e', name: 'e', sinner: 'Yi Sang' as const, grade: 'HE' as const, sin: 'wrath' as const, cost: { wrath: 2 }, sanity: 20, skill: null, statuses: [], wiki_url: '' }]
    const d = { ...gameData, egos }
    const frag = real('Fragment of Hellfire')
    const without = intrinsicScore(frag, makeContext(d, team, []))
    const withEgo = intrinsicScore(frag, makeContext(d, team, [], { loadout: { 'Yi Sang': { HE: 'e' } } }))
    expect(withEgo.score).toBeGreaterThan(without.score)
    expect(without.reasons.some((r) => /pick your E\.G\.O/.test(r.text))).toBe(true)
  })

  it('an Absolute Resonance gift is worth more to a team that lines that sin up', () => {
    const gluttons = [0, 1, 2, 3].map((k) => unit(`g${k}`, 'Yi Sang', ['gluttony', 'gluttony', 'wrath']))
    const others = [0, 1, 2, 3].map((k) => unit(`o${k}`, 'Yi Sang', ['wrath', 'gloom', 'gluttony']))
    const crown = real('Crown of Roses')
    const a = intrinsicScore(crown, makeContext(gameData, gluttons, []))
    const b = intrinsicScore(crown, makeContext(gameData, others, []))
    expect(a.score).toBeGreaterThan(b.score)
    expect(a.reasons.some((r) => r.kind === 'good' && /Gluttony Absolute Resonance/.test(r.text))).toBe(true)
  })
})

describe('team gates and fusion paths', () => {
  const real = (n: string) => gameData.gifts.find((g) => g.name === n)!
  const withPoise = (id: string, sinner: Identity['sinner']) => ident(id, ['Poise'], ['pride'], { sinner })
  const without = (id: string, sinner: Identity['sinner']) => ident(id, ['Burn'], ['wrath'], { sinner })
  const sinners: Identity['sinner'][] = ['Yi Sang', 'Faust', 'Don Quixote', 'Ryōshū', 'Meursault', 'Hong Lu', 'Heathcliff']

  it('reads "N or more Identities have Attack Skills that ..." conditions', () => {
    expect(teamGate(real('Cask Spirits'))).toEqual(expect.objectContaining({ n: 5, status: 'Poise', whole: true }))
    expect(teamGate(real('Interlocked Cogs'))?.status).toBe('Tremor')
    expect(teamGate(real('Endorphin Kit'))).toBeNull()
  })

  it('a gift that stays off for your team is worth little', () => {
    const three = sinners.map((s, k) => (k < 3 ? withPoise(`p${k}`, s) : without(`b${k}`, s)))
    const five = sinners.map((s, k) => (k < 5 ? withPoise(`p${k}`, s) : without(`b${k}`, s)))
    const off = intrinsicScore(real('Cask Spirits'), makeContext(gameData, three, []))
    const on = intrinsicScore(real('Cask Spirits'), makeContext(gameData, five, []))
    expect(off.reasons[0].text).toMatch(/Stays off: needs 5 deployed identities with Poise skills, you have 3/)
    expect(on.reasons.some((r) => /Switches on/.test(r.text))).toBe(true)
    expect(on.score).toBeGreaterThan(off.score * 3)
  })

  it("a gift your team can't use still counts for a fusion result it can", () => {
    const d: GameData = {
      ...data,
      gifts: [...data.gifts, gift('off1', { keyword: 'Tremor', tier: 1 }), gift('off2', { keyword: 'Tremor', tier: 1 }),
        gift('payoff', { keyword: 'Burn', tier: 4, pools: ['fusion'] })],
      fusions: [...data.fusions, { result: 'payoff', ingredients: ['off1', 'off2'] }],
    }
    const ctx = makeContext(d, burnTeam, [])
    const piece = rankGifts(ctx).find((s) => s.gift.id === 'off1')!
    expect(piece.parts.some((p) => p.kind === 'fusion' && /Starts a fusion into payoff/.test(p.label))).toBe(true)
    expect(piece.reasons.some((r) => r.kind === 'good' && /suits your team better/.test(r.text))).toBe(true)
    const plain = intrinsicScore(d.gifts.find((g) => g.id === 'off1')!, ctx).score
    expect(piece.score).toBeGreaterThan(plain)
  })
})

describe('upgrades', () => {
  const real = (n: string) => gameData.gifts.find((g) => g.name === n)!
  it('compares upgraded numbers sentence by sentence', () => {
    const t = real('Thunderbranch')
    const m = upgradeMagnitude(t.effect, t.upgrades![1])
    expect(m.ratio).toBeCloseTo(2)
    expect(m.extra).toBeGreaterThan(0.2)
    // One 1 -> 10 jump doesn't make the whole gift 2.5x.
    const g = real('Charge-type Gloves')
    expect(upgradeMagnitude(g.effect, g.upgrades![0]).ratio).toBeLessThan(1.6)
    expect(upgradeMagnitude('Deal +10% damage.', 'Deal +10% damage.').mag).toBe(1)
  })

  it('credits a slot gift that covers more units when upgraded', () => {
    const team = ['Yi Sang', 'Faust', 'Don Quixote', 'Ryōshū', 'Meursault', 'Hong Lu'].map((s, k) =>
      ident(`u${k}`, ['Burn'], ['wrath'], { sinner: s as Identity['sinner'], attack_types: ['Blunt'], attack_counts: { Blunt: 3 } }))
    const ctx = makeContext(gameData, team, [], { deployed: 6 })
    const curse = real('Burial Curse')
    const up = upgradeValue(curse, ctx, intrinsicScore(curse, ctx).score)
    expect(up).not.toBeNull()
    expect(up!.reason.text).toMatch(/covers #4, #6 instead of #6/)
    const ranked = rankGifts(ctx).find((s) => s.gift.id === curse.id)!
    expect(ranked.parts.some((p) => p.kind === 'upgrade')).toBe(true)
  })

  it('counts less with few floors left', () => {
    const team = burnTeam
    const g = real('Thunderbranch')
    const early = makeContext(gameData, team, [], { run: { difficulty: 'hard', floors: 10, floor: 1, pack: null } })
    const late = makeContext(gameData, team, [], { run: { difficulty: 'hard', floors: 10, floor: 10, pack: null } })
    const a = upgradeValue(g, early, intrinsicScore(g, early).score)
    const b = upgradeValue(g, late, intrinsicScore(g, late).score)
    expect((b?.add ?? 0)).toBeLessThan(a?.add ?? 0)
  })
})

describe('theme pack cards', () => {
  it('show exclusives and a few boosted gifts, never fusion-only or widely shared ones', () => {
    const real = gameData
    const team = real.identities.filter((i) => i.keywords.includes('Rupture')).slice(0, 7)
    const ranked = rankThemePacks(makeContext(real, team, []))
    const count = new Map<string, number>()
    for (const p of real.themePacks) for (const id of packPool(p)) count.set(id, (count.get(id) ?? 0) + 1)
    for (const p of ranked) {
      for (const h of p.highlights) {
        // Fusion-only gifts never, except as a pack's clear reward (The B.E. offers Lunar Memory) or a recipe its own gifts finish.
        if (h.kind === 'clear') expect(p.pack.clear_rewards).toContain(h.gift.gift.id)
        else expect(h.gift.gift.id).not.toBe('lunar-memory')
        if (h.kind === 'exclusive') expect(p.pack.gifts).toContain(h.gift.gift.id)
        else if (h.kind === 'clear' || h.kind === 'fusion') continue
        else expect(count.get(h.gift.gift.id)!).toBeLessThanOrEqual(6)
      }
      expect(p.highlights.filter((h) => h.kind === 'boosted').length).toBeLessThanOrEqual(3)
    }
    expect(ranked.some((p) => p.highlights.length > 0)).toBe(true)
  })
})

describe('owned status sources', () => {
  it('a gift that already applies a status makes its payoffs worth more and other appliers worth less', () => {
    const ids = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
      'heishou-pack-mao-branch-outis', 'heishou-pack-si-branch-rodion', 'heishou-pack-si-branch-gregor']
    const team = ids.map((id) => gameData.identities.find((i) => i.id === id)!)
    expect(team.some((i) => i.keywords.includes('Tremor'))).toBe(false)
    const g = (id: string) => gameData.gifts.find((x) => x.id === id)!
    const before = makeContext(gameData, team, [])
    const after = makeContext(gameData, team, ['downpour'])
    const applier = gameData.gifts.find((x) => x.name === 'Venomous Skin')!
    expect(intrinsicScore(applier, after).score).toBeLessThan(intrinsicScore(applier, before).score)
    expect(intrinsicScore(applier, after).reasons.some((r) => /Downpour, which you have, already does/.test(r.text))).toBe(true)
    expect(intrinsicScore(g('bell-of-truth'), after).score).toBeGreaterThan(intrinsicScore(g('bell-of-truth'), before).score)
  })
})

describe('General gifts in theme packs', () => {
  it("count more toward their pack than keyword gifts, since fusing can't give them", () => {
    const general = gameData.gifts.find((g) => g.pools.includes('themed') && !g.pools.includes('main') && g.keyword === null && g.theme_packs.length === 1)!
    const keyworded = { ...general, id: 'test-keyword-copy', name: 'Keyword copy', keyword: 'Burn' as const }
    const data = { ...gameData, gifts: [...gameData.gifts, keyworded] }
    const pack = (id: string, gift: string) => ({ id, name: id, pool: 'themed' as const, group: null, floors: null, gifts: [gift], gift_pool: [gift], wiki_url: null })
    const team = gameData.identities.filter((i) => i.keywords.includes('Burn')).slice(0, 5)
    const ctx = makeContext(data, team, [])
    const ranked = rankThemePacks(ctx, [pack('a', general.id), pack('b', keyworded.id)])
    const a = ranked.find((p) => p.pack.id === 'a')!
    const b = ranked.find((p) => p.pack.id === 'b')!
    const ga = scoreGift(general, ctx).score
    const gb = scoreGift(keyworded, ctx).score
    // Same gift text: the General one's pack counts 1.3x its gift score, the keyword one's 1x.
    expect(a.split.best / ga).toBeCloseTo(1.3 * (b.split.best / gb), 1)
    expect(a.parts[0].notes.join(' ')).toMatch(/fusing can't give it/)
    expect(scoreGift(general, ctx).reasons.some((r) => /No keyword, so fusing can't give it/.test(r.text))).toBe(true)
  })
})


describe('keyword-free gift sets (combos.json, any_team)', () => {
  const sets = (gameData.combos ?? []).filter((c) => c.any_team)
  const burn = gameData.identities.filter((i) => i.keywords.includes('Burn'))
    .filter((i, k, a) => a.findIndex((x) => x.sinner === i.sinner) === k).slice(0, 7)
  const setPart = (id: string, owned: string[]) =>
    scoreGift(gameData.gifts.find((g) => g.id === id)!, makeContext(gameData, burn, owned)).parts.find((p) => p.kind === 'set')?.value ?? 0

  it('has the seven ranked sets from the guide, with real gifts', () => {
    expect(sets.map((c) => c.keyword)).toEqual(['Tremor', 'Poise', 'Sinking', 'Charge', 'Bleed', 'Rupture', 'Burn'])
    expect(sets.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7])
    const ids = new Set(gameData.gifts.map((g) => g.id))
    for (const c of sets) expect(c.gifts.every((id) => ids.has(id))).toBe(true)
  })

  it('values a piece on any team, more as you build the set and more for higher sets', () => {
    const alone = setPart('bio-venom-vial', [])
    expect(alone).toBeGreaterThan(0)
    expect(setPart('bio-venom-vial', ['downpour', 'melted-eyeball', 'nixie-divergence'])).toBeGreaterThan(2 * alone)
    // Tremor (#1) vs Rupture (#6), nothing owned.
    expect(setPart('bio-venom-vial', [])).toBeGreaterThan(setPart('barbed-lasso', []))
    const s = scoreGift(gameData.gifts.find((g) => g.id === 'bio-venom-vial')!, makeContext(gameData, burn, ['downpour']))
    expect(s.reasons.some((r) => /Piece of the Tremor set \(works for any team\): you have 1 of the other 5/.test(r.text))).toBe(true)
    // Set pieces aren't "built for your team" (that would inflate theme pack scores).
    expect(s.synergy).toBe(false)
  })
})

describe('fused gifts in gift sets', () => {
  it('count their ingredients as had when the fused gift switches on with your team', () => {
    const rupture = gameData.identities.filter((i) => i.keywords.includes('Rupture'))
      .filter((i, k, a) => a.findIndex((x) => x.sinner === i.sinner) === k).slice(0, 7)
    const burn = gameData.identities.filter((i) => i.keywords.includes('Burn') && !i.keywords.includes('Rupture'))
      .filter((i, k, a) => a.findIndex((x) => x.sinner === i.sinner) === k).slice(0, 7)
    const trance = gameData.gifts.find((g) => g.id === 'enrapturing-trance')!
    const on = makeContext(gameData, rupture, ['enrapturing-trance'])
    expect(activates(trance, on.members)).toBe(true)
    expect(setHas(on, 'talisman-bundle') && setHas(on, 'standard-duty-battery')).toBe(true)
    const thrill = scoreGift(gameData.gifts.find((g) => g.id === 'thrill')!, on)
    expect(thrill.reasons.some((r) => /Piece of the Rupture set \(works for any team\): you have 2 of the other 6/.test(r.text))).toBe(true)
    // A Burn team can't switch Enrapturing Trance on, so it doesn't stand in for its pieces.
    const off = makeContext(gameData, burn, ['enrapturing-trance'])
    expect(activates(trance, off.members)).toBe(false)
    expect(setHas(off, 'talisman-bundle')).toBe(false)
  })
})

describe('team-conditioned gifts (Chalice of Trickle-down)', () => {
  it("doesn't count a gift that only works for units with Tremor skills on a team with none", () => {
    const ids = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
      'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion', 'heishou-pack-si-branch-gregor']
    const team = ids.map((id) => gameData.identities.find((i) => i.id === id)!)
    const chalice = gameData.gifts.find((g) => g.id === 'chalice-of-trickle-down')!
    expect(chalice.applies).toEqual([{ status: 'Tremor', when: 'keyword:Tremor' }])
    const s = scoreGift(chalice, makeContext(gameData, team, ['downpour', 'melted-eyeball', 'nixie-divergence']))
    expect(s.fit).toBe(0)
    expect(s.reasons.some((r) => /Downpour/.test(r.text))).toBe(false)
  })
})

describe('gifts for units that trigger a mechanic (Interlinked Time)', () => {
  it('only counts for units that trigger Amplitude Conversion or Entanglement', () => {
    const heishou = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
      'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion', 'heishou-pack-si-branch-gregor']
      .map((id) => gameData.identities.find((i) => i.id === id)!)
    const amp = gameData.identities.filter((i) => i.status_effects.includes('Amplitude Conversion'))
      .filter((i, k, a) => a.findIndex((x) => x.sinner === i.sinner) === k).slice(0, 7)
    const time = gameData.gifts.find((g) => g.id === 'interlinked-time')!
    const off = scoreGift(time, makeContext(gameData, heishou, ['downpour']))
    expect(off.fit).toBe(0)
    expect(off.reasons.some((r) => /Only works for units that trigger Amplitude Conversion or Amplitude Entanglement, and no one on your team does/.test(r.text))).toBe(true)
    const on = scoreGift(time, makeContext(gameData, amp, []))
    expect(on.score).toBeGreaterThan(off.score + 1)
  })
})

describe('recipes a theme pack can finish', () => {
  const byId = (id: string) => gameData.identities.find((i) => i.id === id)!
  // Demo Heishou team with Family Hierarch Candidate Ishmael in #6.
  const team = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
    'heishou-pack-mao-branch-outis', 'heishou-pack-si-branch-rodion', 'family-hierarch-candidate-ishmael',
    'heishou-pack-si-branch-gregor'].map(byId)
  const run = { difficulty: 'hard' as const, floors: 10, floor: 5, pack: null }
  const spring = gameData.themePacks.find((p) => p.id === 'spring-cultivation')!

  it("counts the fused result toward the pack: Spring Cultivation's Virtues -> Cultivation: Cut, File, Carve, Polish", () => {
    const [p] = rankThemePacks(makeContext(gameData, team, [], { run }), [spring])
    const h = p.highlights.find((x) => x.kind === 'fusion')!
    expect(h.gift.gift.id).toBe('cultivation-cut-file-carve-polish')
    expect(h.where).toMatch(/^Fuse Virtue - Zhi .* and Virtue - Ren/)
    expect(p.parts.some((x) => x.gift.gift.id === h.gift.gift.id && x.value > 0)).toBe(true)
    expect(p.reasons.some((r) => /every piece you need is in this pack/.test(r.text))).toBe(true)
    // Owning two Virtues makes the last one worth more to the pack's recipe part.
    const [half] = rankThemePacks(makeContext(gameData, team, ['virtue-zhi', 'virtue-yong'], { run }), [spring])
    const part = (q: typeof p) => q.parts.find((x) => x.gift.gift.id === 'cultivation-cut-file-carve-polish')!.value
    expect(part(half)).toBeGreaterThan(part(p))
    // Once you have the result, nothing more to fuse.
    const [done] = rankThemePacks(makeContext(gameData, team, ['cultivation-cut-file-carve-polish'], { run }), [spring])
    expect(done.highlights.some((x) => x.kind === 'fusion')).toBe(false)
  })

  it("doesn't limit a slot gift's all-allies part to the slot once the unit there qualifies", () => {
    const cfcp = gameData.gifts.find((g) => g.id === 'cultivation-cut-file-carve-polish')!
    const withFhc = scoreGift(cfcp, makeContext(gameData, team, [], { run }))
    const swapped = [...team.slice(0, 4), team[5], team[4], team[6]]
    const without = scoreGift(cfcp, makeContext(gameData, swapped, [], { run }))
    expect(withFhc.reasons.some((r) => /Family Hierarch Candidate, which it wants: that part buffs all allies/.test(r.text))).toBe(true)
    expect(withFhc.score).toBeGreaterThan(without.score * 1.5)
  })
})

describe('keyword in name only', () => {
  it('scores Unhatched Embers (a "Burn" gift that only revives) as a general survival gift', () => {
    const byId = (id: string) => gameData.identities.find((i) => i.id === id)!
    const heishou = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
      'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion', 'heishou-pack-si-branch-gregor'].map(byId)
    const ranked = rankGifts(makeContext(gameData, heishou, []))
    const k = ranked.findIndex((g) => g.gift.id === 'unhatched-embers')
    expect(k).toBeLessThan(80)
    const r = ranked[k]
    expect(r.reasons.some((x) => /A Burn gift in name only/.test(x.text))).toBe(true)
    expect(r.parts.some((p) => p.kind === 'run' && /lethal hit/.test(p.label))).toBe(true)
    // A gift with a status of its own we can't read keeps its keyword.
    expect(intrinsicScore(gameData.gifts.find((g) => g.id === 'straight-pin-of-the-king-of-needleworks')!, makeContext(gameData, heishou, [])).reasons
      .some((x) => /in name only/.test(x.text))).toBe(false)
  })
})

describe('fused gifts count down the whole recipe chain', () => {
  it('owning Lucky Pouch covers Reminiscence and its Pendant of Nostalgia in the Poise set', () => {
    const byId = (id: string) => gameData.identities.find((i) => i.id === id)!
    const heishou = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
      'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion', 'heishou-pack-si-branch-gregor'].map(byId)
    const ctx = makeContext(gameData, heishou, ['lucky-pouch'])
    for (const id of ['four-leaf-clover', 'reminiscence', 'pendant-of-nostalgia']) expect(setHas(ctx, id)).toBe(true)
    expect(ctx.fusedInto.get('pendant-of-nostalgia')?.id).toBe('lucky-pouch')
  })
})

