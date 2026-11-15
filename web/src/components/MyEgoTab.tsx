import { useMemo, useState } from 'react'
import artMeta from '../data/ego_art.json'
import type { Ego } from '../lib/ego'
import { egoArt } from '../lib/images'
import { groupEgosBySinner, hasMarkedEgos, isBaseEgo, normalizeOwnedEgos, ownedEgoSet, setOwnedEgo, setSinnerEgos } from '../lib/myegos'
import type { Sinner } from '../lib/types'
import { EgoImport } from './IdentityImport'
import { SaveStatus } from './MyIdentitiesTab'

type Show = 'all' | 'owned' | 'missing'
/** E.G.O id -> wiki file of its round art. */
const ART = new Map((artMeta.refs as [string, string][]).map(([id, file]) => [id, file]))

/**
 * Home › My identities & E.G.O › E.G.O: every E.G.O grouped by sinner; tap one to mark it owned.
 * Saved like the rest of your data (limbussite.egos.owned.v1), so it follows your account.
 */
export function MyEgoTab({ egos, stored, onChange, onOpenData, importOpen = false }: {
  egos: Ego[]
  /** Saved ids (starting E.G.O not included). */
  stored: string[]
  onChange: (ids: string[]) => void
  onOpenData: () => void
  importOpen?: boolean
}) {
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('all')
  const owned = useMemo(() => ownedEgoSet(stored, egos), [stored, egos])
  const groups = useMemo(() => groupEgosBySinner(egos, owned), [egos, owned])
  const marked = hasMarkedEgos(stored, egos)

  const q = query.trim().toLowerCase()
  const visible = groups.map((g) => ({
    ...g,
    shown: g.list.filter((e) =>
      (!q || e.name.toLowerCase().includes(q) || e.grade.toLowerCase() === q || (e.sin ?? '').includes(q))
      && (show === 'all' || (show === 'owned') === owned.has(e.id))),
  })).filter((g) => g.shown.length > 0)

  const toggle = (e: Ego) => onChange(setOwnedEgo(stored, e.id, !owned.has(e.id), egos))
  const setAll = (s: Sinner, own: boolean) => onChange(setSinnerEgos(stored, s, own, egos))

  return (
    <div className="myids">
      <div className="myids-top">
        <p className="myids-count">You own <b>{owned.size}</b> of {egos.length} E.G.O</p>
        <SaveStatus onOpenData={onOpenData} />
      </div>
      {!marked && (
        <p className="hint myids-hint">
          Tap every E.G.O you have, or import them from screenshots. Each sinner's starting E.G.O comes with the game, so it's already marked.
        </p>
      )}
      <EgoImport egos={egos} owned={owned} startOpen={importOpen}
        onAdd={(ids) => onChange(normalizeOwnedEgos([...stored, ...ids], egos))} />
      <div className="myids-tools">
        <input type="search" placeholder="Search E.G.O, grade (HE) or sin…" value={query} onChange={(e) => setQuery(e.target.value)}
          aria-label="Search E.G.O" />
        <div className="myids-show" role="group" aria-label="Show">
          {(['all', 'owned', 'missing'] as Show[]).map((s) => (
            <button key={s} className={`chip-btn${show === s ? ' on' : ''}`} aria-pressed={show === s} onClick={() => setShow(s)}>
              {s === 'all' ? 'All' : s === 'owned' ? 'Owned' : 'Not owned'}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 && <p className="muted">No E.G.O match.</p>}
      {visible.map((g) => {
        const allOwned = g.owned === g.list.length
        const onlyBase = g.list.every((e) => !owned.has(e.id) || isBaseEgo(e))
        return (
          <section key={g.sinner} className="myids-group" aria-label={`${g.sinner} E.G.O`}>
            <header className="myids-group-head">
              <h3>{g.sinner}</h3>
              <span className="muted small">{g.owned}/{g.list.length}</span>
              <span className="myids-group-btns">
                <button className="chip-btn" disabled={allOwned} onClick={() => setAll(g.sinner, true)}>Select all</button>
                <button className="chip-btn" disabled={onlyBase} onClick={() => setAll(g.sinner, false)}>Clear</button>
              </span>
            </header>
            <ul className="myids-grid myegos-grid">
              {g.shown.map((e) => {
                const own = owned.has(e.id)
                const isBase = isBaseEgo(e)
                return (
                  <li key={e.id}>
                    <button className={`myid myego${own ? ' own' : ''} sin-${e.sin ?? 'none'}`} aria-pressed={own} disabled={isBase}
                      title={`${e.name} (${e.grade}): ${isBase ? 'every player has this one' : own ? 'owned, tap to unmark' : 'tap to mark as owned'}`}
                      onClick={() => toggle(e)}>
                      <EgoArt file={ART.get(e.id)} name={e.name} />
                      {own && <span className="myid-check" aria-hidden="true">✓</span>}
                      <span className={`myego-grade g-${e.grade.toLowerCase()}`}>{e.grade}</span>
                      <span className="myid-name">{e.name}</span>
                      {isBase && <span className="myid-base">Starting</span>}
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

/** The round art, or a plain circle with the initials if it can't load. */
function EgoArt({ file, name }: { file?: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!file || failed) {
    const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')
    return <span className="myego-art myego-fallback" aria-hidden="true">{initials}</span>
  }
  return <img className="myego-art" src={egoArt(file)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
    draggable={false} onError={() => setFailed(true)} />
}
