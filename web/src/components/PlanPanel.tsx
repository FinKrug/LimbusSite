import { useMemo, useState } from 'react'
import { bestReasons, comingUp, fusionTargets, getNow, setTargets, type Piece } from '../lib/plan'
import { START_RULES, startingPicks, type StartPick, type StartPlan } from '../lib/startgifts'
import { tierLabel } from '../lib/types'
import type { GiftScore, RunContext } from '../lib/scoring'
import type { ThemePack } from '../lib/types'
import { GiftLabel, Reasons } from './bits'
import { GiftIcon } from './GiftIcon'

interface Props {
  ctx: RunContext
  ranked: GiftScore[]
  packsForGift: Map<string, ThemePack[]>
  onOwn: (id: string) => void
}

/** Shown before "Show more". */
const FUSIONS_SHOWN = 4
const SETS_SHOWN = 3
const kwOf = (k: string | null | undefined) => k || 'General'

const MARK: Record<string, string> = { have: '✓', now: '●', later: '○', fuse: '◇', luck: '?', no: '×' }
const TITLE: Record<string, string> = {
  have: 'You have it', now: 'Can get it on this floor', later: 'Later floor', fuse: 'Fuse it first', luck: 'Only by luck (event gamble)', no: 'Not available this run',
}

function PieceChip({ p }: { p: Piece }) {
  const state = p.have ? 'have' : p.where.where
  return (
    <li className={`piece piece-${state}${p.via ? ' piece-via' : ''}`}
      title={`${p.gift.name}: ${p.via ? `fused into ${p.via.name}, which you have and which works with your team` : p.have ? TITLE.have : p.where.text}`}>
      <GiftIcon gift={p.gift} size={28} />
      <span className="piece-mark" aria-label={TITLE[state]}>{MARK[state]}</span>
      <span className="piece-name">{p.gift.name}{p.via && <span className="muted"> (in {p.via.name})</span>}</span>
    </li>
  )
}

/**
 * "Your plan" on the Best gifts tab: the best gifts you can get on this floor, the
 * fusions worth working toward, and gift sets to build (src/data/combos.json), all for your team and run.
 */
export function PlanPanel({ ctx, ranked, packsForGift, onOwn }: Props) {
  const now = useMemo(() => getNow(ranked, ctx, packsForGift), [ranked, ctx, packsForGift])
  const later = useMemo(() => comingUp(ranked, ctx, packsForGift), [ranked, ctx, packsForGift])
  // Every target, so you can check other keywords (in a shop: is any other keyword worth starting?).
  const allFusions = useMemo(() => fusionTargets(ctx, packsForGift, 60), [ctx, packsForGift])
  const allSets = useMemo(() => setTargets(ctx, packsForGift, 60), [ctx, packsForGift])
  const [kw, setKw] = useState<string | null>(null)
  const [moreFusions, setMoreFusions] = useState(false)
  const [moreSets, setMoreSets] = useState(false)
  const keywords = useMemo(() => {
    const n = new Map<string, number>()
    for (const f of allFusions) n.set(kwOf(f.result.keyword), (n.get(kwOf(f.result.keyword)) ?? 0) + 1)
    for (const t of allSets) n.set(kwOf(t.combo.keyword), (n.get(kwOf(t.combo.keyword)) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [allFusions, allSets])
  const fusionsIn = kw ? allFusions.filter((f) => kwOf(f.result.keyword) === kw) : allFusions
  const setsIn = kw ? allSets.filter((t) => kwOf(t.combo.keyword) === kw) : allSets
  const fusions = moreFusions || kw ? fusionsIn : fusionsIn.slice(0, FUSIONS_SHOWN)
  const sets = moreSets || kw ? setsIn : setsIn.slice(0, SETS_SHOWN)
  const floor = ctx.run.floor ?? 1
  if (!ctx.profile.size) return null

  return (
    <>
    <section className="panel plan-panel">
      <header className="plan-head">
        <h2>Your plan{ctx.run.floor !== null ? ` for floor ${floor}` : ''}</h2>
        <span className="muted small">
          {ctx.run.floor === null ? 'Press Start run at the top to plan per floor. ' : ''}
          ✓ have · ● this floor · ○ later floor · ◇ fuse first
        </span>
      </header>
      {keywords.length > 1 && (
        <div className="plan-kws" role="group" aria-label="Show fusions and gift sets for a keyword">
          <span className="muted small">Fusions and sets for:</span>
          <button className={`chip-btn${kw === null ? ' on' : ''}`} onClick={() => setKw(null)}>All</button>
          {keywords.map(([k, n]) => (
            <button key={k} className={`chip-btn${kw === k ? ' on' : ''}`} onClick={() => setKw(kw === k ? null : k)}>
              {k} <span className="muted">{n}</span>
            </button>
          ))}
        </div>
      )}
      <div className="plan-grid">
        <div className="plan-col">
          <h3>Get now</h3>
          <ol className="plan-now">
            {now.map(({ score: s, where }) => (
              <li key={s.gift.id}>
                <div className="plan-now-top">
                  <GiftLabel gift={s.gift} icon={32} />
                  <button className="btn small-btn" onClick={() => onOwn(s.gift.id)}>Got it</button>
                </div>
                <span className="muted small">{where.text}{s.gift.cost ? ` · ${s.gift.cost} Cost` : ''}</span>
                <Reasons reasons={bestReasons(s.reasons)} max={1} />
              </li>
            ))}
          </ol>
          {later.length > 0 && (
            <>
              <h3>Later this run</h3>
              <ul className="plan-later">
                {later.map(({ score: s, where }) => (
                  <li key={s.gift.id}><GiftLabel gift={s.gift} icon={24} /> <span className="muted small">{where.text}</span></li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="plan-col">
          <h3>Fusions to work toward{kw ? ` · ${kw}` : ''}</h3>
          {fusions.length === 0 ? <p className="muted small">{kw ? `No ${kw} fusion is worth chasing for this team right now.` : 'No fusion is worth chasing for this team right now.'}</p> : (
            <ol className="plan-targets">
              {fusions.map((f) => {
                const total = f.pieces.length + (f.anyOf?.count ?? 0)
                const have = f.pieces.filter((p) => p.have).length + (f.anyOf?.have ?? 0)
                return (
                  <li key={f.result.id} className="plan-target">
                    <div className="plan-target-head">
                      <GiftLabel gift={f.result} icon={32} />
                      <span className="plan-progress" title="Pieces you have">{have}/{total}</span>
                    </div>
                    {f.blocked && <p className="reason reason-bad small">{f.blocked}</p>}
                    <ul className="pieces">{f.pieces.map((p) => <PieceChip key={p.gift.id} p={p} />)}</ul>
                    {f.anyOf && (
                      <>
                        <p className="muted small">Plus any {f.anyOf.count} of these ({f.anyOf.have}/{f.anyOf.count}):</p>
                        <ul className="pieces">{f.anyOf.pieces.map((p) => <PieceChip key={p.gift.id} p={p} />)}</ul>
                      </>
                    )}
                    <Reasons reasons={bestReasons(f.reasons)} max={2} />
                  </li>
                )
              })}
            </ol>
          )}
          {!kw && fusionsIn.length > FUSIONS_SHOWN && (
            <button className="link-btn small" onClick={() => setMoreFusions(!moreFusions)}>
              {moreFusions ? 'Show fewer' : `Show ${fusionsIn.length - FUSIONS_SHOWN} more fusions`}
            </button>
          )}
        </div>
        <div className="plan-col">
          <h3>Gift sets to build{kw ? ` · ${kw}` : ''}</h3>
          {sets.length === 0 ? <p className="muted small">{kw ? `No ${kw} gift set for this team.` : 'No gift sets for this team yet.'}</p> : (
            <ol className="plan-targets">
              {sets.map((t) => (
                <li key={t.combo.id} className="plan-target">
                  <div className="plan-target-head">
                    <b>{t.combo.name}</b>
                    {t.combo.any_team && <span className="pill" title="Works for any team, whatever its keywords. Sets are ranked: #1 is worth the most to a run.">Any team · #{t.combo.rank}</span>}
                    <span className="plan-progress">{t.pieces.filter((p) => p.have).length}/{t.pieces.length}</span>
                  </div>
                  <ul className="pieces">{t.pieces.map((p) => <PieceChip key={p.gift.id} p={p} />)}</ul>
                  {t.combo.why && <p className="muted small">{t.combo.why}</p>}
                  {t.combo.note && <p className="reason reason-bad small">{t.combo.note}</p>}
                </li>
              ))}
            </ol>
          )}
          {!kw && setsIn.length > SETS_SHOWN && (
            <button className="link-btn small" onClick={() => setMoreSets(!moreSets)}>
              {moreSets ? 'Show fewer' : `Show ${setsIn.length - SETS_SHOWN} more sets`}
            </button>
          )}
        </div>
      </div>
    </section>
    </>
  )
}

/**
 * E.G.O Gift Search before the run: the gifts to get with Starlight (up to 3, Tier I–III), in order.
 * On the Before the run screen (PreRunTab).
 * On the Team screen while the run hasn't started.
 */
export function StartPanel({ ctx, packsForGift, onOwn, rebuild, title = 'E.G.O Gift Search', hint, plan: given }: {
  ctx: RunContext; packsForGift: Map<string, ThemePack[]>; onOwn: (id: string) => void
  rebuild: (owned: string[]) => RunContext
  title?: string
  hint?: string
  /** Already worked out (startingPicks), so it isn't done twice. */
  plan?: StartPlan
}) {
  const own = useMemo(() => (given ? null : startingPicks(ctx, packsForGift, rebuild)), [given, ctx, packsForGift, rebuild])
  const plan = given ?? own!
  if (!plan.picks.length) return null
  return (
    <section className="panel start-panel">
      <header className="plan-head">
        <h2>{title}</h2>
        <span className="muted small">{hint ?? `Up to ${START_RULES.count} gifts, Tier I–${tierLabel(START_RULES.maxTier)}. Best first.`}</span>
      </header>
      <ol className="start-picks">
        {plan.picks.map((p, k) => (
          <li key={p.score.gift.id} className="start-pick">
            <span className="start-rank">{k + 1}</span>
            <div className="start-body">
              <div className="plan-now-top">
                <GiftLabel gift={p.score.gift} icon={32} />
                {p.skips.length > 0 && <span className="pill">Skip {p.skips[0].name}</span>}
                <button className="btn small-btn" onClick={() => onOwn(p.score.gift.id)} title="Mark it as bought: the picks below update">Got it</button>
              </div>
              <ul className="start-why small">{p.why.slice(0, 3).map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          </li>
        ))}
      </ol>
      {plan.together.length > 0 && (
        <ul className="start-together">{plan.together.map((t) => <li key={t}>{t}</li>)}</ul>
      )}
      <StartOptions options={plan.alternatives} onOwn={onOwn} />
      <p className="muted small">
        Gifts that are most of what a theme pack offers your team come first, so you can skip that pack; then strong
        gifts that only a few packs give. Main-pool gifts count less, since shops sell them anyway.
      </p>
    </section>
  )
}

/** How many other options show before "Show more". */
const OPTIONS_SHOWN = 8

/** Other gifts worth buying up front, best first, so you can pick your own three. */
function StartOptions({ options, onOwn }: { options: StartPick[]; onOwn: (id: string) => void }) {
  const [all, setAll] = useState(false)
  if (!options.length) return null
  const shown = all ? options : options.slice(0, OPTIONS_SHOWN)
  return (
    <details className="start-options">
      <summary><b>Other options</b> <span className="muted small">({options.length}, best first: to pick your own)</span></summary>
      <ol className="start-option-list">
        {shown.map((p, k) => (
          <li key={p.score.gift.id} className="start-option">
            <span className="start-option-rank muted">{START_RULES.count + k + 1}</span>
            <div className="start-option-body">
              <div className="plan-now-top">
                <GiftLabel gift={p.score.gift} icon={24} />
                {p.skips.length > 0 && <span className="pill">Skip {p.skips[0].name}</span>}
                <button className="btn small-btn" onClick={() => onOwn(p.score.gift.id)} title="Mark it as bought: the picks update">Got it</button>
              </div>
              {p.why[0] && <span className="muted small">{p.why[0]}</span>}
            </div>
          </li>
        ))}
      </ol>
      {options.length > OPTIONS_SHOWN && (
        <button className="btn small-btn start-more" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show ${options.length - OPTIONS_SHOWN} more`}
        </button>
      )}
    </details>
  )
}
