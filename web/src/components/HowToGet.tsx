import { gameData } from '../lib/data'
import { howToGet, packLabel } from '../lib/acquire'
import type { Gift, ThemePack } from '../lib/types'
import { WikiLink } from './bits'

/** "How to get" disclosure for a gift card: where, and how once you're there. */
export function HowToGet({ gift, packsForGift, giftsById, owned }: {
  gift: Gift; packsForGift: Map<string, ThemePack[]>; giftsById: Map<string, Gift>; owned: Set<string>
}) {
  const lines = howToGet(gift, packsForGift, giftsById, owned, gameData.events ?? [], gameData.themePacks)
  return (
    <details className="how-to-get">
      <summary>How to get</summary>
      <ul>
        {lines.map((l, k) => (
          <li key={k} className={`acquire acquire-${l.kind}`}>
            <span className="acquire-kind">{l.odds === 'chance' ? 'Chance' : LABEL[l.kind]}</span>
            <span className="acquire-body">
              {l.kind === 'fusion' ? (
                <span>
                  {l.ingredients!.map((g, j) => (
                    <span key={g.id}>
                      {j > 0 && ' + '}
                      <span className={g.owned ? 'owned-ingredient' : ''} title={g.owned ? 'You have this' : undefined}>
                        {g.name}{g.owned ? ' ✓' : ''}
                      </span>
                    </span>
                  ))}
                </span>
              ) : l.kind === 'event' ? (
                <span>Random "?" event: <WikiLink href={l.link ?? null}>{l.text}</WikiLink></span>
              ) : l.kind === 'pack' ? (
                <span>
                  {l.text}{l.packs?.length ? ': ' : ''}
                  {l.packs!.map((p, j) => (
                    <span key={p.id}>{j > 0 && ', '}<WikiLink href={p.wiki_url}>{packLabel(p)}</WikiLink></span>
                  ))}
                  {l.morePacks ? `, +${l.morePacks} more` : ''}
                </span>
              ) : (
                <span>{l.text}</span>
              )}
              {l.details && l.details.length > 0 && (
                <ul className="acquire-steps">{l.details.map((d) => <li key={d}>{d}</li>)}</ul>
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}

const LABEL: Record<string, string> = { fusion: 'Fusion', pack: 'Theme pack', event: 'Event', pool: 'Pool', other: 'Other' }
