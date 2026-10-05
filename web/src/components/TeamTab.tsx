import { useEffect, useMemo, useState } from 'react'
import { shortName } from '../lib/format'
import type { ArtVariant } from '../lib/images'
import type { LineupInfo, LineupSuggestion } from '../lib/ordering'
import { identityTier } from '../lib/strength'
import { type Focus, focusKey, parseFocus, traitOptions } from '../lib/teambuilder'
import { CORE_KEYWORDS, SINNERS, type Identity, type Sin, type Sinner } from '../lib/types'
import { KeywordChip } from './bits'
import { EgoLoadoutPanel } from './EgoLoadout'
import type { BattleProfile, Ego, EgoLoadout } from '../lib/ego'
import { Portrait } from './Portrait'

const SIN_ORDER: Sin[] = ['wrath', 'lust', 'sloth', 'gluttony', 'gloom', 'pride', 'envy']

interface Props {
  identities: Identity[]
  equipped: Record<Sinner, Identity>
  selection: Sinner[]
  deployed: number
  art: ArtVariant
  suggestions: LineupSuggestion[]
  info: LineupInfo[]
  dismissedCount: number
  onToggle: (s: Sinner) => void
  onEquip: (s: Sinner, id: string) => void
  onClear: () => void
  onSelectAll: () => void
  onDeployedChange: (n: number) => void
  onApply: (s: LineupSuggestion) => void
  onDismiss: (s: LineupSuggestion) => void
  onRestoreDismissed: () => void
  onBuild: (focus: Focus) => void
  onArtChange: (art: ArtVariant) => void
  egos: Ego[]
  loadout: EgoLoadout
  onLoadoutChange: (l: EgoLoadout) => void
  battle: BattleProfile
}

/**
 * The formation screen: every sinner's current identity as a card. Click a card
 * to add it to the lineup (it gets the next number, like in game) or to take it
 * out; ⇄ swaps the identity. Suggestions for the order appear on the side;
 * nothing moves unless you press Move.
 */
export function TeamTab(props: Props) {
  const { identities, equipped, selection, deployed, art, suggestions, onToggle, onClear, onSelectAll, onDeployedChange } = props
  const [picking, setPicking] = useState<Sinner | null>(null)
  const deployedIds = selection.slice(0, deployed).map((s) => equipped[s])
  const suggestedFor = new Map(suggestions.map((s) => [s.sinner, s]))

  const sinCounts = useMemo(() => {
    const counts = Object.fromEntries(SIN_ORDER.map((s) => [s, 0])) as Record<Sin, number>
    for (const i of deployedIds) for (const a of i.affinities) counts[a]++
    return counts
  }, [deployedIds])
  const keywordCounts = CORE_KEYWORDS
    .map((k) => ({ k, n: deployedIds.filter((i) => i.keywords.includes(k)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)

  return (
    <div className="formation">
      <div className="formation-main">
        <div className="formation-toolbar">
          <span className="muted small">Click identities in the order you want them deployed, like in game. ⇄ swaps an identity.</span>
          <div className="seg" role="group" aria-label="Card art">
            <button className={art === 'uptie' ? 'seg-btn on' : 'seg-btn'} aria-pressed={art === 'uptie'} onClick={() => props.onArtChange('uptie')}
              title="The art identities get at Uptie III (threadspinning). Used on every tab.">Threadspun art</button>
            <button className={art === 'base' ? 'seg-btn on' : 'seg-btn'} aria-pressed={art === 'base'} onClick={() => props.onArtChange('base')}
              title="The art identities have before Uptie III. Used on every tab.">Base art</button>
          </div>
        </div>
        <ol className="card-grid" aria-label="Sinners">
          {SINNERS.map((s) => {
            const i = equipped[s]
            const k = selection.indexOf(s)
            const sug = suggestedFor.get(s)
            return (
              <li key={s}>
                <IdentityCard identity={i} slot={k} isDeployed={k >= 0 && k < deployed} art={art}
                  suggestion={sug ? `→ #${sug.to + 1}` : undefined}
                  onToggle={() => onToggle(s)} onSwap={() => setPicking(s)} />
              </li>
            )
          })}
        </ol>
        <EgoLoadoutPanel egos={props.egos} loadout={props.loadout} onChange={props.onLoadoutChange}
          selection={selection} deployed={deployed} battle={props.battle} />
      </div>

      <aside className="formation-side">
        <SuggestionBox {...props} />

        <section className="side-box">
          <h3>Affinities <span className="muted small">(deployed)</span></h3>
          <ul className="affinity-list">
            {SIN_ORDER.map((sin) => (
              <li key={sin} className={sinCounts[sin] ? '' : 'none'}>
                <span className={`sin sin-${sin}`} aria-hidden="true" />
                <span className="affinity-name">{sin[0].toUpperCase() + sin.slice(1)}</span>
                <span className="affinity-count">×{sinCounts[sin]}</span>
              </li>
            ))}
          </ul>
          {keywordCounts.length > 0 && (
            <p className="side-keywords">
              {keywordCounts.map(({ k, n }) => <span key={k}><KeywordChip keyword={k} /> {n}</span>)}
            </p>
          )}
        </section>

        <section className="side-box">
          <div className="participants">
            <span>Total participants</span>
            <strong>{selection.length}/12</strong>
          </div>
          <label className="deployed-pick">
            Deployed
            <select value={deployed} onChange={(e) => onDeployedChange(Number(e.target.value))} aria-label="Deployed sinners">
              {[5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="side-actions">
            <button className="btn" onClick={onClear} disabled={!selection.length}>⟲ Clear selection</button>
            <button className="btn" onClick={onSelectAll} disabled={selection.length === 12}>Select all</button>
          </div>
        </section>

        <BuildBox identities={identities} onBuild={props.onBuild} />
      </aside>

      {picking && (
        <IdentityPicker sinner={picking} identities={identities.filter((i) => i.sinner === picking)}
          current={equipped[picking]} art={art}
          onPick={(id) => { props.onEquip(picking, id); setPicking(null) }} onClose={() => setPicking(null)} />
      )}
    </div>
  )
}

function SuggestionBox({ suggestions, info, dismissedCount, onApply, onDismiss, onRestoreDismissed, selection }: Props) {
  return (
    <section className="side-box suggestions" aria-live="polite">
      <h3>Lineup suggestions {suggestions.length > 0 && <span className="badge">{suggestions.length}</span>}</h3>
      {!selection.length ? (
        <p className="hint small">Pick your team to get suggestions for its order.</p>
      ) : suggestions.length === 0 ? (
        <p className="hint small">
          Nothing to change right now. Suggestions appear as you pick up gifts for certain slots, or when an
          identity's skills care about where it or its allies sit.
        </p>
      ) : (
        <ul className="suggestion-list">
          {suggestions.map((s) => (
            <li key={s.id} className={`suggestion suggestion-${s.source}`}>
              <div className="suggestion-title">{s.title}</div>
              <p className="suggestion-reason">{s.reason}</p>
              {(s.quote || s.detail) && (
                <details className="suggestion-quote">
                  <summary>Why{s.quote ? ` · ${s.quote.from}` : ''}</summary>
                  {s.detail && <p className="suggestion-detail">{s.detail}</p>}
                  {s.quote && <blockquote>{s.quote.text}</blockquote>}
                </details>
              )}
              <div className="suggestion-actions">
                <span className={`source-tag source-${s.source}`}>{SOURCE[s.source]}</span>
                <button className="link-btn" onClick={() => onDismiss(s)}>Dismiss</button>
                <button className="btn primary small-btn" onClick={() => onApply(s)}>Move</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {dismissedCount > 0 && (
        <button className="link-btn small" onClick={onRestoreDismissed}>Show {dismissedCount} dismissed</button>
      )}
      {info.length > 0 && (
        <details className="position-info">
          <summary>Position effects on your team ({info.length})</summary>
          <ul>
            {info.map((x) => (
              <li key={x.id}>
                <span>{x.title}</span>
                <blockquote>{x.quote.text}</blockquote>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

const SOURCE = { gift: 'Your gift', identity: 'Skill text', tip: 'Player tip' }

function IdentityCard({ identity: i, slot, isDeployed, art, suggestion, onToggle, onSwap }: {
  identity: Identity; slot: number; isDeployed: boolean; art: ArtVariant; suggestion?: string
  onToggle: () => void; onSwap: () => void
}) {
  const selected = slot >= 0
  const role = identityTier(i).role
  return (
    <div className={`id-card rarity-${i.rarity ?? 1}${selected ? ' selected' : ''}${selected && !isDeployed ? ' backup' : ''}`}>
      <button className="id-card-main" onClick={onToggle} aria-pressed={selected}
        aria-label={`${selected ? 'Remove' : 'Add'} ${i.sinner}, ${shortName(i)}${selected ? ` (#${slot + 1})` : ''}`}>
        <Portrait identity={i} kind="art" variant={art} />
        {suggestion && <span className="id-card-suggest" title="There's a lineup suggestion for this sinner">{suggestion}</span>}
        <span className="id-card-info">
          <span className="id-card-name">{shortName(i)}</span>
          <span className="id-card-sinner">{i.sinner}{role ? <span className="id-card-role"> · {role}</span> : null}</span>
          <span className="id-card-kws">{i.keywords.map((k) => <KeywordChip key={k} keyword={k} />)}</span>
        </span>
        {selected && (
          <span className="id-card-selected">
            <span className="id-card-num">{slot + 1}</span>
            <span className="id-card-label">{isDeployed ? 'Selected' : 'Backup'}</span>
          </span>
        )}
      </button>
      <button className="id-card-swap" onClick={onSwap} title="Change identity" aria-label={`Change ${i.sinner}'s identity`}>
        <span className="id-card-rarity" aria-hidden="true">{'0'.repeat(i.rarity ?? 1)}</span>
        <span className="id-card-swap-label"><span aria-hidden="true">⇄</span> Swap</span>
      </button>
    </div>
  )
}

function IdentityPicker({ sinner, identities, current, art, onPick, onClose }: {
  sinner: Sinner; identities: Identity[]; current: Identity; art: ArtVariant
  onPick: (id: string) => void; onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // Like the game: 000 first, then 00, then 0; alphabetical within each.
  const groups = [3, 2, 1].map((r) => ({
    rarity: r,
    list: identities.filter((i) => (i.rarity ?? 1) === r).sort((a, b) => shortName(a).localeCompare(shortName(b))),
  })).filter((g) => g.list.length)

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" role="dialog" aria-modal="true" aria-label={`Choose ${sinner}'s identity`} onClick={(e) => e.stopPropagation()}>
        <header className="picker-head">
          <h2>{sinner}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="picker-scroll">
          {groups.map((g) => (
            <section key={g.rarity} className="picker-group">
              <h3 className={`picker-group-head rarity-${g.rarity}`}>{'0'.repeat(g.rarity)} <span className="muted small">{g.list.length}</span></h3>
              <ul className="picker-list">
                {g.list.map((i) => {
                  const role = identityTier(i).role
                  return (
                    <li key={i.id}>
                      <button className={i.id === current.id ? 'picker-item current' : 'picker-item'} onClick={() => onPick(i.id)}>
                        <Portrait identity={i} kind="profile" variant={art} />
                        <span className="picker-text">
                          <span className="picker-name">{shortName(i)}</span>
                          <span className="picker-meta">
                            {role && <span className="muted small">{role}</span>}
                            {i.keywords.map((k) => <KeywordChip key={k} keyword={k} />)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function BuildBox({ identities, onBuild }: { identities: Identity[]; onBuild: (f: Focus) => void }) {
  const traits = useMemo(() => traitOptions(identities), [identities])
  const [focus, setFocus] = useState('')
  return (
    <section className="side-box">
      <h3>Build a team</h3>
      <p className="hint small">
        Picks an identity per sinner for a keyword or affiliation and a starting order for all 12. It doesn't know
        which identities you own.
      </p>
      <select aria-label="Build around" value={focus} onChange={(e) => setFocus(e.target.value)}>
        <option value="">Build around…</option>
        <optgroup label="Keyword">
          {CORE_KEYWORDS.map((k) => <option key={k} value={focusKey({ kind: 'keyword', value: k })}>{k}</option>)}
        </optgroup>
        <optgroup label="Affiliation">
          {traits.map((t) => (
            <option key={t.name} value={focusKey({ kind: 'trait', value: t.name })}>{t.name} ({t.sinners} sinners)</option>
          ))}
        </optgroup>
      </select>
      <button className="btn" disabled={!parseFocus(focus)} onClick={() => { const f = parseFocus(focus); if (f) onBuild(f) }}>
        Build team
      </button>
    </section>
  )
}
