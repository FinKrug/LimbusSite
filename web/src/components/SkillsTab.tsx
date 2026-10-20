import { useMemo, useState } from 'react'
import type { ArtVariant } from '../lib/images'
import { SWAPS, floorsWeight, multiTarget, planSwaps, teamSins, type SwapKind, type SwapState } from '../lib/skillswap'
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
const DEF_KIND = { guard: 'Guard', evade: 'Evade', counter: 'Counter' } as const

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
  // The swap you last marked done from the recommendation, per identity, so it can be undone in one click.
  const [justDid, setJustDid] = useState<Record<string, SwapKind>>({})
  const didIt = (id: string, kind: SwapKind) => {
    record(id, kind, 1)
    setJustDid({ ...justDid, [id]: kind })
  }
  const undo = (id: string) => {
    const kind = justDid[id]
    if (!kind) return
    record(id, kind, -1)
    const rest = { ...justDid }
    delete rest[id]
    setJustDid(rest)
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
          Defense skills count too: when a hand skill is a sin short of a chain (above all one a gift you
          own triggers on), the model puts a unit's defense skill in instead; the % on each Def row is how often.
          Skill 3 is the default pick, since it's the strongest skill. A swap into Skill 2 is only suggested when it
          gives something Skill 3 doesn't: hitting several targets when nothing else on your team does, or the
          Resonance a gift you own triggers on, if that part of the gift matters (a part that only adds more of a
          status your team already has plenty of, like Crown of Roses' extra Rupture, doesn't count). {floorsLeft} floor{floorsLeft === 1 ? '' : 's'} left.
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
                      <span className="skill-title">
                        <span className="skill-title-name">{s.name}</span>
                        {multiTarget(s) && (
                          <span className="skill-aoe" title={(s.weight ?? 1) > 1 ? `Atk Weight ${s.weight}: hits up to ${s.weight} targets` : `Its text can add Atk Weight +${s.weight_bonus} (usually under a condition)`}>
                            {(s.weight ?? 1) > 1 ? `${s.weight} targets` : `+${s.weight_bonus} targets`}
                          </span>
                        )}
                      </span>
                      <span className="muted small">{s.base ?? '?'}{(s.coin_power ?? 0) >= 0 ? '+' : ''}{s.coin_power ?? '?'} ×{s.coins ?? '?'}</span>
                      <span className="skill-copies" title="Copies in the deck">×{p.deck[s.slot]}</span>
                    </li>
                  ))}
                  {p.defense && (
                    <li className={`skill-row skill-def sinborder-${p.defense.sin ?? 'none'}`}
                      title="Defense skill: not in the deck. You can use it in any slot instead of a hand skill, and it counts for Resonance.">
                      <span className="skill-slot">Def</span>
                      <SinDot sin={p.defense.sin} />
                      <span className="skill-title">
                        <span className="skill-title-name">{p.defense.name}</span>
                        <span className="skill-aoe">{DEF_KIND[p.defense.kind]}</span>
                      </span>
                      <span className="muted small">{p.defense.base ?? '?'}{(p.defense.coin_power ?? 0) >= 0 ? '+' : ''}{p.defense.coin_power ?? '?'} ×{p.defense.coins ?? '?'}</span>
                      <span className="skill-copies" title="Turns it fills a Resonance chain instead of a hand skill (battle model)">
                        {p.defenseUse >= 0.005 ? `${Math.round(p.defenseUse * 100)}%` : '–'}
                      </span>
                    </li>
                  )}
                </ul>
                {justDid[p.identity.id] && (swaps[p.identity.id]?.[justDid[p.identity.id]] ?? 0) > 0 && (
                  <p className="muted small skill-did-note">
                    Recorded {LABEL[justDid[p.identity.id]]}. <button className="link-btn" onClick={() => undo(p.identity.id)}>Undo</button>
                  </p>
                )}
                {p.best ? (
                  <div className="skill-best">
                    <div className="skill-best-head">
                      <span><b>If offered:</b> {LABEL[p.best.kind]} <span className="muted small">({p.best.cost} Cost · {gainText(p.best.gain)} team damage)</span></span>
                      <button className="btn small-btn" title="Record this swap; the advice updates for what's left" onClick={() => didIt(p.identity.id, p.best!.kind)}>I did this</button>
                    </div>
                    <ul className="reasons">
                      {p.best.pros.map((t) => <li key={t} className="reason reason-good"><span className="reason-icon">+</span>{t}</li>)}
                      {p.best.cons.map((t) => <li key={t} className="reason reason-bad"><span className="reason-icon">−</span>{t}</li>)}
                    </ul>
                  </div>
                ) : p.spare ? (
                  <div className="skill-best skill-spare">
                    <div className="skill-best-head">
                      <span>
                        <b>If you have Cost to spare:</b> {LABEL[p.spare.kind]}{' '}
                        <span className="muted small">({p.spare.cost} Cost · {gainText(p.spare.gain)} team damage)</span>
                      </span>
                      <button className="btn small-btn" title="Record this swap; the advice updates for what's left" onClick={() => didIt(p.identity.id, p.spare!.kind)}>I did this</button>
                    </div>
                    <ul className="reasons">
                      {p.spare.pros.slice(0, 2).map((t) => <li key={t} className="reason reason-good"><span className="reason-icon">+</span>{t}</li>)}
                      {p.spare.cons.slice(0, 1).map((t) => <li key={t} className="reason reason-bad"><span className="reason-icon">−</span>{t}</li>)}
                    </ul>
                    <p className="muted small">A small gain for the Cost, but it doesn't hurt your team.</p>
                  </div>
                ) : p.options.length ? (
                  <p className="muted small skill-best">
                    Skip it: every swap would hurt your team{p.options[0].cons[0] ? ` (${p.options[0].cons[0]})` : ''}.
                  </p>
                ) : (
                  <p className="muted small skill-best">Nothing left to swap.</p>
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
