import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { makeContext, rankGifts, rankThemePacks, scoreGift } from './scoring'
import {
  fodder, forecast, fusionIdeas, fusionPoints, fusionTier, keywordChance, matchRecipe, pointsFor, randomPool, recipePlans,
} from './fusion'

const g = (name: string) => gameData.gifts.find((x) => x.name === name)!
const id = (name: string) => g(name).id
const burners = gameData.identities.filter((i) => i.keywords.length === 1 && i.keywords[0] === 'Burn').slice(0, 7)
const burnGifts = gameData.gifts.filter((x) => x.keyword === 'Burn' && x.tier === 3 && !x.fusion_recipe).slice(0, 2).map((x) => x.id)

describe('fusion rules', () => {
  it('turns fusion points into a tier like the wiki table', () => {
    expect(fusionTier(10)).toBe(1)
    expect(fusionTier(11)).toBe(2)
    expect(fusionTier(24)).toBe(3)
    expect(fusionTier(25)).toBe(4)
    expect(fusionTier(22, true)).toBe(4) // Super Shop thresholds
    expect(fusionTier(fusionPoints([g('Faint Vestige'), g('Faint Vestige')]))).toBe(2) // 6 + 6 = 12
    expect(pointsFor(4)).toBe(25)
    expect([2, 3, 4, 5].map(keywordChance)).toEqual([0.6, 0.9, 0.99, 0.99])
  })

  it('matches recipes, including Lunar Memory with any two Sin Fragments', () => {
    const r = matchRecipe([id('Dust to Dust'), id('Secret Cookbook'), id('Ashes to Ashes')], gameData.fusions)
    expect(r?.result).toBe(id('Soothe the Dead'))
    const lunar = matchRecipe([id('Sundered Memory'), id('Punctured Memory'), id('Crushed Memory'),
      id('Fragment of Hellfire'), id('Fragment of Desire')], gameData.fusions)
    expect(lunar).toMatchObject({ result: 'lunar-memory', super_shop: true })
    expect(matchRecipe([id('Dust to Dust'), id('Secret Cookbook')], gameData.fusions)).toBeNull()
  })

  it('pools random results by keyword and tier, and adds the current pack\'s exclusives', () => {
    const ctx = makeContext(gameData, burners, [])
    const plain = randomPool(ctx, 'Rupture', 4, null)
    expect(plain.every((x) => x.keyword === 'Rupture' && x.tier === 4)).toBe(true)
    expect(plain.some((x) => x.name === 'Shadowlurking')).toBe(false) // a recipe result
    const pack = gameData.themePacks.find((p) => p.name === 'Nocturnal Sweeping')!
    const withPack = randomPool(ctx, 'Rupture', 3, pack)
    expect(withPack.length).toBeGreaterThanOrEqual(randomPool(ctx, 'Rupture', 3, null).length)
  })

  it('forecasts a tier and chance from the gifts put in', () => {
    const ctx = makeContext(gameData, burners, [])
    const f = forecast(ctx, 'Burn', [g('Twinkling Vestige'), g('Twinkling Vestige'), g('Faint Vestige')], null, false)
    expect(f.tier).toBe(4) // 10 + 10 + 6 = 26
    expect(f.chance).toBe(0.9)
    expect(f.pool.length).toBeGreaterThan(0)
  })
})

describe('fusion suggestions', () => {
  it('fuses vestiges and off-team gifts into your keyword, never recipe pieces', () => {
    const owned = ['twinkling-vestige', 'twinkling-vestige', 'faint-vestige', id('Dust to Dust'), id('Secret Cookbook')]
    const ctx = makeContext(gameData, burners, owned)
    const ideas = fusionIdeas(ctx, owned, ['Burn'], null, false)
    expect(ideas[0].keyword).toBe('Burn')
    const used = ideas[0].ingredients.map((i) => i.gift.id)
    expect(used).not.toContain(id('Dust to Dust')) // kept: 2/3 of Soothe the Dead
    expect(fodder(ctx, owned).find((f) => f.gift.id === id('Dust to Dust'))!.keepFor).toMatch(/Soothe the Dead/)
  })

  it('does not hold Ammo gifts for Desperado on a team with no Ammo users: fuse them', () => {
    const owned = [id('Staticky Two-way Radio'), id('Torn Bandolier'), ...burnGifts]
    const ctx = makeContext(gameData, burners, owned)
    expect(ctx.members.some((i) => i.status_effects.includes('Ammo'))).toBe(false)
    const radio = fodder(ctx, owned).find((f) => f.gift.id === id('Staticky Two-way Radio'))!
    expect(radio.keepFor).toBeNull()
    expect(radio.value).toBeLessThan(0.15 * Math.max(...fodder(ctx, owned).map((f) => f.value)))
    const why = scoreGift(gameData.gifts.find((g) => g.id === id('Desperado'))!, ctx).reasons.map((r) => r.text)
    expect(why.some((t) => /units that use Ammo, and no one on your team does/.test(t))).toBe(true)
  })

  it('fuses same-keyword ingredients into the stronger result (Enrapturing Trance for Rupture)', () => {
    const rupture = gameData.identities.filter((i) => i.keywords.includes('Rupture')).slice(0, 7)
    const f = gameData.fusions.find((x) => x.result === 'enrapturing-trance')!
    const ctx = makeContext(gameData, rupture, f.ingredients)
    const plan = recipePlans(ctx, f.ingredients).find((p) => p.result.id === f.result)!
    expect(plan.ready).toBe(true)
    expect(plan.worthIt).toBe(true)
    expect(plan.covered.map((g) => g.id).sort()).toEqual([...f.ingredients].sort())
  })

  it('lists recipes you have started, ready ones first', () => {
    const owned = [id('Dust to Dust'), id('Secret Cookbook'), id('Ashes to Ashes'), id('Sundered Memory')]
    const plans = recipePlans(makeContext(gameData, burners, owned), owned)
    expect(plans[0]).toMatchObject({ ready: true, result: { name: 'Soothe the Dead' } })
    const lunar = plans.find((p) => p.result.id === 'lunar-memory')!
    expect(lunar.fusion.super_shop).toBe(true)
    expect(lunar.anyMissing).toBe(2)
  })
})

describe('ingredients used up by a recipe you own', () => {
  const heishou = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
    'heishou-pack-mao-branch-outis', 'heishou-pack-si-branch-rodion', 'heishou-pack-si-branch-gregor']
    .map((i) => gameData.identities.find((x) => x.id === i)!)

  it('drops Shadowlurking\'s ingredients from every list once you have Shadowlurking', () => {
    const f = gameData.fusions.find((x) => x.result === 'shadowlurking')!
    const ctx = makeContext(gameData, heishou, ['shadowlurking'])
    for (const id of f.ingredients) {
      expect(ctx.gone.get(id)).toBe('Shadowlurking')
      expect(rankGifts(ctx).some((s) => s.gift.id === id)).toBe(false)
      expect(scoreGift(g(gameData.gifts.find((x) => x.id === id)!.name), ctx).score).toBe(0)
    }
    expect(rankThemePacks(ctx).some((p) => p.top.some((s) => f.ingredients.includes(s.gift.id)))).toBe(false)
    const kw = g(gameData.gifts.find((x) => x.id === f.ingredients[0])!.name)
    expect(randomPool(ctx, kw.keyword!, kw.tier!, null).some((x) => f.ingredients.includes(x.id))).toBe(false)
  })

  it('keeps Lunar Memory\'s pieces available after you have it', () => {
    const ctx = makeContext(gameData, heishou, ['lunar-memory'])
    expect(ctx.gone.size).toBe(0)
  })
})
