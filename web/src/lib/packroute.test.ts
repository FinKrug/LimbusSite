import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { makeContext, rankThemePacks, type PackScore, type RunSettings } from './scoring'
import { assign, floorsText, packFloors, planRoute, prioritizePacks, routeScores } from './packroute'
import type { ThemePack } from './types'

const pack = (id: string, hard: [number, number]): ThemePack => ({
  id, name: id, pool: 'themed', group: null, floors: { normal: null as never, hard }, gifts: [], gift_pool: [], wiki_url: null,
})
const scored = (p: ThemePack, score: number): PackScore => ({
  pack: p, score, rating: 0, verdict: 'go', top: [], ownedCount: 0, reasons: [], parts: [], highlights: [], split: { best: score, team: 0 },
})
const run = (patch: Partial<RunSettings> = {}): RunSettings => ({ difficulty: 'hard', floors: 4, floor: null, pack: null, ...patch })

describe('pack route', () => {
  it('assigns rows to the best columns', () => {
    expect(assign([[5, 1], [4, -Infinity]])).toEqual([1, 0])
    expect(assign([[1, 9, 2], [8, 9, 1]])).toEqual([1, 0])
  })

  it('writes floor ranges', () => {
    expect(floorsText([3])).toBe('floor 3')
    expect(floorsText([1, 2, 5])).toBe('floors 1–2, 5')
    expect(packFloors(pack('a', [2, 9]), run())).toEqual([2, 3, 4])
  })

  it('saves a long-window pack for later when a short-window pack needs the floor', () => {
    // "big" is better, but it shows up on floors 2-4; "short" is only on floor 2.
    const scores = [
      scored(pack('big', [2, 4]), 10), scored(pack('short', [2, 2]), 6),
      scored(pack('filler', [1, 4]), 2), scored(pack('other', [3, 4]), 3),
    ]
    const r = planRoute({ scores, run: run() })
    const at = (f: number) => r.floors[f - 1].pick?.pack.id
    expect(at(2)).toBe('short')
    expect(['big']).toContain(at(3))
    expect(r.floors[1].why[0]).toMatch(/Only shows up on floor 2/)
    expect(r.floors[1].why.join(' ')).toMatch(/Ahead of big/)
    // Each pack at most once.
    const ids = r.floors.map((f) => f.pick?.pack.id).filter(Boolean)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the pack you picked and skips packs from earlier floors', () => {
    const scores = [scored(pack('big', [1, 4]), 10), scored(pack('mid', [1, 4]), 5), scored(pack('low', [1, 4]), 1)]
    const r = planRoute({ scores, run: run({ floor: 2, pack: 'low', visited: { 1: 'big', 2: 'low' } }) })
    expect(r.floors[0].status).toBe('past')
    expect(r.floors[0].picked?.id).toBe('big')
    expect(r.floors[1].pick?.pack.id).toBe('low')
    expect(r.floors.slice(2).map((f) => f.pick?.pack.id)).not.toContain('big')
  })

  it('marks last chances among the fallbacks', () => {
    const scores = [scored(pack('a', [1, 1]), 8), scored(pack('b', [1, 1]), 6), scored(pack('c', [1, 4]), 5)]
    const r = planRoute({ scores, run: run() })
    const f1 = r.floors[0]
    expect(f1.pick?.pack.id).toBe('a')
    expect(f1.fallbacks[0]).toMatchObject({ lastChance: true })
    expect(f1.fallbacks[0].score.pack.id).toBe('b')
  })

  it('orders the packs in view by the whole run: a last chance before a stronger pack that can wait', () => {
    // On floor 2: "big" (around until 4) and "short" (only floor 2).
    const scores = [scored(pack('big', [2, 4]), 10), scored(pack('short', [2, 2]), 7), scored(pack('x', [3, 4]), 1)]
    const inView = scores.slice(0, 2)
    const { order, advice } = prioritizePacks(scores, inView, run({ floor: 2 }), false)
    expect(order.map((p) => p.pack.id)).toEqual(['short', 'big'])
    expect(advice.get('short')!.note).toMatch(/Best pick now: big is stronger, but it also shows up on floors 3–4/)
    expect(advice.get('big')!.note).toMatch(/Can wait/)
    expect(order[0].verdict).toBe('go')
    // Before the run starts there's no floor to plan from: the order stays.
    expect(prioritizePacks(scores, inView, run(), false).order.map((p) => p.pack.id)).toEqual(['big', 'short'])
  })

  it('never plans around a hidden pack, but takes one you find', () => {
    const be = { ...pack('be', [1, 4]), hidden: true, appear_rate: 0.0002 }
    const scores = [scored(be, 50), scored(pack('a', [1, 4]), 5), scored(pack('b', [1, 4]), 4)]
    const r = planRoute({ scores, run: run() })
    expect(r.floors.map((f) => f.pick?.pack.id)).not.toContain('be')
    expect(r.missed.map((m) => m.score.pack.id)).not.toContain('be')
    // On the floor list it goes last...
    const floorView = prioritizePacks(scores, scores, run({ floor: 1 }), false)
    expect(floorView.order[floorView.order.length - 1].pack.id).toBe('be')
    // ...but when it's actually offered, it's the pick.
    const found = prioritizePacks(scores, scores, run({ floor: 1 }), true)
    expect(found.order[0].pack.id).toBe('be')
    expect(found.advice.get('be')!.kind).toBe('best')
  })

  it('reads The B.E. as a rare hidden pack with Lunar Memory among its clear rewards', () => {
    const be = gameData.themePacks.find((p) => p.id === 'the-b-e')!
    expect(be.hidden).toBe(true)
    expect(be.appear_rate).toBeCloseTo(0.0002)
    expect(be.clear_rewards).toContain('lunar-memory')
    const team = gameData.identities.filter((i) => i.traits.includes('Heishou Pack')).slice(0, 7)
    const ctx = makeContext(gameData, team, [], { run: { difficulty: 'hard', floors: 10, floor: 5, pack: null } })
    const [s] = rankThemePacks(ctx, [be])
    expect(s.reasons[0].text).toMatch(/Rare hidden pack .*1 in 5,000.*take it if you find it/)
    expect(s.highlights.some((h) => h.kind === 'clear' && h.gift.gift.id === 'lunar-memory')).toBe(true)
    const route = planRoute({ scores: routeScores(ctx), run: ctx.run })
    expect(route.floors.map((f) => f.pick?.pack.id)).not.toContain('the-b-e')
  })

  it('routes a real team through a Hard run', () => {
    const team = gameData.identities.filter((i) => i.traits.includes('Heishou Pack')).slice(0, 7)
    const r10: RunSettings = { difficulty: 'hard', floors: 10, floor: null, pack: null }
    const ctx = makeContext(gameData, team, [], { run: r10 })
    const route = planRoute({ scores: routeScores(ctx), run: r10 })
    expect(route.floors).toHaveLength(10)
    expect(route.floors.every((f) => f.pick)).toBe(true)
    const names = route.floors.map((f) => f.pick!.pack.name)
    expect(names).toContain('Nocturnal Sweeping')
    expect(new Set(names).size).toBe(10)
  })
})
