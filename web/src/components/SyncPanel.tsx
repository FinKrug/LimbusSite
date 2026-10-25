import { useEffect, useRef, useState } from 'react'
import { sync, useSync, type SyncStatus } from '../lib/sync'
import {
  backupFileName, compareRows, makeBackup, parseBackup, takeSnapshot, timeAgo,
  type Snapshot, type SummaryLookups,
} from '../lib/transfer'

/** The header button: shows whether your data is synced, and opens "Your data". */
export function SyncButton({ onOpen }: { onOpen: () => void }) {
  const { status } = useSync()
  const { text, tone } = buttonText(status)
  return (
    <button className={`sync-btn sync-${tone}`} onClick={onOpen} title="Sync your data between computers, or back it up to a file">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4.75 4.75 0 0 1-.5 9.5z" /></svg>
      <span>{text}</span>
    </button>
  )
}

function buttonText(s: SyncStatus): { text: string; tone: 'off' | 'ok' | 'busy' | 'warn' } {
  switch (s.kind) {
    case 'unavailable': return { text: 'Backup', tone: 'off' }
    case 'signed-out': return { text: 'Sync', tone: 'off' }
    case 'working': return { text: 'Syncing…', tone: 'busy' }
    case 'ask': return { text: 'Pick a copy', tone: 'warn' }
    case 'synced': return s.error ? { text: 'Sync problem', tone: 'warn' } : s.saving ? { text: 'Saving…', tone: 'busy' } : { text: 'Synced', tone: 'ok' }
  }
}

interface DialogsProps {
  open: boolean
  onClose: () => void
  look: SummaryLookups
}

/**
 * "Your data": cloud sync and backup files. Also shows the side-by-side preview
 * whenever two copies need a decision (signing in, or loading a backup), even
 * if the dialog wasn't opened.
 */
export function SyncDialogs({ open, onClose, look }: DialogsProps) {
  const { status, undo } = useSync()
  const [file, setFile] = useState<{ data: Snapshot; savedAt: number; mine: Snapshot } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const close = () => { setFileError(null); setLoaded(false); onClose() }

  if (status.kind === 'ask') {
    return (
      <Modal title="Which data do you want to keep?" onClose={null}>
        <p className="sync-lead">
          This computer and your cloud copy ({status.user.email ?? status.user.name ?? 'your account'}) have different data.
          Pick the one to keep; the other is replaced on both.
        </p>
        <CompareBox look={look} mine={status.local} theirs={status.cloud.data}
          theirsTitle="Cloud copy"
          theirsMeta={status.cloud.device ? `Saved from ${status.cloud.device}, ${timeAgo(status.cloud.updatedAt)}` : `Saved ${timeAgo(status.cloud.updatedAt)}`}
          keepLabel="Keep this computer's" useLabel="Use the cloud copy"
          onKeep={() => { onClose(); void sync.choose('local') }} onUse={() => { onClose(); void sync.choose('cloud') }} />
        {status.error && <p className="sync-error">{status.error}</p>}
        <p className="small muted">
          Either way, "Undo" in Your data can bring back the copy you didn't pick.{' '}
          <button className="link-btn" onClick={() => void sync.signOut()}>Don't sync for now (sign out)</button>
        </p>
      </Modal>
    )
  }

  if (file) {
    return (
      <Modal title="Load this backup?" onClose={() => setFile(null)}>
        <p className="sync-lead">Loading it replaces what's saved on this computer{status.kind === 'synced' ? ' and in your cloud copy' : ''}.</p>
        <CompareBox look={look} mine={file.mine} theirs={file.data}
          theirsTitle="Backup file" theirsMeta={file.savedAt ? `Saved ${timeAgo(file.savedAt)}` : undefined}
          keepLabel="Keep this computer's" useLabel="Load the backup"
          onKeep={() => setFile(null)}
          onUse={() => { sync.loadBackup(file.data); setFile(null); setLoaded(true) }} />
        <p className="small muted">"Undo" in Your data can put this computer's data back afterwards.</p>
      </Modal>
    )
  }

  if (!open) return null

  const download = () => {
    const backup = makeBackup(takeSnapshot(localStorage))
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = backupFileName(backup.savedAt)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const pick = async (f: File | undefined) => {
    if (!f) return
    setFileError(null)
    setLoaded(false)
    const parsed = parseBackup(await f.text())
    if ('error' in parsed) return setFileError(parsed.error)
    setFile({ data: parsed.data, savedAt: parsed.savedAt, mine: takeSnapshot(localStorage) })
  }

  return (
    <Modal title="Your data" onClose={close}>
      <section className="sync-section">
        <h3>Sync between computers</h3>
        <CloudSection status={status} />
      </section>

      <section className="sync-section">
        <h3>Backup file</h3>
        <p className="hint">Save everything to a file, then load it on another computer (or keep it as a backup). No account needed.</p>
        <div className="sync-actions">
          <button className="btn" onClick={download}>Download backup</button>
          <button className="btn" onClick={() => input.current?.click()}>Load a backup…</button>
          <input ref={input} type="file" accept=".json,application/json" hidden
            onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        {fileError && <p className="sync-error">{fileError}</p>}
        {loaded && <p className="sync-ok">Backup loaded.</p>}
      </section>

      {undo && (
        <section className="sync-section">
          <h3>Undo</h3>
          <p className="hint">Put back {undo.what.charAt(0).toLowerCase() + undo.what.slice(1)} (replaced {timeAgo(undo.at)}).</p>
          <div className="sync-actions"><button className="btn" onClick={() => sync.undo()}>Undo</button></div>
        </section>
      )}

      <p className="small muted">
        Synced and backed up: your team and lineup, saved lineups, E.G.O, skill swaps, run, gifts you have and settings.
        The open tab stays per computer.
      </p>
    </Modal>
  )
}

function CloudSection({ status }: { status: SyncStatus }) {
  switch (status.kind) {
    case 'unavailable':
      return status.why === 'file'
        ? <p className="hint">Cloud sync works on the website, not in this downloaded copy. Use a backup file below to move your data.</p>
        : <p className="hint">Cloud sync isn't set up on this copy of the site yet. Use a backup file below to move your data.</p>
    case 'signed-out':
      return (
        <>
          <p className="hint">Sign in with Google and your team, run and gifts follow you to any computer, saved as you go.</p>
          <div className="sync-actions">
            <button className="btn primary" onClick={() => void sync.signIn()}>Sign in with Google</button>
          </div>
          {status.error && <p className="sync-error">{status.error}</p>}
        </>
      )
    case 'working':
      return <p className="hint sync-busy">{status.what}</p>
    case 'ask':
      return null
    case 'synced':
      return (
        <>
          <p className="sync-user">
            Signed in as <b>{status.user.email ?? status.user.name ?? 'you'}</b>
          </p>
          {status.error
            ? <p className="sync-error">{status.error} {status.saving ? 'Trying again shortly.' : ''}</p>
            : <p className={status.saving ? 'hint sync-busy' : 'sync-ok'}>
                {status.saving ? 'Saving…' : `Everything's saved to the cloud${status.savedAt ? ` (${timeAgo(status.savedAt)})` : ''}.`}
              </p>}
          {status.lastIn && (
            <p className="hint">Last change from another computer: {status.lastIn.device ?? 'unknown'}, {timeAgo(status.lastIn.at)}.</p>
          )}
          <div className="sync-actions">
            <button className="btn" onClick={() => void sync.signOut()}>Sign out</button>
          </div>
          <p className="small muted">Signing out keeps your data on this computer; it just stops syncing.</p>
        </>
      )
  }
}

interface CompareProps {
  look: SummaryLookups
  mine: Snapshot
  theirs: Snapshot
  theirsTitle: string
  theirsMeta?: string
  keepLabel: string
  useLabel: string
  onKeep: () => void
  onUse: () => void
}

/** This computer's data and another copy side by side; rows that differ are marked. */
export function CompareBox({ look, mine, theirs, theirsTitle, theirsMeta, keepLabel, useLabel, onKeep, onUse }: CompareProps) {
  const rows = compareRows(mine, theirs, look)
  const differ = rows.filter((r) => r.differs).length
  return (
    <div className="compare">
      <div className="compare-grid" role="table" aria-label="Your data compared">
        <div className="compare-row compare-head" role="row">
          <span role="columnheader" />
          <span role="columnheader"><b>This computer</b><small>Now</small></span>
          <span role="columnheader"><b>{theirsTitle}</b>{theirsMeta && <small>{theirsMeta}</small>}</span>
        </div>
        {rows.map((r) => (
          <div key={r.id} className={r.differs ? 'compare-row differs' : 'compare-row'} role="row">
            <span className="compare-label" role="rowheader">
              {r.label}
              {r.differs ? <em className="compare-tag">different</em> : <em className="compare-tag same">same</em>}
            </span>
            <Cell row={r.mine} />
            <Cell row={r.theirs} />
          </div>
        ))}
      </div>
      {differ === 0 && <p className="hint">Both copies are the same.</p>}
      <div className="compare-actions">
        <button className="btn" onClick={onKeep}>{keepLabel}</button>
        <button className="btn primary" onClick={onUse}>{useLabel}</button>
      </div>
    </div>
  )
}

function Cell({ row }: { row: { id: string; text: string; detail?: string } }) {
  return (
    <span className="compare-cell" role="cell">
      {row.text}
      {row.detail && <small>{row.detail}</small>}
    </span>
  )
}

/** Same look as the Saved lineups dialog. `onClose` null = it can't be dismissed (a choice is needed). */
function Modal({ title, onClose, children }: { title: string; onClose: (() => void) | null; children: React.ReactNode }) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="picker-backdrop" onClick={onClose ?? undefined}>
      <div className="picker dialog sync-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="picker-head">
          <h2>{title}</h2>
          {onClose && <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>}
        </header>
        <div className="picker-scroll dialog-body">{children}</div>
      </div>
    </div>
  )
}
