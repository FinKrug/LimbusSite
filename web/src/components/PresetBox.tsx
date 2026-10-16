import { useMemo, useState } from 'react'
import type { ArtVariant } from '../lib/images'
import {
  MAX_NAME, cleanName, hasOrder, makePreset, movePreset, presetMatches, renamePreset, restoreSelection, updatePreset,
  type Equipped, type TeamPreset,
} from '../lib/presets'
import { shortName } from '../lib/format'
import { CORE_KEYWORDS, SINNERS, type Identity, type Sinner } from '../lib/types'
import { Portrait } from './Portrait'

interface Props {
  presets: TeamPreset[]
  onPresetsChange: (p: TeamPreset[]) => void
  /** The preset last loaded or saved, so changes to it can be saved back. */
  activeId: string | null
  onActiveChange: (id: string | null) => void
  /** Every sinner's equipped identity id right now. */
  current: Equipped
  /** The lineup order right now (may be empty). */
  selection: Sinner[]
  /** Equip these identities and, if given, set this order (undefined = keep the current order). */
  onApply: (team: Equipped, selection?: Sinner[]) => void
  identities: Identity[]
  art: ArtVariant
}

/**
 * Saved teams on the Team tab: save which version of each sinner you're running
 * (and the lineup order, if you've picked one) under a name, then switch between
 * them in one click instead of swapping identities one at a time.
 */
export function PresetBox({ presets, onPresetsChange, activeId, onActiveChange, current, selection, onApply, identities, art }: Props) {
  const [name, setName] = useState('')
  const [undo, setUndo] = useState<{ team: Equipped; selection: Sinner[]; preset: TeamPreset; activeId: string | null } | null>(null)
  const byId = useMemo(() => new Map(identities.map((i) => [i.id, i])), [identities])
  const defaults = useMemo(() => {
    const out = new Map<Sinner, Identity>()
    for (const s of SINNERS) {
      const mine = identities.filter((i) => i.sinner === s)
      const d = mine.find((i) => i.name.startsWith('LCB Sinner')) ?? mine[0]
      if (d) out.set(s, d)
    }
    return out
  }, [identities])
  const identityOf = (team: Equipped, s: Sinner) => byId.get(team[s] ?? '') ?? defaults.get(s)

  const matching = presets.find((p) => presetMatches(p, current, selection))
  const active = presets.find((p) => p.id === activeId)
  const edited = active && !presetMatches(active, current, selection) ? active : undefined
  // The current preset has no order saved but you've picked one: offer to add it.
  const canAddOrder = matching && !hasOrder(matching) && selection.length > 0
  const overwrite = (id: string) => onPresetsChange(updatePreset(presets, id, current, selection))
  const suggested = suggestName(SINNERS.map((s) => identityOf(current, s)).filter((i): i is Identity => !!i), presets.length)

  const save = () => {
    const p = makePreset(cleanName(name) || suggested, current, selection, presets)
    onPresetsChange([...presets, p])
    onActiveChange(p.id)
    setName('')
    setUndo(null)
  }
  const load = (p: TeamPreset) => {
    // Loading replaces your identities (and order); if they aren't saved anywhere, offer to undo.
    setUndo(!matching ? { team: current, selection, preset: p, activeId } : null)
    onApply(p.team, hasOrder(p) ? restoreSelection(p.selection) : undefined)
    onActiveChange(p.id)
  }

  return (
    <section className="side-box presets" aria-label="Team presets">
      <h3>Team presets {presets.length > 0 && <span className="badge">{presets.length}</span>}</h3>

      <p className="preset-status small">
        {matching ? <>Current team: <b>{matching.name}</b></>
          : edited ? <>Editing <b>{edited.name}</b> <span className="muted">· unsaved changes</span></>
          : <span className="muted">Your current team isn't saved.</span>}
        {canAddOrder && <>{' '}<button className="link-btn" onClick={() => overwrite(matching.id)}
          title="Save your current lineup order to this preset">Save this order to it</button></>}
      </p>
      {edited && !matching && (
        <button className="btn primary" onClick={() => { overwrite(edited.id); setUndo(null) }}>
          Save changes
        </button>
      )}
      {/* Only while the loaded preset is untouched; after more swaps, undoing would lose them. */}
      {undo && matching?.id === undo.preset.id && (
        <p className="preset-undo small">
          Loaded {undo.preset.name}. Your previous team wasn't saved.{' '}
          <button className="link-btn" onClick={() => { onApply(undo.team, undo.selection); onActiveChange(undo.activeId); setUndo(null) }}>Undo</button>
        </p>
      )}

      {presets.length === 0 ? (
        <p className="hint small">
          Swap in the identities you want (e.g. The Thumb Rodion), save them here, then switch between saved teams
          in one click. If you've picked a lineup order it's saved too; you don't need one to save.
        </p>
      ) : (
        <ul className="preset-list">
          {presets.map((p, k) => (
            <PresetRow key={p.id} preset={p} isCurrent={p.id === matching?.id} isEdited={p.id === edited?.id}
              first={k === 0} last={k === presets.length - 1} art={art} identityOf={identityOf}
              onLoad={() => load(p)}
              onOverwrite={() => { overwrite(p.id); onActiveChange(p.id); setUndo(null) }}
              onRename={(n) => onPresetsChange(renamePreset(presets, p.id, n))}
              onMove={(by) => onPresetsChange(movePreset(presets, p.id, by))}
              onDelete={() => {
                onPresetsChange(presets.filter((x) => x.id !== p.id))
                if (p.id === activeId) onActiveChange(null)
              }} />
          ))}
        </ul>
      )}

      {!matching && (
        <form className="preset-save" onSubmit={(e) => { e.preventDefault(); save() }}>
          <input type="text" value={name} maxLength={MAX_NAME} placeholder={suggested} aria-label="Preset name"
            onChange={(e) => setName(e.target.value)} />
          <button className="btn" type="submit" title="Save every sinner's current identity as a new preset">
            {edited ? 'Save as new' : 'Save'}
          </button>
        </form>
      )}
    </section>
  )
}

function PresetRow({ preset: p, isCurrent, isEdited, first, last, art, identityOf, onLoad, onOverwrite, onRename, onMove, onDelete }: {
  preset: TeamPreset; isCurrent: boolean; isEdited: boolean; first: boolean; last: boolean; art: ArtVariant
  identityOf: (team: Equipped, s: Sinner) => Identity | undefined
  onLoad: () => void; onOverwrite: () => void; onRename: (n: string) => void; onMove: (by: -1 | 1) => void; onDelete: () => void
}) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Lineup order first (numbered), then the rest dimmed; all 12 in sinner order if no order was saved.
  const order = restoreSelection(p.selection)
  const sinners = [...order, ...SINNERS.filter((s) => !order.includes(s))]
  const faces = sinners.map((s) => identityOf(p.team, s)).filter((i): i is Identity => !!i)
  const tip = faces.map((i) => {
    const k = order.indexOf(i.sinner)
    return `${k >= 0 ? `#${k + 1} ` : ''}${i.sinner}: ${shortName(i)}`
  }).join('\n')

  return (
    <li className={`preset${isCurrent ? ' current' : ''}${isEdited ? ' edited' : ''}`}>
      <div className="preset-head">
        {renaming !== null ? (
          <form className="preset-rename" onSubmit={(e) => { e.preventDefault(); onRename(renaming); setRenaming(null) }}>
            <input type="text" value={renaming} maxLength={MAX_NAME} autoFocus aria-label="New name"
              onChange={(e) => setRenaming(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null) }} />
            <button className="btn small-btn" type="submit">OK</button>
          </form>
        ) : (
          <span className="preset-name" title={p.name}>{p.name}</span>
        )}
        {isCurrent ? <span className="preset-tag">Current</span> : <>
          {isEdited && <span className="preset-tag edited">Edited</span>}
          <button className={isEdited ? 'btn small-btn' : 'btn primary small-btn'} onClick={onLoad}
            title={isEdited ? 'Go back to the saved identities' : undefined}>{isEdited ? 'Revert' : 'Load'}</button>
        </>}
      </div>
      <button className="preset-faces" onClick={isCurrent ? undefined : onLoad} disabled={isCurrent}
        aria-label={isCurrent ? `${p.name} is equipped` : `Load ${p.name}`}
        title={tip}>
        {faces.map((i) => (
          <span key={i.sinner} className={order.length && !order.includes(i.sinner) ? 'preset-face off' : 'preset-face'}>
            <Portrait identity={i} kind="profile" variant={art} />
          </span>
        ))}
      </button>
      <span className="preset-order muted small">{order.length ? `Order saved · ${order.length} picked` : 'No order saved'}</span>
      <details className="preset-edit" onToggle={(e) => { if (!(e.target as HTMLDetailsElement).open) setConfirmDelete(false) }}>
        <summary className="muted small">Edit</summary>
        <div className="preset-actions">
          <button className="link-btn" onClick={() => setRenaming(p.name)}>Rename</button>
          {!isCurrent && <button className="link-btn" onClick={onOverwrite} title="Replace this preset with the identities and order you have now">Overwrite with current</button>}
          <button className="link-btn" onClick={() => onMove(-1)} disabled={first} aria-label="Move up">↑</button>
          <button className="link-btn" onClick={() => onMove(1)} disabled={last} aria-label="Move down">↓</button>
          {confirmDelete
            ? <button className="link-btn danger" onClick={onDelete}>Delete “{p.name}”?</button>
            : <button className="link-btn danger" onClick={() => setConfirmDelete(true)}>Delete</button>}
        </div>
      </details>
    </li>
  )
}

/** "Burn team" from the most common keyword across the identities, else "Team 3". */
function suggestName(ids: Identity[], count: number): string {
  const top = CORE_KEYWORDS
    .map((k) => ({ k, n: ids.filter((i) => i.keywords.includes(k)).length }))
    .sort((a, b) => b.n - a.n)[0]
  return top && top.n >= 4 ? `${top.k} team` : `Team ${count + 1}`
}
