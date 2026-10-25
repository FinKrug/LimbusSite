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
}

const KIND_TAG: Record<GiftOffer['kind'], string | null> = {
  fits: null, fuel: 'Fusion fuel', duplicate: 'Becomes a Vestige', gone: 'Already in a gift you have',
}

/**
 * "Which gift do I take?": add the gifts the game is offering you (after a fight, or the
 * floor's reward) and they're ranked for your team, best first. Take one and it goes into
 * Gifts you have.
 */
export function RewardPicker({ ctx, gifts, owned, onOwnedChange, title, hint, preset = [] }: Props) {
  const [offered, setOffered] = useState<string[]>(preset)
  const [taken, setTaken] = useState<{ id: string; added: string } | null>(null)
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
    setOffered([])
  }

  return (
    <section className="panel reward-picker">
      <h2>{title}</h2>
      <p className="muted small">{hint}</p>
      <GiftSearch gifts={gifts} owned={new Set(owned)} placeholder="Add a gift you're being offered…"
        onPick={(g) => { if (!offered.includes(g.id)) setOffered([...offered, g.id]); setTaken(null) }} />
      {taken && (
        <p className="reward-taken">
          Added {ctx.giftsById.get(taken.id)?.name ?? taken.id} to Gifts you have.{' '}
          <button className="link-btn" onClick={() => { onOwnedChange(removeOne(owned, taken.added)); setTaken(null) }}>Undo</button>
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
                {k === 0 && ranked.length > 1 && <span className="reward-pick">Take this</span>}
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
