import { useMemo, useState } from 'react'
import { costPlan, floorCostFrom } from '../lib/costplan'
import { usePacksOnFloor, withFloor } from '../lib/run'
import {
  EXTREME_FROM, RUN_LENGTHS, defaultFloors, withPack, type Difficulty, type GiftScore, type RunContext, type RunSettings,
} from '../lib/scoring'
import type { ThemePack } from '../lib/types'

interface Props {
  run: RunSettings
  onChange: (run: RunSettings) => void
  packs: ThemePack[]
  /** Gifts ranked for the current floor (the Best gifts list). */
  ranked: GiftScore[]
  ctx: RunContext
  /** Start fresh: gifts you have, offered packs, floor and pack (team and saved lineups stay). */
  onClearRun: () => void
  /** Show "Cost to have at this floor's shop" (the Shop shows it on its own). */
  showCost?: boolean
}

const DIFFICULTY: Record<Difficulty, string> = { normal: 'Normal', hard: 'Hard', extreme: 'EXTREME' }

/**
 * The run you're playing, shared by every tab: difficulty, length, floor and the
 * floor's theme pack. Gift scores use the length and floor (Cost gifts early,
 * "survive a lethal hit" gifts late); Theme packs and Fusion use the floor and pack.
 */
export function RunPanel({ run, onChange, packs, ranked, ctx, onClearRun, showCost = true }: Props) {
  const [confirmClear, setConfirmClear] = useState(false)
  const onFloor = usePacksOnFloor(packs, run)
  const set = (patch: Partial<RunSettings>) => onChange({ ...run, ...patch })
  const setFloor = (floor: number | null) => onChange(withFloor(run, floor))
  const phase = run.difficulty === 'extreme' && run.floor !== null
    ? run.floor < EXTREME_FROM ? 'Hard floor' : 'EXTREME floor' : null

  return (
    <section className="panel run-panel">
      <header className="panel-head"><h2>Your run</h2>
        <span className="run-actions">
          {run.floor !== null && <button className="link-btn" onClick={() => setFloor(null)}
            title="Stop tracking the floor (keeps your gifts)">End run</button>}
          <button className="link-btn danger" onClick={() => setConfirmClear(!confirmClear)}
            title="Start a new run: clears the gifts you have, offered theme packs, floor and pack. Your team and saved lineups stay.">
            Clear run
          </button>
        </span>
      </header>
      {confirmClear && (
        <div className="run-clear small">
          <span>Clear the gifts you have, offered theme packs, floor and pack? Your team and saved lineups stay.</span>
          <span className="run-clear-btns">
            <button className="btn small-btn danger-btn" onClick={() => { onClearRun(); setConfirmClear(false) }}>Clear run</button>
            <button className="link-btn" onClick={() => setConfirmClear(false)}>Cancel</button>
          </span>
        </div>
      )}
      <div className="run-grid">
        <label className="run-field">
          <span>Difficulty</span>
          <select value={run.difficulty} onChange={(e) => {
            const d = e.target.value as Difficulty
            onChange({ ...run, difficulty: d, floors: defaultFloors(d), floor: run.floor === null ? null : Math.min(run.floor, defaultFloors(d)), pack: null, visited: {} })
          }}>
            {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => <option key={d} value={d}>{DIFFICULTY[d]}</option>)}
          </select>
        </label>
        <div className="run-field">
          <span>Length</span>
          <div className="seg" role="group" aria-label="Run length">
            {RUN_LENGTHS.map((n) => (
              <button key={n} className={run.floors === n ? 'seg-btn on' : 'seg-btn'} aria-pressed={run.floors === n}
                onClick={() => set({ floors: n, floor: run.floor === null ? null : Math.min(run.floor, n) })}
                title={`${n}-floor run`}>{n}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="run-floor">
        <span className="muted small">Floor</span>
        <button className="icon-btn" aria-label="Previous floor" disabled={run.floor === null || run.floor <= 1}
          onClick={() => setFloor((run.floor ?? 2) - 1)}>−</button>
        <span className="run-floor-n">{run.floor === null ? '–' : run.floor}<span className="muted">/{run.floors}</span></span>
        <button className="icon-btn" aria-label="Next floor" disabled={run.floor !== null && run.floor >= run.floors}
          onClick={() => setFloor(run.floor === null ? 1 : run.floor + 1)}>+</button>
        {run.floor === null
          ? <button className="btn small-btn" onClick={() => setFloor(1)}>Start run</button>
          : phase && <span className="muted small">{phase}</span>}
      </div>
      {run.floor !== null && (
        <label className="run-field">
          <span>Theme pack on this floor</span>
          <select value={run.pack ?? ''} onChange={(e) => onChange(withPack(run, e.target.value || null))}>
            <option value="">Not picked yet</option>
            {onFloor.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      <label className="run-check small" title="Events normally pick the fight that gives an extra gift (a spare is fusion fuel). Tick this when fights are going badly and they'll play it safe.">
        <input type="checkbox" checked={!!run.struggling} onChange={(e) => set({ struggling: e.target.checked })} />
        Struggling in fights (events avoid optional fights)
      </label>
      {showCost && <CostBox run={run} ranked={ranked} ctx={ctx} />}
      <p className="muted small run-note">
        {run.floor === null
          ? 'Set your run so gifts are weighed for it: Cost gifts early, survival gifts late.'
          : `${run.floors - run.floor} floor${run.floors - run.floor === 1 ? '' : 's'} after this one.`}
      </p>
    </section>
  )
}

/** How much Cost to have at the shop: now, and (on request) for every floor. */
export function CostBox({ run, ranked, ctx }: { run: RunSettings; ranked: GiftScore[]; ctx: RunContext }) {
  const floor = run.floor ?? 1
  const here = useMemo(() => floorCostFrom(ranked, floor), [ranked, floor])
  const [showAll, setShowAll] = useState(false)
  // Ranking every floor takes a moment, so only when asked.
  const all = useMemo(() => (showAll ? costPlan(ctx) : []), [showAll, ctx])
  return (
    <div className="run-cost">
      <div className="run-cost-head">
        <span className="muted small">Cost to have at {run.floor === null ? 'floor 1\'s' : 'this floor\'s'} shop</span>
        <span className="run-cost-n"><b>{here.min}</b> <span className="muted small">minimum</span>
          {here.comfortable > here.min && <> · <b>{here.comfortable}</b> <span className="muted small">comfortable</span></>}</span>
      </div>
      <ul className="run-cost-parts">
        {here.parts.map((p) => <li key={p.label}><span>{p.label}</span><span>{p.cost}</span></li>)}
      </ul>
      {here.top && here.comfortable > here.min && (
        <p className="muted small">Comfortable also covers {here.top.name} ({here.top.cost}), your #1 shop gift.</p>
      )}
      <details className="run-cost-all" onToggle={(e) => setShowAll((e.target as HTMLDetailsElement).open)}>
        <summary className="small">Every floor</summary>
        <ol className="run-cost-floors">
          {all.map((f) => (
            <li key={f.floor} className={f.floor === run.floor ? 'current' : undefined}
              title={f.parts.map((p) => `${p.label}: ${p.cost}`).join('\n')}>
              <span>F{f.floor}</span><b>{f.min}</b><span className="muted">{f.comfortable > f.min ? f.comfortable : ''}</span>
            </li>
          ))}
        </ol>
        <p className="muted small">
          Where Cost comes from: you start with 200; fights give 75–150 (Hard 85–180) and bosses 200+ (Hard 250+).
          Cumulating Starcloud adds 10% of your Cost on each new floor (max 100, so holding 1,000 gets it all).
        </p>
      </details>
    </div>
  )
}
