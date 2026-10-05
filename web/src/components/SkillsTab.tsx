import { useMemo } from 'react'
import type { ArtVariant } from '../lib/images'
import { SWAPS, SWAP_WEIGHTS, floorsWeight, planSwaps, teamSins, type SwapKind, type SwapState } from '../lib/skillswap'
import type { BattleProfile, Ego, EgoLoadout } from '../lib/ego'
import type { RunSettings } from '../lib/scoring'
import type { Gift, Identity, Sin } from '../lib/types'
import { Portrait } from './Portrait'
import { KeywordChip, SinDot } from './bits'

interface Props {
  team: Identity[]
  swaps: SwapState
  onSwapsChange: (s: SwapState) => void
  owned: Gift[]
  art: ArtVariant
  egos: Ego[]
  loadout: EgoLoadout
  run: RunSettings
  battle: BattleProfile
  onOpenTeam: () => void
}

const SIN_ORDER: Sin[] = ['wrath', 'lust', 'sloth', 'gluttony', 'gloom', 'pride', 'envy']
const gainText = (g: number) => `${g >= 0 ? '+' : ''}${(g * 100).toFixed(1)}%`
const LABEL: Record<SwapKind, string> = { '1to2': 'S1 → S2', '2to3': 'S2 → S3', '1to3': 'S1 → S3' }

/**
 * Skill Replacement planner: for each deployed identity, which swap to buy when a
 * shop offers that sinner, and a record of the swaps you've made this run.
 */
export function SkillsTab({ team, swaps, onSwapsChange, owned, art, egos, loadout, run, battle, onOpenTeam }: Props) {
  const plans = useMemo(() => planSwaps(team, swaps, owned, { egos, loadout, run }), [team, swaps, owned, egos, loadout, run])
  const { floorsLeft } = floorsWeight(run)
  const { ego, sim } = battle
  const lean = ego.lean >= 0.55 ? 'high' : ego.lean < 0.35 ? 'low' : 'medium'
  const sins = useMemo(() => teamSins(team, swaps), [team, swaps])
  const total = [...sins.values()].reduce((a, b) => a + b, 0) || 1
  const record = (id: string, kind: SwapKind, delta: number) => {
    const log = { ...(swaps[id] ?? {}) }
    log[kind] = Math.max(0, (log[kind] ?? 0) + delta)
    onSwapsChange({ ...swaps, [id]: log })
  }
  const anyDone = Object.values(swaps).some((l) => Object.values(l).some((n) => (n ?? 0) > 0))

  if (!team.length) return <div className="empty">Pick your team on the Team tab to plan skill swaps.</div>

  return (
    <div className="skills-tab">
      <section className="panel skills-intro">
        <p>
          Shops can replace one copy of a skill with a stronger one: <b>S1 → S2</b> 45 Cost, <b>S2 → S3</b> 75, <b>S1 → S3</b> 120.
          A regular shop offers this for a random sinner; a Super Shop's ID Skill Search lets you choose (90 / 150 / 240).
          When a shop offers someone, do the swap shown on their card, then press <b>Did it</b> so the plan updates.
        </p>
        <div className="sin-bar" aria-label="Your team's skills by sin">
          {SIN_ORDER.filter((s) => sins.get(s)).map((s) => (
            <span key={s} className={`sin-seg sinbg-${s}`} style={{ flexGrow: sins.get(s) }} title={`${s}: ${sins.get(s)} skills`}>
              <SinDot sin={s} /> {sins.get(s)}
            </span>
          ))}
        </div>
        <p className="muted small">Skills in your deployed decks by sin ({total}).</p>
        <p className="small">
          Each swap is played out: your team takes a few hundred turns with and without it, picking the best skills each
          turn and lining up same-sin skills for Resonance. The gain counts the stronger skill, Resonance
          (Absolute Resonance {sim.anyAreson ? `on ${Math.round(sim.anyAreson * 100)}% of turns now` : 'rare right now'})
          and what your E.G.O can afford (E.G.O lean {lean}{ego.known ? '' : <>, <button className="link-btn" onClick={onOpenTeam}>pick your E.G.O</button></>}).
          Worth it = at least +{SWAP_WEIGHTS.worth}% team damage per 100 Cost, less with fewer floors left ({floorsLeft} now).
        </p>
        {anyDone && <button className="link-btn" onClick={() => onSwapsChange({})}>Reset all swaps (new run)</button>}
      </section>

      <ol className="skill-cards">
        {plans.map((p) => (
          <li key={p.identity.id} className="card skill-card">
            <header className="skill-head">
              <Portrait identity={p.identity} kind="profile" variant={art} />
              <div>
                <div className="skill-name">{p.identity.sinner}</div>
                <div className="muted small">{p.identity.name}</div>
                <div className="kw-row">{p.identity.keywords.map((k) => <KeywordChip key={k} keyword={k} />)}</div>
              </div>
            </header>
            {p.skills.length < 3 ? (
              <p className="muted small">No skill data for this identity yet.</p>
            ) : (
              <>
                <ul className="skill-deck">
                  {p.skills.map((s) => (
                    <li key={s.slot} className={`skill-row sinborder-${s.sin ?? 'none'}`}>
                      <span className="skill-slot">S{s.slot}</span>
                      <SinDot sin={s.sin} />
                      <span className="skill-title">{s.name}</span>
                      <span className="muted small">{s.base ?? '?'}{(s.coin_power ?? 0) >= 0 ? '+' : ''}{s.coin_power ?? '?'} ×{s.coins ?? '?'}</span>
                      <span className="skill-copies" title="Copies in the deck">×{p.deck[s.slot]}</span>
                    </li>
                  ))}
                </ul>
                {p.best ? (
                  <div className="skill-best">
                    <div><b>If offered:</b> {LABEL[p.best.kind]} <span className="muted small">({p.best.cost} Cost · {gainText(p.best.gain)} team damage)</span></div>
                    <ul className="reasons">
                      {p.best.pros.map((t) => <li key={t} className="reason reason-good"><span className="reason-icon">+</span>{t}</li>)}
                      {p.best.cons.map((t) => <li key={t} className="reason reason-bad"><span className="reason-icon">−</span>{t}</li>)}
                    </ul>
                  </div>
                ) : (
                  <p className="muted small skill-best">No swap is worth the Cost for this identity right now.</p>
                )}
                <details>
                  <summary>All swaps and your record</summary>
                  <ul className="skill-options">
                    {SWAPS.map((sw) => {
                      const o = p.options.find((x) => x.kind === sw.kind)
                      const done = swaps[p.identity.id]?.[sw.kind] ?? 0
                      return (
                        <li key={sw.kind}>
                          <span className="skill-opt-label">{LABEL[sw.kind]}</span>
                          <span className={o?.worth ? 'reason-good small' : 'muted small'}>
                            {o ? `${o.worth ? 'worth it' : 'not worth it'} · ${gainText(o.gain)}` : 'nothing left to swap'}
                          </span>
                          <span className="skill-done">
                            <button className="vestige-btn" aria-label={`Undo ${LABEL[sw.kind]}`} disabled={!done} onClick={() => record(p.identity.id, sw.kind, -1)}>−</button>
                            <span>{done}</span>
                            <button className="btn small-btn" disabled={!o} onClick={() => record(p.identity.id, sw.kind, 1)}>Did it</button>
                          </span>
                          {o && o.cons.length > 0 && <span className="muted small skill-opt-why">{o.cons[0]}</span>}
                        </li>
                      )
                    })}
                  </ul>
                </details>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
