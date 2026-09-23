import { useMemo, useState } from 'react'
import { identityTier, isTier, TIERS, tierList, type Tier, type TierOverrides } from '../lib/strength'
import { type Focus, focusKey, parseFocus, traitOptions } from '../lib/teambuilder'
import { CORE_KEYWORDS, SINNERS, type Identity, type Sinner } from '../lib/types'
import { KeywordChip } from './bits'
import { LineupList } from './LineupList'

export type TeamSelection = Partial<Record<Sinner, string | null>>

interface Props {
  identities: Identity[]
  team: TeamSelection
  onChange: (team: TeamSelection) => void
  /** Picked sinners in deployment order (#1 first). */
  order: Sinner[]
  onOrderChange: (order: Sinner[]) => void
  deployed: number
  onDeployedChange: (n: number) => void
  /** Why the suggested order put a sinner where it is. */
  notes: Partial<Record<Sinner, string>>
  onSuggestOrder: () => void
  onBuild: (focus: Focus) => void
  /** Your own identity ratings (they win over the bundled tier list). */
  tiers: TierOverrides
  onTiersChange: (tiers: TierOverrides) => void
}

export function TeamPicker({
  identities, team, onChange, order, onOrderChange, deployed, onDeployedChange, notes, onSuggestOrder, onBuild,
  tiers, onTiersChange,
}: Props) {
  const bySinner = useMemo(() => {
    const map = new Map<Sinner, Identity[]>()
    for (const s of SINNERS) map.set(s, [])
    for (const i of identities) map.get(i.sinner)?.push(i)
    for (const list of map.values()) {
      list.sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0) || a.name.localeCompare(b.name))
    }
    return map
  }, [identities])
  const setTier = (id: string, tier: Tier | null) => {
    const next = { ...tiers }
    if (tier) next[id] = tier
    else delete next[id]
    onTiersChange(next)
  }
  const byId = useMemo(() => new Map(identities.map((i) => [i.id, i])), [identities])
  const traits = useMemo(() => traitOptions(identities), [identities])
  const count = order.length
  // Collapse to the lineup once a team exists, so the gift list stays in view.
  const [editing, setEditing] = useState(count === 0)
  const [building, setBuilding] = useState(false)
  const [focus, setFocus] = useState('')


  const builder = building && (
    <div className="builder">
      <p className="hint small">
        Picks the best identity for each sinner and a deployment order, preferring stronger
        units and giving the best ones the buffed slots. It doesn't know which identities you
        own, so swap in what you have afterwards.
      </p>
      <select aria-label="Build around" value={focus} onChange={(e) => setFocus(e.target.value)}>
        <option value="">Build around…</option>
        <optgroup label="Keyword">
          {CORE_KEYWORDS.map((k) => <option key={k} value={focusKey({ kind: 'keyword', value: k })}>{k}</option>)}
        </optgroup>
        <optgroup label="Affiliation">
          {traits.map((t) => (
            <option key={t.name} value={focusKey({ kind: 'trait', value: t.name })}>
              {t.name} ({t.sinners} sinners)
            </option>
          ))}
        </optgroup>
      </select>
      <span className="confirm">
        <button className="btn" disabled={!parseFocus(focus)} onClick={() => {
          const f = parseFocus(focus)
          if (f) { onBuild(f); setBuilding(false); setEditing(false) }
        }}>
          {count ? 'Replace team' : 'Build team'}
        </button>
        <button className="link-btn" onClick={() => setBuilding(false)}>Cancel</button>
      </span>
    </div>
  )

  if (!editing && count > 0) {
    return (
      <section className="panel">
        <header className="panel-head">
          <h2>Lineup <span className="count">{count}/12</span></h2>
          <span className="confirm">
            <button className="link-btn" onClick={() => setBuilding((b) => !b)}>Build</button>
            <button className="btn" onClick={() => setEditing(true)}>Edit</button>
          </span>
        </header>
        {builder}
        <div className="lineup-tools">
          <label className="muted small">
            Deployed{' '}
            <select value={deployed} onChange={(e) => onDeployedChange(Number(e.target.value))} aria-label="Deployed sinners">
              {[5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="link-btn" onClick={onSuggestOrder} title="Order the lineup for your team and gifts">
            Suggest order
          </button>
        </div>
        <LineupList
          order={order} deployed={deployed} minDeployed={5} maxDeployed={7}
          onOrderChange={onOrderChange} onDeployedChange={onDeployedChange}
          renderRow={(s, k) => {
            const i = byId.get(team[s]!)
            if (!i) return null
            return (
              <>
                <span className="slot">#{k + 1}</span>
                <span className="lineup-name">
                  <span className="lineup-title">
                    <a href={i.wiki_url} target="_blank" rel="noreferrer" title={i.name}>{s}</a>
                    <TierTag tier={identityTier(i, tiers)} />
                  </span>
                  {notes[s] && <span className="lineup-note">{notes[s]}</span>}
                </span>
                <span className="team-kws">
                  {i.attack_types?.length ? <span className="team-atk">{i.attack_types.join(' / ')}</span> : null}
                  {i.keywords.map((kw) => <KeywordChip key={kw} keyword={kw} />)}
                </span>
              </>
            )
          }}
        />
      </section>
    )
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Team <span className="count">{count}/12</span></h2>
        <span className="confirm">
          <button className="link-btn" onClick={() => setBuilding((b) => !b)}>Build</button>
          {count > 0 && <button className="link-btn" onClick={() => onChange({})}>Clear</button>}
          {count > 0 && <button className="btn" onClick={() => setEditing(false)}>Done</button>}
        </span>
      </header>
      {builder}
      <ol className="team">
        {SINNERS.map((sinner) => {
          const selected = team[sinner] ? byId.get(team[sinner]!) : undefined
          const options = bySinner.get(sinner) ?? []
          return (
            <li key={sinner} className={selected ? 'team-row picked' : 'team-row'}>
              <label className="team-sinner" htmlFor={`id-${sinner}`}>{sinner}</label>
              <select
                id={`id-${sinner}`}
                value={selected?.id ?? ''}
                onChange={(e) => onChange({ ...team, [sinner]: e.target.value || null })}
              >
                <option value="">Not in team</option>
                {options.map((i) => {
                  const t = identityTier(i, tiers).tier
                  return (
                    <option key={i.id} value={i.id}>
                      {'★'.repeat(i.rarity ?? 0)} {shortName(i)}{t ? ` · ${t}` : ''}
                    </option>
                  )
                })}
              </select>
              {selected && (
                <TierSelect rating={identityTier(selected, tiers)} listed={tierList.tiers[selected.id] ?? null}
                  sinner={sinner} onChange={(t) => setTier(selected.id, t)} />
              )}
              {selected && selected.keywords.length > 0 && (
                <div className="team-kws">
                  {selected.keywords.map((k) => <KeywordChip key={k} keyword={k} />)}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function TierTag({ tier }: { tier: ReturnType<typeof identityTier> }) {
  if (!tier.tier) return null
  const cls = `tier-tag tier-${tier.tier.replace('+', 'p').toLowerCase()}`
  return (
    <span className={cls} title={tier.from === 'you' ? 'Your rating' : `Tier list (${tierList.updated})`}>
      {tier.tier}{tier.from === 'you' ? '*' : ''}
    </span>
  )
}

/** Rate an identity yourself; "List" goes back to the bundled tier list. */
function TierSelect({ rating, listed, sinner, onChange }: {
  rating: ReturnType<typeof identityTier>; listed: Tier | null; sinner: Sinner; onChange: (t: Tier | null) => void
}) {
  return (
    <select className="tier-select" aria-label={`${sinner} tier`} title="How strong this identity is"
      value={rating.from === 'you' ? rating.tier! : ''}
      onChange={(e) => onChange(isTier(e.target.value) ? e.target.value : null)}>
      <option value="">{listed ? `Tier: ${listed}` : 'Tier: unrated'}</option>
      {TIERS.map((t) => <option key={t} value={t}>{t}{t === listed ? '' : ' (mine)'}</option>)}
    </select>
  )
}

/** "LCB Sinner Yi Sang" -> "LCB Sinner" (the sinner is already shown in the row). */
function shortName(i: Identity): string {
  const trimmed = i.name.endsWith(i.sinner) ? i.name.slice(0, -i.sinner.length).trim() : i.name
  return trimmed || i.name
}
