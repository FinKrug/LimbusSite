import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { allPackEvents, eventHighlights, ownShare, usualEvents } from './packevents'
import { DEFAULT_RUN, defaultFloors, makeContext } from './scoring'
import type { ThemePack } from './types'

const byId = (id: string) => gameData.identities.find((x) => x.id === id)!
const heishou = ['the-lord-of-hongyuan-hong-lu', 'heishou-pack-mao-branch-adept-faust', 'heishou-pack-mao-branch-ryoshu',
  'heishou-pack-mao-branch-outis', 'family-hierarch-candidate-ishmael', 'heishou-pack-si-branch-rodion',
  'heishou-pack-si-branch-gregor'].map(byId)
const ctx = makeContext(gameData, heishou, [], { run: { ...DEFAULT_RUN, difficulty: 'hard', floors: defaultFloors('hard'), floor: 2 } })
const pack = (name: string) => gameData.themePacks.find((p) => p.name === name)!
const all = allPackEvents(gameData.themePacks, gameData.events!, ctx, heishou)

describe('theme pack events', () => {
  it('reads how many event nodes are the pack’s own from its note', () => {
    expect(ownShare(pack("Hell's Chicken"))).toEqual({ share: 0.75, known: true })
    expect(ownShare(pack('Nocturnal Sweeping'))).toEqual({ share: 1, known: true })
    expect(ownShare({ event_note: null } as ThemePack).known).toBe(false)
  })

  it('keeps packs’ own events and boss fights out of the usual pool', () => {
    const usual = usualEvents(gameData.events!, gameData.themePacks)
    expect(usual.length).toBeGreaterThan(40)
    expect(usual.some((e) => e.boss || / Theme Pack$/.test(e.name))).toBe(false)
    expect(usual.some((e) => e.name === 'Drunkard')).toBe(true)
  })

  it('says to go for events in Nocturnal Sweeping with a Heishou team, and names the best ones', () => {
    const ns = all.get(pack('Nocturnal Sweeping').id)!
    expect(ns.verdict).toBe('better')
    expect(ns.summary).toMatch(/^Go for events here/)
    expect(eventHighlights(ns).hope.length).toBeGreaterThan(0)
  })

  it('says to skip events where the pack’s own ones do little for the team', () => {
    expect(all.get(pack('Murder on the WARP Express').id)!.verdict).toBe('worse')
  })

  it('treats packs with no events of their own as usual, and lists each event once', () => {
    const plain = gameData.themePacks.find((p) => !all.get(p.id)!.own.length)!
    expect(all.get(plain.id)!.verdict).toBe('usual')
    for (const p of all.values()) {
      const keys = p.own.map((x) => x.variant.choices.map((c) => c.label).join('|'))
      expect(new Set(keys).size).toBe(keys.length)
      expect(p.own.some((x) => x.event.boss)).toBe(false)
    }
  })
})
