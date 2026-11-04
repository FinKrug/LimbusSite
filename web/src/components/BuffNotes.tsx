import type { BuffNote } from '../lib/buffeffects'
import type { Gift } from '../lib/types'
import { GiftLabel } from './bits'

/**
 * What your Starlight buffs did here (lib/buffeffects.ts): at a shop, or on entering a floor. A buff
 * that hands you a Vestige gets buttons to add it, since the site can't see which one you got.
 */
export function BuffNotes({ title, notes, giftsById, owned, onAdd }: {
  title: string
  notes: BuffNote[]
  giftsById: Map<string, Gift>
  owned: string[]
  onAdd: (ids: string[]) => void
}) {
  if (!notes.length) return null
  const count = (id: string) => owned.filter((x) => x === id).length
  return (
    <section className="panel buff-notes" aria-label={title}>
      <h3>{title}</h3>
      <ul>
        {notes.map((n) => (
          <li key={n.buff + n.text}>
            <span className="buff-note-name">{n.buff}</span>
            <span className="small">{n.text}</span>
            {n.vestiges && (
              <span className="buff-note-adds">
                {n.vestiges.map((id) => giftsById.get(id)).filter((g): g is Gift => !!g).map((g) => (
                  <button key={g.id} className="chip-btn" onClick={() => onAdd([g.id])} title={`Add a ${g.name} to Gifts you have`}>
                    <GiftLabel gift={g} link={false} icon={18} />{count(g.id) > 0 && <span className="muted"> ({count(g.id)})</span>}
                  </button>
                ))}
              </span>
            )}
            {n.allVestiges && (
              <span className="buff-note-adds">
                <button className="chip-btn" onClick={() => onAdd(n.allVestiges!)}>
                  Add the {n.allVestiges.length > 1 ? `${n.allVestiges.length} Vestiges` : 'Vestige'}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
