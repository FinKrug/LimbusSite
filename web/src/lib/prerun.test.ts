import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { makeContext, packsByGift } from './scoring'
import { startingPicks } from './startgifts'
import {
  BONUS_BASE, BUFFS, EMPTY_PRERUN, MIN_RATIO, bestCombination, planStarlight, rankStartKeywords, START_KEYWORDS, STARTING_GIFTS, startingChoices, tier3Choices,
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
    // Perfected Possibility's 2 Tier 3 gifts are random: counted at the pool's average.
    expect(best.tier3).toBeGreaterThan(0)
    expect(rankStartKeywords(ctx, 2, 0)[0].tier3).toBe(0)
    // The keyword's later gifts count too: Rupture's run, not just Slash's starting gifts (Finley).
    const one = rankStartKeywords(ctx, 1, 0)
    expect(one[0].keyword).toBe('Rupture')
    expect(one[0].pool.length).toBeGreaterThan(0)
    expect(one.findIndex((k) => k.keyword === 'Rupture')).toBeLessThan(one.findIndex((k) => k.keyword === 'Slash'))
  })

  it('plans Starlight: worth more than its Cost, + after base, within the budget', () => {
    const keywords = rankStartKeywords(ctx, 3, 3)
    const search = startingPicks(ctx, packsByGift(gameData.themePacks)).picks
    const plan = planStarlight(ctx, { ...EMPTY_PRERUN, starlight: 40 }, keywords, search)
    expect(plan.steps.length).toBeGreaterThan(5)
    expect(plan.steps.every((s) => s.ratio >= MIN_RATIO || s.forNext)).toBe(true)
    const seen = new Map<string, number>()
    for (const s of plan.steps) {
      const key = s.kind === 'buff' ? s.buff!.id : 'search'
      expect(s.level).toBe((seen.get(key) ?? 0) + 1)
      seen.set(key, s.level)
    }
    // The 60 Bonus + 40 saved.
    expect(plan.spent).toBeLessThanOrEqual(100)
    expect(plan.affordable!.reduce((t, s) => t + s.starlight, 0)).toBe(plan.spent)
    // Star-shower's extra choice is valued with the team's keyword.
    const shower = plan.steps.find((s) => s.buff?.id === 'star-shower' && s.level === 1)!
    expect(shower.why.join(' ')).toMatch(/another Rupture gift/)
    expect(shower.value).toBeGreaterThan(400)
  }, 30000)
  it('with plenty of saved Starlight, buys every level that helps, even on a 5-floor run (Finley)', () => {
    const short = makeContext(gameData, heishou, [], { run: { difficulty: 'normal', floors: 5, floor: null, pack: null } })
    const keywords = rankStartKeywords(short, 3, 3)
    const search = startingPicks(short, packsByGift(gameData.themePacks)).picks
    const plan = planStarlight(short, { ...EMPTY_PRERUN, starlight: 5000 }, keywords, search)
    const name = (s: { buff?: { id: string }; level: number }) => `${s.buff?.id ?? 'search'}${s.level}`
    const bought = new Set(plan.affordable!.map(name))
    // Starlight Guidance (Speed, Clash Power Up) doesn't beat 5 Cost a Starlight in 5 floors, but helps.
    expect(plan.steps.some((s) => s.buff?.id === 'starlight-guidance' && s.ratio < 1)).toBe(true)
    expect(bought.has('starlight-guidance1')).toBe(true)
    // Every step that helps is bought; only ones that do nothing in 5 floors are skipped.
    expect(plan.affordable).toHaveLength(plan.steps.length)
    expect(plan.skip.map(name)).toContain('favor-of-the-nebulae2')
    expect(plan.skip.every((s) => s.ratio < MIN_RATIO)).toBe(true)
  }, 30000)

  it('pays from the Bonus only when a level beats the Cost it would turn into', () => {
    const keywords = rankStartKeywords(ctx, 3, 3)
    const search = startingPicks(ctx, packsByGift(gameData.themePacks)).picks
    const plan = planStarlight(ctx, { ...EMPTY_PRERUN, starlight: 0 }, keywords, search)
    expect(plan.bonus).toBe(BONUS_BASE)
    expect(plan.spent).toBeLessThanOrEqual(BONUS_BASE)
    expect(plan.savedSpent).toBe(0)
    // Below 5 Cost a Starlight it's better to keep the Bonus as Cost.
    const ratio = plan.affordable!.reduce((v, s) => v + s.value, 0) / Math.max(1, plan.spent * 5)
    expect(plan.affordable!.length === 0 || ratio >= 1).toBe(true)
  }, 30000)

  it('finds the best combination that fits, Gift Search included', () => {
    const step = (id: string, level: number, starlight: number, value: number) =>
      ({ kind: id === 'search' ? 'search' : 'buff', buff: id === 'search' ? undefined : { id, name: id, starlight, levels: [] }, level, starlight, value, ratio: value / (starlight * 5), why: [] }) as never
    const a1 = step('a', 1, 40, 300), b1 = step('b', 1, 60, 400), c1 = step('c', 1, 30, 100), s1 = step('search', 1, 70, 500), a2 = step('a', 2, 40, 10)
    // Best first would take a1 (7.5 Cost a Starlight), then nothing else fits 60: b1 alone is worth more.
    expect(bestCombination([a1, b1, c1, a2], 0, 60)).toEqual([b1])
    // Gift Search competes for the same Starlight.
    expect(bestCombination([s1, a1, b1], 0, 70)).toEqual([s1])
    // A + only comes with its base level.
    expect(bestCombination([a2], 0, 1000)).toEqual([])
    // Bonus not worth spending on a weak level: kept as Cost (40 x 5 = 200 > 150).
    expect(bestCombination([step('d', 1, 40, 150)], 40, 0)).toEqual([])
    expect(bestCombination([step('d', 1, 40, 150)], 0, 40)).toHaveLength(1)
  })
})
