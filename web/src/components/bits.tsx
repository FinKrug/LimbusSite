import type { Reason } from '../lib/scoring'
import { type Gift, isCoreKeyword, tierLabel } from '../lib/types'

export function TierBadge({ tier }: { tier: number | null }) {
  return (
    <span className="tier" data-tier={tier ?? 0} title={`Tier ${tierLabel(tier)}`}>
      {tierLabel(tier)}
    </span>
  )
}

export function SinDot({ sin }: { sin: string | null }) {
  if (!sin) return null
  return <span className={`sin sin-${sin}`} title={`${sin[0].toUpperCase()}${sin.slice(1)} affinity`} aria-label={`${sin} affinity`} />
}

export function KeywordChip({ keyword }: { keyword: string | null }) {
  const label = keyword ?? 'General'
  const cls = isCoreKeyword(keyword) ? `kw kw-${keyword.toLowerCase()}` : 'kw kw-general'
  return <span className={cls}>{label}</span>
}

export function WikiLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <span className="wiki">{children}</span>
  return (
    <a href={href} target="_blank" rel="noreferrer" className="wiki" title="Open on the Limbus Company Wiki">
      {children}
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
        <path d="M4.5 2H2v8h8V7.5M7 2h3v3M10 2 5.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </a>
  )
}

export function RatingBar({ rating }: { rating: number }) {
  return (
    <div className="rating" title={`${rating} / 100 compared with the best option`}>
      <div className="rating-track">
        <div className="rating-fill" style={{ width: `${Math.max(2, rating)}%` }} />
      </div>
      <span className="rating-num">{rating}</span>
    </div>
  )
}

const ICON: Record<Reason['kind'], string> = { good: '+', bad: '−', info: '·' }

export function Reasons({ reasons, max = 3 }: { reasons: Reason[]; max?: number }) {
  if (!reasons.length) return null
  return (
    <ul className="reasons">
      {reasons.slice(0, max).map((r) => (
        <li key={r.text} className={`reason reason-${r.kind}`}>
          <span className="reason-icon" aria-hidden="true">{ICON[r.kind]}</span>
          {r.text}
        </li>
      ))}
    </ul>
  )
}

/** One-line gift label: tier, sin, name (linked), keyword. */
export function GiftLabel({ gift, link = true }: { gift: Gift; link?: boolean }) {
  return (
    <span className="gift-label">
      <TierBadge tier={gift.tier} />
      <SinDot sin={gift.sin} />
      {link ? <WikiLink href={gift.wiki_url}>{gift.name}</WikiLink> : <span>{gift.name}</span>}
      <KeywordChip keyword={gift.keyword} />
    </span>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>
}

export function TargetButton({ on, onToggle, name }: { on: boolean; onToggle: () => void; name: string }) {
  return (
    <button
      className={on ? 'star on' : 'star'}
      aria-pressed={on}
      aria-label={on ? `Stop targeting ${name}` : `Target ${name}`}
      title={on ? 'Targeted: packs that give this are ranked higher' : 'Target this gift'}
      onClick={onToggle}
    >
      {on ? '★' : '☆'}
    </button>
  )
}

