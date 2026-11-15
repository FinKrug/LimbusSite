import { useMemo, useState } from 'react'
import { shortName } from '../lib/format'
import type { ArtVariant } from '../lib/images'
import { groupBySinner, hasMarkedIdentities, isBaseIdentity, normalizeOwned, ownedIdentitySet, setOwned, setSinnerOwned } from '../lib/myidentities'
import { useSync } from '../lib/sync'
import type { Identity, Sinner } from '../lib/types'
import { IdentityImport } from './IdentityImport'
import { Portrait } from './Portrait'

type Show = 'all' | 'owned' | 'missing'

/**
 * "My identities" (Tools): every identity grouped by sinner; tap one to mark it owned.
 * The list is saved like the rest of your data, so signing in keeps it on your account.
 */
export function MyIdentitiesTab({ identities, stored, onChange, art, onOpenData, importOpen = false }: {
  identities: Identity[]
  /** Saved ids (non-base only). */
  stored: string[]
  onChange: (ids: string[]) => void
  art: ArtVariant
  /** Opens "Your data" (sign in). */
  onOpenData: () => void
  /** Show the screenshot import open (first-time setup). */
  importOpen?: boolean
}) {
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('all')
  const owned = useMemo(() => ownedIdentitySet(stored, identities), [stored, identities])
  const groups = useMemo(() => groupBySinner(identities, owned, shortName), [identities, owned])
  const marked = hasMarkedIdentities(stored, identities)

  const q = query.trim().toLowerCase()
  const visible = groups.map((g) => ({
    ...g,
    shown: g.list.filter((i) =>
      (!q || i.name.toLowerCase().includes(q) || i.traits.some((t) => t.toLowerCase().includes(q)))
      && (show === 'all' || (show === 'owned') === owned.has(i.id))),
  })).filter((g) => g.shown.length > 0)

  const toggle = (i: Identity) => onChange(setOwned(stored, i.id, !owned.has(i.id), identities))
  const setAll = (s: Sinner, own: boolean) => onChange(setSinnerOwned(stored, s, own, identities))

  return (
    <div className="myids">
      <div className="myids-top">
        <p className="myids-count">
          You own <b>{owned.size}</b> of {identities.length} identities
        </p>
        <SaveStatus onOpenData={onOpenData} />
      </div>
      {!marked && (
        <p className="hint myids-hint">
          Tap every identity you have. The 12 base LCB Sinner identities come with the game, so they're already marked.
        </p>
      )}
      <IdentityImport identities={identities} owned={owned} startOpen={importOpen}
        onAdd={(ids) => onChange(normalizeOwned([...stored, ...ids], identities))} />
      <div className="myids-tools">
        <input type="search" placeholder="Search identities or affiliations…" value={query} onChange={(e) => setQuery(e.target.value)}
          aria-label="Search identities" />
        <div className="myids-show" role="group" aria-label="Show">
          {(['all', 'owned', 'missing'] as Show[]).map((s) => (
            <button key={s} className={`chip-btn${show === s ? ' on' : ''}`} aria-pressed={show === s} onClick={() => setShow(s)}>
              {s === 'all' ? 'All' : s === 'owned' ? 'Owned' : 'Not owned'}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 && <p className="muted">No identities match.</p>}
      {visible.map((g) => {
        const allOwned = g.owned === g.list.length
        const onlyBase = g.list.every((i) => !owned.has(i.id) || isBaseIdentity(i))
        return (
          <section key={g.sinner} className="myids-group" aria-label={g.sinner}>
            <header className="myids-group-head">
              <h3>{g.sinner}</h3>
              <span className="muted small">{g.owned}/{g.list.length}</span>
              <span className="myids-group-btns">
                <button className="chip-btn" disabled={allOwned} onClick={() => setAll(g.sinner, true)}>Select all</button>
                <button className="chip-btn" disabled={onlyBase} onClick={() => setAll(g.sinner, false)}>Clear</button>
              </span>
            </header>
            <ul className="myids-grid">
              {g.shown.map((i) => {
                const own = owned.has(i.id)
                const isBase = isBaseIdentity(i)
                return (
                  <li key={i.id}>
                    <button className={`myid${own ? ' own' : ''} rarity-${i.rarity ?? 1}`} aria-pressed={own} disabled={isBase}
                      title={`${i.name}: ${isBase ? 'every player has this one' : own ? 'owned, tap to unmark' : 'tap to mark as owned'}`}
                      onClick={() => toggle(i)}>
                      <Portrait identity={i} kind="profile" variant={art} />
                      {own && <span className="myid-check" aria-hidden="true">✓</span>}
                      <span className="myid-rarity" aria-hidden="true">{'0'.repeat(i.rarity ?? 1)}</span>
                      <span className="myid-name">{shortName(i)}</span>
                      {isBase && <span className="myid-base">Base</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/** Where your list is saved, and whether the latest change has reached your account. */
export function SaveStatus({ onOpenData }: { onOpenData: () => void }) {
  const { status } = useSync()
  switch (status.kind) {
    case 'synced':
      if (status.error) return <p className="myids-save warn" role="status">Couldn't save to your account. <button className="link-btn" onClick={onOpenData}>Details</button></p>
      return status.saving
        ? <p className="myids-save busy" role="status">Saving…</p>
        : <p className="myids-save ok" role="status">✓ Saved to your account</p>
    case 'working': return <p className="myids-save busy" role="status">Syncing…</p>
    case 'ask': return <p className="myids-save warn" role="status"><button className="link-btn" onClick={onOpenData}>Pick which copy to keep</button> to finish signing in</p>
    case 'signed-out':
      return <p className="myids-save" role="status">Saved on this computer. <button className="link-btn accent" onClick={onOpenData}>Sign in</button> to keep it on your account.</p>
    default:
      return <p className="myids-save" role="status">Saved on this computer.</p>
  }
}
