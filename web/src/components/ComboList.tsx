import { useState } from 'react'
import type { ComboPlan } from '../lib/scoring'
import type { Combo, Gift, ThemePack } from '../lib/types'
import { OwnedGifts } from './OwnedGifts'
import { Empty, GiftLabel } from './bits'

interface Props {
  plans: ComboPlan[]
  gifts: Gift[]
  packsForGift: Map<string, ThemePack[]>
  onSave: (combo: Combo) => void
  onDelete: (id: string) => void
  onTarget: (ids: string[]) => void
}

export function ComboList({ plans, gifts, packsForGift, onSave, onDelete, onTarget }: Props) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [why, setWhy] = useState('')

  const save = () => {
    onSave({ id: `custom-${Date.now()}`, name: name.trim() || 'My combo', gifts: picked, why: why.trim(), custom: true })
    setEditing(false); setName(''); setPicked([]); setWhy('')
  }

  return (
    <section className="group">
      <div className="group-head">
        <h3>Combos <span className="count">{plans.length}</span></h3>
        {!editing && <button className="btn" onClick={() => setEditing(true)}>New combo</button>}
      </div>
      <p className="hint small">
        Gifts that are much better together. Once you own one piece, the rest rank higher on Best gifts.
      </p>

      {editing && (
        <div className="card combo-editor">
          <input type="search" placeholder="Combo name" value={name} onChange={(e) => setName(e.target.value)} />
          <OwnedGifts gifts={gifts} owned={picked} onChange={setPicked} title="Gifts in this combo"
            placeholder="Add a gift…" emptyHint="Add at least two gifts." />
          <input type="search" placeholder="Why they work together (optional)" value={why} onChange={(e) => setWhy(e.target.value)} />
          <div className="confirm">
            <button className="btn" disabled={picked.length < 2} onClick={save}>Save combo</button>
            <button className="link-btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}

      {plans.length === 0 ? <Empty>No combos yet.</Empty> : (
        <ol className="cards">
          {plans.map(({ combo, owned, missing }) => {
            const done = missing.length === 0
            return (
              <li key={combo.id} className={`card ${done ? 'card-go' : owned.length ? 'card-maybe' : ''}`}>
                <div className="card-main">
                  <span className="gift-label">
                    <strong>{combo.name}</strong>
                    {combo.custom && <span className="tag">yours</span>}
                    <span className="muted small">{owned.length}/{owned.length + missing.length}</span>
                  </span>
                  <span className="confirm">
                    {missing.length > 0 && (
                      <button className="btn" onClick={() => onTarget(missing.map((g) => g.id))}>☆ Target missing</button>
                    )}
                    {combo.custom && <button className="link-btn danger" onClick={() => onDelete(combo.id)}>Delete</button>}
                  </span>
                </div>
                {combo.why && <p className="combo-why">{combo.why}</p>}
                <ul className="ingredients">
                  {owned.map((g) => (
                    <li key={g.id} className="have"><span aria-label="have">✓</span><GiftLabel gift={g} link={false} /></li>
                  ))}
                  {missing.map((g) => {
                    const packs = packsForGift.get(g.id) ?? []
                    return (
                      <li key={g.id} className="need">
                        <span aria-label="missing">✗</span><GiftLabel gift={g} />
                        {packs.length > 0 && <span className="muted small">in {packs.length} pack{packs.length > 1 ? 's' : ''}</span>}
                      </li>
                    )
                  })}
                </ul>
                {combo.source && (
                  <p className="muted small">Source: <a href={combo.source} target="_blank" rel="noreferrer">guide</a></p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
