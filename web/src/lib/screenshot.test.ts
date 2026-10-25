/// <reference types="node" />
// Node-only test: reads the fixture screenshots from disk.
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import atlasMeta from '../data/gift_icons.json'
import { gameData } from './data'
import {
  applyImport, findTiles, matchTile, mergePicks, readAtlas, readTier, type Pixels,
} from './screenshot'
import { isVestige } from './vestiges'

/** Minimal PNG reader for the fixtures (8-bit RGB/RGBA, not interlaced): node has no image decoder. */
function readPng(path: string): Pixels {
  const buf = readFileSync(path)
  let width = 0, height = 0, type = 0
  const idat: Buffer[] = []
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p)
    const kind = buf.toString('ascii', p + 4, p + 8)
    const body = buf.subarray(p + 8, p + 8 + len)
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4); type = body[9]
      if (body[8] !== 8 || body[12] !== 0 || (type !== 2 && type !== 6)) throw new Error('unsupported PNG')
    } else if (kind === 'IDAT') idat.push(body)
    p += 12 + len
  }
  const c = type === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const out = new Uint8Array(width * height * c)
  const stride = width * c
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= c ? out[y * stride + x - c] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const d = x >= c && y > 0 ? out[(y - 1) * stride + x - c] : 0
      const pa = Math.abs(b - d), pb = Math.abs(a - d), pc = Math.abs(a + b - 2 * d)
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1
        : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : d) : 0
      out[y * stride + x] = (line[x] + pred) & 255
    }
  }
  return { data: out, width, height, channels: c }
}

const fixture = (name: string) => readPng(new URL(`./__fixtures__/${name}`, import.meta.url).pathname)
const tierOf = (id: string) => gameData.gifts.find((g) => g.id === id)?.tier ?? null
const refs = readAtlas(readPng(new URL('../data/gift_icons.png', import.meta.url).pathname), atlasMeta, tierOf)
const nameOf = (id: string) => gameData.gifts.find((g) => g.id === id)!.name
const read = (img: Pixels) => findTiles(img).map((t) => matchTile(img, t, refs))

describe('screenshot import', () => {
  it('has a reference for every gift', () => {
    expect(atlasMeta.ids.length).toBe(gameData.gifts.length)
  })

  it('reads the tier from the numeral’s shape', () => {
    expect(readTier(1, 0.15)).toBe(1)
    expect(readTier(0.67, 0.45)).toBe(2)
    expect(readTier(0.6, 0.75)).toBe(3)
    expect(readTier(0.29, 0.78)).toBe(4)
    expect(readTier(0.05, 0.55)).toBe(5)
  })

  it('finds every gift on the Owned tab (with the HUD, big preview and selected glow), in reading order', () => {
    const got = read(fixture('owned-tab-1280.png'))
    expect(got.map((m) => nameOf(m.candidates[0].id))).toEqual([
      'Maison du Noir Slacks', 'Trial Extraction : A.B.S', "Chief Butler's Secret Arts", 'Broken Violin', 'Hot ‘n Juicy Drumstick',
      'Rest', 'Hardship', 'Leaked Enkephalin', 'Warning Notice', 'Faded Watch Case',
      'Silver Watch Case', 'Etched Clock Hands',
    ])
    expect(got.filter((m) => m.confidence === 'sure').length).toBeGreaterThanOrEqual(10)
  })

  it('matches dimmed tiles on the Enhance screen', () => {
    expect(read(fixture('enhance-grid.png')).map((m) => nameOf(m.candidates[0].id))).toEqual([
      'Fragment of Hellfire', 'Downpour', 'Maison du Noir Slacks', 'Trial Extraction : A.B.S', "Chief Butler's Secret Arts",
      'Clockwork Spring', 'Bell of Truth', 'Melted Eyeball', 'Grand Welcome', 'Broken Violin',
      'Hot ‘n Juicy Drumstick', 'Rest', 'Hardship', 'Midwinter Nightmare', 'Prestige Card',
    ])
  })

  it('matches the Fuse screen, including its half-hidden bottom row', () => {
    const got = read(fixture('fuse-grid.png'))
    expect(got.map((m) => nameOf(m.candidates[0].id))).toEqual([
      'Trial Extraction : A.B.S', "Chief Butler's Secret Arts", 'Clockwork Spring', 'Bell of Truth', 'Melted Eyeball',
      'Grand Welcome', 'Broken Violin', 'Hot ‘n Juicy Drumstick', 'Rest', 'Hardship',
      'Midwinter Nightmare', 'Prestige Card', 'Oscillating Bracelet', 'Reverberation', 'Sour Liquor Aroma',
    ])
  })

  it('merges screenshots: a gift once, Vestiges by the most seen in one screenshot', () => {
    const picks = mergePicks([['rest', 'twinkling-vestige', 'twinkling-vestige'], ['rest', 'twinkling-vestige']], isVestige)
    expect(picks).toEqual([{ id: 'rest', count: 1 }, { id: 'twinkling-vestige', count: 2 }])
    expect(applyImport(['rest', 'hardship'], picks, false, isVestige)).toEqual(['rest', 'hardship', 'twinkling-vestige', 'twinkling-vestige'])
    expect(applyImport(['hardship'], picks, true, isVestige)).toEqual(['rest', 'twinkling-vestige', 'twinkling-vestige'])
  })
})
