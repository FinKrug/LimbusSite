/**
 * Identity screenshot import: find the identity cards in a screenshot of the game's
 * Sinners > Identities screen and work out which identity each one is. Runs in the browser.
 *
 * Fitted on Finley's screenshots (2026-11-15): every readable card matched, at 2560 px wide
 * and also scaled to 1920 and 1280 as JPEG. The cards there are the wiki's card art (base
 * or Uptie III) under a gold/red/brown frame, in a grid of fixed columns.
 *
 *  1. Columns: frame pixels (bright, saturated, warm) are densest at the cards' left and right
 *     edges, so the column profile repeats with the column pitch; the left edges are the
 *     strongest phase and the card width the strongest second offset.
 *  2. Rows: between two rows of cards is a short gutter: a few empty rows with a card edge right
 *     above and below. The "SELECTED" banner and the name text can't make one. Gutters a whole
 *     number of rows apart agree; the best-supported one anchors the rows. Card height follows
 *     from the card art's shape.
 *  3. Identity: the upper part of the art (REGION: clear of the name, level and "SELECTED"
 *     banner; rarity and emblem corners masked) shrunk to GX x GY, against each identity's
 *     base and Uptie III art (scraper/identity_art.py) by per-channel normalised correlation
 *     (a dimmed card still matches), at a few small shifts. Cards cut off by the top bar match
 *     nothing well and are left out.
 */
import type { Pixels } from './screenshot'

/** Card art is 537 x 827 on the wiki, and so are the cards in game. */
export const ASPECT = 827 / 537
export const GX = 24
export const GY = 16
/** x0, y0, x1, y1 as a share of the card (same as scraper/identity_art.py REGION). */
export const REGION = [0.07, 0.10, 0.93, 0.46] as const
export const SHIFTS = [-0.03, 0, 0.03]
export const CONFIDENCE = { sure: 0.7, check: 0.55, margin: 0.1, checkMargin: 0.06 }

const px = (img: Pixels) => img.channels ?? 4

/** Cells of the GX x GY region that are compared (not the rarity or emblem corners). */
export const CARD_MASK: boolean[] = (() => {
  const m: boolean[] = []
  for (let j = 0; j < GY; j++) {
    for (let i = 0; i < GX; i++) {
      const x = REGION[0] + ((i + 0.5) / GX) * (REGION[2] - REGION[0])
      const y = REGION[1] + ((j + 0.5) / GY) * (REGION[3] - REGION[1])
      m.push(!((x < 0.42 && y < 0.17) || (x > 0.66 && y < 0.22)))
    }
  }
  return m
})()

/** 1 where a pixel looks like card frame: bright, saturated, warm (gold, orange, red). */
export function frameMask(img: Pixels): Uint8Array {
  const { data, width, height } = img
  const c = px(img)
  const m = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < m.length; i++, p += c) {
    const r = data[p], g = data[p + 1], b = data[p + 2]
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    if (mx > 110 && (mx - mn) / mx > 0.5 && r >= g && g >= b - 10) m[i] = 1
  }
  return m
}

export interface CardGrid {
  /** Left edge of each column, card width and height, row pitch, and the top of each row (may be < 0). */
  lefts: number[]
  width: number
  height: number
  pitch: number
  tops: number[]
}

/** Mean of the larger half of the values (robust to a few missing cards). */
function topHalfMean(vals: number[], min = 3): number {
  const s = [...vals].sort((a, b) => b - a)
  const k = Math.max(min, Math.floor(s.length / 2))
  let sum = 0
  for (let i = 0; i < Math.min(k, s.length); i++) sum += s[i]
  return sum / Math.min(k, s.length)
}

export function findCardGrid(img: Pixels): CardGrid | null {
  const { width: W, height: H } = img
  const m = frameMask(img)
  // 1. columns
  const col = new Float64Array(W)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) col[x] += m[y * W + x]
  let colMax = 0
  for (const v of col) colMax = Math.max(colMax, v)
  if (colMax === 0) return null
  const prof = Array.from(col, (v) => v / colMax)
  let best = { s: 0, P: 0, ph: 0 }
  for (let P = Math.floor(W / 20); P < Math.floor(W / 5); P++) {
    for (let ph = 0; ph < P; ph++) {
      const vals: number[] = []
      for (let x = ph; x < W; x += P) vals.push(prof[x])
      const s = topHalfMean(vals)
      if (s > best.s) best = { s, P, ph }
    }
  }
  const { P, ph } = best
  if (!P) return null
  let cw = 0, cwScore = -1
  for (let d = Math.floor(0.6 * P); d < Math.floor(0.97 * P); d++) {
    if (ph + d >= W) break
    let s = 0, n = 0
    for (let x = ph + d; x < W; x += P) { s += prof[x]; n++ }
    if (n && s / n > cwScore) { cwScore = s / n; cw = d }
  }
  const lefts: number[] = []
  for (let x = ph; x < W; x += P) if (x + cw < W && col[x] > 0.25 * colMax) lefts.push(x)
  if (!lefts.length || !cw) return null
  const ch = cw * ASPECT

  // 2. rows: how much of each row, across the cards' middles, is frame
  const cov = new Float64Array(H)
  const x0s = lefts.map((x) => x + Math.floor(0.12 * cw)), x1s = lefts.map((x) => x + Math.floor(0.88 * cw))
  for (let y = 0; y < H; y++) {
    let s = 0
    for (let k = 0; k < lefts.length; k++) {
      let n = 0
      for (let x = x0s[k]; x < x1s[k]; x++) n += m[y * W + x]
      s += n / (x1s[k] - x0s[k])
    }
    cov[y] = s / lefts.length
  }
  const maxOf = (a: number, b: number) => { let v = 0; for (let y = Math.max(0, a); y < Math.min(H, b); y++) v = Math.max(v, cov[y]); return v }
  const maxGap = Math.floor(0.15 * cw)
  const raw: [number, number][] = []
  for (let y = 0; y < H;) {
    if (cov[y] < 0.12) {
      const s = y
      while (y < H && cov[y] < 0.12) y++
      if (y - s >= 2 && y - s <= maxGap && s >= 4 && y + 4 <= H && maxOf(s - 4, s) > 0.5 && maxOf(y, y + 4) > 0.5) raw.push([s, y])
    } else y++
  }
  const gutters: [number, number][] = []
  for (const g of raw) {
    const last = gutters[gutters.length - 1]
    if (last && g[0] - last[1] < 0.1 * cw) last[1] = g[1]
    else gutters.push([g[0], g[1]])
  }
  if (!gutters.length) return null
  const ends = gutters.map((g) => g[1])
  const diffs: number[] = []
  for (let k = 1; k < ends.length; k++) {
    const d = ends[k] - ends[k - 1]
    if (d > ch * 0.95 && d < ch * 1.25) diffs.push(d)
  }
  const gap = median(gutters.map((g) => g[1] - g[0]))
  const Q = diffs.length ? Math.round(median(diffs)) : Math.round(ch) + Math.round(gap)
  const support = (e: number) => ends.filter((f) => {
    if (f === e) return false
    const r = (f - e) / Q
    return Math.abs(r - Math.round(r)) * Q <= Math.max(3, 0.03 * Q)
  }).length
  const edge = ([s, e]: [number, number]) => maxOf(s - 4, s) + maxOf(e, e + 4)
  let anchor = gutters[0]
  for (const g of gutters) {
    const a = support(g[1]), b = support(anchor[1])
    if (a > b || (a === b && edge(g) > edge(anchor))) anchor = g
  }
  const phase = ((anchor[1] % Q) + Q) % Q
  const tops: number[] = []
  for (let y = phase - Q; y < H; y += Q) tops.push(y)
  return { lefts, width: cw, height: ch, pitch: Q, tops }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const k = Math.floor(s.length / 2)
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2
}

/** Area-average a rectangle of the image down to GX x GY RGB. */
export function sampleRect(img: Pixels, x0: number, y0: number, w: number, h: number): Float32Array {
  const { data, width, height } = img
  const c = px(img)
  const out = new Float32Array(GX * GY * 3)
  const sx = w / GX, sy = h / GY
  for (let gy = 0; gy < GY; gy++) {
    const ya = y0 + gy * sy, yb = ya + sy
    for (let gx = 0; gx < GX; gx++) {
      const xa = x0 + gx * sx, xb = xa + sx
      let r = 0, g = 0, b = 0, wsum = 0
      for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
        if (y < 0 || y >= height) continue
        const wy = Math.min(yb, y + 1) - Math.max(ya, y)
        for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
          if (x < 0 || x >= width) continue
          const wt = wy * (Math.min(xb, x + 1) - Math.max(xa, x))
          const p = (y * width + x) * c
          r += data[p] * wt; g += data[p + 1] * wt; b += data[p + 2] * wt; wsum += wt
        }
      }
      const o = (gy * GX + gx) * 3
      if (wsum > 0) { out[o] = r / wsum; out[o + 1] = g / wsum; out[o + 2] = b / wsum }
    }
  }
  return out
}

const MASK_IDX = CARD_MASK.flatMap((on, i) => (on ? [i] : []))

/** Masked cells, each channel centred and scaled to length 1 (a dot product / 3 = mean channel correlation). */
export function normaliseCard(f: Float32Array): Float32Array {
  const n = MASK_IDX.length
  const v = new Float32Array(n * 3)
  for (let ch = 0; ch < 3; ch++) {
    let mean = 0
    for (const i of MASK_IDX) mean += f[i * 3 + ch]
    mean /= n
    let norm = 0
    for (let k = 0; k < n; k++) { const d = f[MASK_IDX[k] * 3 + ch] - mean; v[k * 3 + ch] = d; norm += d * d }
    norm = Math.sqrt(norm) + 1e-6
    for (let k = 0; k < n; k++) v[k * 3 + ch] /= norm
  }
  return v
}

export interface IdentityRef { id: string; variant: 'base' | 'uptie'; v: Float32Array }
export interface IdentityAtlasMeta { gx: number; gy: number; cols: number; region: number[]; refs: [string, string][] }

/** The references from the atlas picture (scraper/identity_art.py). */
export function readIdentityAtlas(atlas: Pixels, meta: IdentityAtlasMeta): IdentityRef[] {
  if (meta.gx !== GX || meta.gy !== GY || meta.region.some((r, k) => Math.abs(r - REGION[k]) > 1e-9)) {
    throw new Error('identity_art.json was built with other settings than the matcher uses')
  }
  const c = px(atlas)
  return meta.refs.map(([id, variant], k) => {
    const ox = (k % meta.cols) * GX, oy = Math.floor(k / meta.cols) * GY
    const f = new Float32Array(GX * GY * 3)
    for (let y = 0; y < GY; y++) {
      for (let x = 0; x < GX; x++) {
        const p = ((oy + y) * atlas.width + ox + x) * c
        const o = (y * GX + x) * 3
        f[o] = atlas.data[p]; f[o + 1] = atlas.data[p + 1]; f[o + 2] = atlas.data[p + 2]
      }
    }
    return { id, variant: variant === 'uptie' ? 'uptie' : 'base', v: normaliseCard(f) }
  })
}

export interface CardBox { x: number; y: number; w: number; h: number }
export interface CardMatch {
  box: CardBox
  /** Best identities, best first (one entry per identity). */
  candidates: { id: string; score: number }[]
  confidence: 'sure' | 'check' | 'unsure'
}

export function matchCard(img: Pixels, box: CardBox, refs: IdentityRef[], top = 5): CardMatch {
  const feats: Float32Array[] = []
  for (const dx of SHIFTS) {
    for (const dy of SHIFTS) {
      const x0 = box.x + (REGION[0] + dx) * box.w, y0 = box.y + (REGION[1] + dy) * box.h
      feats.push(normaliseCard(sampleRect(img, x0, y0, (REGION[2] - REGION[0]) * box.w, (REGION[3] - REGION[1]) * box.h)))
    }
  }
  const byId = new Map<string, number>()
  for (const r of refs) {
    let bestS = -Infinity
    for (const f of feats) {
      let s = 0
      for (let k = 0; k < f.length; k++) s += f[k] * r.v[k]
      if (s > bestS) bestS = s
    }
    const score = bestS / 3
    if (score > (byId.get(r.id) ?? -Infinity)) byId.set(r.id, score)
  }
  const candidates = [...byId].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score).slice(0, top)
  const [a, b] = candidates
  const margin = a && b ? a.score - b.score : 1
  const confidence = !a ? 'unsure'
    : a.score >= CONFIDENCE.sure && margin >= CONFIDENCE.margin ? 'sure'
      : a.score >= CONFIDENCE.check && margin >= CONFIDENCE.checkMargin ? 'check' : 'unsure'
  return { box, candidates, confidence }
}

/** Every card whose compared part is fully inside the screenshot, with its match. */
export function readIdentityScreenshot(img: Pixels, refs: IdentityRef[]): CardMatch[] {
  const grid = findCardGrid(img)
  if (!grid) return []
  const out: CardMatch[] = []
  for (const t of grid.tops) {
    if (t + REGION[1] * grid.height < 0 || t + REGION[3] * grid.height > img.height) continue
    for (const x of grid.lefts) out.push(matchCard(img, { x, y: t, w: grid.width, h: grid.height }, refs))
  }
  return out
}

/** The identities to add: every card kept (not unsure), once each. */
export function identitiesFound(matches: CardMatch[]): string[] {
  const out = new Set<string>()
  for (const m of matches) if (m.confidence !== 'unsure' && m.candidates[0]) out.add(m.candidates[0].id)
  return [...out]
}
