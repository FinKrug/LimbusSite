import { useMemo, useState, type ReactNode } from 'react'
import { EXTREME_FROM, isHiddenPack, packOnFloor, playedPacks, type Difficulty, type GiftScore, type PackHighlight, type PackScore, type RunSettings } from '../lib/scoring'
import { type Gift, type ThemePack, floorText } from '../lib/types'
import { Empty, GiftLabel, Reasons, RatingBar, WikiLink } from './bits'
import { HowToGet } from './HowToGet'
import { PACK_GIFTS_FIRST, PACK_GIFTS_STEP, nextShown } from '../lib/format'
import { PackWhy } from './WhyRank'
import { neighbourLines, packEdgeReason, packSummary } from '../lib/explain'
import type { PackAdvice } from '../lib/packroute'

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
  /** Per pack: what taking it now does for the rest of the run (internal pack route). */
  advice?: Map<string, PackAdvice>
}

const VERDICT = { go: 'Go', maybe: 'Maybe', skip: 'Skip' }
const DIFF: Record<Difficulty, string> = { normal: 'Normal', hard: 'Hard', extreme: 'EXTREME' }

export function PackList({
  allPacks, ranked, offered, onOfferedChange, run, onPickPack, packsForGift, giftsById, owned, advice = new Map(),
}: Props) {
  const how = (g: Gift) => <HowToGet gift={g} packsForGift={packsForGift} giftsById={giftsById} owned={owned} />
  const [query, setQuery] = useState('')
  const played = useMemo(() => playedPacks(run), [run])
  const byId = useMemo(() => new Map(allPacks.map((p) => [p.id, p])), [allPacks])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allPacks.filter((p) => !offered.includes(p.id) && !played.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 8)
  }, [allPacks, offered, played, query])
  // Packs that can show up on this floor but that you've already played: you can't pick them again.
  const playedHere = run.floor === null || offered.length ? []
    : allPacks.filter((p) => played.has(p.id) && packOnFloor(p, run.difficulty, run.floor!))

  const visible = ranked
  // Hidden packs (The B.E.) stay quiet unless you've added one as offered, i.e. found it.
  const rareUnfound = (p: PackScore) => isHiddenPack(p.pack) && !offered.includes(p.pack.id)

  return (
    <div>
      <div className="offered">
        <p className="hint">
          {offered.length
            ? 'Comparing only the packs you’re being offered, best pick for the whole run first.'
            : run.floor !== null
              ? `Packs that can show up on floor ${run.floor} (${DIFF[run.difficulty]}${run.difficulty === 'extreme'
                ? run.floor < EXTREME_FROM ? ', a Hard floor' : ', an EXTREME floor' : ''}), best pick first: a pack that won't show up again comes before one that will still be around on later floors. Change the floor in Your run.`
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

      {playedHere.length > 0 && (
        <p className="muted small">
          Not listed: {playedHere.map((p) => `${p.name} (played on floor ${played.get(p.id)})`).join(', ')}. Once you've picked a pack, you can't pick it again this run.
        </p>
      )}
      {visible.length === 0 ? <Empty>No theme packs match.</Empty> : (
        <ol className="cards">
          {visible.map((p, k) => {
            const verdict = p.verdict
            // When the order follows the run (advice), score comparisons with the neighbours would read wrong.
            const routed = advice.size > 0
            const { above, below } = neighbourLines(p, routed ? undefined : visible[k - 1], routed ? undefined : visible[k + 1], (x) => x.pack.name, packEdgeReason)
            const summary = packSummary(p)
            const normal = floorText(p.pack.floors?.normal)
            const hard = floorText(p.pack.floors?.hard)
            const extreme = floorText(p.pack.floors?.extreme)
            return (
              <li key={p.pack.id} className={`card card-${rareUnfound(p) ? "rare" : verdict}`}>
                <div className="card-main">
                  <span className="gift-label">
                    {rareUnfound(p)
                      ? <span className="verdict verdict-rare" title="A rare hidden pack: don't plan around it, but take it if it shows up">If found</span>
                      : <span className={`verdict verdict-${verdict}`}>{VERDICT[verdict]}</span>}
                    <WikiLink href={p.pack.wiki_url}>{p.pack.name}</WikiLink>
                    {p.pack.pool !== 'themed' && <span className="tag">{p.pack.pool}</span>}
                    {run.pack === p.pack.id && <span className="pill">Current pack</span>}
                  </span>
                  {!rareUnfound(p) && <RatingBar rating={p.rating} />}
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
                {advice.get(p.pack.id)?.note && (
                  <p className={`offered-advice advice-${advice.get(p.pack.id)!.kind}`}>{advice.get(p.pack.id)!.note}</p>
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

/** Pill class and label per highlight kind. */
const HIGHLIGHT_PILL: Record<PackHighlight['kind'], [string, string]> = {
  exclusive: ['', 'Exclusive'], clear: ['pill-clear', 'Clear reward'], fusion: ['pill-fusion', 'Fusion'], boosted: ['pill-boost', 'Boosted'],
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
              <span className={`pill ${HIGHLIGHT_PILL[h.kind][0]}`}>{HIGHLIGHT_PILL[h.kind][1]}</span>
              <GiftLabel gift={h.gift.gift} icon={28} />
              {h.kind === 'fusion' ? <span className="pack-gift-why reason-good">{h.where}</span> : why(h.gift)}{how(h.gift.gift)}
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
