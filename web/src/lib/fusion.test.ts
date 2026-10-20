import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { makeContext, rankGifts, rankThemePacks, scoreGift } from './scoring'
import {
  comboFusions, fodder, forecast, fusionIdeas, fusionKeywords, isSpare, setOrComboOf, fusionPoints, fusionTier, keywordChance, lastChanceGifts, matchRecipe, pointsFor, randomPool, recipePlans,
} from './fusion'

const g = (name: string) => gameData.gifts.find((x) => x.name === name)!
const id = (name: string) => g(name).id
const g2 = (gid: string) => gameData.gifts.find((x) => x.id === gid)!
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

  it("aims fusions at the current pack's exclusives when it's the last chance at them", () => {
    const you = ['heishou-pack-you-branch-sinclair', 'heishou-pack-you-branch-adept-heathcliff']
      .map((x) => gameData.identities.find((i) => i.id === x)!)
    const team = [...you, ...burners.filter((i) => i.sinner !== 'Sinclair' && i.sinner !== 'Heathcliff').slice(0, 5)]
    const spring = gameData.themePacks.find((p) => p.id === 'spring-cultivation')!
    const vestige = id('Faint Vestige')
    const ctx = makeContext(gameData, team, [vestige, vestige], {
      run: { difficulty: 'hard', floors: 10, floor: 7, pack: spring.id, visited: { 7: spring.id } },
    })
    const last = lastChanceGifts(ctx, spring)
    expect(last.has('bloodflame-sword')).toBe(true)
    // Two Tier II vestiges make a Tier II fusion: Bloodflame Sword is in the Burn pool.
    const ideas = fusionIdeas(ctx, [vestige, vestige], ['Burn'], spring, false)
    expect(ideas[0].chase?.gift.id).toBe('bloodflame-sword')
    expect(ideas[0].forecast.lastChanceOdds).toBeGreaterThan(0)
    const f = forecast(ctx, 'Burn', [g('Faint Vestige'), g('Faint Vestige')], spring, false)
    expect(f.lastChance.map((x) => x.gift.id)).toContain('bloodflame-sword')
    // Without the pack in play there's nothing to chase.
    expect(fusionIdeas(ctx, [vestige, vestige], ['Burn'], null, false).every((i) => !i.chase)).toBe(true)
  })

  it("doesn't call it a last chance when a later pack has the gift too", () => {
    const pack = gameData.themePacks.find((p) => p.id === 'unbound-wrath')!
    const ctx = makeContext(gameData, burners, [], { run: { difficulty: 'hard', floors: 10, floor: 1, pack: pack.id } })
    const shared = gameData.gifts.find((x) => x.theme_packs.includes(pack.id) && x.theme_packs.length > 1)
    if (shared) {
      const later = gameData.themePacks.filter((p) => p.id !== pack.id && p.gift_pool.includes(shared.id))
      const reachable = later.some((p) => [2, 3, 4, 5, 6, 7, 8, 9, 10].some((f) => p.floors?.hard && f >= p.floors.hard[0] && f <= p.floors.hard[1]))
      expect(lastChanceGifts(ctx, pack).has(shared.id)).toBe(!reachable)
    }
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

describe('gifts that only activate with a keyword skill', () => {
  const heishou = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
    'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion', 'heishou-pack-si-branch-gregor']
    .map((i) => gameData.identities.find((x) => x.id === i)!)

  it('fuses Respite (needs a Bleed skill to activate) before Smokes and Wires on a team without Bleed', () => {
    const owned = ['thrill', 'respite', 'smokes-and-wires']
    const ctx = makeContext(gameData, heishou, owned)
    const order = fodder(ctx, owned).map((f) => f.gift.id)
    expect(order.indexOf('respite')).toBeLessThan(order.indexOf('smokes-and-wires'))
    const r = scoreGift(g('Respite'), ctx)
    expect(r.reasons.some((x) => /Only works for units with skills that use Bleed, and no one on your team does/.test(x.text))).toBe(true)
    expect(r.reasons.some((x) => /Also uses|affinity is common/.test(x.text))).toBe(false)
    // A Bleed team still values it.
    const bleeders = gameData.identities.filter((i) => i.keywords.includes('Bleed')).slice(0, 7)
    expect(scoreGift(g('Respite'), makeContext(gameData, bleeders, [])).score).toBeGreaterThan(r.score + 1)
  })

  it("judges each gift on its own, not against your best one: good gifts aren't sell-or-fuse", () => {
    const owned = ['thrill', 'glyph-of-glass-shards', 'smokes-and-wires', 'lowest-star', 'ebony-brooch-md', 'deathseeker', 'respite', 'lunar-memory']
    const ctx = makeContext(gameData, heishou, owned)
    const list = fodder(ctx, owned)
    const spare = list.filter(isSpare).map((f) => f.gift.id)
    // Lunar Memory is worth far more than the rest; Ebony Brooch and Deathseeker still pull their weight.
    expect(spare).not.toContain('ebony-brooch-md')
    expect(spare).not.toContain('deathseeker')
    // Nothing (Respite), then next to nothing (Lowest Star), then a little (Smokes and Wires: Bleed set piece).
    expect(spare).toEqual(['respite', 'lowest-star', 'smokes-and-wires'])
    expect(scoreGift(g('Lowest Star'), ctx).reasons.some((r) => /Does very little/.test(r.text))).toBe(true)
  })

  it('fuses an affiliation gift whose members you lack (Pocket Flashcards on Heishou), keeps one whose general part fits', () => {
    const owned = ['pocket-flashcards', 'short-cane-sword', 'thrill']
    const ctx = makeContext(gameData, heishou, owned)
    const list = fodder(ctx, owned)
    const flash = list.find((f) => f.gift.id === 'pocket-flashcards')!
    expect(isSpare(flash)).toBe(true)
    expect(flash.share).toBeLessThan(0.2)
    // Short Cane Sword's Slash part works for an all-Slash team even without Seven Association units.
    expect(isSpare(list.find((f) => f.gift.id === 'short-cane-sword')!)).toBe(false)
  })

  it('on the last floor, gifts that only help with Cost, shops or rewards go to sell or fuse', () => {
    const owned = ['prestige-card', 'milepost-of-survival', 'golden-urn', 'thrill']
    const at = (floor: number) => makeContext(gameData, heishou, owned, { run: { difficulty: 'hard', floors: 10, floor, pack: null } })
    const spare = (floor: number) => fodder(at(floor), owned).filter(isSpare).map((f) => f.gift.id)
    expect(spare(5)).toEqual([])
    expect(spare(10)).toEqual(expect.arrayContaining(['prestige-card', 'milepost-of-survival', 'golden-urn']))
    expect(spare(10)).not.toContain('thrill')
    expect(scoreGift(g('Prestige Card'), at(10)).reasons[0].text).toMatch(/^Last floor: it only helps with Cost/)
  })

  it("fuses toward what the team uses and says what for: no Blunt for one Blunt user on Heishou", () => {
    const ctx = makeContext(gameData, heishou, ['respite', 'smokes-and-wires', 'lowest-star', 'pocket-flashcards', 'faint-vestige', 'twinkling-vestige'])
    const kws = fusionKeywords(ctx, ['Rupture', 'Poise'])
    // Rupture and Poise (the team), Slash (everyone uses it), and the keyword-free sets' keywords; not Blunt or Pierce.
    expect(kws.slice(0, 3)).toEqual(['Rupture', 'Poise', 'Slash'])
    expect(kws).not.toContain('Blunt')
    expect(kws).not.toContain('Pierce')
    expect(kws).toEqual(expect.arrayContaining(['Bleed', 'Tremor', 'Sinking']))
    const ideas = fusionIdeas(ctx, [...ctx.owned], kws, null, false)
    expect(ideas.length).toBeGreaterThan(0)
    for (const i of ideas) {
      expect(i.forecast.targets.length).toBeGreaterThan(0)
      expect(i.forecast.targets.every((t) => t.fit >= 0.35 || t.synergy || setOrComboOf(t))).toBe(true)
    }
    // A Bleed fusion is for the Bleed set's pieces, which work for any team.
    const bleed = forecast(ctx, 'Bleed', ['faint-vestige', 'twinkling-vestige', 'respite'].map(g2), null, false)
    expect(bleed.targets.length).toBeGreaterThan(0)
    expect(bleed.targets.every((t) => t.fit >= 0.35 || setOrComboOf(t) === 'Bleed set')).toBe(true)
  })

  it('suggests fusing useless gifts into missing set pieces (Sinking set on a Heishou team)', () => {
    const owned = ['respite', 'lowest-star', 'pocket-flashcards', 'faint-vestige', 'dark-vestige', 'thrill']
    const ctx = makeContext(gameData, heishou, owned)
    const list = comboFusions(ctx, owned, null, false)
    expect(list.length).toBeGreaterThan(0)
    const sinking = list.find((c) => c.combo.name === 'Sinking set')!
    expect(sinking.pieces.map((g) => g.id)).toContain('midwinter-nightmare')
    expect(sinking.odds).toBeGreaterThan(0.3)
    // Only gifts that do little for the team go in.
    expect(sinking.ingredients.map((i) => i.gift.id)).not.toContain('thrill')
  })
})

