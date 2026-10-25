import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { ArtVariant } from '../lib/images'
import { SINNERS, type Identity, type Sinner } from '../lib/types'
import { Portrait } from './Portrait'

interface Props {
  /** Each sinner's equipped identity (shown around the clock). */
  equipped: Record<Sinner, Identity>
  art: ArtVariant
  counts: { gifts: number; packs: number; events: number; identities: number }
  /** You already have a lineup: offer to go straight back to it. */
  hasTeam: boolean
  onDemo: () => void
  onBuild: () => void
  onContinue: () => void
  /** Sign in / load a backup to bring data from another computer. */
  onOpenData: () => void
}

const SIN_COLORS = ['var(--wrath)', 'var(--lust)', 'var(--sloth)', 'var(--gluttony)', 'var(--gloom)', 'var(--pride)', 'var(--envy)']

/** Embers drifting up the page: fixed pseudo-random spots so it looks the same every load. */
const EMBERS = Array.from({ length: 26 }, (_, k) => {
  const r = (n: number) => ((Math.sin(k * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1
  return {
    left: `${Math.round(r(1) * 100)}%`,
    size: 3 + Math.round(r(2) * 5),
    delay: `${-(r(3) * 14).toFixed(2)}s`,
    duration: `${(9 + r(4) * 9).toFixed(2)}s`,
    drift: `${Math.round((r(5) - 0.5) * 120)}px`,
    color: SIN_COLORS[k % SIN_COLORS.length],
  }
})

const FEATURES = [
  {
    title: 'Best gifts for your team',
    text: 'Every E.G.O gift scored for your lineup: keywords, affiliations, slot effects, upgrades and what you already hold.',
    icon: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />,
  },
  {
    title: 'Theme packs and events',
    text: 'Which pack to enter on each floor, and which choice to make at every "?" event, with who to send on a check.',
    icon: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  },
  {
    title: 'Fusion and Lunar Memory',
    text: 'What to fuse right now, what to keep, and the pieces worth building toward every Hard run.',
    icon: <><circle cx="8" cy="8" r="4" /><circle cx="16" cy="16" r="4" /><path d="M11 11l2 2" /></>,
  },
  {
    title: 'Battle simulation',
    text: 'Your decks played out turn by turn: Resonance, E.G.O resources, and which skill swaps actually pay off.',
    icon: <><path d="M4 20L20 4M14 4h6v6" /><path d="M4 4l6 6M14 14l6 6M20 14v6h-6" /></>,
  },
]

/** A number that counts up from 0 when it first shows. */
function CountUp({ to, delay = 0 }: { to: number; delay?: number }) {
  const [n, setN] = useState(() => (reducedMotion() ? to : 0))
  useEffect(() => {
    if (reducedMotion()) return
    let raf = 0
    const start = performance.now() + delay
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / 1400))
      setN(Math.round(to * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, delay])
  return <>{n}</>
}

function reducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/**
 * The welcome screen: what the site does, a one-click demo team, and a way in.
 * Shown on a first visit and from the LimbusSite title. Dante's clock with the
 * twelve sinners at their hours is the centerpiece.
 */
export function Welcome({ equipped, art, counts, hasTeam, onDemo, onBuild, onContinue, onOpenData }: Props) {
  const ring = useMemo(() => SINNERS.map((s, k) => ({ s, i: equipped[s], angle: (k + 1) * 30 })), [equipped])
  const rootRef = useRef<HTMLDivElement>(null)
  // Subtle parallax on the clock with the pointer.
  const onMove = (e: React.PointerEvent) => {
    const el = rootRef.current
    if (!el || reducedMotion()) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3))
    el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3))
  }

  return (
    <div className="welcome" ref={rootRef} onPointerMove={onMove}>
      <div className="welcome-glow" aria-hidden="true" />
      <div className="welcome-embers" aria-hidden="true">
        {EMBERS.map((e, k) => (
          <span key={k} style={{ left: e.left, width: e.size, height: e.size, background: e.color,
            animationDelay: e.delay, animationDuration: e.duration, '--drift': e.drift } as CSSProperties} />
        ))}
      </div>

      <section className="welcome-hero">
        <div className="welcome-copy">
          <p className="welcome-eyebrow rise" style={{ '--d': '0.05s' } as CSSProperties}>Limbus Company · Mirror Dungeon</p>
          <h1 className="welcome-title rise" style={{ '--d': '0.15s' } as CSSProperties}>LimbusSite</h1>
          <p className="welcome-lead rise" style={{ '--d': '0.3s' } as CSSProperties}>
            Plan your Mirror Dungeon run, Manager. Which E.G.O gifts to take, which theme packs to enter, what to pick
            in events and what to fuse, all judged for <em>your</em> team.
          </p>
          <div className="welcome-actions rise" style={{ '--d': '0.45s' } as CSSProperties}>
            <button className="welcome-btn primary" onClick={onDemo}>
              <span>Try a demo team</span>
              <small>A Heishou lineup on a Hard run, ready to go</small>
            </button>
            <button className="welcome-btn" onClick={onBuild}>
              <span>Build my own team</span>
              <small>Pick your sinners and identities</small>
            </button>
          </div>
          {hasTeam && (
            <button className="link-btn welcome-continue rise" style={{ '--d': '0.55s' } as CSSProperties} onClick={onContinue}>
              Continue with my current lineup →
            </button>
          )}
          <button className="link-btn welcome-sync rise" style={{ '--d': '0.6s' } as CSSProperties} onClick={onOpenData}>
            Played on another computer? Sign in or load a backup to bring your data here
          </button>
        </div>

        <div className="welcome-clock rise" style={{ '--d': '0.2s' } as CSSProperties} aria-hidden="true">
          <div className="clock-face">
            <div className="clock-ticks">
              {Array.from({ length: 60 }, (_, k) => <i key={k} className={k % 5 ? '' : 'major'} style={{ transform: `rotate(${k * 6}deg)` }} />)}
            </div>
            <div className="clock-ring">
              {ring.map(({ s, i, angle }) => (
                <div key={s} className="clock-seat" style={{ '--a': `${angle}deg` } as CSSProperties}>
                  <div className="clock-sinner" title={`${s}: ${i?.name ?? ''}`}>
                    {i && <Portrait identity={i} kind="profile" variant={art} />}
                  </div>
                </div>
              ))}
            </div>
            <div className="clock-hand hour" />
            <div className="clock-hand minute" />
            <div className="clock-hand second" />
            <div className="clock-pin" />
          </div>
        </div>
      </section>

      <ul className="welcome-stats">
        {[
          { n: counts.gifts, label: 'E.G.O gifts' },
          { n: counts.packs, label: 'theme packs' },
          { n: counts.events, label: 'events' },
          { n: counts.identities, label: 'identities' },
        ].map((x, k) => (
          <li key={x.label} className="rise" style={{ '--d': `${0.6 + k * 0.08}s` } as CSSProperties}>
            <strong><CountUp to={x.n} delay={600 + k * 80} /></strong>
            <span>{x.label}</span>
          </li>
        ))}
      </ul>

      <ul className="welcome-features">
        {FEATURES.map((f, k) => (
          <li key={f.title} className="rise" style={{ '--d': `${0.85 + k * 0.1}s` } as CSSProperties}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{f.icon}</svg>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </li>
        ))}
      </ul>

      <p className="welcome-foot rise" style={{ '--d': '1.3s' } as CSSProperties}>
        Data scraped from the <a href="https://limbuscompany.wiki.gg/" target="_blank" rel="noreferrer">Limbus Company Wiki</a>.
        A fan project, not affiliated with Project Moon.
      </p>
    </div>
  )
}
