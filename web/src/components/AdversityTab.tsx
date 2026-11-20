import { useMemo, useState } from 'react'
import {
  FAMILY_ACHIEVEMENTS, FIRST_OFFER, LAST_FLOOR, PR_CAP, RUN_PR, SCORE_ACHIEVEMENTS, hasAdversities, normalizeAdversity, offerKey,
  planAdversities, prPointsLeft, readTeam, scoreAchievementId, ADVERSITIES,
  type AdversityState, type OfferAdvice, type Plan, type Risk, type Verdict,
} from '../lib/adversity'
import type { RunContext, RunSettings } from '../lib/scoring'

const RISKS: { id: Risk; label: string; hint: string }[] = [
  { id: 'safe', label: 'Safe', hint: 'Only the cheapest points: you want the clear.' },
  { id: 'balanced', label: 'Balanced', hint: 'Points where your team can afford them.' },
  { id: 'push', label: 'Push', hint: 'More points, a real chance of losing the run.' },
]

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  take: { label: 'Take', cls: 'verdict-go' },
  maybe: { label: 'Maybe', cls: 'verdict-maybe' },
  skip: { label: 'Skip', cls: 'verdict-skip' },
  taken: { label: 'Taken', cls: 'verdict-taken' },
}

/**
 * Parallel Superposition EXTREME (PRO150 requirement 4): after clearing each of floors 10–14 the
 * game offers that floor's adversities. This screen shows the floor's offer as cards, like in game,
 * each with Take / Maybe / Skip for your team and why, a plan for the floors still to come
 * (Level Boost 0–5 and so on), and what the plan earns: Starlight, Projection Rate (weekly cap)
 * and achievements. "I took it" records what you picked; it's cleared with the run.
 */
export function AdversityTab({ ctx, run, state: stored, onStateChange, onRunChange, onOpenTeam }: {
  ctx: RunContext
  run: RunSettings
  state: AdversityState
  onStateChange: (s: AdversityState) => void
  onRunChange: (run: RunSettings) => void
  onOpenTeam: () => void
}) {
  const state = useMemo(() => normalizeAdversity(stored), [stored])
  const team = useMemo(() => readTeam(ctx), [ctx])
  const plan = useMemo(() => planAdversities(team, state, run.floor), [team, state, run.floor])
  const enabled = hasAdversities(run)
  const inRun = run.floor !== null
  // You can record what you took once you've reached floor 10 in an EXTREME run.
  const canTake = enabled && inRun && run.floor! >= FIRST_OFFER
  const set = (patch: Partial<AdversityState>) => onStateChange({ ...state, ...patch })
  const toggle = (key: string) => set({ taken: state.taken.includes(key) ? state.taken.filter((k) => k !== key) : [...state.taken, key] })

  const now = plan.nextFloor === null ? [] : plan.offers.filter((o) => o.adversity.floor === plan.nextFloor)
  const later = plan.nextFloor === null ? [] : [...new Set(plan.offers.map((o) => o.adversity.floor))].filter((f) => f > plan.nextFloor!)
  const earlier = plan.taken.filter((a) => plan.nextFloor === null || a.floor < plan.nextFloor)

  return (
    <div className="layout adv-layout">
      <aside className="side">
        <PlanSummary plan={plan} state={state} onChange={set} />
      </aside>
      <main className="main adv-main">
        <header className="adv-head">
          <h2>Parallel Superposition: adversities</h2>
          <p className="muted small">
            After clearing each of floors 10 to 14 of an EXTREME run, the game offers that floor's adversities. Each one you take stays
            for the rest of the run and adds its points: 15 Starlight and 15 Projection Rate each at the end. The later you take one,
            the fewer floors it hurts.
          </p>
        </header>

        {!enabled && (
          <div className="panel adv-note">
            <p className="hint">
              Adversities only come in a <b>15-floor EXTREME</b> run; this run is {run.floors} floors on {run.difficulty === 'extreme' ? 'EXTREME' : run.difficulty === 'hard' ? 'Hard' : 'Normal'}.
              Here's what the plan would be for your team.
            </p>
            {!inRun && (
              <button className="btn small-btn" onClick={() => onRunChange({ ...run, difficulty: 'extreme', floors: LAST_FLOOR, pack: null, visited: {} })}>
                Plan an EXTREME run
              </button>
            )}
          </div>
        )}
        {team.size === 0 && (
          <p className="panel hint">
            <button className="link-btn" onClick={onOpenTeam}>Pick your team</button> first: how much each adversity hurts depends on it.
          </p>
        )}

        {plan.nextFloor === null ? (
          <p className="panel hint">Floor {LAST_FLOOR} is the last: no adversities left to choose. Your points are added when the run ends.</p>
        ) : (
          <section className="adv-now" aria-labelledby="adv-now-h">
            <h3 id="adv-now-h" className="adv-floor-h">
              {canTake ? <>After clearing floor {plan.nextFloor}: choose</> : <>First offer: after floor {plan.nextFloor}</>}
              <span className="muted"> · on for {LAST_FLOOR - plan.nextFloor} floor{LAST_FLOOR - plan.nextFloor === 1 ? '' : 's'}</span>
            </h3>
            {!canTake && enabled && (
              <p className="muted small">When you reach floor {FIRST_OFFER}, mark the ones you take here and the plan adjusts.</p>
            )}
            <ul className="adv-cards">
              {now.map((o) => <OfferCard key={o.key} offer={o} canTake={canTake} onToggle={() => toggle(o.key)} />)}
            </ul>
          </section>
        )}

        {later.length > 0 && (
          <section className="panel adv-later">
            <h3>Later floors</h3>
            <p className="muted small">The plan for the rest of the run. It changes as you take adversities and your team changes.</p>
            <ul className="adv-floors">
              {later.map((f) => (
                <li key={f}>
                  <span className="adv-floor-n">After F{f}</span>
                  <span className="adv-chips">
                    {plan.offers.filter((o) => o.adversity.floor === f).map((o) => (
                      <span key={o.key} className={`adv-chip adv-chip-${o.verdict}`} title={`${VERDICT[o.verdict].label}: ${o.reason} ${o.why}`}>
                        {o.verdict === 'take' ? '✓ ' : ''}{o.adversity.name} <small>+{o.adversity.score}</small>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="muted small adv-legend">
              <span className="adv-chip adv-chip-take">✓ Take</span> <span className="adv-chip adv-chip-maybe">Maybe</span>{' '}
              <span className="adv-chip adv-chip-skip">Skip</span> · hover or tap-and-hold a name for why.
            </p>
          </section>
        )}

        {earlier.length > 0 && (
          <section className="panel adv-taken">
            <h3>Taken earlier this run</h3>
            <ul className="adv-chips">
              {earlier.map((a) => (
                <li key={offerKey(a)} className="adv-chip adv-chip-taken">
                  F{a.floor} {a.name} <small>+{a.score}</small>
                  <button className="link-btn" aria-label={`Remove ${a.name} (floor ${a.floor})`} onClick={() => toggle(offerKey(a))}>✕</button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}

function OfferCard({ offer, canTake, onToggle }: { offer: OfferAdvice; canTake: boolean; onToggle: () => void }) {
  const a = offer.adversity
  const v = VERDICT[offer.verdict]
  const taken = offer.verdict === 'taken'
  return (
    <li className={`adv-card adv-card-${offer.verdict}`}>
      <div className="adv-card-top">
        <b className="adv-name">{a.name}</b>
        <span className="adv-score" title="Adversity Score">+{a.score}</span>
      </div>
      <p className="adv-effect">{a.effect}</p>
      <div className="adv-verdict-row">
        <span className={`verdict ${v.cls}`}>{v.label}</span>
        <span className="adv-reason">{offer.reason}</span>
      </div>
      <p className="adv-why">{offer.why}</p>
      {canTake && (
        <button className={`btn small-btn adv-take${taken ? ' on' : ''}`} aria-pressed={taken} onClick={onToggle}>
          {taken ? '✓ Taken · undo' : 'I took it'}
        </button>
      )}
    </li>
  )
}

function PlanSummary({ plan, state, onChange }: { plan: Plan; state: AdversityState; onChange: (p: Partial<AdversityState>) => void }) {
  const r = plan.rewards
  const left = prPointsLeft(state)
  const usedPct = plan.budget > 0 ? Math.min(100, Math.round((plan.used / plan.budget) * 100)) : 0
  const [prText, setPrText] = useState(String(state.prBefore || ''))
  const achievementNames = useMemo(() => new Map(ADVERSITIES.map((a) => [a.family_id, a.family])), [])
  const doneSet = new Set(state.achievements)
  const toggleDone = (id: string) => onChange({ achievements: doneSet.has(id) ? state.achievements.filter((x) => x !== id) : [...state.achievements, id] })
  return (
    <section className="panel adv-summary" aria-label="Your adversity plan">
      <h2>Your plan</h2>
      <dl className="adv-totals">
        <div><dt>Adversity Score</dt><dd>{r.score}{plan.takenRewards.score > 0 && <small> ({plan.takenRewards.score} taken)</small>}</dd></div>
        <div><dt>Starlight</dt><dd>{r.starlight}</dd></div>
        <div>
          <dt>Projection Rate</dt>
          <dd>{state.wantPR ? <>{r.prFromScore}{r.prFromAchievements > 0 && <small> + {r.prFromAchievements} achievements</small>}</> : <small>not counted</small>}</dd>
        </div>
      </dl>
      {state.wantPR && r.pastCap > 0 && (
        <p className="muted small">
          {r.pastCap} point{r.pastCap === 1 ? '' : 's'} past this week's Projection Rate cap ({PR_CAP}): those earn Starlight only.
        </p>
      )}
      {state.wantPR && r.pastCap === 0 && (
        <p className="muted small">Up to {left} points still earn Projection Rate this week (the run's floors give {RUN_PR}).</p>
      )}

      <div className="adv-risk">
        <div className="adv-risk-head"><span>How hard the plan makes the run</span><b>{usedPct}%</b></div>
        <div className="adv-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPct} aria-label="Share of your risk budget used">
          <i style={{ width: `${usedPct}%` }} />
        </div>
        <div className="seg adv-risk-seg" role="radiogroup" aria-label="Risk">
          {RISKS.map((x) => (
            <button key={x.id} role="radio" aria-checked={state.risk === x.id} className={`seg-btn${state.risk === x.id ? ' on' : ''}`}
              onClick={() => onChange({ risk: x.id })}>{x.label}</button>
          ))}
        </div>
        <p className="muted small">
          {RISKS.find((x) => x.id === state.risk)!.hint}
          {plan.team.struggling && ' Struggling in fights is on, so it takes half as much.'}
        </p>
      </div>

      <h3 className="adv-sub">Levels</h3>
      <ul className="adv-levels">
        {plan.levels.map((l) => (
          <li key={l.family_id} className={l.planned ? '' : 'muted'}>
            <span>{l.family}</span>
            {l.tiered ? (
              <span className="adv-tier">{l.planned ? ['', 'I', 'II', 'III'][l.planned] : '–'}<small> / {['', 'I', 'II', 'III'][l.maxTier]}</small></span>
            ) : (
              <span className="adv-pips" aria-label={`${l.planned} of ${l.max}${l.taken ? `, ${l.taken} taken` : ''}`}>
                {Array.from({ length: l.max }, (_, k) => <i key={k} className={k < l.taken ? 'taken' : k < l.planned ? 'planned' : ''} />)}
                <small>{l.planned}/{l.max}</small>
              </span>
            )}
          </li>
        ))}
      </ul>

      <details className="adv-settings">
        <summary>Projection Rate and achievements</summary>
        <label className="adv-field">
          <span>Projection Rate you've already earned this week</span>
          <input type="number" min={0} max={PR_CAP} step={5} inputMode="numeric" value={prText} placeholder="0"
            onChange={(e) => {
              setPrText(e.target.value)
              const n = Number(e.target.value)
              if (e.target.value === '' || Number.isFinite(n)) onChange({ prBefore: Math.max(0, Math.min(PR_CAP, Math.round(n || 0))) })
            }} />
        </label>
        <label className="adv-check">
          <input type="checkbox" checked={state.wantPR} onChange={(e) => onChange({ wantPR: e.target.checked })} />
          <span>Projection Rate still matters to me (untick once you've claimed the season's rewards)</span>
        </label>
        <fieldset className="adv-achievements" disabled={!state.wantPR}>
          <legend className="muted small">Achievements you've already done this season</legend>
          {FAMILY_ACHIEVEMENTS.map((f) => (
            <label key={f} className="adv-check">
              <input type="checkbox" checked={doneSet.has(f)} onChange={() => toggleDone(f)} />
              <span>Cleared with {achievementNames.get(f) ?? f}</span>
            </label>
          ))}
          {SCORE_ACHIEVEMENTS.map((s) => (
            <label key={s.score} className="adv-check">
              <input type="checkbox" checked={doneSet.has(scoreAchievementId(s.score))} onChange={() => toggleDone(scoreAchievementId(s.score))} />
              <span>Cleared with {s.score}+ Adversity Score</span>
            </label>
          ))}
        </fieldset>
      </details>
    </section>
  )
}
