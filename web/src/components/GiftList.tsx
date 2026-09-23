import { useMemo, useState } from 'react'
import type { GiftScore } from '../lib/scoring'
import { CORE_KEYWORDS, type Gift, type ThemePack } from '../lib/types'
import { Empty, GiftLabel, Reasons, RatingBar, TargetButton } from './bits'

interface Props {
  ranked: GiftScore[]
  packsForGift: Map<string, ThemePack[]>
  teamKeywords: string[]
  targets: Set<string>
  onOwn: (id: string) => void
  onToggleTarget: (id: string) => void
}

const PAGE = 30

export function GiftList({ ranked, packsForGift, teamKeywords, targets, onOwn, onToggleTarget }: Props) {
  const [query, setQuery] = useState('')
  const [keyword, setKeyword] = useState('team')
  const [tier, setTier] = useState('any')
  const [shown, setShown] = useState(PAGE)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const isCore = (k: string | null) => !!k && (CORE_KEYWORDS as readonly string[]).includes(k)
    return ranked.filter(({ gift, synergy }) => {
      if (q && !gift.name.toLowerCase().includes(q) && !gift.effect.toLowerCase().includes(q)) return false
      if (tier !== 'any' && String(gift.tier) !== tier) return false
      switch (keyword) {
        case 'team':
          return synergy || teamKeywords.length === 0 || !isCore(gift.keyword) || teamKeywords.includes(gift.keyword!)
        case 'synergy': return synergy
        case 'targets': return targets.has(gift.id)
        case 'general': return !isCore(gift.keyword)
        case 'all': return true
        default: return gift.keyword === keyword
      }
    })
  }, [ranked, query, keyword, tier, teamKeywords, targets])

  const reset = () => setShown(PAGE)

  return (
    <div>
      <div className="filters">
        <input type="search" placeholder="Search name or effect…" value={query}
          onChange={(e) => { setQuery(e.target.value); reset() }} />
        <select value={keyword} onChange={(e) => { setKeyword(e.target.value); reset() }} aria-label="Show">
          <option value="team">Fits my team</option>
          <option value="synergy">Built for my team</option>
          <option value="targets">My targets ({targets.size})</option>
          <option value="all">All keywords</option>
          <option value="general">General only</option>
          {CORE_KEYWORDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={tier} onChange={(e) => { setTier(e.target.value); reset() }} aria-label="Tier">
          <option value="any">Any tier</option>
          {[1, 2, 3, 4, 5].map((t) => <option key={t} value={t}>Tier {['I', 'II', 'III', 'IV', 'V'][t - 1]}</option>)}
        </select>
      </div>
      <p className="result-count">{filtered.length} gifts</p>
      {filtered.length === 0 ? (
        <Empty>
          {keyword === 'targets'
            ? 'No targets yet. Press ☆ on a gift you want and the Theme packs tab will point you to the packs that give it.'
            : 'No gifts match these filters.'}
        </Empty>
      ) : (
        <ol className="cards">
          {filtered.slice(0, shown).map((s) => {
            const targeted = targets.has(s.gift.id)
            return (
              <li key={s.gift.id} className={['card', s.synergy && 'synergy', targeted && 'targeted'].filter(Boolean).join(' ')}>
                <div className="card-main">
                  <span className="gift-label">
                    <GiftLabel gift={s.gift} />
                    {s.synergy && <span className="pill">Built for your team</span>}
                  </span>
                  <RatingBar rating={s.rating} />
                </div>
                <Reasons reasons={s.reasons} />
                <div className="card-foot">
                  <span className="source">{sourceText(s.gift, packsForGift.get(s.gift.id) ?? [])}</span>
                  <details>
                    <summary>Effect</summary>
                    <p>{s.gift.effect || 'See the wiki for this gift’s effect.'}</p>
                  </details>
                  <TargetButton on={targeted} name={s.gift.name} onToggle={() => onToggleTarget(s.gift.id)} />
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
