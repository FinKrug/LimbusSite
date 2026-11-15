/**
 * E.G.O screenshot import: find the E.G.O in a screenshot of the game's Sinners > E.G.O screen and
 * work out which E.G.O each one is. Runs in the browser.
 *
 * Fitted on Finley's screenshots (2026-11-15): all 30 readable cards matched, at 2560 px wide and
 * scaled to 1920, 1280 and 960 as JPEG. Each E.G.O there is its round art inside an orange ring,
 * with the sinner's emblem on top, the grade and name plate over the bottom, and "SELECTED" across
 * the middle when it's equipped (equipped ones are also tinted yellow).
 *
 *  1. Rings: on a copy of the screenshot ~320 px wide, bright warm pixels (frameMask); every radius
 *     from 1/40 to 1/9 of the width is tried and the one whose best ring scores are highest wins. A
 *     ring scores orange on the circle (upper arc and sides; the plate hides the bottom) minus orange
 *     just inside and outside it, so the solid name plates don't count. Then the same at ~640 px for
 *     that radius, every 2 px.
 *  2. Grid: strong rings (≥ 0.6; stray rings score ≤ 0.52) give the columns and rows (positions at least two rings share);
 *     a card is a grid point with a ring found near it.
 *  3. E.G.O: REGION around the ring centre, shrunk to G x G in grey, with the emblem, banner band and
 *     plate masked, against each E.G.O's art placed the same way (scraper/ego_art.py), by normalised
 *     correlation, at small shifts. Cards cut off by the top bar or the screen's edge are left out.
 */
import { frameMask } from './idscreenshot'
import type { Pixels } from './screenshot'

export const G = 24
/** x0, y0, x1, y1 in ring radii around the ring centre (same as scraper/ego_art.py). */
export const REGION = [-0.7, -0.85, 0.7, 0.55] as const
export const SHIFTS = [-0.04, 0, 0.04]
export const CONFIDENCE = { sure: 0.75, check: 0.6, margin: 0.12, checkMargin: 0.06 }
const ANGLES = (() => {
  const out: number[] = []
  for (let d = 150; d <= 390; d += 7.5) out.push((d * Math.PI) / 180)
  return out
})()

const px = (img: Pixels) => img.channels ?? 4

/** Cells compared: inside the art, not the emblem, the "SELECTED" band or the plate. */
export const EGO_MASK: boolean[] = (() => {
  const m: boolean[] = []
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const x = REGION[0] + ((i + 0.5) / G) * (REGION[2] - REGION[0])
      const y = REGION[1] + ((j + 0.5) / G) * (REGION[3] - REGION[1])
      const inside = x * x + y * y < 0.88 * 0.88
      const emblem = Math.abs(x) < 0.32 && y < -0.62
      const banner = y > -0.24 && y < 0.26
      m.push(inside && !emblem && !banner)
    }
  }
  return m
})()
const MASK_IDX = EGO_MASK.flatMap((on, i) => (on ? [i] : []))

/** Area-average the image down to `w` px wide (RGB). */
export function shrink(img: Pixels, w: number): Pixels {
  const s = img.width / w
  const h = Math.max(1, Math.round(img.height / s))
  const c = px(img)
  const out = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * s), y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) * s)))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * s), x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) * s)))
      let r = 0, g = 0, b = 0, n = 0
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = (yy * img.width + xx) * c
          r += img.data[p]; g += img.data[p + 1]; b += img.data[p + 2]; n++
        }
      }
      const o = (y * w + x) * 3
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n
    }
  }
  return { data: out, width: w, height: h, channels: 3 }
}

/** Ring score at every `step`-th centre: on-ring orange minus half of orange 4 px (at 640) inside and outside. */
function ringScores(m: Float32Array, md: Float32Array, W: number, H: number, r: number, gap: number, step: number): { score: Float32Array; w: number; h: number } {
  const w = Math.ceil(W / step), h = Math.ceil(H / step)
  const score = new Float32Array(w * h)
  const offs = (rad: number) => ANGLES.map((a) => [Math.round(rad * Math.cos(a)), Math.round(rad * Math.sin(a))])
  const on = offs(r), inner = offs(r - gap), outer = offs(r + gap)
  const n = ANGLES.length
  for (let j = 0; j < h; j++) {
    const cy = j * step
    for (let i = 0; i < w; i++) {
      const cx = i * step
      let a = 0, b = 0
      for (let k = 0; k < n; k++) {
        let x = cx + on[k][0], y = cy + on[k][1]
        if (x >= 0 && y >= 0 && x < W && y < H) a += md[y * W + x]
        x = cx + inner[k][0]; y = cy + inner[k][1]
        if (x >= 0 && y >= 0 && x < W && y < H) b += m[y * W + x]
        x = cx + outer[k][0]; y = cy + outer[k][1]
        if (x >= 0 && y >= 0 && x < W && y < H) b += m[y * W + x]
      }
      score[j * w + i] = (a - 0.5 * b) / n
    }
  }
  return { score, w, h }
}

function masks(img: Pixels): { m: Float32Array; md: Float32Array } {
  const raw = frameMask(img)
  const { width: W, height: H } = img
  const m = Float32Array.from(raw)
  const md = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0
      for (let dy = -1; dy <= 1 && !v; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && raw[yy * W + xx]) { v = 1; break }
        }
      }
      md[y * W + x] = v
    }
  }
  return { m, md }
}

/** The best few scores of a score map (to compare radii). */
function topMean(a: Float32Array, k = 30): number {
  const s = Array.from(a).sort((x, y) => y - x)
  let t = 0
  for (let i = 0; i < Math.min(k, s.length); i++) t += s[i]
  return t / Math.min(k, s.length)
}

export interface Ring { x: number; y: number; score: number }

/** Ring centres (in screenshot pixels) and the ring radius. */
export function findRings(img: Pixels): { r: number; rings: Ring[] } | null {
  // 1. coarse: radius
  const coarse = shrink(img, 320)
  const c = masks(coarse)
  let bestR = 0, best = -Infinity
  for (let r = Math.round(320 / 40); r <= Math.round(320 / 9); r++) {
    const t = topMean(ringScores(c.m, c.md, coarse.width, coarse.height, r, 2, 2).score)
    if (t > best) { best = t; bestR = r }
  }
  if (!bestR || best < 0.45) return null
  // 2. finer: positions
  const fine = shrink(img, 640)
  const f = masks(fine)
  let pick: { r: number; s: { score: Float32Array; w: number; h: number } } | null = null
  for (const r of [2 * bestR - 1, 2 * bestR, 2 * bestR + 1]) {
    const s = ringScores(f.m, f.md, fine.width, fine.height, r, 4, 2)
    if (!pick || topMean(s.score) > topMean(pick.s.score)) pick = { r, s }
  }
  const { r, s } = pick!
  const scale = img.width / fine.width
  const score = Float32Array.from(s.score)
  const rings: Ring[] = []
  const block = Math.ceil(r / 2)
  for (;;) {
    let k = 0
    for (let i = 1; i < score.length; i++) if (score[i] > score[k]) k = i
    if (score[k] < 0.45) break
    const j = Math.floor(k / s.w), i = k % s.w
    rings.push({ x: i * 2 * scale, y: j * 2 * scale, score: score[k] })
    for (let jj = Math.max(0, j - block); jj <= Math.min(s.h - 1, j + block); jj++) {
      for (let ii = Math.max(0, i - block); ii <= Math.min(s.w - 1, i + block); ii++) score[jj * s.w + ii] = -Infinity
    }
  }
  return { r: r * scale, rings }
}

/** Positions at least two strong rings share (within 0.3 r), averaged. */
function lattice(vals: number[], r: number): number[] {
  const sorted = [...vals].sort((a, b) => a - b)
  const groups: number[][] = []
  for (const v of sorted) {
    const last = groups[groups.length - 1]
    if (last && v - last[last.length - 1] < 0.3 * r) last.push(v)
    else groups.push([v])
  }
  return groups.filter((g) => g.length >= 2).map((g) => g.reduce((a, b) => a + b, 0) / g.length)
}

export interface EgoCard { x: number; y: number; r: number }

export function findEgoCards(img: Pixels): EgoCard[] {
  const found = findRings(img)
  if (!found) return []
  const { r, rings } = found
  const strong = rings.filter((g) => g.score >= 0.6)
  const xs = lattice(strong.map((g) => g.x), r), ys = lattice(strong.map((g) => g.y), r)
  const out: EgoCard[] = []
  for (const y of ys) {
    if (y + REGION[1] * r < 0 || y + REGION[3] * r > img.height) continue
    for (const x of xs) {
      if (x + REGION[0] * r < 0 || x + REGION[2] * r > img.width) continue
      if (rings.some((g) => Math.abs(g.x - x) < 0.25 * r && Math.abs(g.y - y) < 0.25 * r)) out.push({ x, y, r })
    }
  }
  return out
}

/** G x G grey of REGION around (cx, cy), area-averaged. */
export function sampleEgo(img: Pixels, cx: number, cy: number, r: number): Float32Array {
  const { data, width, height } = img
  const c = px(img)
  const out = new Float32Array(G * G)
  const x0 = cx + REGION[0] * r, y0 = cy + REGION[1] * r
  const sx = ((REGION[2] - REGION[0]) * r) / G, sy = ((REGION[3] - REGION[1]) * r) / G
  for (let gy = 0; gy < G; gy++) {
    const ya = y0 + gy * sy, yb = ya + sy
    for (let gx = 0; gx < G; gx++) {
      const xa = x0 + gx * sx, xb = xa + sx
      let v = 0, wsum = 0
      for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
        if (y < 0 || y >= height) continue
        const wy = Math.min(yb, y + 1) - Math.max(ya, y)
        for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
          if (x < 0 || x >= width) continue
          const w = wy * (Math.min(xb, x + 1) - Math.max(xa, x))
          const p = (y * width + x) * c
          v += (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) * w; wsum += w
        }
      }
      out[gy * G + gx] = wsum > 0 ? v / wsum : 0
    }
  }
  return out
}

/** Masked cells, centred and scaled to length 1 (a dot product of two is their correlation). */
export function normaliseEgo(f: Float32Array): Float32Array {
  const v = new Float32Array(MASK_IDX.length)
  let mean = 0
  for (const i of MASK_IDX) mean += f[i]
  mean /= MASK_IDX.length
  let norm = 0
  MASK_IDX.forEach((i, k) => { const d = f[i] - mean; v[k] = d; norm += d * d })
  norm = Math.sqrt(norm) + 1e-6
  for (let k = 0; k < v.length; k++) v[k] /= norm
  return v
}

export interface EgoRef { id: string; v: Float32Array }
export interface EgoAtlasMeta { g: number; cols: number; region: number[]; place: number[]; refs: [string, string][] }

export function readEgoAtlas(atlas: Pixels, meta: EgoAtlasMeta): EgoRef[] {
  if (meta.g !== G || meta.region.some((r, k) => Math.abs(r - REGION[k]) > 1e-9)) {
    throw new Error('ego_art.json was built with other settings than the matcher uses')
  }
  const c = px(atlas)
  return meta.refs.map(([id], k) => {
    const ox = (k % meta.cols) * G, oy = Math.floor(k / meta.cols) * G
    const f = new Float32Array(G * G)
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const p = ((oy + y) * atlas.width + ox + x) * c
        f[y * G + x] = atlas.data[p] * 0.299 + atlas.data[p + 1] * 0.587 + atlas.data[p + 2] * 0.114
      }
    }
    return { id, v: normaliseEgo(f) }
  })
}

export interface EgoMatch {
  card: EgoCard
  candidates: { id: string; score: number }[]
  confidence: 'sure' | 'check' | 'unsure'
}

export function matchEgo(img: Pixels, card: EgoCard, refs: EgoRef[], top = 5): EgoMatch {
  const feats: Float32Array[] = []
  for (const dx of SHIFTS) for (const dy of SHIFTS) feats.push(normaliseEgo(sampleEgo(img, card.x + dx * card.r, card.y + dy * card.r, card.r)))
  const scored = refs.map((r) => {
    let best = -Infinity
    for (const f of feats) {
      let s = 0
      for (let k = 0; k < f.length; k++) s += f[k] * r.v[k]
      if (s > best) best = s
    }
    return { id: r.id, score: best }
  }).sort((a, b) => b.score - a.score)
  const candidates = scored.slice(0, top)
  const [a, b] = candidates
  const margin = a && b ? a.score - b.score : 1
  const confidence = !a ? 'unsure'
    : a.score >= CONFIDENCE.sure && margin >= CONFIDENCE.margin ? 'sure'
      : a.score >= CONFIDENCE.check && margin >= CONFIDENCE.checkMargin ? 'check' : 'unsure'
  return { card, candidates, confidence }
}

export function readEgoScreenshot(img: Pixels, refs: EgoRef[]): EgoMatch[] {
  return findEgoCards(img).map((c) => matchEgo(img, c, refs))
}
