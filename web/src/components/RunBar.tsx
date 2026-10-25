import { EXTREME_FROM, withPack, type Difficulty, type RunSettings } from '../lib/scoring'
import type { ThemePack } from '../lib/types'
import { usePacksOnFloor, withFloor } from '../lib/run'

interface Props {
  run: RunSettings
  onChange: (run: RunSettings) => void
  packs: ThemePack[]
  /** Gifts you have (Vestiges included). */
  giftCount: number
  /** Open the full run settings (difficulty, length, End / Clear run). */
  onOpenSettings: () => void
  /** Open Gifts you have; omitted where they're already on screen. */
  onOpenGifts?: () => void
}

const DIFFICULTY: Record<Difficulty, string> = { normal: 'Normal', hard: 'Hard', extreme: 'EXTREME' }

/**
 * One line at the top of every run screen with what changes during a run: the
 * floor and its theme pack. The rest of the run settings sit behind "Run settings".
 */
export function RunBar({ run, onChange, packs, giftCount, onOpenSettings, onOpenGifts }: Props) {
  const onFloor = usePacksOnFloor(packs, run)
  const setFloor = (floor: number | null) => onChange(withFloor(run, floor))
  const phase = run.difficulty === 'extreme' && run.floor !== null
    ? run.floor < EXTREME_FROM ? 'Hard floor' : 'EXTREME floor' : null

  return (
    <section className="run-bar" aria-label="Your run">
      <button className="run-bar-diff" onClick={onOpenSettings} title="Difficulty and length (Run settings)">
        {DIFFICULTY[run.difficulty]} · {run.floors} floors
      </button>

      <div className="run-bar-floor">
        <span className="muted">Floor</span>
        <button className="icon-btn" aria-label="Previous floor" disabled={run.floor === null || run.floor <= 1}
          onClick={() => setFloor((run.floor ?? 2) - 1)}>−</button>
        <span className="run-floor-n">{run.floor === null ? '–' : run.floor}<span className="muted">/{run.floors}</span></span>
        <button className="icon-btn" aria-label="Next floor" disabled={run.floor !== null && run.floor >= run.floors}
          onClick={() => setFloor(run.floor === null ? 1 : run.floor + 1)}>+</button>
        {phase && <span className="muted small-text">{phase}</span>}
      </div>

      {run.floor === null ? (
        <button className="btn primary small-btn" onClick={() => setFloor(1)}>Start run</button>
      ) : (
        <label className="run-bar-pack">
          <span className="muted">Pack</span>
          <select value={run.pack ?? ''} onChange={(e) => onChange(withPack(run, e.target.value || null))} aria-label="Theme pack on this floor">
            <option value="">Not picked yet</option>
            {onFloor.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      <span className="run-bar-end">
        {onOpenGifts
          ? <button className="link-btn" onClick={onOpenGifts}>Gifts you have <b>{giftCount}</b></button>
          : <span className="muted">Gifts you have <b>{giftCount}</b></span>}
        {run.struggling && <span className="tag" title="Events avoid optional fights (Run settings)">Struggling</span>}
        <button className="btn small-btn" onClick={onOpenSettings}>Run settings</button>
      </span>
    </section>
  )
}
