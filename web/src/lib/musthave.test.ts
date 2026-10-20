import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { fodder, recipePlans } from './fusion'
import { fusionTargets } from './plan'
import { DEFAULT_RUN, defaultFloors, makeContext, packsByGift, rankGifts, scoreGift, type RunSettings } from './scoring'

const byId = (id: string) => gameData.identities.find((x) => x.id === id)!
// A Rupture/Poise Heishou team: no Slash/Pierce/Blunt or E.G.O focus, so Lunar Memory's pieces don't fit it.
const team = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
  'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion',
  'heishou-pack-si-branch-gregor'].map(byId)
const hard: RunSettings = { ...DEFAULT_RUN, difficulty: 'hard', floors: defaultFloors('hard'), floor: 1 }
const normal: RunSettings = { ...DEFAULT_RUN, difficulty: 'normal', floors: defaultFloors('normal'), floor: 1 }
const gift = (id: string) => gameData.gifts.find((g) => g.id === id)!
const pfg = packsByGift(gameData.themePacks)

describe('must-have gifts (Lunar Memory)', () => {
  it('ranks Lunar Memory at the top for any team', () => {
    const ranked = rankGifts(makeContext(gameData, team, [], { run: hard }))
    expect(ranked[0].gift.id).toBe('lunar-memory')
  })

  it('values its pieces more later in the run, when the Super Shop usually shows up', () => {
    const at = (floor: number) => scoreGift(gift('punctured-memory'), makeContext(gameData, team, [], { run: { ...hard, floor } }))
    expect(at(8).score).toBeGreaterThan(at(1).score)
    expect(at(10).parts.find((p) => p.label.startsWith('Builds toward'))!.detail).toMatch(/worth more late in the run/)
  })

  it('values its pieces on Hard even when they do nothing for the team, more as you collect them', () => {
    const fresh = scoreGift(gift('punctured-memory'), makeContext(gameData, team, [], { run: hard }))
    expect(fresh.reasons[0].text).toMatch(/^Builds toward Lunar Memory .*1\/5 pieces/)
    const closer = scoreGift(gift('punctured-memory'), makeContext(gameData, team, ['sundered-memory', 'crushed-memory'], { run: hard }))
    expect(closer.score).toBeGreaterThan(fresh.score)
    const onNormal = scoreGift(gift('punctured-memory'), makeContext(gameData, team, [], { run: normal }))
    expect(onNormal.score).toBeLessThan(fresh.score)
    expect(onNormal.reasons.some((r) => /only appears on Hard/.test(r.text))).toBe(true)
  })

  it('only counts the Sin Fragments you still need (any 2)', () => {
    const two = ['fragment-of-hellfire', 'fragment-of-desire']
    const third = scoreGift(gift('fragment-of-decay'), makeContext(gameData, team, two, { run: hard }))
    expect(third.reasons.some((r) => r.text.startsWith('Builds toward Lunar Memory'))).toBe(false)
    const second = scoreGift(gift('fragment-of-decay'), makeContext(gameData, team, two.slice(0, 1), { run: hard }))
    expect(second.reasons[0].text).toMatch(/^Builds toward Lunar Memory/)
  })

  it('keeps its pieces instead of fusing them, and always lists it in your plan and the Fusion tab', () => {
    const owned = ['sundered-memory', 'fragment-of-hellfire', 'fragment-of-desire', 'fragment-of-decay']
    const ctx = makeContext(gameData, team, owned, { run: hard })
    const notes = fodder(ctx, owned)
    expect(notes.find((f) => f.gift.id === 'sundered-memory')!.keepFor).toMatch(/Lunar Memory/)
    expect(notes.filter((f) => f.gift.id.startsWith('fragment-of') && f.keepFor).length).toBe(2)
    expect(fusionTargets(makeContext(gameData, team, [], { run: hard }), pfg)[0].result.id).toBe('lunar-memory')
    expect(recipePlans(makeContext(gameData, team, [], { run: hard }), []).some((p) => p.result.id === 'lunar-memory')).toBe(true)
    expect(recipePlans(makeContext(gameData, team, [], { run: normal }), []).some((p) => p.result.id === 'lunar-memory')).toBe(false)
  })
})
