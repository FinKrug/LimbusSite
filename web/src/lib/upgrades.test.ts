import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { DEFAULT_RUN, defaultFloors, makeContext } from './scoring'
import { affordable, fusingSoon, maxLevel, planGift, planUpgrades, shopValue } from './upgrades'

const byId = (id: string) => gameData.identities.find((x) => x.id === id)!
const byName = (n: string) => gameData.gifts.find((g) => g.name === n)!
const heishou = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
  'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion',
  'heishou-pack-si-branch-gregor'].map(byId)
const run = { ...DEFAULT_RUN, difficulty: 'hard' as const, floors: defaultFloors('hard'), floor: 4 }
const owned = ['Fluorescent Lamp', 'Thunderbranch', 'Thrill', 'Unhatched Embers', 'Blossom Scissors', 'Rest'].map((n) => byName(n).id)
const ctx = makeContext(gameData, heishou, owned, { run })

describe('upgrade planner', () => {
  it('only lists gifts the game can enhance (bright on the Enhance screen)', () => {
    expect(maxLevel(byName('Rest'))).toBe(0)
    expect(maxLevel(byName('Downpour'))).toBe(2)
    const o = planUpgrades(ctx)
    expect(o.fixed).toBe(1)
    expect(o.plans.map((p) => p.gift.name)).not.toContain('Rest')
  })

  it('goes straight to ++ when + alone barely changes anything', () => {
    const p = planGift(byName('Fluorescent Lamp'), ctx, 0, shopValue(ctx))!
    expect(p.values[1]).toBeCloseTo(p.values[0], 5)
    expect(p.moves).toHaveLength(1)
    expect(p.moves[0]).toMatchObject({ from: 0, to: 2, cost: 180 })
    expect(p.verdict).toBe('max')
  })

  it('says "upgrade once" when ++ adds nothing over +, and "with spare Cost" for gifts that barely help', () => {
    const o = planUpgrades(ctx)
    expect(o.plans.find((p) => p.gift.name === 'Unhatched Embers')!.verdict).toBe('once')
    // Every upgrade helps a little; it's only a Skip when it changes nothing for your team.
    const scissors = o.plans.find((p) => p.gift.name === 'Blossom Scissors')!
    expect(scissors.verdict).toBe('spare')
    expect(scissors.moves.length).toBeGreaterThan(0)
    expect(o.order[o.order.length - 1].priority).toBe('spare')
  })

  it('picks what you can afford, best first, and does everything with a lot of Cost', () => {
    const { order } = planUpgrades(ctx)
    const all = order.reduce((a, m) => a + m.cost, 0)
    expect(affordable(order, all + 1000).moves).toHaveLength(order.length)
    const some = affordable(order, 250)
    expect(some.spent).toBeLessThanOrEqual(250)
    expect(some.moves[0]).toBe(order[0])
    // A gift's ++ never comes without its +.
    const tb = byName('Thunderbranch').id
    const tbMoves = affordable(order, 130).moves.filter((m) => m.gift.id === tb)
    expect(tbMoves.every((m, k) => m.from === (k === 0 ? 0 : tbMoves[k - 1].to))).toBe(true)
    expect(affordable(order, 0).moves).toHaveLength(0)
  })

  it('moves on as you upgrade, and ranks every move best first', () => {
    const tb = byName('Thunderbranch')
    const half = planUpgrades(ctx, { [tb.id]: 1 })
    expect(half.order.filter((m) => m.gift.id === tb.id).map((m) => m.to)).toEqual([2])
    expect(planUpgrades(ctx, { [tb.id]: 2 }).plans.find((p) => p.gift.id === tb.id)!.verdict).toBe('done')
    const { order } = planUpgrades(ctx)
    for (let k = 1; k < order.length; k++) expect(order[k - 1].ratio).toBeGreaterThanOrEqual(order[k].ratio)
  })

  // Ruin = Broken Revolver + Thunderbranch + Eerie Effigy (Thunderbranch can be enhanced).
  const ruinParts = (names: string[], r = run) => makeContext(gameData, heishou, [...owned, ...names.map((n) => byName(n).id)], { run: r })
  const tbPlan = (c: ReturnType<typeof makeContext>) => planUpgrades(c).plans.find((p) => p.gift.name === 'Thunderbranch')!

  it("doesn't enhance a gift you're about to fuse into something good (Finley: it wastes Cost)", () => {
    const c = ruinParts(['Broken Revolver'])
    const p = tbPlan(c)
    expect(p.verdict).toBe('fuse')
    expect(p.moves).toHaveLength(0)
    expect(p.fusing!.text).toMatch(/Ruin/)
    expect(planUpgrades(c).order.some((m) => m.gift.name === 'Thunderbranch')).toBe(false)
    const ready = tbPlan(ruinParts(['Broken Revolver', 'Eerie Effigy']))
    expect(ready.verdict).toBe('fuse')
    expect(ready.fusing!.ready).toBe(true)
  })

  it('still enhances when the fusion is a long way off or there are no floors left to finish it', () => {
    // Only Thunderbranch of the three: 2 pieces missing.
    const far = tbPlan(ruinParts([]))
    expect(far.verdict).not.toBe('fuse')
    expect(far.fusing?.likely).toBe(false)
    expect(far.moves.length).toBeGreaterThan(0)
    // Last floor: only a fusion you can make right now counts.
    const last = tbPlan(ruinParts(['Broken Revolver'], { ...run, floor: run.floors }))
    expect(last.verdict).not.toBe('fuse')
  })

  it("still enhances an ingredient whose fusion isn't good for your team", () => {
    // Uniform - Liu Assoc. is a Burn gift; this team plays Rupture and Poise.
    const c = makeContext(gameData, heishou, ['Polarization', 'Lowest Star'].map((n) => byName(n).id), { run })
    expect(fusingSoon(byName('Polarization'), c)).toBeNull()
  })
})
