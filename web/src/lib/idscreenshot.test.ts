/// <reference types="node" />
// Node-only test: reads the fixture screenshots (Finley's, 2026-11-15, cropped to the cards and halved) from disk.
import { describe, expect, it } from 'vitest'
import atlasMeta from '../data/identity_art.json'
import { gameData } from './data'
import {
  findCardGrid, identitiesFound, readIdentityAtlas, readIdentityScreenshot, type IdentityAtlasMeta,
} from './idscreenshot'
import { readPng } from './__fixtures__/readpng'

const fixture = (name: string) => readPng(new URL(`./__fixtures__/${name}`, import.meta.url))
const refs = readIdentityAtlas(readPng(new URL('../data/identity_art.png', import.meta.url)), atlasMeta as IdentityAtlasMeta)

/** Sinners > Identities with Obtained ticked; the first 12 are the current team ("SELECTED", dimmed). */
const SELECTED = [
  'heishou-pack-wu-branch-adept-yi-sang', 'dawn-office-fixer-faust', 't-corp-class-3-collection-staff-don-quixote',
  'district-20-yurodivy-ryoshu', 'the-thumb-east-capo-iiii-meursault', 'district-20-yurodivy-hong-lu',
  'the-house-of-spiders-the-thumb-apprentice-heathcliff', 'zwei-assoc-west-section-3-ishmael',
  'the-house-of-spiders-the-thumb-nursefather-rodion', 'dawn-office-fixer-sinclair', 't-corp-class-3-vdcu-staff-outis',
  'dawn-office-rep-gregor', 'heishou-pack-wei-branch-don-quixote', 'heishou-pack-you-branch-adept-heathcliff',
  'heishou-pack-you-branch-sinclair', 'the-lord-of-hongyuan-hong-lu', 'family-hierarch-candidate-ishmael',
  'heishou-pack-mao-branch-adept-faust', 'heishou-pack-si-branch-rodion', 'heishou-pack-si-branch-gregor',
  'heishou-pack-mao-branch-ryoshu', 'heishou-pack-mao-branch-outis', 'cinq-assoc-west-section-3-meursault',
  'the-house-of-spiders-the-ring-apprentice-faust',
]
/** Scrolled down: low-level and new identities (base art), the top row hidden under the top bar. */
const SCROLLED = [
  's-corp-ch-unokkun-hong-lu', 'the-middle-big-brother-heathcliff', 'the-middle-little-brother-meursault',
  'multicrack-office-fixer-heathcliff', 'lcb-sinner-don-quixote', 'lcb-sinner-heathcliff', 'shi-assoc-south-section-5-ishmael',
  'wedge-office-fixer-don-quixote', 'wedge-office-fixer-sinclair', 'wedge-office-rep-outis',
  'haute-couture-le-noir-3f-public-address-room-hong-lu', 'haute-couture-the-crimson-god-of-le-rouge-sinclair',
  'haute-couture-le-noir-brand-manager-don-quixote', 'haute-couture-alteration-shop-rodion',
  'haute-couture-le-noir-footwear-hall-ryoshu', 'lcd-osir-team-ishmael', 'the-house-of-spiders-the-middle-nursefather-outis',
  'lobotomy-e-g-o-lamp-gregor',
]

describe('identity screenshot import', () => {
  it('has base art for every identity and Uptie III art for all but the base ones', () => {
    const ids = new Set(gameData.identities.map((i) => i.id))
    const base = new Set(refs.filter((r) => r.variant === 'base').map((r) => r.id))
    expect([...ids].filter((id) => !base.has(id))).toEqual([])
    expect(refs.every((r) => ids.has(r.id))).toBe(true)
  })

  it('finds the card grid even with the SELECTED banners across the team', () => {
    const grid = findCardGrid(fixture('identities-selected.png'))!
    expect(grid.lefts).toHaveLength(6)
    expect(grid.width).toBeGreaterThan(110)
    expect(grid.width).toBeLessThan(125)
    // rows are about a card height plus a small gutter apart
    expect(grid.pitch / grid.height).toBeGreaterThan(1.0)
    expect(grid.pitch / grid.height).toBeLessThan(1.1)
  })

  it('reads every card of the team screen, in order, including dimmed selected ones', () => {
    const matches = readIdentityScreenshot(fixture('identities-selected.png'), refs)
    expect(matches.map((m) => m.candidates[0].id)).toEqual(SELECTED)
    expect(matches.filter((m) => m.confidence === 'sure').length).toBeGreaterThanOrEqual(22)
    expect(identitiesFound(matches).sort()).toEqual([...SELECTED].sort())
  })

  it('reads base-art and brand-new identities and skips the row under the top bar', () => {
    const matches = readIdentityScreenshot(fixture('identities-scrolled.png'), refs)
    const kept = matches.filter((m) => m.confidence !== 'unsure')
    expect(kept.map((m) => m.candidates[0].id)).toEqual(SCROLLED)
    expect(kept.every((m) => m.confidence === 'sure')).toBe(true)
  })

  it('finds nothing in a picture without cards', () => {
    const blank = { data: new Uint8Array(400 * 300 * 3).fill(20), width: 400, height: 300, channels: 3 as const }
    expect(readIdentityScreenshot(blank, refs)).toEqual([])
  })
})
