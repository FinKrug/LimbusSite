import { GRADES, type BattleProfile, type Ego, type EgoLoadout as Loadout, type Grade } from '../lib/ego'
import { SINS, type Sinner } from '../lib/types'
import { SinDot } from './bits'

interface Props {
  egos: Ego[]
  loadout: Loadout
  onChange: (l: Loadout) => void
  selection: Sinner[]
  deployed: number
  battle: BattleProfile
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
export function EgoLoadoutPanel({ egos, loadout, onChange, selection, deployed, battle }: Props) {
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
                    return (
                      <td key={g}>
                        <select value={current} onChange={(e) => set(s, g, e.target.value)} disabled={!options.length}
                          aria-label={`${s} ${g} E.G.O`} title={picked ? `${picked.name}: ${costText(picked)}${picked.sanity ? ` · ${picked.sanity} SP` : ''}` : undefined}
                          className={picked?.sin ? `sinborder-${picked.sin}` : undefined}>
                          {!base && <option value="">{options.length ? '—' : 'none'}</option>}
                          {options.map((e) => <option key={e.id} value={e.id}>{e.name}{e.base ? ' (base)' : ''}</option>)}
                        </select>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ego.uses.some((u) => u.estimated) && (
        <p className="muted small">Some costs weren't on the wiki page; typical costs for their grade are used.</p>
      )}
    </section>
  )
}
