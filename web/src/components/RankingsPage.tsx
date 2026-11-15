import { useEffect, useMemo, useState } from 'react'
import { shortName } from '../lib/format'
import type { ArtVariant } from '../lib/images'
import { getNextPicks, giftsFor, rankGiftsOverall, rankIdentitiesOverall, type GiftRanking } from '../lib/rankings'
import { clashLabel } from '../lib/strength'
import { CORE_KEYWORDS, SINNERS, type CoreKeyword, type GameData, type Sinner } from '../lib/types'
import { KeywordChip, TierBadge } from './bits'
import { GiftIcon } from './GiftIcon'
import { Portrait } from './Portrait'

export type RankingsView = 'gifts' | 'identities'

let giftCache: GiftRanking[] | null = null

/** Rankings: the best E.G.O gifts and identities for Mirror Dungeon, whatever you own. */
export function RankingsPage({ view, data, ownedIdentities, hasMarked, art, onOpenMyIdentities }: {
  view: RankingsView
  data: GameData
  /** Identities you own (base ones included). */
  ownedIdentities: ReadonlySet<string>
  /** You've marked any identities (otherwise "get next" can't be personal). */
  hasMarked: boolean
  art: ArtVariant
  onOpenMyIdentities: () => void
}) {
  return view === 'gifts'
    ? <BestGifts data={data} />
    : <BestIdentities data={data} owned={ownedIdentities} hasMarked={hasMarked} art={art} onOpenMyIdentities={onOpenMyIdentities} />
}

type GiftFilter = 'all' | 'any' | CoreKeyword

function valueLabel(v: number): { text: string; cls: string } {
  if (v >= 1) return { text: 'Top pick', cls: 'v-top' }
  if (v >= 0.8) return { text: 'Strong', cls: 'v-strong' }
  if (v >= 0.6) return { text: 'Good', cls: 'v-good' }
  return { text: 'Situational', cls: 'v-sit' }
}

function BestGifts({ data }: { data: GameData }) {
  const [list, setList] = useState<GiftRanking[] | null>(giftCache)
  const [filter, setFilter] = useState<GiftFilter>('all')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(30)
  useEffect(() => {
    if (giftCache) return
    // Seven keyword teams' worth of scoring: let the page draw first.
    const t = setTimeout(() => { giftCache = rankGiftsOverall(data); setList(giftCache) }, 30)
    return () => clearTimeout(t)
  }, [data])

  const rows = useMemo(() => {
    if (!list) return []
    const q = query.trim().toLowerCase()
    return giftsFor(list, filter).filter((g) => !q || g.gift.name.toLowerCase().includes(q))
  }, [list, filter, query])
  const valueOf = (g: GiftRanking) => (filter === 'all' ? g.overall : filter === 'any' ? g.anyTeam : g.byKeyword[filter])

  return (
    <div className="rankings">
      <p className="muted rankings-intro">
        The best E.G.O gifts for a Hard Mirror Dungeon run, for any team: each gift is scored for the strongest team of every status
        keyword, and ranked by the team it helps most. Pick a keyword to see the best gifts for that kind of team, or
        <b> Any team</b> for gifts that help whatever you bring. For what to take in your own run, use the Shop in the run.
      </p>
      <div className="rankings-tools" data-tour="gift-filters">
        <div className="chips-row" role="group" aria-label="Which teams">
          <button className={`chip-btn${filter === 'all' ? ' on' : ''}`} aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setShown(30) }}>All</button>
          <button className={`chip-btn${filter === 'any' ? ' on' : ''}`} aria-pressed={filter === 'any'} onClick={() => { setFilter('any'); setShown(30) }}>Any team</button>
          {CORE_KEYWORDS.map((k) => (
            <button key={k} className={`chip-btn${filter === k ? ' on' : ''}`} aria-pressed={filter === k} onClick={() => { setFilter(k); setShown(30) }}>{k}</button>
          ))}
        </div>
        <input type="search" placeholder="Find a gift…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a gift" />
      </div>
      {!list && <p className="muted rankings-loading">Scoring every gift for seven teams…</p>}
      <ol className="rank-list">
        {rows.slice(0, shown).map((g, k) => {
          const v = valueLabel(valueOf(g))
          // The reasons are written for "your team"; here it's the keyword team it was scored for.
          const reason = (g.reasons.find((r) => r.kind === 'good')?.text ?? g.reasons[0]?.text)?.replace(/\byour team\b/g, 'the team')
          return (
            <li key={g.gift.id} className="rank-row">
              <span className="rank-n">{k + 1}</span>
              <GiftIcon gift={g.gift} size={40} />
              <span className="rank-main">
                <span className="rank-title">
                  <TierBadge tier={g.gift.tier} /> <b>{g.gift.name}</b> <KeywordChip keyword={g.gift.keyword} />
                  {g.gift.reward_only && <span className="tag" title="Only from clearing a pack or a hidden boss, never in shops">Reward only</span>}
                </span>
                {reason && <span className="rank-why muted small">{reason}</span>}
              </span>
              <span className="rank-side">
                <span className={`rank-value ${v.cls}`}>{v.text}</span>
                <span className="rank-for small muted">
                  {g.anyTeam >= 0.45 ? 'Any team' : g.bestFor.length ? `Best for ${g.bestFor.slice(0, 3).join(', ')}` : ''}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
      {rows.length > shown && <button className="btn" onClick={() => setShown(shown + 40)}>Show {Math.min(40, rows.length - shown)} more</button>}
      {list && rows.length === 0 && <p className="muted">No gifts match.</p>}
    </div>
  )
}

type OwnFilter = 'all' | 'owned' | 'missing'

function BestIdentities({ data, owned, hasMarked, art, onOpenMyIdentities }: {
  data: GameData; owned: ReadonlySet<string>; hasMarked: boolean; art: ArtVariant; onOpenMyIdentities: () => void
}) {
  const [sinner, setSinner] = useState<Sinner | ''>('')
  const [keyword, setKeyword] = useState<CoreKeyword | ''>('')
  const [own, setOwn] = useState<OwnFilter>('all')
  const [shown, setShown] = useState(40)
  const ranked = useMemo(() => rankIdentitiesOverall(data.identities), [data])
  const picks = useMemo(() => (hasMarked ? getNextPicks(data, owned) : []), [data, owned, hasMarked])
  const rows = ranked.filter((r) => (!sinner || r.identity.sinner === sinner)
    && (!keyword || r.identity.keywords.includes(keyword))
    && (own === 'all' || (own === 'owned') === owned.has(r.identity.id)))

  return (
    <div className="rankings">
      <section className="panel getnext" data-tour="get-next">
        <h2>Worth getting next</h2>
        {!hasMarked ? (
          <p className="muted">
            Mark the identities you own and this shows the ones that would most improve the teams you can build.{' '}
            <button className="link-btn accent" onClick={onOpenMyIdentities}>Mark my identities →</button>
          </p>
        ) : picks.length === 0 ? (
          <p className="muted">Your teams already have the strongest picks for every keyword. Nice collection, Manager.</p>
        ) : (
          <>
            <p className="muted small">For each status keyword, the best team you can build from what you own, compared with the best team overall.</p>
            <ul className="getnext-list">
              {picks.map((p) => (
                <li key={p.identity.id} className="getnext-card">
                  <Portrait identity={p.identity} kind="profile" variant={art} />
                  <span className="getnext-text">
                    <b>{shortName(p.identity)}</b> <span className="muted">{p.identity.sinner}</span>
                    <span className="small">
                      For your <KeywordChip keyword={p.keyword} /> team{p.alsoFor.length ? <> (also {p.alsoFor.join(', ')})</> : null}:
                      {' '}replaces {shortName(p.replaces)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="muted rankings-intro">
        Every identity ranked for Mirror Dungeon: the Prydwen and Great Limbus Library tier lists combined, with a bonus for status
        specialists (MD's keyword gifts multiply status damage) and how well each one wins clashes.
      </p>
      <div className="rankings-tools">
        <select value={sinner} onChange={(e) => { setSinner(e.target.value as Sinner | ''); setShown(40) }} aria-label="Sinner">
          <option value="">All sinners</option>
          {SINNERS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={keyword} onChange={(e) => { setKeyword(e.target.value as CoreKeyword | ''); setShown(40) }} aria-label="Keyword">
          <option value="">Any keyword</option>
          {CORE_KEYWORDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <div className="chips-row" role="group" aria-label="Owned">
          {(['all', 'owned', 'missing'] as OwnFilter[]).map((o) => (
            <button key={o} className={`chip-btn${own === o ? ' on' : ''}`} aria-pressed={own === o} onClick={() => { setOwn(o); setShown(40) }}>
              {o === 'all' ? 'All' : o === 'owned' ? 'Owned' : 'Not owned'}
            </button>
          ))}
        </div>
      </div>
      <ol className="rank-list">
        {rows.slice(0, shown).map((r, k) => {
          const clash = clashLabel(r.identity)
          return (
            <li key={r.identity.id} className={`rank-row${owned.has(r.identity.id) ? ' owned' : ''}`}>
              <span className="rank-n">{k + 1}</span>
              <Portrait identity={r.identity} kind="profile" variant={art} />
              <span className="rank-main">
                <span className="rank-title">
                  <b>{shortName(r.identity)}</b> <span className="muted">{r.identity.sinner}</span>
                  {r.identity.keywords.map((kw) => <KeywordChip key={kw} keyword={kw} />)}
                </span>
                <span className="rank-why small muted">
                  {[r.role, clash?.text, owned.has(r.identity.id) ? '✓ You own it' : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="rank-side">
                <span className={`rank-tier t-${(r.tier ?? 'none').replace('+', 'p').toLowerCase()}`}>{r.tier ?? '–'}</span>
              </span>
            </li>
          )
        })}
      </ol>
      {rows.length > shown && <button className="btn" onClick={() => setShown(shown + 40)}>Show {Math.min(40, rows.length - shown)} more</button>}
      {rows.length === 0 && <p className="muted">No identities match.</p>}
    </div>
  )
}
