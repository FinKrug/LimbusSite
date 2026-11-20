import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { makeContext } from './scoring'
import {
  ADVERSITIES, EMPTY_ADVERSITY, LAST_FLOOR, PR_PER_POINT, RUN_PR, budget, hasAdversities, harmPerFloor, nextOfferFloor,
  normalizeAdversity, offerKey, offersByFloor, planAdversities, prPointsLeft, readTeam, rewards, setHarm, type Adversity, type TeamRead,
} from './adversity'

const byId = (id: string) => gameData.identities.find((x) => x.id === id)!
const heishou = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
  'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion',
  'heishou-pack-si-branch-gregor'].map(byId)
const run = { difficulty: 'extreme' as const, floors: 15, floor: 9, pack: null }
const team = readTeam(makeContext(gameData, heishou, [], { run, deployed: 7 }))
const read = (over: Partial<TeamRead> = {}): TeamRead => ({ clash: 0.5, strength: 0.6, egoLean: 0.3, tremor: 0, size: 7, struggling: false, ...over })
const adv = (floor: number, id: string) => ADVERSITIES.find((a) => a.floor === floor && a.id === id)!

describe('Parallel Superposition adversities (PRO150 req 4)', () => {
  it('has the wiki table: 6 per floor on floors 10–14, 60 points in all', () => {
    const floors = offersByFloor()
    expect([...floors.keys()]).toEqual([10, 11, 12, 13, 14])
    for (const list of floors.values()) expect(list).toHaveLength(6)
    expect(ADVERSITIES.reduce((s, a) => s + a.score, 0)).toBe(60)
    // Level Boost and Frailness on every floor: "level 0–5".
    expect(ADVERSITIES.filter((a) => a.id === 'level-boost')).toHaveLength(5)
    expect(adv(13, 'mark-of-fire-ii').replaces_lower).toBe(true)
  })

  it('only in a 15-floor EXTREME run', () => {
    expect(hasAdversities({ difficulty: 'extreme', floors: 15 })).toBe(true)
    expect(hasAdversities({ difficulty: 'hard', floors: 10 })).toBe(false)
    expect(hasAdversities({ difficulty: 'extreme', floors: 10 })).toBe(false)
  })

  it('offers come after clearing floors 10–14', () => {
    expect(nextOfferFloor(null)).toBe(10)
    expect(nextOfferFloor(3)).toBe(10)
    expect(nextOfferFloor(12)).toBe(12)
    expect(nextOfferFloor(LAST_FLOOR)).toBeNull()
    expect(planAdversities(team, EMPTY_ADVERSITY, 15).offers).toEqual([])
  })

  it('a higher tier replaces the lower one from its floor on', () => {
    const t = read()
    const one = adv(10, 'mark-of-fire-i')
    const two = adv(13, 'mark-of-fire-ii')
    // I on floors 11–13, II on 14–15.
    expect(setHarm([one, two], t, 10)).toBeCloseTo(harmPerFloor(one, t) * 3 + harmPerFloor(two, t) * 2)
    // Level Boost stacks: twice is twice the harm.
    expect(setHarm([adv(13, 'level-boost'), adv(14, 'level-boost')], t, 10)).toBeCloseTo(harmPerFloor(adv(14, 'level-boost'), t) * 3)
  })

  it('rates adversities for the team', () => {
    const ego = adv(10, 'ego-interference-i')
    expect(harmPerFloor(ego, read({ egoLean: 0.05 }))).toBeLessThan(harmPerFloor(ego, read({ egoLean: 0.8 })))
    const barrier = adv(12, 'tremor-barrier')
    expect(harmPerFloor(barrier, read({ tremor: 1 }))).toBeGreaterThan(harmPerFloor(barrier, read({ tremor: 0 })))
    const brutality = adv(13, 'brutality')
    expect(harmPerFloor(brutality, read({ clash: 0.8 }))).toBeLessThan(harmPerFloor(brutality, read({ clash: 0.2 })))
  })

  it('plans late, cheap adversities first and stays within the risk budget', () => {
    const plan = planAdversities(team, EMPTY_ADVERSITY, 9)
    expect(plan.nextFloor).toBe(10)
    expect(plan.used).toBeLessThanOrEqual(plan.budget + 1e-9)
    expect(plan.planned.length).toBeGreaterThan(4)
    const lastFloor = plan.planned.filter((a) => a.floor === 14).length
    expect(lastFloor).toBeGreaterThanOrEqual(4)
    // A strong team on Balanced gets near the points that still earn Projection Rate.
    expect(plan.rewards.score).toBeGreaterThanOrEqual(15)
    expect(plan.rewards.score).toBeLessThanOrEqual(30)
    const verdicts = new Map(plan.offers.map((o) => [o.key, o.verdict]))
    for (const a of plan.planned) expect(verdicts.get(offerKey(a))).toBe('take')
    expect(plan.offers.every((o) => o.reason && o.why)).toBe(true)
  })

  it('takes more on Push than on Safe, and less when struggling', () => {
    const score = (state = EMPTY_ADVERSITY, t = team) => planAdversities(t, state, 9).rewards.score
    expect(score({ ...EMPTY_ADVERSITY, risk: 'safe' })).toBeLessThan(score())
    expect(score()).toBeLessThan(score({ ...EMPTY_ADVERSITY, risk: 'push' }))
    expect(budget({ ...team, struggling: true }, 'balanced')).toBeCloseTo(budget(team, 'balanced') / 2)
    expect(score(EMPTY_ADVERSITY, { ...team, struggling: true })).toBeLessThan(score())
  })

  it('counts what you took: taken offers, and only later floors are planned', () => {
    const taken = [offerKey(adv(10, 'level-boost')), offerKey(adv(10, 'inflation-i'))]
    const plan = planAdversities(team, { ...EMPTY_ADVERSITY, taken }, 11)
    expect(plan.nextFloor).toBe(11)
    expect(plan.taken.map((a) => a.id)).toEqual(['level-boost', 'inflation-i'])
    expect(plan.offers.every((o) => o.adversity.floor >= 11)).toBe(true)
    expect(plan.takenRewards.score).toBe(3)
    expect(plan.levels.find((l) => l.family_id === 'level-boost')).toMatchObject({ taken: 1, max: 5 })
  })

  it('works out rewards: Starlight, Projection Rate up to the weekly cap, achievements', () => {
    expect(prPointsLeft({ prBefore: 0 })).toBe(Math.floor((1000 - RUN_PR) / PR_PER_POINT))
    expect(prPointsLeft({ prBefore: 900 })).toBe(0)
    const set: Adversity[] = ADVERSITIES.filter((a) => a.floor >= 13)
    const r = rewards(set, EMPTY_ADVERSITY)
    expect(r.score).toBe(27)
    expect(r.starlight).toBe(27 * 15)
    expect(r.prFromScore).toBe(23 * 15)
    expect(r.pastCap).toBe(4)
    expect(r.achievements).toContain('25+ score')
    const done = rewards(set, { ...EMPTY_ADVERSITY, achievements: ['score-5', 'score-15', 'score-25', 'level-boost', 'frailness'] })
    expect(done.prFromAchievements).toBeLessThan(r.prFromAchievements)
  })

  it('keeps only valid saved state', () => {
    const s = normalizeAdversity({ taken: ['10:level-boost', 'nope', '10:level-boost'], risk: 'wild' as never, prBefore: -5 })
    expect(s).toEqual({ ...EMPTY_ADVERSITY, taken: ['10:level-boost'] })
    expect(normalizeAdversity(null)).toEqual(EMPTY_ADVERSITY)
  })
})
