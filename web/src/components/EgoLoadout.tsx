import { useMemo, useState } from 'react'
import { GRADES, egoGiftInfo, type BattleProfile, type Ego, type EgoLoadout as Loadout, type Grade } from '../lib/ego'
import { applyRecs, recommendEgos, type EgoRec } from '../lib/egorec'
import { SINS, type Gift, type Identity, type Sinner } from '../lib/types'
import { SinDot } from './bits'

interface Props {
  egos: Ego[]
  loadout: Loadout
  onChange: (l: Loadout) => void
  selection: Sinner[]
  deployed: number
  /** The deployed identities, in order (same order as `battle`). */
  members: Identity[]
  battle: BattleProfile
  /** All gifts and the ones you own, to name gifts that make E.G.O resources. */
  gifts: Gift[]
  owned: Set<string>
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A sin -> amount cost as "Wrath 1 · Sloth 3". */
function costText(e: Ego): string {
  if (!e.cost) return 'cost unknown'
  return SINS.filter((s) => e.cost![s]).map((s) => `${cap(s)} ${e.cost![s]}`).join(' · ')
}

/**
 * The E.G.O each sinner has equipped, one per grade like in game. Only the
 * deployed sinners' E.G.O count; they decide how much the team leans on E.G.O,
 * which moves E.G.O gifts and skill swaps.
 */
export function EgoLoadoutPanel({ egos, loadout, onChange, selection, deployed, members, battle, gifts, owned }: Props) {
  const { ego, sim } = battle
  const set = (s: Sinner, g: Grade, id: string) => {
    const mine = { ...(loadout[s] ?? {}) }
    if (id) mine[g] = id
    else delete mine[g]
    onChange({ ...loadout, [s]: mine })
  }
  const lean = ego.lean >= 0.55 ? 'High' : ego.lean < 0.35 ? 'Low' : 'Medium'
  const best = ego.bestAreson
  const sinners = selection.slice(0, deployed)
  const recs = useMemo(() => recommendEgos(members, egos, loadout, battle, gifts, owned), [members, egos, loadout, battle, gifts, owned])
  const suggested = recs.filter((r) => r.better)
  const listed = recs.filter((r) => r.better || r.upgrade)
  const recFor = (s: Sinner, g: Grade) => suggested.find((r) => r.sinner === s && r.grade === g)
  const take = (r: EgoRec) => set(r.sinner, r.grade, r.best.ego.id)
  const [showAll, setShowAll] = useState(false)
  const SHOWN = 4

  return (
    <section className="panel ego-panel">
      <header className="ego-head">
        <h2>E.G.O loadout</h2>
        <p className="muted small">
          Pick the E.G.O each deployed sinner has equipped (ZAYIN starts on their base E.G.O, like in game). Skills make E.G.O resources of their sin, so this decides
          how often your E.G.O can come out, and how much E.G.O gifts and skill swaps are worth.
        </p>
      </header>
      {selection.length > 0 && (
        <ul className="ego-stats">
          <li>
            <span className="muted small">E.G.O lean</span>
            <b className={`lean lean-${lean.toLowerCase()}`}>{lean}</b>
            <span className="muted small">
              {ego.known ? `E.G.O on about ${Math.round(ego.share * 100)}% of turns` : 'no E.G.O picked yet'}
              {ego.egoGifts.length > 0 && ` · ${ego.egoGifts.length} E.G.O gift${ego.egoGifts.length > 1 ? 's' : ''}`}
            </span>
          </li>
          <li>
            <span className="muted small">Absolute Resonance</span>
            <b>{best.sin ? <><SinDot sin={best.sin} /> {cap(best.sin)} {Math.round(best.share * 100)}%</> : 'rare'}</b>
            <span className="muted small">of turns · any sin {Math.round(sim.anyAreson * 100)}%</span>
          </li>
          <li>
            <span className="muted small">Resources per turn</span>
            <span className="ego-gen">
              {SINS.filter((s) => ego.gen[s] >= 0.05).sort((a, b) => ego.gen[b] - ego.gen[a]).map((s) => (
                <span key={s}><SinDot sin={s} />{ego.gen[s].toFixed(1)}</span>
              ))}
            </span>
          </li>
        </ul>
      )}
      {egos.length === 0 ? (
        <p className="hint small">
          No E.G.O data yet. Run <code>python -m scraper</code> once (it fetches the E.G.O pages into
          <code> data/egos.json</code>), then reload.
        </p>
      ) : sinners.length === 0 ? (
        <p className="hint small">Pick your team above to set its E.G.O.</p>
      ) : (
        <>
        {listed.length > 0 && (
          <section className="ego-recs" aria-label="Suggested E.G.O">
            <header className="ego-recs-head">
              <h3>Suggested E.G.O {suggested.length > 0 && <span className="badge">{suggested.length}</span>}</h3>
              {suggested.length > 0 && (
                <button className="btn primary small-btn" onClick={() => onChange(applyRecs(loadout, recs))}>Equip all</button>
              )}
            </header>
            <p className="muted small">
              Based on your team's keywords and the sins its skills make E.G.O resources of. It doesn't know which
              E.G.O you own.
            </p>
            <ul className="ego-rec-list">
              {(showAll ? listed : listed.slice(0, SHOWN)).map((r) => (
                <li key={`${r.sinner}-${r.grade}`}>
                  {r.better ? (
                    <>
                      <div className="ego-rec-title">
                        <span><b>{r.sinner}</b> <span className="muted small">{r.grade}</span></span>
                        <span className="ego-rec-swap">
                          {r.current ? <span className="muted">{r.current.ego.name}</span> : <span className="muted">empty</span>}
                          {' → '}
                          {r.best.ego.sin && <SinDot sin={r.best.ego.sin} />} <b>{r.best.ego.name}</b>
                        </span>
                        <button className="link-btn" onClick={() => take(r)}>Equip</button>
                      </div>
                      <ul className="ego-rec-reasons small">
                        {r.best.reasons.map((x) => <li key={x}>{x}</li>)}
                        {r.current?.short && !r.best.short && (
                          <li>{r.current.ego.name} is short on {cap(r.current.short.sin)}</li>
                        )}
                      </ul>
                    </>
                  ) : (
                    <div className="ego-rec-title">
                      <span><b>{r.sinner}</b> <span className="muted small">{r.grade}</span></span>
                      <span className="muted small">
                        {r.upgrade && r.current?.ego.id === r.upgrade.pick.ego.id
                          ? `${r.current.ego.name} equipped: take resource gifts so it can come out`
                          : r.current ? `${r.current.ego.name} is the best your team can pay for` : 'nothing affordable yet'}
                      </span>
                    </div>
                  )}
                  {r.upgrade && <UpgradeNote rec={r} onEquip={() => set(r.sinner, r.grade, r.upgrade!.pick.ego.id)} />}
                </li>
              ))}
            </ul>
            {listed.length > SHOWN && (
              <button className="link-btn small" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Show fewer' : `Show ${listed.length - SHOWN} more`}
              </button>
            )}
          </section>
        )}
        <div className="ego-table-wrap">
          <table className="ego-table">
            <thead>
              <tr><th>Sinner</th>{GRADES.map((g) => <th key={g}>{g}</th>)}</tr>
            </thead>
            <tbody>
              {sinners.map((s) => (
                <tr key={s}>
                  <th scope="row">{s}</th>
                  {GRADES.map((g) => {
                    const options = egos.filter((e) => e.sinner === s && e.grade === g)
                    const base = g === 'ZAYIN' ? options.find((e) => e.base) : undefined
                    const current = loadout[s]?.[g] ?? base?.id ?? ''
                    const picked = options.find((e) => e.id === current)
                    const rec = recFor(s, g)
                    return (
                      <td key={g} className={rec ? 'ego-suggest' : undefined}>
                        <select value={current} onChange={(e) => set(s, g, e.target.value)} disabled={!options.length}
                          aria-label={`${s} ${g} E.G.O`} title={picked ? `${picked.name}: ${costText(picked)}${picked.sanity ? ` · ${picked.sanity} SP` : ''}` : undefined}
                          className={picked?.sin ? `sinborder-${picked.sin}` : undefined}>
                          {!base && <option value="">{options.length ? '—' : 'none'}</option>}
                          {options.map((e) => <option key={e.id} value={e.id}>{e.name}{e.base ? ' (base)' : ''}</option>)}
                        </select>
                        {rec && (
                          <button className="ego-rec-chip" onClick={() => take(rec)} title={rec.best.reasons.join('\n')}>
                            ★ {rec.best.ego.name}
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {ego.uses.some((u) => u.estimated) && (
        <p className="muted small">Some costs weren't on the wiki page; typical costs for their grade are used.</p>
      )}
    </section>
  )
}

/** A stronger E.G.O for the slot that only needs resources, and gifts that make them. */
function UpgradeNote({ rec, onEquip }: { rec: EgoRec; onEquip: () => void }) {
  const u = rec.upgrade!
  const sins = u.sins.map(cap).join(' and ')
  // resourceGifts lists gifts naming the sin first, then random ones.
  const shown = u.gifts.slice(0, 3).map((g) => {
    const named = egoGiftInfo(g).resourceSins.filter((x) => u.sins.includes(x))
    return `${g.name} (${named.length ? named.map(cap).join('/') : 'random'})`
  })
  return (
    <div className="ego-upgrade small">
      <span className="ego-upgrade-tag">With resource gifts</span>{' '}
      {u.pick.ego.sin && <SinDot sin={u.pick.ego.sin} />} <b>{u.pick.ego.name}</b> is stronger
      {u.pick.fits.length > 0 && <> and inflicts {u.pick.fits.join(', ')}</>}, but your team makes too little {sins}.
      Gifts that make those resources: {shown.join(', ')}
      {u.gifts.length > shown.length && ` and ${u.gifts.length - shown.length} more`} (marked in Best gifts).{' '}
      {rec.current?.ego.id !== u.pick.ego.id && <button className="link-btn" onClick={onEquip}>Equip anyway</button>}
    </div>
  )
}
