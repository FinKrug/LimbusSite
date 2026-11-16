/** One change to your Cost at the shop: what it was for, and how much (negative: given back). */
export interface CostChange {
  key: number
  amount: number
  label: string
}

/**
 * The Cost you have at the shop (Finley, 2026-11-15: "when you buy something … your cost goes down
 * along with it"). Buying, enhancing, skill swaps and paid refreshes marked on the site take their
 * price off; the last few changes are listed.
 */
export function CostNow({ cost, onChange, log }: { cost: number | null; onChange: (c: number | null) => void; log: CostChange[] }) {
  return (
    <section className="panel cost-now">
      <label className="cost-now-label">
        <span>Cost you have</span>
        <input type="number" min={0} step={10} inputMode="numeric" value={cost ?? ''} placeholder="e.g. 450"
          onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))} />
      </label>
      {cost === null
        ? <p className="muted small">Enter it once: buying, enhancing, swaps and refreshes you mark here take their price off.</p>
        : log.length > 0 && (
          <ul className="cost-log small">
            {log.map((c) => (
              <li key={c.key}><span className={c.amount > 0 ? 'cost-down' : 'cost-up'}>{c.amount > 0 ? `−${c.amount}` : `+${-c.amount}`}</span> {c.label}</li>
            ))}
          </ul>
        )}
    </section>
  )
}
