import type { ArtVariant } from '../lib/images'
import { useSync } from '../lib/sync'
import { timeAgo } from '../lib/transfer'

/** Home › Settings: card art, your data (sign in, backups), and the first-time setup. */
export function SettingsPage({ art, onArtChange, onOpenData, onSetup, dataNote }: {
  art: ArtVariant
  onArtChange: (a: ArtVariant) => void
  onOpenData: () => void
  onSetup: () => void
  /** "455 gifts · … · data from the wiki, <date>" */
  dataNote: React.ReactNode
}) {
  const { status } = useSync()
  const syncLine = (() => {
    switch (status.kind) {
      case 'unavailable': return 'Cloud sync isn\'t available in this copy of the site. You can still save and load backup files.'
      case 'signed-out': return 'Saved on this computer only. Sign in to keep your lineups, identities and runs on every computer.'
      case 'working': return `${status.what}…`
      case 'ask': return 'This computer and your account both have data: pick which copy to keep.'
      case 'synced': return status.error
        ? `Signed in, but the last save failed: ${status.error}`
        : `Signed in as ${status.user.name ?? status.user.email ?? 'you'}. ${status.saving ? 'Saving…' : status.savedAt ? `Saved ${timeAgo(status.savedAt)}.` : 'Everything is saved.'}`
    }
  })()

  return (
    <div className="settings-page">
      <section className="panel settings-card">
        <h2>Your data</h2>
        <p className={status.kind === 'synced' && !status.error ? 'good' : 'muted'}>{syncLine}</p>
        <div className="settings-row">
          <button className="btn primary" onClick={onOpenData}>
            {status.kind === 'signed-out' ? 'Sign in or load a backup' : 'Sync and backups'}
          </button>
        </div>
      </section>

      <section className="panel settings-card">
        <h2>Card art</h2>
        <p className="muted">Which art identities show with, on every screen.</p>
        <div className="seg" role="group" aria-label="Card art">
          <button className={art === 'uptie' ? 'seg-btn on' : 'seg-btn'} aria-pressed={art === 'uptie'} onClick={() => onArtChange('uptie')}
            title="The art identities get at Uptie III (threadspinning)">Threadspun</button>
          <button className={art === 'base' ? 'seg-btn on' : 'seg-btn'} aria-pressed={art === 'base'} onClick={() => onArtChange('base')}
            title="The art identities have before Uptie III">Base art</button>
        </div>
      </section>

      <section className="panel settings-card">
        <h2>First-time setup</h2>
        <p className="muted">Sign in and mark the identities you own (by hand or from screenshots), step by step.</p>
        <div className="settings-row"><button className="btn" onClick={onSetup}>Run the setup again</button></div>
      </section>

      <p className="muted small settings-data">{dataNote}</p>
    </div>
  )
}
