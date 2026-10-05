import { useId, useMemo, useState } from 'react'
import { type Gift, tierLabel } from '../lib/types'
import { VESTIGES, addGift, countOf, isVestige, removeOne } from '../lib/vestiges'
import { GiftIcon } from './GiftIcon'
import { GiftLabel, KeywordChip, SinDot, TierBadge } from './bits'

const VESTIGE_NAMES: Record<number, string> = { 1: 'Dark Vestige', 2: 'Faint Vestige', 3: 'Twinkling Vestige', 4: 'Brilliant Vestige', 5: 'Lunar Vestige' }

interface Props {
  gifts: Gift[]
  /** Owned gift ids; vestiges can appear more than once. */
  owned: string[]
  onChange: (owned: string[]) => void
}

/**
 * "Gifts you have": search to add, icons, and a row of Vestige counters. Adding a
 * gift you already have adds a Vestige of its tier instead, like the game does.
 */
export function OwnedGifts({ gifts, owned, onChange }: Props) {
  const byId = useMemo(() => new Map(gifts.map((g) => [g.id, g])), [gifts])
  const ownedGifts = [...new Set(owned)].filter((id) => !isVestige(id)).map((id) => byId.get(id)).filter((g): g is Gift => !!g)
  const vestiges = VESTIGES.map((id) => byId.get(id)).filter((g): g is Gift => !!g)
  const vestigeTotal = owned.filter(isVestige).length
  const [confirmClear, setConfirmClear] = useState(false)

  return (
    <section className="panel owned-panel">
      <header className="panel-head">
        <h2>Gifts you have <span className="count">{ownedGifts.length + vestigeTotal}</span></h2>
        {owned.length > 0 && (
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
      <GiftSearch gifts={gifts} owned={new Set(owned)} placeholder="Add a gift…"
        onPick={(g) => onChange(addGift(owned, g.id, g.tier))} />
      <div className="vestige-row" aria-label="Vestiges">
        {vestiges.map((v) => {
          const n = countOf(owned, v.id)
          return (
            <span key={v.id} className={n ? 'vestige has' : 'vestige'} title={`${v.name}: counts as a Tier ${tierLabel(v.tier)} gift for selling and fusing`}>
              <GiftIcon gift={v} size={26} />
              <span className="vestige-tier">{tierLabel(v.tier)}</span>
              <button className="vestige-btn" aria-label={`Remove a ${v.name}`} disabled={!n}
                onClick={() => onChange(removeOne(owned, v.id))}>−</button>
              <span className="vestige-n">{n}</span>
              <button className="vestige-btn" aria-label={`Add a ${v.name}`} onClick={() => onChange([...owned, v.id])}>+</button>
            </span>
          )
        })}
      </div>
      {ownedGifts.length === 0 ? (
        <p className="hint">Add gifts as you pick them up. A gift you already have becomes a Vestige, like in game.</p>
      ) : (
        <ul className="owned">
          {ownedGifts.map((g) => (
            <li key={g.id}>
              <GiftLabel gift={g} link={false} icon={24} />
              <button className="icon-btn" aria-label={`Remove ${g.name}`} title="Remove"
                onClick={() => onChange(owned.filter((id) => id !== g.id))}>×</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function GiftSearch({ gifts, owned, onPick, placeholder }: {
  gifts: Gift[]; owned: Set<string>; onPick: (g: Gift) => void; placeholder: string
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return gifts
      .filter((g) => !isVestige(g.id) && g.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q))
        || a.name.localeCompare(b.name))
      .slice(0, 8)
  }, [gifts, query])

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
              <GiftIcon gift={g} size={22} />
              <TierBadge tier={g.tier} />
              <SinDot sin={g.sin} />
              <span className="grow">{g.name}</span>
              {owned.has(g.id) ? <span className="muted small">have it: adds a {VESTIGE_NAMES[g.tier ?? 1]}</span> : <KeywordChip keyword={g.keyword} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
