/**
 * Screenshot import: find the E.G.O gift tiles in a screenshot of the game and work out which
 * gift each one is. Everything runs in the browser; nothing is uploaded.
 *
 * Works on the screens that list gifts in a grid of tiles: the E.G.O Gifts screen's Owned tab,
 * and the Enhance and Fuse screens at a shop. Fitted on Finley's screenshots (2026-10-22): every
 * tile found and matched, at 2560 px wide and also scaled down to 1920, 1280 and 960 as JPEG.
 *
 *  1. Tiles: every tile has its tier numeral (I–V) in bright yellow at its top-left, even when
 *     the tile itself is dimmed. Yellow blobs that line up into a numeral give a tile's corner
 *     and size (H = numeral height; a tile is TILE.size x H square). The most common numeral
 *     height is the grid's (the big preview and the HUD's tiny icons have other sizes), and
 *     tiles must share a row or column with another tile.
 *  2. Tier: read from the numeral's shape (how many full-height strokes, how wide), as a hint:
 *     a matching tier adds TIER_BONUS, since blurry screenshots can misread it.
 *  3. Gift: the art inside the tile, shrunk to N x N, against every gift's reference in the
 *     atlas (scraper/icons.py), by normalised correlation (so a dimmed tile still matches),
 *     leaving out the numeral's and the keyword icon's corners, at a few small shifts.
 */

export interface Pixels {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
  /** Bytes per pixel: 4 (RGBA, canvas) or 3 (RGB). */
  channels?: 3 | 4
}

export interface TileAnchor {
  /** Numeral's top-left corner and size, in pixels. */
  x: number
  y: number
  w: number
  h: number
  /** The grid's numeral height. */
  H: number
  /** Tier read from the numeral (1–5); a hint, see TIER_BONUS. */
  tier: number
}

/** Tile square relative to its numeral, in numeral heights. */
export const TILE = { dx: -0.33, dy: -0.25, size: 4.05 }
/** Feature grid; must match scraper/icons.py ATLAS_N. */
export const N = 24
/** Share of the tile trimmed off each side before comparing (frame, glow). */
export const INSET = 0.18
/** Corners left out of the comparison: the numeral (top-left) and keyword icon (bottom-right). */
export const CORNER = 0.30
/** Small shifts tried (share of the tile), since the numeral's position varies a little by tier. */
export const SHIFTS = [-0.06, -0.03, 0, 0.03, 0.06]
export const TIER_BONUS = 0.06
/** Scores: at or above `sure`, a confident match; below `unsure`, probably not a gift tile. */
export const CONFIDENCE = { sure: 0.6, unsure: 0.45, margin: 0.1 }

const px = (img: Pixels) => img.channels ?? 4

/** Bright yellow: the tier numerals (same test as the prototype: hue 36–64°, saturation > 0.5, value > 0.7). */
export function numeralMask(img: Pixels): Uint8Array {
  const { data, width, height } = img
  const c = px(img)
  const out = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < out.length; i++, p += c) {
    const r = data[p] / 255, g = data[p + 1] / 255, b = data[p + 2] / 255
    const mx = Math.max(r, g, b)
    if (mx <= 0.7) continue
    const mn = Math.min(r, g, b)
    const d = mx - mn + 1e-6
    if (d / (mx + 1e-6) <= 0.5) continue
    let h: number
    if (mx === r) h = (((g - b) / d) % 6 + 6) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h > 36 && h < 64) out[i] = 1
  }
  return out
}

interface Blob { id: number; x0: number; y0: number; x1: number; y1: number; area: number }

/** 4-connected components of a mask: a label per pixel (0 = none) and each blob's box. */
export function components(mask: Uint8Array, width: number, height: number): { labels: Int32Array; blobs: Blob[] } {
  const labels = new Int32Array(width * height)
  const blobs: Blob[] = []
  const stack: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue
    const id = blobs.length + 1
    const b: Blob = { id, x0: width, y0: height, x1: 0, y1: 0, area: 0 }
    labels[start] = id
    stack.push(start)
    while (stack.length) {
      const i = stack.pop()!
      const x = i % width, y = (i - x) / width
      b.area++
      if (x < b.x0) b.x0 = x
      if (x + 1 > b.x1) b.x1 = x + 1
      if (y < b.y0) b.y0 = y
      if (y + 1 > b.y1) b.y1 = y + 1
      if (x > 0 && mask[i - 1] && !labels[i - 1]) { labels[i - 1] = id; stack.push(i - 1) }
      if (x < width - 1 && mask[i + 1] && !labels[i + 1]) { labels[i + 1] = id; stack.push(i + 1) }
      if (y > 0 && mask[i - width] && !labels[i - width]) { labels[i - width] = id; stack.push(i - width) }
      if (y < height - 1 && mask[i + width] && !labels[i + width]) { labels[i + width] = id; stack.push(i + width) }
    }
    blobs.push(b)
  }
  return { labels, blobs }
}

interface Group { x: number; y: number; w: number; h: number; ids: number[] }

/** Tier from a numeral's shape: share of its columns that are full-height strokes, and its width. */
export function readTier(fullShare: number, widthPerH: number): number {
  if (fullShare < 0.12 && widthPerH > 0.4) return 5
  if (fullShare < 0.4) return 4
  if (widthPerH < 0.3) return 1
  if (widthPerH < 0.6) return 2
  return 3
}

/** Every gift tile's numeral in the screenshot. */
export function findTiles(img: Pixels): TileAnchor[] {
  const { width, height } = img
  const { labels, blobs } = components(numeralMask(img), width, height)
  const strokes = blobs.filter((b) => {
    const w = b.x1 - b.x0, h = b.y1 - b.y0
    return h >= 8 && b.area / (w * h) >= 0.3 && w <= 1.6 * h
  }).sort((a, b) => a.x0 - b.x0)

  // Strokes side by side with their bottoms lined up form a numeral ("III", "IV").
  // Bottoms, not tops: a selected tile's glow can clip a stroke's top.
  const used = new Set<number>()
  const groups: Group[] = []
  strokes.forEach((b, k) => {
    if (used.has(k)) return
    const g = [b]
    used.add(k)
    const bh = b.y1 - b.y0
    for (let j = k + 1; j < strokes.length; j++) {
      if (used.has(j)) continue
      const c = strokes[j]
      const ch = c.y1 - c.y0
      const hh = Math.max(ch, bh)
      const last = g[g.length - 1]
      const gap = c.x0 - last.x1
      if (Math.min(ch, bh) >= 0.7 * hh && Math.abs(c.y1 - b.y1) <= 0.15 * hh && gap >= -1 && gap <= 0.35 * hh) {
        g.push(c)
        used.add(j)
      }
    }
    const x1 = Math.max(...g.map((c) => c.x1))
    const y1 = Math.max(...g.map((c) => c.y1))
    const h = Math.max(...g.map((c) => c.y1 - c.y0))
    groups.push({ x: g[0].x0, y: y1 - h, w: x1 - g[0].x0, h, ids: g.map((c) => c.id) })
  })

  // The HUD's strip of tiny gift icons has numerals too: ignore ones too small to be the grid's.
  const big = groups.filter((g) => g.h >= 0.012 * height)
  if (!big.length) return []
  // The grid's numeral height: the most common one (within 6%).
  const hs = big.map((g) => g.h)
  let best = 0
  let H0 = hs[0]
  for (const h0 of hs) {
    const n = hs.filter((h) => h >= h0 * 0.94 && h <= h0 * 1.06).length
    if (n > best) { best = n; H0 = h0 }
  }
  const H = median(hs.filter((h) => h >= H0 * 0.94 && h <= H0 * 1.06))

  const anchors: TileAnchor[] = []
  for (const g of big) {
    if (Math.abs(g.h - H) > 0.15 * H || g.w < 0.08 * H || g.w > H) continue
    const ids = new Set(g.ids)
    let full = 0
    for (let x = g.x; x < g.x + g.w; x++) {
      let n = 0
      for (let y = g.y; y < g.y + g.h; y++) if (ids.has(labels[y * width + x])) n++
      if (n >= 0.85 * g.h) full++
    }
    anchors.push({ x: g.x, y: g.y, w: g.w, h: g.h, H, tier: readTier(full / g.w, g.w / H) })
  }

  // One anchor per tile (a selected tile's glow can add a second group): keep the widest.
  const keep: TileAnchor[] = []
  for (const t of [...anchors].sort((a, b) => b.w - a.w)) {
    if (keep.every((o) => Math.abs(t.x - o.x) > 2 * H || Math.abs(t.y - o.y) > 2 * H)) keep.push(t)
  }
  // Tiles sit in a grid: keep anchors that share a row or column with another, a tile or more away.
  const aligned = (t: TileAnchor, o: TileAnchor) => {
    const far = Math.abs(t.x - o.x) >= 3.2 * H || Math.abs(t.y - o.y) >= 3.2 * H
    return far && (Math.abs(t.y - o.y) <= 0.25 * H || Math.abs(t.x - o.x) <= 0.4 * H)
  }
  const grid = keep.length > 1 ? keep.filter((t) => keep.some((o) => o !== t && aligned(t, o))) : keep
  // Reading order: rows top to bottom, then left to right.
  return grid.sort((a, b) => Math.round((a.y - b.y) / H) || a.x - b.x)
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** The tile's square in the screenshot. */
export function tileBox(t: TileAnchor): { x: number; y: number; size: number } {
  return { x: t.x + TILE.dx * t.H, y: t.y + TILE.dy * t.H, size: TILE.size * t.H }
}

/** Pixels compared: all but the two corners. */
export const MASK: boolean[] = (() => {
  const c = Math.floor(CORNER * N)
  const m: boolean[] = []
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) m.push(!((y < c && x < c) || (y >= N - c && x >= N - c)))
  }
  return m
})()

/** Area-average resample of a square region of the image to N x N RGB. */
export function sample(img: Pixels, x0: number, y0: number, size: number): Float32Array {
  const { data, width, height } = img
  const c = px(img)
  const out = new Float32Array(N * N * 3)
  const step = size / N
  for (let gy = 0; gy < N; gy++) {
    const ya = y0 + gy * step, yb = ya + step
    for (let gx = 0; gx < N; gx++) {
      const xa = x0 + gx * step, xb = xa + step
      let r = 0, g = 0, b = 0, wsum = 0
      for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
        if (y < 0 || y >= height) continue
        const wy = Math.min(yb, y + 1) - Math.max(ya, y)
        for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
          if (x < 0 || x >= width) continue
          const w = wy * (Math.min(xb, x + 1) - Math.max(xa, x))
          const p = (y * width + x) * c
          r += data[p] * w; g += data[p + 1] * w; b += data[p + 2] * w; wsum += w
        }
      }
      const o = (gy * N + gx) * 3
      if (wsum > 0) { out[o] = r / wsum; out[o + 1] = g / wsum; out[o + 2] = b / wsum }
    }
  }
  return out
}

/** Masked pixels, each channel centred, scaled to length 1: a dot product of two is their correlation. */
export function normalise(f: Float32Array): Float32Array {
  const idx: number[] = []
  MASK.forEach((on, i) => { if (on) idx.push(i) })
  const v = new Float32Array(idx.length * 3)
  for (let ch = 0; ch < 3; ch++) {
    let mean = 0
    for (const i of idx) mean += f[i * 3 + ch]
    mean /= idx.length
    idx.forEach((i, k) => { v[k * 3 + ch] = f[i * 3 + ch] - mean })
  }
  let norm = 0
  for (let k = 0; k < v.length; k++) norm += v[k] * v[k]
  norm = Math.sqrt(norm) + 1e-6
  for (let k = 0; k < v.length; k++) v[k] /= norm
  return v
}

/** The tile's art at every shift, normalised. */
export function tileFeatures(img: Pixels, t: TileAnchor): Float32Array[] {
  const box = tileBox(t)
  const out: Float32Array[] = []
  for (const dx of SHIFTS) {
    for (const dy of SHIFTS) {
      const x = box.x + dx * box.size + INSET * box.size
      const y = box.y + dy * box.size + INSET * box.size
      out.push(normalise(sample(img, x, y, (1 - 2 * INSET) * box.size)))
    }
  }
  return out
}

export interface Reference { id: string; tier: number | null; v: Float32Array }

/** Each gift's reference from the atlas picture (scraper/icons.py: `n` px squares, `cols` per row). */
export function readAtlas(atlas: Pixels, meta: { n: number; cols: number; ids: string[] }, tierOf: (id: string) => number | null): Reference[] {
  if (meta.n !== N) throw new Error(`gift_icons.json is for ${meta.n} px references; the matcher uses ${N}`)
  const c = px(atlas)
  return meta.ids.map((id, k) => {
    const ox = (k % meta.cols) * N, oy = Math.floor(k / meta.cols) * N
    const f = new Float32Array(N * N * 3)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const p = ((oy + y) * atlas.width + ox + x) * c
        const o = (y * N + x) * 3
        f[o] = atlas.data[p]; f[o + 1] = atlas.data[p + 1]; f[o + 2] = atlas.data[p + 2]
      }
    }
    return { id, tier: tierOf(id), v: normalise(f) }
  })
}

export interface Candidate { id: string; score: number }

export interface TileMatch {
  anchor: TileAnchor
  /** Best first: correlation (-1..1), without the tier bonus. */
  candidates: Candidate[]
  confidence: 'sure' | 'check' | 'unsure'
}

/** The best gifts for one tile. */
export function matchTile(img: Pixels, t: TileAnchor, refs: Reference[], top = 6): TileMatch {
  const feats = tileFeatures(img, t)
  const scored = refs.map((r) => {
    let best = -1
    for (const f of feats) {
      let s = 0
      for (let k = 0; k < f.length; k++) s += f[k] * r.v[k]
      if (s > best) best = s
    }
    return { id: r.id, score: best, rank: best + (r.tier === t.tier ? TIER_BONUS : 0) }
  }).sort((a, b) => b.rank - a.rank)
  const candidates = scored.slice(0, top).map(({ id, score }) => ({ id, score }))
  const [a, b] = candidates
  const confidence = a.score >= CONFIDENCE.sure && (!b || a.score - b.score >= CONFIDENCE.margin) ? 'sure'
    : a.score >= CONFIDENCE.unsure ? 'check' : 'unsure'
  return { anchor: t, candidates, confidence }
}

/** Find and match every tile. */
export function readScreenshot(img: Pixels, refs: Reference[]): TileMatch[] {
  return findTiles(img).map((t) => matchTile(img, t, refs))
}

export interface ImportPick {
  id: string
  /** How many copies (only Vestiges stack). */
  count: number
}

/**
 * The gifts across several screenshots: each gift once, except Vestiges, which you can hold several
 * of (the most seen in any one screenshot, since screenshots of a scrolled list overlap).
 */
export function mergePicks(perShot: string[][], isStacking: (id: string) => boolean): ImportPick[] {
  const counts = new Map<string, number>()
  for (const ids of perShot) {
    const here = new Map<string, number>()
    for (const id of ids) here.set(id, (here.get(id) ?? 0) + 1)
    for (const [id, n] of here) counts.set(id, Math.max(counts.get(id) ?? 0, isStacking(id) ? n : 1))
  }
  return [...counts].map(([id, count]) => ({ id, count }))
}

/** Your gifts after an import: added to what you have, or replacing it. */
export function applyImport(owned: string[], picks: ImportPick[], replace: boolean, isStacking: (id: string) => boolean): string[] {
  if (replace) return picks.flatMap((p) => Array(p.count).fill(p.id))
  const out = [...owned]
  for (const p of picks) {
    const have = out.filter((x) => x === p.id).length
    const want = isStacking(p.id) ? p.count : 1
    for (let k = have; k < want; k++) out.push(p.id)
  }
  return out
}
