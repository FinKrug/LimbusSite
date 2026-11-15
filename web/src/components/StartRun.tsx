import { useMemo } from 'react'
import { shortName } from '../lib/format'
import type { ArtVariant } from '../lib/images'
import { hasOrder, presetMatches, restoreSelection, type Equipped, type TeamPreset } from '../lib/presets'
import { RUN_LENGTHS, defaultFloors, type Difficulty, type RunSettings } from '../lib/scoring'
import { SINNERS, type Identity, type Sinner } from '../lib/types'
import { Portrait } from './Portrait'

const DIFFICULTY: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'normal', label: 'Normal', hint: 'Shorter run, one boss reward gift' },
  { id: 'hard', label: 'Hard', hint: 'Two boss reward gifts, Lunar Memory' },
  { id: 'extreme', label: 'EXTREME', hint: 'Hard floors, then EXTREME ones' },
]

/**
 * Starting a run, step 1: which lineup you're taking in (a saved one, the team you have
 * now, or a new one) and the difficulty. Also opened mid-run from "Run setup" to change them.
 */
export function StartRun({ presets, activeId, current, selection, deployed, identities, art, run, onRunChange, onUse, onUseCurrent, onNewLineup, onEditTeam }: {
  presets: TeamPreset[]
  activeId: string | null
  /** The team on the Team page now. */
  current: Equipped
  selection: Sinner[]
  deployed: number
  identities: Identity[]
  art: ArtVariant
  run: RunSettings
  onRunChange: (run: RunSettings) => void
  /** Load a saved lineup for the run. */
  onUse: (p: TeamPreset) => void
  /** Keep the team you have now (forgets which saved lineup it came from if it no longer matches). */
  onUseCurrent: () => void
  /** Build a new lineup on the Team page, then come back here. */
  onNewLineup: () => void
  /** Change the team you have now on the Team page, then come back here. */
  onEditTeam: () => void
}) {
  const byId = useMemo(() => new Map(identities.map((i) => [i.id, i])), [identities])
  const base = useMemo(() => {
    const out = new Map<Sinner, Identity>()
    for (const s of SINNERS) {
      const mine = identities.filter((i) => i.sinner === s)
      const d = mine.find((i) => i.name.startsWith('LCB Sinner')) ?? mine[0]
      if (d) out.set(s, d)
    }
    return out
  }, [identities])
  const identityOf = (team: Equipped, s: Sinner) => byId.get(team[s] ?? '') ?? base.get(s)
  const matching = presets.find((p) => presetMatches(p, current, selection))
  const chosenId = matching?.id ?? (activeId && presets.some((p) => p.id === activeId && presetMatches(p, current, selection)) ? activeId : null)
  const currentChosen = !chosenId
  const inRun = run.floor !== null

  const setDifficulty = (d: Difficulty) => {
    if (d === run.difficulty) return
    onRunChange({ ...run, difficulty: d, floors: defaultFloors(d), floor: run.floor === null ? null : Math.min(run.floor, defaultFloors(d)), pack: null, visited: {} })
  }

  return (
    <div className="start-run" data-tour="start-run">
      <section className="start-section">
        <header className="start-head">
          <h2>Which lineup are you taking in?</h2>
          <p className="muted small">
            {inRun
              ? `You're on floor ${run.floor}. Switching lineups changes the team the rest of this run is planned for.`
              : 'Recommendations for the whole run are worked out for this team. You can change the deployment order during the run.'}
          </p>
        </header>
        <div className="lineup-cards">
          <LineupCard title={matching ? matching.name : 'Your current team'}
            sub={matching ? 'Saved lineup · what you have now' : selection.length ? 'Not saved as a lineup' : 'No lineup picked yet'}
            team={current} order={selection} deployed={deployed} identityOf={identityOf} art={art}
            chosen={currentChosen || chosenId === matching?.id}
            onPick={onUseCurrent}
            action={<button className="link-btn" onClick={(e) => { e.stopPropagation(); onEditTeam() }}>Edit</button>} />
          {presets.filter((p) => p.id !== matching?.id).map((p) => (
            <LineupCard key={p.id} title={p.name} sub={hasOrder(p) ? `${restoreSelection(p.selection).length} in the lineup` : 'Identities only, no order'}
              team={p.team} order={hasOrder(p) ? restoreSelection(p.selection) : []} deployed={deployed} identityOf={identityOf} art={art}
              chosen={false} onPick={() => onUse(p)} />
          ))}
          <button className="lineup-card lineup-new" onClick={onNewLineup}>
            <span className="lineup-new-plus" aria-hidden="true">+</span>
            <b>Make a new lineup</b>
            <small className="muted">Pick identities or build one around a keyword</small>
          </button>
        </div>
        {selection.length === 0 && (
          <p className="hint start-warn">Your current team has no lineup order yet. Pick a saved lineup, or press Edit to choose who's deployed.</p>
        )}
      </section>

      <section className="start-section">
        <header className="start-head"><h2>Difficulty</h2></header>
        <div className="difficulty-cards" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTY.map((d) => (
            <button key={d.id} role="radio" aria-checked={run.difficulty === d.id}
              className={`difficulty-card d-${d.id}${run.difficulty === d.id ? ' on' : ''}`} onClick={() => setDifficulty(d.id)}>
              <b>{d.label}</b><small>{d.hint}</small>
            </button>
          ))}
        </div>
        <div className="start-floors">
          <span className="muted">Floors</span>
          <div className="seg" role="group" aria-label="Run length">
            {RUN_LENGTHS.map((n) => (
              <button key={n} className={run.floors === n ? 'seg-btn on' : 'seg-btn'} aria-pressed={run.floors === n}
                onClick={() => onRunChange({ ...run, floors: n, floor: run.floor === null ? null : Math.min(run.floor, n) })}>{n}</button>
            ))}
          </div>
          {inRun && run.difficulty && <span className="muted small">Changing the difficulty mid-run clears the floor's pack.</span>}
        </div>
      </section>
    </div>
  )
}

function LineupCard({ title, sub, team, order, deployed, identityOf, art, chosen, onPick, action }: {
  title: string
  sub: string
  team: Equipped
  order: Sinner[]
  deployed: number
  identityOf: (team: Equipped, s: Sinner) => Identity | undefined
  art: ArtVariant
  chosen: boolean
  onPick: () => void
  action?: React.ReactNode
}) {
  // Deployed sinners first (in order), like the game's formation; then up to 12 in all.
  const shown = (order.length ? order : SINNERS).slice(0, 12)
  return (
    <div role="radio" aria-checked={chosen} tabIndex={0} className={`lineup-card${chosen ? ' on' : ''}`} onClick={onPick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick() } }}>
      <span className="lineup-card-head">
        <b>{title}</b>
        {chosen && <span className="pill pill-chosen">Taking this</span>}
        {action}
      </span>
      <small className="muted">{sub}</small>
      <span className="lineup-faces">
        {shown.map((s, k) => {
          const i = identityOf(team, s)
          return i ? (
            <span key={s} className={`lineup-face${order.length && k >= deployed ? ' backup' : ''}`} title={`${k + 1}. ${shortName(i)} ${s}`}>
              <Portrait identity={i} kind="profile" variant={art} />
            </span>
          ) : null
        })}
      </span>
    </div>
  )
}
