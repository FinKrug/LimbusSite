import { useMemo, useState } from 'react'
import type { GiftScore } from '../lib/scoring'
import { CORE_KEYWORDS, type Gift, type ThemePack } from '../lib/types'
import { Empty, GiftLabel, Reasons, RatingBar } from './bits'
import { bestFilter, filterLabel, matches, searchOptions } from '../lib/giftsearch'
import { HowToGet } from './HowToGet'
import { GiftWhy } from './WhyRank'

interface Props {
  ranked: GiftScore[]
  packsForGift: Map<string, ThemePack[]>
  teamKeywords: string[]
  packs: ThemePack[]
  onOwn: (id: string) => void
  giftsById: Map<string, Gift>
  owned: Set<string>
  /** Gifts you can get on the floor you're on. */
  availableNow?: Set<string>
}

const PAGE = 30

export function GiftList({ ranked, packsForGift, teamKeywords, packs, onOwn, giftsById, owned, availableNow }: Props) {
  const [query, setQuery] = useState('')
  const [keyword, setKeyword] = useState('team')
  const [tier, setTier] = useState('any')
  const [shown, setShown] = useState(PAGE)

  const search = useMemo(() => bestFilter(query, packs), [query, packs])
  const options = useMemo(() => searchOptions(query, packs).slice(0, 6), [query, packs])
  // A pack, sin, keyword or tier search shows everything that matches, not just what fits.
  const smart = search !== null && search.kind !== 'text'
  const filtered = useMemo(() => {
    const isCore = (k: string | null) => !!k && (CORE_KEYWORDS as readonly string[]).includes(k)
    return ranked.filter(({ gift, synergy }) => {
      if (search && !matches(gift, search)) return false
      if (tier !== 'any' && String(gift.tier) !== tier) return false
      if (smart) return true
      switch (keyword) {
        case 'team':
          return synergy || teamKeywords.length === 0 || !isCore(gift.keyword) || teamKeywords.includes(gift.keyword!)
        case 'now': return (!availableNow || availableNow.has(gift.id))
          && (synergy || teamKeywords.length === 0 || !isCore(gift.keyword) || teamKeywords.includes(gift.keyword!))
        case 'synergy': return synergy
        case 'general': return !isCore(gift.keyword)
        case 'all': return true
        default: return gift.keyword === keyword
      }
    })
  }, [ranked, search, smart, keyword, tier, teamKeywords, availableNow])

  const reset = () => setShown(PAGE)

  return (
    <div>
      <div className="filters">
        <input type="search" placeholder="Search: a gift, theme pack, sin, keyword, tier…" value={query}
          aria-label="Search gifts" onChange={(e) => { setQuery(e.target.value); reset() }} />
        <select value={keyword} onChange={(e) => { setKeyword(e.target.value); reset() }} aria-label="Show">
          <option value="team">Fits my team</option>
          <option value="now">Fits my team, on this floor</option>
          <option value="synergy">Built for my team</option>
          <option value="all">All keywords</option>
          <option value="general">General only</option>
          {CORE_KEYWORDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={tier} onChange={(e) => { setTier(e.target.value); reset() }} aria-label="Tier">
          <option value="any">Any tier</option>
          {[1, 2, 3, 4, 5].map((t) => <option key={t} value={t}>Tier {['I', 'II', 'III', 'IV', 'V'][t - 1]}</option>)}
        </select>
      </div>
      {options.length > 0 && (!search || search.kind === 'text') && (
        <div className="search-options">
          <span className="muted small">Did you mean</span>
          {options.map((o) => (
            <button key={filterLabel(o)} className="chip-btn" onClick={() => { setQuery(o.kind === 'pack' ? o.pack.name : o.kind === 'sin' ? o.sin : o.kind === 'keyword' ? o.keyword : `tier ${o.kind === 'tier' ? o.tier : ''}`); reset() }}>
              {filterLabel(o)}
            </button>
          ))}
        </div>
      )}
      <p className="result-count">
        {smart ? (
          <>
            <span className="search-chip">{filterLabel(search!)}
              <button className="icon-btn" aria-label="Clear search" onClick={() => { setQuery(''); reset() }}>×</button>
            </span>{' '}
            {filtered.length} gifts, best for your team first
            {search!.kind === 'pack' && <> · <span className="muted">exclusives: {search!.pack.gifts.length}</span></>}
          </>
        ) : `${filtered.length} gifts`}
      </p>
      {filtered.length === 0 ? (
        <Empty>
          {smart ? 'You already have every gift that matches.' : 'No gifts match these filters.'}
        </Empty>
      ) : (
        <ol className="cards">
          {filtered.slice(0, shown).map((s) => {
            return (
              <li key={s.gift.id} className={['card', s.synergy && 'synergy'].filter(Boolean).join(' ')}>
                <div className="card-main">
                  <span className="gift-label">
                    <GiftLabel gift={s.gift} icon={44} />
                    {s.synergy && <span className="pill">Built for your team</span>}
                  </span>
                  <RatingBar rating={s.rating} />
                </div>
                <Reasons reasons={s.reasons} />
                <div className="card-foot">
                  <span className="source">{sourceText(s.gift, packsForGift.get(s.gift.id) ?? [])}</span>
                  <HowToGet gift={s.gift} packsForGift={packsForGift} giftsById={giftsById} owned={owned} />
                  <GiftWhy score={s} />
                  <details>
                    <summary>Effect</summary>
                    <p>{s.gift.effect || 'See the wiki for this gift’s effect.'}</p>
                    {s.gift.upgrades?.map((u, k) => (
                      <p key={k} className="effect-upgrade"><b>{'+'.repeat(k + 1)}</b> {u}</p>
                    ))}
                  </details>
                  <button className="btn" onClick={() => onOwn(s.gift.id)}>I got this</button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {filtered.length > shown && (
        <button className="btn more" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({filtered.length - shown} left)
        </button>
      )}
    </div>
  )
}

function sourceText(gift: Gift, packs: ThemePack[]): string {
  if (gift.fusion_recipe) return 'Fusion only'
  const exclusive = packs.filter((p) => p.gifts.includes(gift.id))
  if (exclusive.length) return `Only in: ${exclusive.map((p) => p.name).join(', ')}`
  if (packs.length) {
    const names = packs.slice(0, 2).map((p) => p.name).join(', ')
    return `In ${packs.length} theme pack${packs.length > 1 ? 's' : ''}: ${names}${packs.length > 2 ? ', …' : ''}`
  }
  if (gift.events.length) return `Event: ${gift.events.map((e) => e.name).join(', ')}`
  return 'Shop & rewards'
}
