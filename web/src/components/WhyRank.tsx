import type { GiftScore, PackScore } from '../lib/scoring'
import { giftSummary, shares } from '../lib/explain'
import { Reasons } from './bits'
import { GiftIcon } from './GiftIcon'

const pct = (x: number) => `${Math.round(x * 100)}%`

function Share({ share }: { share: number }) {
  return (
    <span className="why-share" title={`${pct(share)} of its score`}>
      <span className="why-share-fill" style={{ width: `${Math.max(3, share * 100)}%` }} />
    </span>
  )
}

/** "Why this rank" for a gift: what its score is made of, and how it compares with its neighbours. */
export function GiftWhy({ score, above, below }: { score: GiftScore; above?: string; below?: string }) {
  const parts = shares(score.parts).filter((p) => p.share > 0.005)
  return (
    <details className="why-rank">
      <summary>Why this rank</summary>
      <div className="why-body">
        {(below || above) && (
          <ul className="why-compare">
            {below && <li>{below}</li>}
            {above && <li>{above}</li>}
          </ul>
        )}
        <p className="why-lead">{giftSummary(score)}</p>
        <ul className="why-parts">
          {parts.map((p) => (
            <li key={p.kind + p.label}>
              <Share share={p.share} />
              <span className="why-pct">{pct(p.share)}</span>
              <span className="why-label">
                {p.label}
                {p.detail && <span className="why-detail">{p.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
        {score.reasons.length > 3 && (
          <>
            <p className="why-lead">Everything that counted:</p>
            <Reasons reasons={score.reasons} max={20} />
          </>
        )}
      </div>
    </details>
  )
}

/** "Why this rank" for a theme pack: which of its gifts carry its score. */
export function PackWhy({ score, above, below }: { score: PackScore; above?: string; below?: string }) {
  const parts = shares(score.parts).filter((p) => p.share > 0.005)
  return (
    <details className="why-rank">
      <summary>Why this rank</summary>
      <div className="why-body">
        {(below || above) && (
          <ul className="why-compare">
            {below && <li>{below}</li>}
            {above && <li>{above}</li>}
          </ul>
        )}
        {parts.length > 0 ? (
          <>
            <p className="why-lead">
              A pack is worth its best few gifts for your team (the best counts fully, each next one less), plus extra
              for gifts built for your team. Gifts found in many packs count for less; gifts only
              in this pack count for more.
            </p>
            <ul className="why-parts">
              {parts.map((p) => (
                <li key={p.gift.gift.id}>
                  <Share share={p.share} />
                  <span className="why-pct">{pct(p.share)}</span>
                  <span className="why-label">
                    <span className="why-gift"><GiftIcon gift={p.gift.gift} size={20} />{p.gift.gift.name}</span>
                    <span className="why-detail">
                      {p.notes.join(' · ')}
                      {p.gift.reasons[0] && <> · {p.gift.reasons[0].text}</>}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {score.top.length > parts.length && (
              <p className="muted small">
                Its other {score.top.length - parts.length}{' '}
                {score.top.length - parts.length > 1 ? 'gifts add' : 'gift adds'} nothing: only the best 5 and gifts built for your team count.
              </p>
            )}
          </>
        ) : (
          <p className="why-lead">Nothing here is left for you to get.</p>
        )}
      </div>
    </details>
  )
}

