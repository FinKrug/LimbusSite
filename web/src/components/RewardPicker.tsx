import { useMemo, useState } from 'react'
import { giftOfferValue, type GiftOffer } from '../lib/events'
import type { RunContext } from '../lib/scoring'
import type { Gift } from '../lib/types'
import { addGift, removeOne } from '../lib/vestiges'
import { GiftLabel } from './bits'
import { GiftSearch } from './OwnedGifts'

interface Props {
  ctx: RunContext
  gifts: Gift[]
  owned: string[]
  onOwnedChange: (owned: string[]) => void
  title: string
  hint: string
  /** Gifts always offered here (a pack's clear rewards), added to start with. */
  preset?: string[]
  /** How many of the offered gifts you get to take (boss rewards on Hard: 2). */
  picks?: number
}

const KIND_TAG: Record<GiftOffer['kind'], string | null> = {
  fits: null, fuel: 'Fusion fuel', duplicate: 'Becomes a Vestige', gone: 'Already in a gift you have',
}

/**
 * "Which gift do I take?" where the game lets you choose: the starting gift at the start of a
 * run, and the boss reward gifts after each floor's boss (2 on Hard). Add the gifts offered and
 * they're ranked for your team, best first; take one and it goes into Gifts you have. Fights'
 * reward cards give a random gift, so there's nothing to compare there (Finley, 2026-10-27).
 */
export function RewardPicker({ ctx, gifts, owned, onOwnedChange, title, hint, preset = [], picks = 1 }: Props) {
  const [offered, setOffered] = useState<string[]>(preset)
  const [taken, setTaken] = useState<{ id: string; added: string } | null>(null)
  const [takenCount, setTakenCount] = useState(0)
  const ranked = useMemo(
    () => offered.map((id) => ({ id, gift: ctx.giftsById.get(id), offer: giftOfferValue(id, ctx) }))
      .filter((x): x is { id: string; gift: Gift; offer: GiftOffer } => !!x.gift && !!x.offer)
      .sort((a, b) => b.offer.value - a.offer.value),
    [offered, ctx],
  )
  const best = ranked[0]?.offer.value ?? 0

  const take = (g: Gift) => {
    const next = addGift(owned, g.id, g.tier)
    onOwnedChange(next)
    setTaken({ id: g.id, added: next[next.length - 1] })
    // With more picks left, the rest of the offer stays (re-ranked now that you have this one).
    const n = takenCount + 1
    setTakenCount(n)
    setOffered(n < picks ? offered.filter((x) => x !== g.id) : [])
  }

  return (
    <section className="panel reward-picker">
      <h2>{title}</h2>
      <p className="muted small">{hint}</p>
      <GiftSearch gifts={gifts} owned={new Set(owned)} placeholder="Add a gift you're being offered…"
        onPick={(g) => { if (!offered.includes(g.id)) setOffered([...offered, g.id]); setTaken(null); if (takenCount >= picks) setTakenCount(0) }} />
      {taken && (
        <p className="reward-taken">
          Added {ctx.giftsById.get(taken.id)?.name ?? taken.id} to Gifts you have.{' '}
          {picks > 1 && takenCount < picks && <>Take {picks - takenCount} more. </>}
          <button className="link-btn" onClick={() => {
            onOwnedChange(removeOne(owned, taken.added))
            if (!offered.includes(taken.id)) setOffered([...offered, taken.id])
            setTakenCount(Math.max(0, takenCount - 1))
            setTaken(null)
          }}>Undo</button>
        </p>
      )}
      {ranked.length > 0 && (
        <ol className="reward-list">
          {ranked.map(({ id, gift, offer }, k) => (
            <li key={id} className={k === 0 && ranked.length > 1 ? 'reward best' : 'reward'}>
              <span className="reward-rank">{k + 1}</span>
              <div className="reward-main">
                <GiftLabel gift={gift} icon={28} />
                <p className="small muted">
                  {offer.why.slice(gift.name.length + 2) || offer.why}
                  {KIND_TAG[offer.kind] && <> · <span className="tag">{KIND_TAG[offer.kind]}</span></>}
                </p>
              </div>
              <span className="reward-bar" aria-label={`${Math.round(best ? (offer.value / best) * 100 : 0)} of 100`}>
                <span style={{ width: `${best ? Math.max(4, (offer.value / best) * 100) : 0}%` }} />
              </span>
              <span className="reward-actions">
                {k < Math.max(1, picks - takenCount) && ranked.length > 1 && <span className="reward-pick">Take this</span>}
                <button className={k === 0 ? 'btn primary small-btn' : 'btn small-btn'} onClick={() => take(gift)}>Got it</button>
                <button className="icon-btn" aria-label={`Remove ${gift.name}`} onClick={() => setOffered(offered.filter((x) => x !== id))}>×</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {ranked.length > 0 && (
        <button className="link-btn" onClick={() => setOffered([])}>Clear the offer</button>
      )}
    </section>
  )
}
