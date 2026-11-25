import type { Gift } from '../lib/types'

/** One change to your Cost at the shop: what it was for, and how much (negative: given back). */
export interface CostChange {
  key: number
  amount: number
  label: string
  /** Marked before the Cost was entered: nothing came off. */
  untracked?: boolean
}

/**
 * The Cost you have at the shop (Finley, 2026-11-15: "when you buy something … your cost goes down
 * along with it"). Buying, enhancing, skill swaps and paid refreshes marked on the site take their
 * price off; the last few changes are listed.
 */
export function CostNow({ cost, onChange, log, discounts = [] }: {
  cost: number | null; onChange: (c: number | null) => void; log: CostChange[]
  /** Gifts you have that lower shop prices (shopprices.ts). */
  discounts?: { gift: Gift | null; name: string; text: string }[]
}) {
  return (
    <section className="panel cost-now">
      <label className="cost-now-label">
        <span>Cost you have</span>
        <input type="number" min={0} step={10} inputMode="numeric" value={cost ?? ''} placeholder="e.g. 450"
          onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))} />
      </label>
      {discounts.length > 0 && (
        <p className="small cost-discounts">{discounts.map((d, i) => <span key={d.name}>{i > 0 && ' · '}<b>{d.name}</b>: {d.text}</span>)}. Prices here include it.</p>
      )}
      {cost === null && <p className="muted small">Enter it once: buying, enhancing, swaps and refreshes you mark here take their price off. Until then nothing is taken off.</p>}
      {log.length > 0 && (
          <ul className="cost-log small">
            {log.map((c) => (
              <li key={c.key} className={c.untracked ? 'muted' : undefined}><span className={c.untracked ? '' : c.amount > 0 ? 'cost-down' : 'cost-up'}>{c.amount > 0 ? `−${c.amount}` : `+${-c.amount}`}</span> {c.label}{c.untracked ? ' (not taken off: no Cost entered)' : ''}</li>
            ))}
          </ul>
      )}
    </section>
  )
}
