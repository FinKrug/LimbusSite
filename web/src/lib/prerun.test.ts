import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { makeContext, packsByGift } from './scoring'
import { startingPicks } from './startgifts'
import {
  BUFFS, EMPTY_PRERUN, planStarlight, rankStartKeywords, START_KEYWORDS, STARTING_GIFTS, startingChoices, tier3Choices,
} from './prerun'

const byId = (id: string) => gameData.identities.find((x) => x.id === id)!
const heishou = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
  'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion',
  'heishou-pack-si-branch-gregor'].map(byId)
const ctx = makeContext(gameData, heishou, [], { run: { difficulty: 'hard', floors: 10, floor: null, pack: null } })

describe('before the run (Finley)', () => {
  it('has the starting gifts and starter buffs from the wiki', () => {
    for (const k of START_KEYWORDS) {
      expect(STARTING_GIFTS[k]).toHaveLength(3)
      for (const id of STARTING_GIFTS[k]) {
        const g = ctx.giftsById.get(id)
        expect(g, id).toBeDefined()
        expect(g!.tier).toBe(2)
        expect(g!.keyword).toBe(k)
      }
    }
    expect(BUFFS).toHaveLength(10)
    expect(BUFFS.every((b) => b.levels.length === 3)).toBe(true)
    expect(BUFFS.reduce((s, b) => s + b.starlight, 0) * 3).toBe(930)
  })

  it('counts starting choices from the buffs you took', () => {
    expect(startingChoices({})).toBe(1)
    expect(startingChoices({ 'star-shower': 1 })).toBe(2)
    expect(startingChoices({ 'star-shower': 3, 'perfected-possibility': 1 })).toBe(3)
    expect(tier3Choices({ 'perfected-possibility': 2 })).toBe(2)
  })

  it('ranks the starting keywords for the team: Rupture for Heishou', () => {
    const [best] = rankStartKeywords(ctx, 2, 2)
    expect(best.keyword).toBe('Rupture')
    expect(best.take).toHaveLength(2)
    expect(best.tier3).toHaveLength(2)
    expect(best.tier3.every((g) => g.gift.tier === 3 && g.gift.keyword === 'Rupture')).toBe(true)
  })

  it('plans Starlight: worth more than its Cost, + after base, within the budget', () => {
    const keywords = rankStartKeywords(ctx, 3, 3)
    const search = startingPicks(ctx, packsByGift(gameData.themePacks)).picks
    const plan = planStarlight(ctx, { ...EMPTY_PRERUN, starlight: 100 }, keywords, search)
    expect(plan.steps.length).toBeGreaterThan(5)
    expect(plan.steps.every((s) => s.ratio >= 1)).toBe(true)
    const seen = new Map<string, number>()
    for (const s of plan.steps) {
      const key = s.kind === 'buff' ? s.buff!.id : 'search'
      expect(s.level).toBe((seen.get(key) ?? 0) + 1)
      seen.set(key, s.level)
    }
    expect(plan.spent).toBeLessThanOrEqual(100)
    expect(plan.affordable!.reduce((t, s) => t + s.starlight, 0)).toBe(plan.spent)
    // Star-shower's extra choice is valued with the team's keyword.
    const shower = plan.steps.find((s) => s.buff?.id === 'star-shower' && s.level === 1)!
    expect(shower.why.join(' ')).toMatch(/another Rupture gift/)
    expect(shower.value).toBeGreaterThan(400)
  }, 30000)
})
