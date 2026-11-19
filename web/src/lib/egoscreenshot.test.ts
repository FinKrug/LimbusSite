/// <reference types="node" />
// Node-only test: Finley's Sinners › E.G.O screenshots (2026-11-15), cropped to the cards and halved.
import { describe, expect, it } from 'vitest'
import atlasMeta from '../data/ego_art.json'
import { gameData } from './data'
import { findEgoCards, readEgoAtlas, readEgoScreenshot, type EgoAtlasMeta } from './egoscreenshot'
import { readPng } from './__fixtures__/readpng'

const fixture = (name: string) => readPng(new URL(`./__fixtures__/${name}`, import.meta.url))
const refs = readEgoAtlas(readPng(new URL('../data/ego_art.png', import.meta.url)), atlasMeta as EgoAtlasMeta)

/** Every card equipped ("SELECTED", tinted yellow). */
const SELECTED = [
  'wishing-cairn-yi-sang', 'crow-s-eye-view-yi-sang', 'dimension-shredder-yi-sang', 'great-trichiliocosm-yi-sang',
  'hex-nail-faust', 'fluid-sac-faust', 'representation-emitter-faust', 'hollow-faust',
  'la-sangre-de-sancho-don-quixote', 'wishing-cairn-don-quixote', 'red-sheet-don-quixote',
  'in-the-name-of-love-and-hate-don-quixote', 'forest-for-the-flames-ryoshu', 'red-eyes-open-ryoshu',
  'red-eyes-ryoshu',
]
/** Scrolled down; the top row is half under the top bar. */
const SCROLLED = [
  'asymmetrical-inertia-heathcliff', 'snagharpoon-ishmael', 'bygone-days-ishmael', 'what-is-cast-rodion',
  'pursuance-rodion', 'mirror-touch-rodion', 'impending-day-sinclair', 'branch-of-knowledge-sinclair',
  'tears-of-the-tarnished-blood-sinclair', 'harmony-sinclair', 'to-pathos-mathos-outis', 'lantern-gregor',
  'solemn-lament-gregor', 'suddenly-one-day-gregor', 'unbrilliant-glory-gregor',
]

describe('E.G.O screenshot import', () => {
  it('has art for every E.G.O', () => {
    const ids = new Set((gameData.egos ?? []).map((e) => e.id))
    expect(refs.map((r) => r.id).sort()).toEqual([...ids].sort())
  })

  it('finds the 5 x 3 grid of rings, not the name plates', () => {
    const cards = findEgoCards(fixture('egos-selected.png'))
    expect(cards).toHaveLength(15)
    expect(new Set(cards.map((c) => Math.round(c.x))).size).toBe(5)
    const r = cards[0].r
    expect(r).toBeGreaterThan(65)
    expect(r).toBeLessThan(80)
  })

  it('reads every equipped (tinted) E.G.O, in order', () => {
    const m = readEgoScreenshot(fixture('egos-selected.png'), refs)
    expect(m.map((x) => x.candidates[0].id)).toEqual(SELECTED)
    expect(m.every((x) => x.confidence === 'sure')).toBe(true)
  })

  it('tells apart same-named E.G.O of different sinners and skips the row under the top bar', () => {
    const m = readEgoScreenshot(fixture('egos-scrolled.png'), refs)
    expect(m.map((x) => x.candidates[0].id)).toEqual(SCROLLED)
    expect(m.find((x) => x.candidates[0].id === 'bygone-days-ishmael')!.candidates.some((c) => c.id === 'bygone-days-yi-sang')).toBe(false)
  })

  it('finds nothing in a picture without E.G.O', () => {
    const blank = { data: new Uint8Array(400 * 300 * 3).fill(20), width: 400, height: 300, channels: 3 as const }
    expect(readEgoScreenshot(blank, refs)).toEqual([])
  })
})
