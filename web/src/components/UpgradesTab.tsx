import { useMemo } from 'react'
import { floorCostFrom } from '../lib/costplan'
import type { GiftScore, RunContext } from '../lib/scoring'
import { ENHANCE_COST, lastFloor } from '../lib/scoring'
import { usePersistentState } from '../lib/storage'
import { affordable, planUpgrades, UPGRADE_LEVELS, type Priority, type UpgradeMove, type UpgradePlan } from '../lib/upgrades'
import { Empty, GiftLabel } from './bits'

interface Props {
  ctx: RunContext
  /** Upgrade level of each gift you own (missing = not enhanced). */
  levels: Record<string, number>
  onLevelsChange: (levels: Record<string, number>) => void
  /** Gifts ranked for this floor (for the Cost your top shop picks take). */
  ranked: GiftScore[]
}

const PRIORITY: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low', spare: 'With spare Cost', skip: 'No change' }
const VERDICT: Record<UpgradePlan['verdict'], string> = { max: 'Max it', once: 'Upgrade once', spare: 'With spare Cost', skip: 'No change', done: 'Maxed', fuse: 'Will be fused' }
const plus = (n: number) => (n ? '+'.repeat(n) : 'Base')

function gainText(p: UpgradePlan, m: UpgradeMove): string {
  const before = p.values[m.from]
  const pct = before > 0 ? Math.round((m.gain / before) * 100) : null
  return pct === null ? '' : `about ${pct}% more value for your team`
}

/**
 * Upgrades tab: which of your gifts to enhance at a shop, how far, and in what order (lib/upgrades.ts).
 */
export function UpgradesTab({ ctx, levels, onLevelsChange, ranked }: Props) {
  const overview = useMemo(() => planUpgrades(ctx, levels), [ctx, levels])
  // The Cost you have now, and whether to keep some for your top shop picks (Finley: "what if we have a lot of Cost?").
  const [cost, setCost] = usePersistentState<number | null>('limbussite.cost.v1', null)
  const [keep, setKeep] = usePersistentState<boolean>('limbussite.costkeep.v1', true)
  const reserve = useMemo(() => (lastFloor(ctx.run) ? 0 : floorCostFrom(ranked, ctx.run.floor ?? 1).comfortable), [ranked, ctx.run])
  const budget = cost === null ? null : Math.max(0, cost - (keep ? reserve : 0))
  const can = useMemo(() => (budget === null ? null : affordable(overview.order, budget)), [overview.order, budget])
  const doNow = new Set((can?.moves ?? []).map((m) => `${m.gift.id}:${m.to}`))
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
          Every upgrade helps; the question is whether the Cost would do more buying gifts. Upgrades are ranked by what they
          add for your team per Cost, next to what the same Cost buys in a shop: <b>High</b> is at least as good as a good
          shop gift, <b>With spare Cost</b> is worth it once you've bought what you need. Gifts you're about to fuse aren't
          enhanced: the enhance is lost in the fusion. Mark an upgrade done and the plan moves on.
        </p>
        <div className="upgrade-budget">
          <label>
            <span>Cost you have</span>
            <input type="number" min={0} step={10} inputMode="numeric" placeholder="e.g. 600" value={cost ?? ''}
              onChange={(e) => setCost(e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))} />
          </label>
          {reserve > 0 && (
            <label className="run-check small">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              Keep {reserve} for your top shop picks
            </label>
          )}
          {can && (
            <p className="upgrade-budget-sum">
              {can.moves.length
                ? <>You can do <b>{can.moves.length}</b> upgrade{can.moves.length === 1 ? '' : 's'} ({can.spent} Cost){keep && reserve > 0 ? `, keeping ${reserve} for shop gifts` : ''}; {cost! - can.spent - (keep ? reserve : 0) > 0 ? `${cost! - can.spent - (keep ? reserve : 0)} left over` : 'nothing left over'}. They're marked <span className="pill pill-now">Do now</span>.</>
                : budget === 0 && keep && reserve > 0 ? <>All of it goes to your top shop picks. Untick the box to spend it on upgrades instead.</>
                  : <>Not enough for any upgrade yet (the cheapest is {Math.min(...overview.order.map((m) => m.cost))}).</>}
            </p>
          )}
        </div>
        {overview.order.length === 0 ? (
          <p className="muted small">Nothing worth upgrading right now.</p>
        ) : (
          <>
            <ol className="upgrade-order">
              {overview.order.map((m, k) => {
                const p = overview.plans.find((x) => x.gift.id === m.gift.id)!
                return (
                  <li key={`${m.gift.id}:${m.to}`} className={`upgrade-move${doNow.has(`${m.gift.id}:${m.to}`) ? ' now' : can ? ' later' : ''}`}>
                    <span className="start-rank">{k + 1}</span>
                    <div className="upgrade-body">
                      <div className="plan-now-top">
                        <GiftLabel gift={m.gift} icon={32} />
                        <span className="pill">{m.to - m.from > 1 ? `Straight to ${plus(m.to)}` : `To ${plus(m.to)}`}</span>
                        <span className={`pill pill-prio-${m.priority}`}>{PRIORITY[m.priority]}</span>
                        {doNow.has(`${m.gift.id}:${m.to}`) && <span className="pill pill-now">Do now</span>}
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
                    : p.verdict === 'fuse' ? `${p.fusing!.text} If that fusion falls through, it's worth enhancing again.`
                    : p.verdict === 'skip' ? `Upgrading changes nothing your team uses (${costs.slice(p.level, p.level + 1)[0]} Cost for ${plus(p.level + 1)}).`
                    : p.verdict === 'spare' ? `It helps a little (${p.values.map((v, l) => `${plus(l)} ${v.toFixed(1)}`).join(' → ')}), but the Cost does more buying gifts. Worth it once you have Cost to spare.`
                      : p.values.map((v, l) => `${plus(l)} ${v.toFixed(1)}`).join(' → ') + ' (value for your team)'}
                </span>
                {p.fusing && !p.fusing.likely && <span className="small upgrade-fuse-note">{p.fusing.text}</span>}
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
          Cost of a good shop gift for your team ({overview.shop.toFixed(2)} per 100 Cost); below that, With spare Cost.
          No change: the upgrade only improves parts of the gift your team doesn't use.
        </p>
      </section>
    </div>
  )
}
