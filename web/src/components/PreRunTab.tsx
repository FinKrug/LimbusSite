import { useMemo } from 'react'
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
/** Name suffix per level, as the game shows it. */
const MARK = ['', '', '+', '++']
const stepName = (s: StarlightStep) => (s.kind === 'buff'
  ? `${s.buff!.name}${s.level > 1 ? ` ${'+'.repeat(s.level - 1)}` : ''}`
  : `E.G.O Gift Search: ${s.level} gift${s.level > 1 ? 's' : ''}`)

/**
 * Before the run (lib/prerun.ts): Starlight buffs, the starting keyword and gifts, and E.G.O Gift
 * Search, in the order the game asks for them. (Perfected Possibility's Tier 3 gifts are random.)
 */
export function PreRunTab({ ctx, packsForGift, rebuild, state, onStateChange, onOwn, inRun }: Props) {
  const picks = startingChoices(state.buffs)
  const t3 = tier3Choices(state.buffs)
  // Every extra choice, for valuing the buffs that give them; then the choices you actually have.
  const keywordsMax = useMemo(() => rankStartKeywords(ctx, 3, 3), [ctx])
  const keywords = useMemo(() => (picks === 3 && t3 === 3 ? keywordsMax : rankStartKeywords(ctx, picks, t3)), [ctx, picks, t3, keywordsMax])
  const chosen = keywords.find((k) => k.keyword === state.keyword) ?? keywords[0]
  // Gift Search comes after the starting gifts: plan it as if you have them.
  const searchCtx = useMemo(() => {
    const extra = chosen.take.map((g) => g.gift.id).filter((id) => !ctx.owned.has(id))
    return extra.length ? rebuild([...ctx.owned, ...extra]) : ctx
  }, [ctx, chosen, rebuild])
  const search = useMemo(() => startingPicks(searchCtx, packsForGift, rebuild), [searchCtx, packsForGift, rebuild])
  const plan = useMemo(() => planStarlight(ctx, state, keywordsMax, search.picks), [ctx, state, keywordsMax, search])
  const set = (patch: Partial<PreRunState>) => onStateChange({ ...state, ...patch })
  const setBuff = (id: string, level: number) => set({ buffs: { ...state.buffs, [id]: level } })
  // Like the game's Base / + / ++ switch: every buff at one level (0 clears them all).
  const setAll = (level: number) => set({ buffs: Object.fromEntries(BUFFS.map((b) => [b.id, level])) })
  const levels = BUFFS.map((b) => state.buffs[b.id] ?? 0)
  /** The level every buff is at, or null when they differ. */
  const allAt = levels.every((l) => l === levels[0]) ? levels[0] : null
  const selected = BUFFS.reduce((n, b) => n + b.starlight * (state.buffs[b.id] ?? 0), 0)
  // The advice per buff: the highest level worth buying (and within your Starlight), and its place in the buy order.
  const adviceFor = (steps: StarlightStep[]) => {
    const at = new Map<string, { level: number; rank: number; why: string[] }>()
    for (const s of steps) {
      if (s.kind !== 'buff') continue
      const prev = at.get(s.buff!.id)
      at.set(s.buff!.id, { level: s.level, rank: prev?.rank ?? plan.steps.indexOf(s) + 1, why: [...(prev?.why ?? []), ...s.why] })
    }
    return at
  }
  const worthAt = adviceFor(plan.steps)
  const buyAt = adviceFor(plan.affordable ?? plan.steps)
  const takeAdvice = () => set({ buffs: Object.fromEntries(BUFFS.map((b) => [b.id, buyAt.get(b.id)?.level ?? 0])) })
  const took = (s: StarlightStep) => s.kind === 'buff' && (state.buffs[s.buff!.id] ?? 0) >= s.level
  const inBudget = new Set(plan.affordable ?? [])

  return (
    <div className="prerun">
      {inRun && <p className="panel muted small">Your run has started: this screen is for the next one (or to check what you picked).</p>}

      <section className="panel">
        <header className="plan-head">
          <h2>1. Starlight buffs</h2>
          <span className="muted small">Grace of the Star: tap a buff to take it, then + or ++ to upgrade it</span>
        </header>
        <div className="upgrade-budget">
          <label>
            <span>Starlight to spend</span>
            <input type="number" min={0} step={10} inputMode="numeric" placeholder="e.g. 300" value={state.starlight ?? ''}
              onChange={(e) => set({ starlight: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })} />
          </label>
          <p className="muted small prerun-bar">
            A buff is worth it when it adds more than the Cost its Starlight would convert to ({COST_PER_STARLIGHT} Cost each).
            {plan.affordable && <> Best first, your Starlight covers <b>{plan.affordable.length}</b> buff and Gift Search levels ({plan.spent} Starlight).</>}
          </p>
        </div>
        <div className="sb-bar">
          <span className="sb-total">
            <span className="sb-star" aria-hidden>★</span> <b>{selected}</b> Starlight selected
            {state.starlight !== null && selected > state.starlight && <span className="sb-over"> ({selected - state.starlight} over)</span>}
          </span>
          <div className="chips">
            <span className="muted small">Set all to</span>
            {LEVEL.slice(1).map((l, k) => (
              <button key={l} className={`chip-btn${allAt === k + 1 ? ' on' : ''}`} aria-pressed={allAt === k + 1}
                onClick={() => setAll(k + 1)}>{l}</button>
            ))}
            <button className={`chip-btn${allAt === 0 ? ' on' : ''}`} aria-pressed={allAt === 0} onClick={() => setAll(0)}>None</button>
            <button className="chip-btn" onClick={takeAdvice}>Take the advice</button>
          </div>
        </div>
        <ul className="sb-grid">
          {BUFFS.map((b) => {
            const level = state.buffs[b.id] ?? 0
            const lv = Math.max(1, level)
            const buy = buyAt.get(b.id)
            const worth = worthAt.get(b.id)
            const tip = buy ?? worth
            return (
              <li key={b.id} className={`sb-card${level ? ' on' : ''}`}>
                <button className="sb-main" aria-pressed={level > 0} onClick={() => setBuff(b.id, level ? 0 : 1)}
                  title={level ? 'Tap to take it off' : 'Tap to take it'}>
                  <span className="sb-cost"><span className="sb-star" aria-hidden>★</span>{b.starlight * lv}</span>
                  <span className="sb-name">{b.name}{MARK[lv]}</span>
                  <span className="sb-effects">{b.levels[lv - 1].map((e) => <span key={e}>{e}</span>)}</span>
                  <span className={`sb-advice${buy ? ' buy' : worth ? ' worth' : ''}`}
                    title={tip ? `${buy ? '' : 'Worth it, but past your Starlight. '}${tip.why.join('\n')}` : 'Each level adds less than the Cost its Starlight converts to'}>
                    {tip ? <>#{tip.rank} · {buy ? 'Buy' : 'Worth'} {tip.level > 1 ? MARK[tip.level] : 'it'}</> : 'Skip'}
                  </span>
                </button>
                <div className="sb-levels">
                  {[2, 3].map((l) => (
                    <button key={l} className={level === l ? 'on' : ''} aria-pressed={level === l}
                      aria-label={`${b.name}${MARK[l]}`} title={b.levels[l - 1].join('\n')}
                      onClick={() => setBuff(b.id, level === l ? 1 : l)}>{MARK[l]}</button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
        <details className="prerun-all">
          <summary className="small">Buy order, best value first (with E.G.O Gift Search)</summary>
          <ol className="sb-order small">
            {plan.steps.map((s) => (
              <li key={stepName(s)} className={`${plan.affordable ? (inBudget.has(s) ? 'now' : 'later') : ''}${took(s) ? ' took' : ''}`}>
                <b>{stepName(s)}</b>{' '}
                <span className="muted">{s.starlight} Starlight · about {Math.round(s.value)} Cost ({s.ratio >= 10 ? Math.round(s.ratio) : s.ratio.toFixed(1)}×) · {s.why.join(' · ')}</span>
              </li>
            ))}
          </ol>
          {plan.skip.length > 0 && (
            <>
              <p className="small muted">Not worth their Starlight:</p>
              <ul className="prerun-skip small muted">
                {plan.skip.map((s) => <li key={stepName(s)}>{stepName(s)} ({s.starlight}): about {Math.round(s.value)} Cost, under the {s.starlight * COST_PER_STARLIGHT} it converts to. {s.why.join(' · ')}</li>)}
              </ul>
            </>
          )}
        </details>
        <p className="muted small">
          Values are rough: Levels, speed and refreshes are counted as Cost (see BUFF_VALUES in lib/prerun.ts). Gift parts are
          valued for your team. Select what you took and the steps below follow it.
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


      <StartPanel ctx={searchCtx} packsForGift={packsForGift} onOwn={onOwn} rebuild={rebuild} plan={search}
        title="3. E.G.O Gift Search"
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
