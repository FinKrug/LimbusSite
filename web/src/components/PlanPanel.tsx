import { useMemo } from 'react'
import { bestReasons, comingUp, fusionTargets, getNow, setTargets, type Piece } from '../lib/plan'
import { START_RULES, startingPicks } from '../lib/startgifts'
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
  /** The same context with other gifts owned (for the starting-gift picks). */
  rebuild: (owned: string[]) => RunContext
}

const MARK: Record<string, string> = { have: '✓', now: '●', later: '○', fuse: '◇', luck: '?', no: '×' }
const TITLE: Record<string, string> = {
  have: 'You have it', now: 'Can get it on this floor', later: 'Later floor', fuse: 'Fuse it first', luck: 'Only by luck (event gamble)', no: 'Not available this run',
}

function PieceChip({ p }: { p: Piece }) {
  const state = p.have ? 'have' : p.where.where
  return (
    <li className={`piece piece-${state}`} title={`${p.gift.name}: ${p.have ? TITLE.have : p.where.text}`}>
      <GiftIcon gift={p.gift} size={28} />
      <span className="piece-mark" aria-label={TITLE[state]}>{MARK[state]}</span>
      <span className="piece-name">{p.gift.name}</span>
    </li>
  )
}

/**
 * "Your plan" on the Best gifts tab: the best gifts you can get on this floor, the
 * fusions worth working toward, and gift sets to build (src/data/combos.json), all for your team and run.
 */
export function PlanPanel({ ctx, ranked, packsForGift, onOwn, rebuild }: Props) {
  const now = useMemo(() => getNow(ranked, ctx, packsForGift), [ranked, ctx, packsForGift])
  const later = useMemo(() => comingUp(ranked, ctx, packsForGift), [ranked, ctx, packsForGift])
  const fusions = useMemo(() => fusionTargets(ctx, packsForGift), [ctx, packsForGift])
  const sets = useMemo(() => setTargets(ctx, packsForGift), [ctx, packsForGift])
  const floor = ctx.run.floor ?? 1
  if (!ctx.profile.size) return null

  return (
    <>
    {ctx.run.floor === null && <StartPanel ctx={ctx} packsForGift={packsForGift} onOwn={onOwn} rebuild={rebuild} />}
    <section className="panel plan-panel">
      <header className="plan-head">
        <h2>Your plan{ctx.run.floor !== null ? ` for floor ${floor}` : ''}</h2>
        <span className="muted small">
          {ctx.run.floor === null ? 'Start a run in Your run to plan per floor. ' : ''}
          ✓ have · ● this floor · ○ later floor · ◇ fuse first
        </span>
      </header>
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
          <h3>Fusions to work toward</h3>
          {fusions.length === 0 ? <p className="muted small">No fusion is worth chasing for this team right now.</p> : (
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
        </div>
        <div className="plan-col">
          <h3>Gift sets to build</h3>
          {sets.length === 0 ? <p className="muted small">No gift sets for this team yet.</p> : (
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
        </div>
      </div>
    </section>
    </>
  )
}

/**
 * Before the run: the gifts to buy at the start (up to 3, Tier I–III), in order.
 * Shown while no floor is set in Your run.
 */
function StartPanel({ ctx, packsForGift, onOwn, rebuild }: {
  ctx: RunContext; packsForGift: Map<string, ThemePack[]>; onOwn: (id: string) => void
  rebuild: (owned: string[]) => RunContext
}) {
  const plan = useMemo(() => startingPicks(ctx, packsForGift, rebuild), [ctx, packsForGift, rebuild])
  if (!plan.picks.length) return null
  return (
    <section className="panel start-panel">
      <header className="plan-head">
        <h2>Before the run: gifts to buy</h2>
        <span className="muted small">Up to {START_RULES.count} gifts, Tier I–{tierLabel(START_RULES.maxTier)}. Best first.</span>
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
      {plan.alternatives.length > 0 && (
        <p className="muted small">
          Also good: {plan.alternatives.map((a) => a.score.gift.name).join(', ')}.
        </p>
      )}
      <p className="muted small">
        Gifts that are most of what a theme pack offers your team come first, so you can skip that pack; then strong
        gifts that only a few packs give. Main-pool gifts count less, since shops sell them anyway.
      </p>
    </section>
  )
}
