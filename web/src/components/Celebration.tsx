import { useEffect, useMemo } from 'react'
import type { RareFind } from '../lib/rare'
import { GiftIcon } from './GiftIcon'

/** How long the shower lasts (ms); the banner stays a little longer. */
const SHOWER_MS = 4200
const BANNER_MS = 6000
const PIECES = 46

/** mulberry32, seeded from a string: numbers in [0, 1). */
function seeded(text: string): () => number {
  let a = [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761), 1779033703) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A rare find (lib/rare.ts): coins (Wealth) or stars rain down for a few seconds over the page, with
 * a banner naming the gift. Clicks go through the shower; the banner closes on a click or by itself.
 * With "reduce motion" set in the system, only the banner shows.
 */
export function Celebration({ find, onDone }: { find: RareFind; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, BANNER_MS)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone() }
    window.addEventListener('keydown', esc)
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', esc) }
  }, [find, onDone])
  // Scattered by a little seeded generator, so the same find always rains the same way and
  // re-renders don't reshuffle the pieces.
  const pieces = useMemo(() => {
    const rnd = seeded(find.gift.id)
    return Array.from({ length: PIECES }, (_, i) => ({
      key: i,
      left: rnd() * 100,
      delay: rnd() * (SHOWER_MS - 1800),
      fall: 1600 + rnd() * 1400,
      size: 16 + rnd() * 18,
      spin: 500 + rnd() * 700,
      drift: (rnd() - 0.5) * 80,
    }))
  }, [find.gift.id])
  return (
    <div className={`celebrate celebrate-${find.style}`} aria-live="polite">
      <div className="celebrate-rain" aria-hidden="true">
        {pieces.map((p) => (
          <span key={p.key} className="celebrate-piece" style={{
            left: `${p.left}%`, width: p.size, height: p.size, animationDelay: `${p.delay}ms`, animationDuration: `${p.fall}ms`,
            ['--drift' as string]: `${p.drift}px`,
          }}>
            <span className="celebrate-face" style={{ animationDuration: `${p.spin}ms` }}>{find.style === 'stars' ? '✦' : ''}</span>
          </span>
        ))}
      </div>
      <button className="celebrate-banner" onClick={onDone} title="Close">
        <GiftIcon gift={find.gift} size={44} />
        <span>
          <span className="celebrate-kicker">{find.style === 'coins' ? 'Jackpot!' : 'Rare find!'}</span>
          <b>{find.gift.name}</b>
          <small>{find.why}</small>
        </span>
      </button>
    </div>
  )
}
