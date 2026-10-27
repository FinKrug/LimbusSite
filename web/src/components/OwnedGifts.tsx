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
      <VestigeCounters gifts={gifts} owned={owned} onChange={onChange} />
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

/** A counter per Vestige tier (I to V): − and + to fix the count. */
export function VestigeCounters({ gifts, owned, onChange }: Props) {
  const vestiges = useMemo(() => {
    const byId = new Map(gifts.map((g) => [g.id, g]))
    return VESTIGES.map((id) => byId.get(id)).filter((g): g is Gift => !!g)
  }, [gifts])
  return (
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
  )
}

/**
 * "Picked something up?" (Fights & events, Boss): the gift a fight's reward card or an event gave
 * you, or a Vestige. In the game a duplicate just shows up as a Vestige of its tier, without saying
 * which gift it was (Finley), so the Vestiges are big one-click buttons of their own.
 */
export function PickupBox({ gifts, owned, onChange }: Props) {
  const byId = useMemo(() => new Map(gifts.map((g) => [g.id, g])), [gifts])
  const vestiges = useMemo(() => VESTIGES.map((id) => byId.get(id)).filter((g): g is Gift => !!g), [byId])
  const [last, setLast] = useState<{ text: string; added: string } | null>(null)
  const addId = (id: string, text: string) => {
    const g = byId.get(id)
    const next = g && !isVestige(id) ? addGift(owned, id, g.tier) : [...owned, id]
    const added = next[next.length - 1]
    onChange(next)
    setLast({ text: added === id ? `Added ${text}.` : `You have ${text}, so it's +1 ${byId.get(added)?.name ?? 'Vestige'}.`, added })
  }
  return (
    <section className="panel pickup-box">
      <div className="pickup-gift">
        <h3>Got a gift?</h3>
        <p className="muted small">From a fight's reward card or an event: add it to Gifts you have.</p>
        <GiftSearch gifts={gifts.filter((g) => !isVestige(g.id))} owned={new Set(owned)} placeholder="Add the gift you got…"
          onPick={(g) => addId(g.id, g.name)} />
      </div>
      <div className="pickup-vestiges">
        <h3>Got a Vestige?</h3>
        <p className="muted small">A duplicate comes as a Vestige of its tier (the game doesn't say which gift it was).</p>
        <div className="vestige-big-row">
          {vestiges.map((v) => {
            const n = countOf(owned, v.id)
            return (
              <div key={v.id} className={n ? 'vestige-big has' : 'vestige-big'}>
                <button className="vestige-big-add" onClick={() => addId(v.id, `a ${v.name}`)}
                  title={`${v.name}: counts as a Tier ${tierLabel(v.tier)} gift for selling and fusing`}>
                  <GiftIcon gift={v} size={44} />
                  <span className="vestige-big-name">{v.name.replace(' Vestige', '')}</span>
                  <span className="vestige-big-tier">Tier {tierLabel(v.tier)}</span>
                  <span className="vestige-big-plus">+1</span>
                </button>
                <span className="vestige-big-count">
                  <button className="vestige-btn" aria-label={`Remove a ${v.name}`} disabled={!n}
                    onClick={() => { onChange(removeOne(owned, v.id)); setLast(null) }}>−</button>
                  <b>{n}</b>
                </span>
              </div>
            )
          })}
        </div>
      </div>
      {last && (
        <p className="duplicate-done small">
          {last.text}{' '}
          <button className="link-btn" onClick={() => { onChange(removeOne(owned, last.added)); setLast(null) }}>Undo</button>
        </p>
      )}
    </section>
  )
}

export function GiftSearch({ gifts, owned, onPick, placeholder }: {
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
