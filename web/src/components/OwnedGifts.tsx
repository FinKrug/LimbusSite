import { useId, useMemo, useState } from 'react'
import type { Gift } from '../lib/types'
import { GiftLabel, KeywordChip, SinDot, TierBadge } from './bits'

interface Props {
  gifts: Gift[]
  owned: string[]
  onChange: (owned: string[]) => void
  title?: string
  placeholder?: string
  emptyHint?: string
  /** Gift ids that can't be added here (e.g. already owned). */
  exclude?: string[]
  /** Extra info shown next to each gift. */
  meta?: (g: Gift) => React.ReactNode
}

export function OwnedGifts({
  gifts, owned, onChange, title = 'Gifts you have', placeholder = 'Add a gift…',
  emptyHint = 'Add gifts as you pick them up during a run.', exclude = [], meta,
}: Props) {
  const byId = useMemo(() => new Map(gifts.map((g) => [g.id, g])), [gifts])
  const ownedGifts = owned.map((id) => byId.get(id)).filter((g): g is Gift => !!g)
  const [confirmClear, setConfirmClear] = useState(false)

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{title} <span className="count">{ownedGifts.length}</span></h2>
        {ownedGifts.length > 0 && (
          confirmClear ? (
            <span className="confirm">
              <button className="link-btn danger" onClick={() => { onChange([]); setConfirmClear(false) }}>Clear all</button>
              <button className="link-btn" onClick={() => setConfirmClear(false)}>Keep</button>
            </span>
          ) : (
            <button className="link-btn" onClick={() => setConfirmClear(true)}>Clear</button>
          )
        )}
      </header>
      <GiftSearch gifts={gifts} exclude={new Set([...owned, ...exclude])} placeholder={placeholder}
        onPick={(g) => onChange([...owned, g.id])} />
      {ownedGifts.length === 0 ? (
        <p className="hint">{emptyHint}</p>
      ) : (
        <ul className="owned">
          {ownedGifts.map((g) => (
            <li key={g.id}>
              <GiftLabel gift={g} link={false} />
              {meta && <span className="owned-meta">{meta(g)}</span>}
              <button
                className="icon-btn"
                aria-label={`Remove ${g.name}`}
                title="Remove"
                onClick={() => onChange(owned.filter((id) => id !== g.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function GiftSearch({ gifts, exclude, onPick, placeholder }: {
  gifts: Gift[]; exclude: Set<string>; onPick: (g: Gift) => void; placeholder: string
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return gifts
      .filter((g) => !exclude.has(g.id) && g.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q))
        || a.name.localeCompare(b.name))
      .slice(0, 8)
  }, [gifts, exclude, query])

  const pick = (g: Gift) => {
    onPick(g)
    setQuery('')
    setActive(0)
  }

  return (
    <div className="search">
      <input
        type="search"
        placeholder={placeholder}
        value={query}
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
        onChange={(e) => { setQuery(e.target.value); setActive(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); pick(matches[active]) }
          else if (e.key === 'Escape') setQuery('')
        }}
      />
      {matches.length > 0 && (
        <ul className="search-results" id={listId} role="listbox">
          {matches.map((g, i) => (
            <li
              key={g.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onMouseDown={(e) => { e.preventDefault(); pick(g) }}
              onMouseEnter={() => setActive(i)}
            >
              <TierBadge tier={g.tier} />
              <SinDot sin={g.sin} />
              <span className="grow">{g.name}</span>
              <KeywordChip keyword={g.keyword} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
