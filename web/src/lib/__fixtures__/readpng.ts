/// <reference types="node" />
// Test helper: node has no image decoder, so the fixture tests read PNGs with this.
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import type { Pixels } from '../screenshot'

/** Minimal PNG reader for the fixtures (8-bit RGB/RGBA, not interlaced): node has no image decoder. */
// Takes a file URL (new URL('…', import.meta.url)) as it is: its .pathname is "/C:/…" on Windows,
// which Node reads as C:\C:\… (Finley, 2026-11-19).
export function readPng(path: string | URL): Pixels {
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
