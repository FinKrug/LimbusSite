import { useMemo } from 'react'
import type { RunContext } from '../lib/scoring'
import { ENHANCE_COST } from '../lib/scoring'
import { planUpgrades, UPGRADE_LEVELS, type Priority, type UpgradeMove, type UpgradePlan } from '../lib/upgrades'
import { Empty, GiftLabel } from './bits'

interface Props {
  ctx: RunContext
  /** Upgrade level of each gift you own (missing = not enhanced). */
  levels: Record<string, number>
  onLevelsChange: (levels: Record<string, number>) => void
}

const PRIORITY: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low', skip: 'Skip' }
const VERDICT: Record<UpgradePlan['verdict'], string> = { max: 'Max it', once: 'Upgrade once', skip: 'Skip', done: 'Maxed' }
const plus = (n: number) => (n ? '+'.repeat(n) : 'Base')

function gainText(p: UpgradePlan, m: UpgradeMove): string {
  const before = p.values[m.from]
  const pct = before > 0 ? Math.round((m.gain / before) * 100) : null
  return pct === null ? '' : `about ${pct}% more value for your team`
}

/**
 * Upgrades tab: which of your gifts to enhance at a shop, how far, and in what order (lib/upgrades.ts).
 */
export function UpgradesTab({ ctx, levels, onLevelsChange }: Props) {
  const overview = useMemo(() => planUpgrades(ctx, levels), [ctx, levels])
  const setLevel = (id: string, level: number) => {
    const next = { ...levels }
    if (level > 0) next[id] = level
    else delete next[id]
    onLevelsChange(next)
  }
  const total = overview.order.reduce((s, m) => s + m.cost, 0)

  if (!ctx.owned.size) {
    return <Empty>Add the gifts you have (on the left, or with Import gifts) to see which to upgrade.</Empty>
  }
  return (
    <div className="upgrades-tab">
      <section className="panel">
        <h2>What to upgrade</h2>
        <p className="muted small">
          Your gifts that can be enhanced, ranked by how much each upgrade adds for your team per Cost, next to what the
          same Cost would buy in a shop. <b>High</b> is at least as good as buying a good shop gift; <b>Low</b> is worth it
          only with spare Cost. Clash effects count most. Mark an upgrade done when you make it and the plan moves on.
        </p>
        {overview.order.length === 0 ? (
          <p className="muted small">Nothing worth upgrading right now.</p>
        ) : (
          <>
            <ol className="upgrade-order">
              {overview.order.map((m, k) => {
                const p = overview.plans.find((x) => x.gift.id === m.gift.id)!
                return (
                  <li key={`${m.gift.id}:${m.to}`} className="upgrade-move">
                    <span className="start-rank">{k + 1}</span>
                    <div className="upgrade-body">
                      <div className="plan-now-top">
                        <GiftLabel gift={m.gift} icon={32} />
                        <span className="pill">{m.to - m.from > 1 ? `Straight to ${plus(m.to)}` : `To ${plus(m.to)}`}</span>
                        <span className={`pill pill-prio-${m.priority}`}>{PRIORITY[m.priority]}</span>
                        <button className="btn small-btn" onClick={() => setLevel(m.gift.id, m.to)} title="Mark it as upgraded: the plan moves on">Done</button>
                      </div>
                      <span className="muted small">
                        {m.cost} Cost · {gainText(p, m)}
                        {m.to - m.from > 1 ? ` · ${plus(m.from + 1)} alone does little, ${plus(m.to)} is where it pays off` : ''}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>
            <p className="muted small">All of it: {total} Cost.</p>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Your gifts</h2>
        <ul className="upgrade-gifts">
          {overview.plans.map((p) => {
            const costs = ENHANCE_COST[p.gift.tier ?? 0] ?? []
            return (
              <li key={p.gift.id} className={`upgrade-gift verdict-row-${p.verdict}`}>
                <div className="plan-now-top">
                  <GiftLabel gift={p.gift} icon={28} />
                  <span className={`pill upgrade-verdict-${p.verdict}`}>{VERDICT[p.verdict]}</span>
                  <label className="upgrade-level small">
                    <span className="muted">Now:</span>
                    <select value={p.level} onChange={(e) => setLevel(p.gift.id, Number(e.target.value))} aria-label={`${p.gift.name} upgrade level`}>
                      {Array.from({ length: p.maxLevel + 1 }, (_, l) => <option key={l} value={l}>{plus(l)}</option>)}
                    </select>
                  </label>
                </div>
                <span className="muted small">
                  {p.verdict === 'done' ? 'Fully upgraded.'
                    : p.verdict === 'skip' ? `Not worth the Cost for your team (${costs.slice(p.level, p.level + 1)[0]} Cost for ${plus(p.level + 1)}).`
                      : p.values.map((v, l) => `${plus(l)} ${v.toFixed(1)}`).join(' → ') + ' (value for your team)'}
                </span>
                {p.level < p.maxLevel && p.gift.upgrades?.[p.level] && (
                  <details className="upgrade-text small">
                    <summary className="muted">What {plus(p.level + 1)} does</summary>
                    <p>{p.gift.upgrades[p.level]}</p>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
        {overview.fixed > 0 && (
          <p className="muted small">{overview.fixed} of your gifts can’t be enhanced (they’re dimmed on the Enhance screen).</p>
        )}
        <p className="muted small">
          Priorities: High ≥ {UPGRADE_LEVELS.high}×, Medium ≥ {UPGRADE_LEVELS.medium}×, Low ≥ {UPGRADE_LEVELS.low}× the value per
          Cost of a good shop gift for your team ({overview.shop.toFixed(2)} per 100 Cost).
        </p>
      </section>
    </div>
  )
}
