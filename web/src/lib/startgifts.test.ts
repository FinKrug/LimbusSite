import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { availability } from './plan'
import { DEFAULT_RUN, defaultFloors, makeContext, packsByGift, scoreGift } from './scoring'
import { START_OPTIONS, START_RULES, startingPicks } from './startgifts'

const byId = (id: string) => gameData.identities.find((x) => x.id === id)!
const heishou = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
  'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion',
  'heishou-pack-si-branch-gregor'].map(byId)
const run = (d: 'normal' | 'hard') => ({ ...DEFAULT_RUN, difficulty: d, floors: defaultFloors(d), floor: null })
const pfg = packsByGift(gameData.themePacks)

describe('starting gifts', () => {
  it('picks up to 3 gifts of Tier III or lower that fit the team, never fusion-only or EX ones', () => {
    const plan = startingPicks(makeContext(gameData, heishou, [], { run: run('hard') }), pfg)
    expect(plan.picks).toHaveLength(START_RULES.count)
    const recipe = new Set(gameData.fusions.map((f) => f.result))
    for (const p of plan.picks) {
      expect(p.score.gift.tier).toBeLessThanOrEqual(START_RULES.maxTier)
      expect(recipe.has(p.score.gift.id)).toBe(false)
      expect(p.score.fit > 0 || p.score.synergy).toBe(true)
      expect(p.why.length).toBeGreaterThan(0)
    }
    expect(new Set(plan.picks.map((p) => p.score.gift.id)).size).toBe(plan.picks.length)
  })

  it('prefers gifts only a few packs give, and says when a pick lets you skip a pack', () => {
    const plan = startingPicks(makeContext(gameData, heishou, [], { run: run('hard') }), pfg)
    expect(plan.picks[0].score.gift.pools).not.toContain('main')
    expect([...plan.picks, ...plan.alternatives].some((p) => p.skips.length > 0)).toBe(true)
  })

  it('lists plenty of other options, best first, none of them a pick', () => {
    const plan = startingPicks(makeContext(gameData, heishou, [], { run: run('hard') }), pfg)
    expect(plan.alternatives.length).toBeGreaterThan(10)
    expect(plan.alternatives.length).toBeLessThanOrEqual(START_OPTIONS)
    const picks = new Set(plan.picks.map((p) => p.score.gift.id))
    expect(plan.alternatives.some((a) => picks.has(a.score.gift.id))).toBe(false)
    for (let k = 1; k < plan.alternatives.length; k++) {
      expect(plan.alternatives[k - 1].value).toBeGreaterThanOrEqual(plan.alternatives[k].value)
    }
  })

  it('notices when the picks complete a recipe together', () => {
    const plan = startingPicks(makeContext(gameData, heishou, [], { run: run('hard') }), pfg)
    const ids = plan.picks.map((p) => p.score.gift.id)
    const done = gameData.fusions.find((f) => !f.any_of && f.ingredients.every((i) => ids.includes(i)))
    if (done) expect(plan.together.some((t) => t.startsWith('Together they fuse into'))).toBe(true)
  })
})

describe('EX gifts', () => {
  it('are luck-only: not "get now", with a reason not to plan around them', () => {
    const ctx = makeContext(gameData, heishou, [], { run: { ...run('hard'), floor: 1 } })
    const wealth = gameData.gifts.find((g) => g.id === 'wealth')!
    expect(availability(wealth, ctx, pfg).where).toBe('luck')
    expect(scoreGift(wealth, ctx).reasons[0].text).toMatch(/don't plan around it/)
  })
})
