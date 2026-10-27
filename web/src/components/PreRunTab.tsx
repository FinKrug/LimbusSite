import { useMemo, useState } from 'react'
import {
  BUFFS, COST_PER_STARLIGHT, GIFT_SEARCH, planStarlight, rankStartKeywords, startingChoices, tier3Choices,
  type PreRunState, type StarlightStep,
} from '../lib/prerun'
import type { GiftScore, RunContext } from '../lib/scoring'
import type { ThemePack } from '../lib/types'
import { startingPicks } from '../lib/startgifts'
import { GiftLabel } from './bits'
import { StartPanel } from './PlanPanel'

interface Props {
  ctx: RunContext
  packsForGift: Map<string, ThemePack[]>
  rebuild: (owned: string[]) => RunContext
  state: PreRunState
  onStateChange: (s: PreRunState) => void
  onOwn: (id: string) => void
  /** The run has started (this screen is for before it). */
  inRun: boolean
}

const LEVEL = ['—', 'Base', '+', '++']
/** Steps shown before "Show more". */
const STEPS_SHOWN = 8
const stepName = (s: StarlightStep) => (s.kind === 'buff'
  ? `${s.buff!.name}${s.level > 1 ? ` ${'+'.repeat(s.level - 1)}` : ''}`
  : `E.G.O Gift Search: ${s.level} gift${s.level > 1 ? 's' : ''}`)

/**
 * Before the run (lib/prerun.ts): Starlight buffs, the starting keyword and gifts, Perfected
 * Possibility's Tier 3 picks and E.G.O Gift Search, in the order the game asks for them.
 */
export function PreRunTab({ ctx, packsForGift, rebuild, state, onStateChange, onOwn, inRun }: Props) {
  const picks = startingChoices(state.buffs)
  const t3 = tier3Choices(state.buffs)
  // Every extra choice, for valuing the buffs that give them; then the choices you actually have.
  const keywordsMax = useMemo(() => rankStartKeywords(ctx, 3, 3), [ctx])
  const keywords = useMemo(() => (picks === 3 && t3 === 3 ? keywordsMax : rankStartKeywords(ctx, picks, t3)), [ctx, picks, t3, keywordsMax])
  const chosen = keywords.find((k) => k.keyword === state.keyword) ?? keywords[0]
  // Gift Search comes after the starting gifts and Perfected Possibility's picks: plan it as if you have them.
  const searchCtx = useMemo(() => {
    const extra = [...chosen.take, ...chosen.tier3].map((g) => g.gift.id).filter((id) => !ctx.owned.has(id))
    return extra.length ? rebuild([...ctx.owned, ...extra]) : ctx
  }, [ctx, chosen, rebuild])
  const search = useMemo(() => startingPicks(searchCtx, packsForGift, rebuild), [searchCtx, packsForGift, rebuild])
  const plan = useMemo(() => planStarlight(ctx, state, keywordsMax, search.picks), [ctx, state, keywordsMax, search])
  // The list is long: the first ones (and all you can afford), the rest on request.
  const [showAll, setShowAll] = useState(false)
  const lastBuy = plan.affordable?.length ? plan.steps.indexOf(plan.affordable[plan.affordable.length - 1]) : -1
  const shown = showAll ? plan.steps : plan.steps.slice(0, Math.max(STEPS_SHOWN, lastBuy + 2))
  const set = (patch: Partial<PreRunState>) => onStateChange({ ...state, ...patch })
  const setBuff = (id: string, level: number) => set({ buffs: { ...state.buffs, [id]: level } })
  const [showSkip, setShowSkip] = useState(false)
  const took = (s: StarlightStep) => s.kind === 'buff' && (state.buffs[s.buff!.id] ?? 0) >= s.level
  const inBudget = new Set(plan.affordable ?? [])

  return (
    <div className="prerun">
      {inRun && <p className="panel muted small">Your run has started: this screen is for the next one (or to check what you picked).</p>}

      <section className="panel">
        <header className="plan-head">
          <h2>1. Starlight buffs</h2>
          <span className="muted small">Grace of the Star: bought with Starlight before the run</span>
        </header>
        <div className="upgrade-budget">
          <label>
            <span>Starlight to spend</span>
            <input type="number" min={0} step={10} inputMode="numeric" placeholder="e.g. 300" value={state.starlight ?? ''}
              onChange={(e) => set({ starlight: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })} />
          </label>
          <p className="muted small prerun-bar">
            Worth buying when it adds more than the Cost the Starlight would convert to ({COST_PER_STARLIGHT} Cost each).
            {plan.affordable && <> Your Starlight covers <b>{plan.affordable.length}</b> of these ({plan.spent} Starlight).</>}
          </p>
        </div>
        <ol className="prerun-steps">
          {shown.map((s, k) => (
            <li key={stepName(s)} className={`prerun-step${plan.affordable ? (inBudget.has(s) ? ' now' : ' later') : ''}${took(s) ? ' took' : ''}`}>
              <span className="start-rank">{k + 1}</span>
              <div className="prerun-step-body">
                <div className="plan-now-top">
                  <b>{stepName(s)}</b>
                  <span className="pill">{s.starlight} Starlight</span>
                  <span className="muted small">worth about {Math.round(s.value)} Cost ({s.ratio >= 10 ? Math.round(s.ratio) : s.ratio.toFixed(1)}×)</span>
                  {inBudget.has(s) && <span className="pill pill-now">Buy</span>}
                  {s.kind === 'buff' && (
                    <button className={took(s) ? 'btn small-btn' : 'btn small-btn primary'}
                      onClick={() => setBuff(s.buff!.id, took(s) ? s.level - 1 : s.level)}>{took(s) ? 'Took it ✓' : 'Took it'}</button>
                  )}
                </div>
                <span className="muted small">{s.why.join(' · ')}</span>
              </div>
            </li>
          ))}
        </ol>
        {shown.length < plan.steps.length && (
          <button className="link-btn small" onClick={() => setShowAll(true)}>Show {plan.steps.length - shown.length} more worth buying</button>
        )}{' '}
        {plan.skip.length > 0 && (
          <button className="link-btn small" onClick={() => setShowSkip(!showSkip)}>
            {showSkip ? 'Hide' : 'Show'} {plan.skip.length} not worth their Starlight
          </button>
        )}
        {showSkip && (
          <ul className="prerun-skip small muted">
            {plan.skip.map((s) => <li key={stepName(s)}>{stepName(s)} ({s.starlight}): about {Math.round(s.value)} Cost, under the {s.starlight * COST_PER_STARLIGHT} it converts to. {s.why.join(' · ')}</li>)}
          </ul>
        )}
        <details className="prerun-all">
          <summary className="small">All buffs, and the ones you took</summary>
          <ul className="prerun-buffs">
            {BUFFS.map((b) => {
              const level = state.buffs[b.id] ?? 0
              return (
                <li key={b.id}>
                  <div className="plan-now-top">
                    <b>{b.name}</b><span className="muted small">{b.starlight} Starlight a level</span>
                    <select value={level} aria-label={`${b.name} level`} onChange={(e) => setBuff(b.id, Number(e.target.value))}>
                      {LEVEL.map((l, k) => <option key={l} value={k}>{k === 0 ? 'Not taken' : l}</option>)}
                    </select>
                  </div>
                  <span className="muted small">{b.levels[Math.max(0, level - 1)].join(' · ')}</span>
                </li>
              )
            })}
          </ul>
        </details>
        <p className="muted small">
          Values are rough: Levels, speed and refreshes are counted as Cost (see BUFF_VALUES in lib/prerun.ts). Gift parts are
          valued for your team. Tick what you took and the steps below follow it.
        </p>
      </section>

      <section className="panel">
        <header className="plan-head">
          <h2>2. Starting gifts</h2>
          <span className="muted small">Pick a keyword, then take {picks} of its 3 Tier II gifts{picks > 1 ? '' : ' (more with Star-shower or Perfected Possibility)'}</span>
        </header>
        <div className="prerun-keyword">
          <div className="plan-now-top">
            <span className="tag">{chosen.keyword}</span>
            <b>{chosen === keywords[0] ? 'Best keyword for your team' : 'Your keyword'}</b>
            {state.keyword && <button className="link-btn small" onClick={() => set({ keyword: null })}>Go back to the advice</button>}
          </div>
          <ol className="reward-list">
            {chosen.gifts.map((g, k) => <StartGift key={g.gift.id} g={g} take={chosen.take.includes(g)} rank={k + 1} owned={ctx.owned.has(g.gift.id)} onOwn={onOwn} />)}
          </ol>
        </div>
        <details className="prerun-all">
          <summary className="small">Other keywords</summary>
          <ul className="prerun-keywords">
            {keywords.map((k) => (
              <li key={k.keyword}>
                <button className={`chip-btn${k === chosen ? ' on' : ''}`} onClick={() => set({ keyword: k.keyword })}>{k.keyword}</button>
                <span className="reward-bar" aria-label={`${k.rating} of 100`}><span style={{ width: `${Math.max(4, k.rating)}%` }} /></span>
                <span className="muted small">{k.gifts[0]?.gift.name}{k.gifts[0] && `, ${k.gifts.slice(1).map((g) => g.gift.name).join(', ')}`}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>

      {t3 > 0 && (
        <section className="panel">
          <header className="plan-head">
            <h2>3. Perfected Possibility: Tier 3 {chosen.keyword} gifts</h2>
            <span className="muted small">You pick {t3}, plus {t3 === 1 ? 'a Dark Vestige' : t3 === 2 ? 'a Dark and a Faint Vestige' : 'a Dark, Faint and Twinkling Vestige'}</span>
          </header>
          <ol className="reward-list">
            {chosen.tier3.map((g, k) => <StartGift key={g.gift.id} g={g} take rank={k + 1} owned={ctx.owned.has(g.gift.id)} onOwn={onOwn} />)}
          </ol>
        </section>
      )}

      <StartPanel ctx={searchCtx} packsForGift={packsForGift} onOwn={onOwn} rebuild={rebuild} plan={search}
        title={`${t3 > 0 ? 4 : 3}. E.G.O Gift Search`}
        hint={`After the starting gifts: up to 3 gifts of Tier I–III, any you like (pack exclusives too), for ${GIFT_SEARCH.join(' / ')} Starlight. Best first.`} />
    </div>
  )
}

function StartGift({ g, take, rank, owned, onOwn }: { g: GiftScore; take: boolean; rank: number; owned: boolean; onOwn: (id: string) => void }) {
  const why = g.reasons.filter((r) => r.kind === 'good').slice(0, 2).map((r) => r.text)
  return (
    <li className={take ? 'reward best' : 'reward'}>
      <span className="reward-rank">{rank}</span>
      <div className="reward-main">
        <GiftLabel gift={g.gift} icon={28} />
        {why.length > 0 && <p className="small muted">{why.join(' · ')}</p>}
      </div>
      <span />
      <span className="reward-actions">
        {take && !owned && <span className="reward-pick">Take this</span>}
        {owned ? <span className="muted small">You have it</span>
          : <button className={take ? 'btn primary small-btn' : 'btn small-btn'} onClick={() => onOwn(g.gift.id)}>Got it</button>}
      </span>
    </li>
  )
}
