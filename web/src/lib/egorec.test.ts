import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { buildBattle, type EgoLoadout } from './ego'
import { applyRecs, egoFits, egoNeeds, recommendEgos, resourceGifts } from './egorec'
import { makeContext, rankGifts } from './scoring'

const byId = (id: string) => {
  const i = gameData.identities.find((x) => x.id === id)
  if (!i) throw new Error(`no identity ${id}`)
  return i
}
const HEISHOU = [
  'heishou-pack-wu-branch-adept-yi-sang', 'heishou-pack-mao-branch-adept-faust', 'the-lord-of-hongyuan-hong-lu',
  'heishou-pack-mao-branch-ryoshu', 'heishou-pack-you-branch-adept-heathcliff', 'heishou-pack-si-branch-rodion',
  'heishou-pack-mao-branch-outis',
].map(byId)
const egos = gameData.egos ?? []

const recsFor = (loadout: EgoLoadout) =>
  recommendEgos(HEISHOU, egos, loadout, buildBattle(HEISHOU, {}, egos, loadout, []))

describe('E.G.O recommendations', () => {
  it('suggests an E.G.O of the right sinner and grade for each slot that has options', () => {
    const recs = recsFor({})
    expect(recs.length).toBeGreaterThan(HEISHOU.length)
    for (const r of recs) {
      expect(r.best.ego.sinner).toBe(r.sinner)
      expect(r.best.ego.grade).toBe(r.grade)
      expect(r.best.reasons.length).toBeGreaterThan(0)
    }
    // ZAYIN starts on the base E.G.O, so it always has a current pick.
    expect(recs.filter((r) => r.grade === 'ZAYIN').every((r) => r.current)).toBe(true)
  })

  it('stops suggesting a slot once its suggestion is taken', () => {
    let loadout: EgoLoadout = {}
    for (let round = 0; round < 4; round++) loadout = applyRecs(loadout, recsFor(loadout))
    const left = recsFor(loadout).filter((r) => r.better)
    expect(left.length).toBeLessThanOrEqual(2)
  })

  it('reads keyword fits from the skill statuses', () => {
    const e = egos.find((x) => [...x.statuses, ...(x.skill?.statuses ?? [])].includes('Tremor Burst'))!
    expect(egoFits(e, ['Tremor', 'Burn'])).toContain('Tremor')
  })

})

describe('E.G.O held back by resources', () => {
  it('names gifts that make the missing resources, named sins first', () => {
    const gifts = resourceGifts(gameData.gifts, ['pride'])
    expect(gifts[0].name).toBe('Grand Welcome')
    expect(gifts.length).toBeGreaterThan(3)
    expect(resourceGifts(gameData.gifts, ['pride'], new Set([gifts[0].id]))[0].name).not.toBe('Grand Welcome')
  })

  it('notes a stronger E.G.O only when resources hold it back, with gifts to fix it', () => {
    const battle = buildBattle(HEISHOU, {}, egos, {}, [])
    const recs = recommendEgos(HEISHOU, egos, {}, battle, gameData.gifts)
    const ups = recs.filter((r) => r.upgrade)
    expect(ups.length).toBeGreaterThan(0)
    for (const r of ups) {
      const u = r.upgrade!
      expect(u.pick.ego.id).not.toBe(r.best.ego.id)
      expect(u.pick.gain).toBeGreaterThan(r.best.gain)
      expect(u.sins.length).toBeGreaterThan(0)
      expect(u.gifts.length).toBeGreaterThan(0)
    }
    expect(egoNeeds(recs).length).toBe(ups.length)
    // Equipping the held-back E.G.O anyway: keep the note, stop suggesting the switch back.
    const r = ups[0]
    const chosen: EgoLoadout = { [r.sinner]: { [r.grade]: r.upgrade!.pick.ego.id } }
    const again = recommendEgos(HEISHOU, egos, chosen, buildBattle(HEISHOU, {}, egos, chosen, []), gameData.gifts)
      .find((x) => x.sinner === r.sinner && x.grade === r.grade)!
    expect(again.better).toBe(false)
    expect(again.upgrade?.pick.ego.id).toBe(r.upgrade!.pick.ego.id)
    // Without gift data there's nothing to point to, so no notes.
    expect(recommendEgos(HEISHOU, egos, {}, battle).some((r) => r.upgrade)).toBe(false)
  })

  it('marks resource gifts in Best gifts when they would unlock a stronger E.G.O', () => {
    const ctx = makeContext(gameData, HEISHOU, [], { deployed: 7 })
    expect(ctx.egoNeeds.length).toBeGreaterThan(0)
    const sins = new Set(ctx.egoNeeds.flatMap((n) => n.sins))
    const ranked = rankGifts(ctx)
    const random = ranked.find((r) => r.gift.name === 'Child within a Flask')!
    expect(random.reasons.some((x) => x.text.includes('stronger than the E.G.O your team can pay for'))).toBe(true)
    if (sins.has('pride')) {
      const named = ranked.find((r) => r.gift.name === 'Grand Welcome')!
      expect(named.reasons.some((x) => x.text.startsWith('Makes Pride'))).toBe(true)
    }
  })
})
