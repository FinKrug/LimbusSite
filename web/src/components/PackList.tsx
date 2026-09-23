import { useMemo, useState } from 'react'
import type { Difficulty, PackScore } from '../lib/scoring'
import { type ThemePack, floorText } from '../lib/types'
import { Empty, GiftLabel, Reasons, RatingBar, WikiLink } from './bits'

export interface FloorFilter {
  difficulty: Difficulty
  floor: number | null
}

interface Props {
  allPacks: ThemePack[]
  /** Ranked packs in view: the offered ones, or those on the chosen floor, or all. */
  ranked: PackScore[]
  offered: string[]
  onOfferedChange: (ids: string[]) => void
  targetCount: number
  floorFilter: FloorFilter
  onFloorFilterChange: (f: FloorFilter) => void
}

const VERDICT = { go: 'Go', maybe: 'Maybe', skip: 'Skip' }

export function PackList({
  allPacks, ranked, offered, onOfferedChange, targetCount, floorFilter, onFloorFilterChange,
}: Props) {
  const [query, setQuery] = useState('')
  const byId = useMemo(() => new Map(allPacks.map((p) => [p.id, p])), [allPacks])
  const hasFloorData = allPacks.some((p) => p.floors)
  const hasExtreme = allPacks.some((p) => p.floors?.extreme)
  const maxFloor = useMemo(() => Math.max(5, ...allPacks.flatMap((p) =>
    [p.floors?.[floorFilter.difficulty]?.[1] ?? 0])), [allPacks, floorFilter.difficulty])
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
            : targetCount
              ? `Packs that can give the most of your ${targetCount} target${targetCount > 1 ? 's' : ''} come first.`
              : 'Star (☆) gifts you want on the Best gifts tab to find the packs that give them. Or add the packs the game is offering you to compare just those.'}
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
        ) : hasFloorData ? (
          <div className="pack-filters">
            <select aria-label="Difficulty" value={floorFilter.difficulty}
              onChange={(e) => onFloorFilterChange({ ...floorFilter, difficulty: e.target.value as Difficulty })}>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
              {hasExtreme && <option value="extreme">Extreme</option>}
            </select>
            <select aria-label="Floor" value={floorFilter.floor ?? ''}
              onChange={(e) => onFloorFilterChange({ ...floorFilter, floor: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Any floor</option>
              {Array.from({ length: maxFloor }, (_, i) => i + 1).map((f) => <option key={f} value={f}>Floor {f}</option>)}
            </select>
            {floorFilter.floor !== null && <span className="muted small">{visible.length} packs can appear here</span>}
          </div>
        ) : (
          <p className="muted small">Floor info appears after a live scrape (python -m scraper).</p>
        )}
      </div>

      {visible.length === 0 ? <Empty>No theme packs match.</Empty> : (
        <ol className="cards">
          {visible.map((p) => {
            const verdict = p.verdict
            const others = p.top.filter((g) => !p.targets.some((t) => t.gift.id === g.gift.id)).slice(0, 3)
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
                    {p.targets.length > 0 && <span className="pill">★ {p.targets.length} target{p.targets.length > 1 ? 's' : ''}</span>}
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
                {(p.targets.length > 0 || others.length > 0) && (
                  <ul className="pack-gifts">
                    {p.targets.map((g) => (
                      <li key={g.gift.id}><span className="star-mark" aria-label="target">★</span><GiftLabel gift={g.gift} /></li>
                    ))}
                    {others.map((g) => (
                      <li key={g.gift.id}><span className="star-mark" /><GiftLabel gift={g.gift} /></li>
                    ))}
                    {p.top.length > p.targets.length + others.length && (
                      <li className="muted">+{p.top.length - p.targets.length - others.length} more</li>
                    )}
                  </ul>
                )}
                {p.ownedCount > 0 && <p className="muted small">You already have {p.ownedCount} of its gifts.</p>}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
