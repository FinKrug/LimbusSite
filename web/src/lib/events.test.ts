import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { adviseVariant, checkOdds, eventsForPack, rollChance, searchEvents } from './events'
import { DEFAULT_RUN, defaultFloors, makeContext } from './scoring'

const byId = (id: string) => gameData.identities.find((x) => x.id === id)!
const heishou = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
  'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion',
  'heishou-pack-si-branch-gregor'].map(byId)
const burners = gameData.identities.filter((i) => i.keywords.length === 1 && i.keywords[0] === 'Burn').slice(0, 7)
const hard = { ...DEFAULT_RUN, difficulty: 'hard' as const, floors: defaultFloors('hard'), floor: 2 }
const ev = (name: string) => gameData.events!.find((e) => e.name === name)!

describe('Mirror Dungeon events', () => {
  it('has the scraped events with choices', () => {
    expect(gameData.events!.length).toBeGreaterThan(80)
    const drunkard = ev('Drunkard').variants[0]
    expect(drunkard.choices.map((c) => c.label)).toEqual(['I do.', "I don't.", "I don't know how to live without alcohol."])
    expect(drunkard.choices[2].check).toMatchObject({ sins: ['sloth', 'gluttony'], adv: 13, disadv: 26 })
    // Follow-up choices are nested under the one they follow.
    expect(ev('Fairy Gentleman').variants[0].choices[0].next?.length).toBe(2)
  })

  it('rolls skill power against the check', () => {
    expect(rollChance(10, 0, 1, 10)).toBe(1)
    expect(rollChance(4, 4, 2, 12)).toBeCloseTo(0.25)
    expect(rollChance(4, 4, 2, 8)).toBeCloseTo(0.75)
  })

  it('sends a unit with a skill of the checked sin', () => {
    const check = ev('Drunkard').variants[0].choices[2].check!
    const odds = checkOdds(check, heishou)
    expect(odds.best).not.toBeNull()
    expect(odds.withSin.length).toBeGreaterThan(0)
    expect(odds.chance).toBeGreaterThan(0)
  })

  it('judges choices for the team: a Burn gift is worth taking for Burn, not for Rupture', () => {
    const moth = ev('Ardor Blossom Moth').variants[0]
    const forHeishou = adviseVariant(moth, makeContext(gameData, heishou, [], { run: hard }), heishou)
    expect(forHeishou.find((a) => a.choice.label === 'Reach out.')!.verdict).toBe('avoid')
    const forBurn = adviseVariant(moth, makeContext(gameData, burners, [], { run: hard }), burners)
    const reach = forBurn.find((a) => a.choice.label === 'Reach out.')!
    expect(reach.value).toBeGreaterThan(forHeishou.find((a) => a.choice.label === 'Reach out.')!.value)
    expect(forBurn.filter((a) => a.verdict === 'best').length).toBe(1)
  })

  it('finds events by name, gift or theme pack', () => {
    const name = (id: string) => gameData.gifts.find((g) => g.id === id)?.name
    expect(searchEvents(gameData.events!, 'drunk', name).map((e) => e.name)).toContain('Drunkard')
    expect(searchEvents(gameData.events!, 'wobbling keg', name).map((e) => e.name)).toContain('Drunkard')
    expect(eventsForPack(gameData.events!, 'The Dusk of Amber').length).toBeGreaterThan(0)
  })
})
