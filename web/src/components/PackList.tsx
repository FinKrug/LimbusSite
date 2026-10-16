import { useMemo, useState, type ReactNode } from 'react'
import { EXTREME_FROM, type Difficulty, type GiftScore, type PackScore, type RunSettings } from '../lib/scoring'
import { type Gift, type ThemePack, floorText } from '../lib/types'
import { Empty, GiftLabel, Reasons, RatingBar, WikiLink } from './bits'
import { HowToGet } from './HowToGet'
import { PACK_GIFTS_FIRST, PACK_GIFTS_STEP, nextShown } from '../lib/format'
import { PackWhy } from './WhyRank'
import { neighbourLines, packEdgeReason, packSummary } from '../lib/explain'

interface Props {
  allPacks: ThemePack[]
  /** Ranked packs in view: the offered ones, or those on the chosen floor, or all. */
  ranked: PackScore[]
  offered: string[]
  onOfferedChange: (ids: string[]) => void
  run: RunSettings
  onPickPack: (id: string | null) => void
  packsForGift: Map<string, ThemePack[]>
  giftsById: Map<string, Gift>
  owned: Set<string>
}

const VERDICT = { go: 'Go', maybe: 'Maybe', skip: 'Skip' }
const DIFF: Record<Difficulty, string> = { normal: 'Normal', hard: 'Hard', extreme: 'EXTREME' }

export function PackList({
  allPacks, ranked, offered, onOfferedChange, run, onPickPack, packsForGift, giftsById, owned,
}: Props) {
  const how = (g: Gift) => <HowToGet gift={g} packsForGift={packsForGift} giftsById={giftsById} owned={owned} />
  const [query, setQuery] = useState('')
  const byId = useMemo(() => new Map(allPacks.map((p) => [p.id, p])), [allPacks])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allPacks.filter((p) => !offered.includes(p.id) && p.name.toLowerCase().includes(q)).slice(0, 8)
  }, [allPacks, offered, query])

  const visible = ranked

  return (
    <div>
      <div className="offered">
        <p className="hint">
          {offered.length
            ? 'Comparing only the packs you’re being offered.'
            : run.floor !== null
              ? `Packs that can show up on floor ${run.floor} (${DIFF[run.difficulty]}${run.difficulty === 'extreme'
                ? run.floor < EXTREME_FROM ? ', a Hard floor' : ', an EXTREME floor' : ''}), best for your team first. Change the floor in Your run.`
              : `Every ${DIFF[run.difficulty]} pack, best for your team first. Start your run to see just the packs on your floor, or add the packs the game is offering.`}
        </p>
        <div className="search">
          <input type="search" placeholder="Add an offered pack…" value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) { onOfferedChange([...offered, matches[0].id]); setQuery('') }
            }} />
          {matches.length > 0 && (
            <ul className="search-results">
              {matches.map((p) => (
                <li key={p.id} onMouseDown={(e) => { e.preventDefault(); onOfferedChange([...offered, p.id]); setQuery('') }}>
                  <span className="grow">{p.name}</span>
                  {p.pool !== 'themed' && <span className="tag">{p.pool}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        {offered.length > 0 ? (
          <div className="chips">
            {offered.map((id) => (
              <span key={id} className="chip">
                {byId.get(id)?.name ?? id}
                <button className="icon-btn" aria-label="Remove" onClick={() => onOfferedChange(offered.filter((x) => x !== id))}>×</button>
              </span>
            ))}
            <button className="link-btn" onClick={() => onOfferedChange([])}>Show all packs</button>
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? <Empty>No theme packs match.</Empty> : (
        <ol className="cards">
          {visible.map((p, k) => {
            const verdict = p.verdict
            const { above, below } = neighbourLines(p, visible[k - 1], visible[k + 1], (x) => x.pack.name, packEdgeReason)
            const summary = packSummary(p)
            const normal = floorText(p.pack.floors?.normal)
            const hard = floorText(p.pack.floors?.hard)
            const extreme = floorText(p.pack.floors?.extreme)
            return (
              <li key={p.pack.id} className={`card card-${verdict}`}>
                <div className="card-main">
                  <span className="gift-label">
                    <span className={`verdict verdict-${verdict}`}>{VERDICT[verdict]}</span>
                    <WikiLink href={p.pack.wiki_url}>{p.pack.name}</WikiLink>
                    {p.pack.pool !== 'themed' && <span className="tag">{p.pack.pool}</span>}
                    {run.pack === p.pack.id && <span className="pill">Current pack</span>}
                  </span>
                  <RatingBar rating={p.rating} />
                </div>
                {(normal || hard || extreme || p.pack.group) && (
                  <div className="pack-meta">
                    {p.pack.group && <span>{p.pack.group.replace(/ Themes?$/, '')}</span>}
                    {normal && <span>Normal {normal}</span>}
                    {hard && <span>Hard {hard}</span>}
                    {extreme && <span>Extreme {extreme}</span>}
                    <span>{p.pack.gift_pool.length} gifts</span>
                  </div>
                )}
                <Reasons reasons={p.reasons} />
                {summary && <p className="why-line">{summary}.</p>}
                {above && <p className="why-line">{above}</p>}
                <PackGifts pack={p} how={how} />
                {p.ownedCount > 0 && <p className="muted small">You already have {p.ownedCount} of its gifts.</p>}
                <div className="card-foot">
                  <PackWhy score={p} below={below} />
                  {run.floor !== null && (
                    run.pack === p.pack.id
                      ? <button className="btn" onClick={() => onPickPack(null)}>Unpick</button>
                      : <button className="btn" onClick={() => onPickPack(p.pack.id)} title="Sets this as your current pack (used by Fusion)">Picking this</button>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

/**
 * A pack's card gifts: its exclusives (fitting your team first) and a few strong gifts
 * it features that few other packs do. Gifts most packs give aren't a reason to pick
 * this one, so they're only in "Everything it can give".
 */
function PackGifts({ pack: p, how }: { pack: PackScore; how: (g: Gift) => ReactNode }) {
  const [all, setAll] = useState(false)
  const [shown, setShown] = useState(PACK_GIFTS_FIRST)
  const why = (g: GiftScore) => g.reasons[0] && <span className={`pack-gift-why reason-${g.reasons[0].kind}`}>{g.reasons[0].text}</span>
  const rows = p.top
  return (
    <>
      {p.highlights.length > 0 ? (
        <ul className="pack-gifts">
          {p.highlights.map((h) => (
            <li key={h.gift.gift.id} className={h.fits ? '' : 'pack-gift-off'}>
              <span className={`pill ${h.kind === 'exclusive' ? '' : 'pill-boost'}`}>{h.kind === 'exclusive' ? 'Exclusive' : 'Boosted'}</span>
              <GiftLabel gift={h.gift.gift} icon={28} />{why(h.gift)}{how(h.gift.gift)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No exclusive gifts, and nothing boosted here that fits your team.</p>
      )}
      {rows.length > 0 && (
        <details className="pack-all" open={all} onToggle={(e) => setAll((e.target as HTMLDetailsElement).open)}>
          <summary className="muted small">Everything it can give ({rows.length})</summary>
          {all && (
            <ul className="pack-gifts">
              {rows.slice(0, shown).map((g) => (
                <li key={g.gift.id}><GiftLabel gift={g.gift} icon={24} />{why(g)}</li>
              ))}
              {rows.length > shown && (
                <li className="pack-gifts-more">
                  <button className="link-btn" onClick={() => setShown(nextShown(shown, rows.length))}>
                    Show {Math.min(rows.length - shown, PACK_GIFTS_STEP)} more
                  </button>
                </li>
              )}
            </ul>
          )}
        </details>
      )}
    </>
  )
}
