import { useMemo } from 'react'
import { bestReasons, comingUp, fusionTargets, getNow, setTargets, type Piece } from '../lib/plan'
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

const MARK: Record<string, string> = { have: '✓', now: '●', later: '○', fuse: '◇', no: '×' }
const TITLE: Record<string, string> = {
  have: 'You have it', now: 'Can get it on this floor', later: 'Later floor', fuse: 'Fuse it first', no: 'Not available this run',
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
export function PlanPanel({ ctx, ranked, packsForGift, onOwn }: Props) {
  const now = useMemo(() => getNow(ranked, ctx, packsForGift), [ranked, ctx, packsForGift])
  const later = useMemo(() => comingUp(ranked, ctx, packsForGift), [ranked, ctx, packsForGift])
  const fusions = useMemo(() => fusionTargets(ctx, packsForGift), [ctx, packsForGift])
  const sets = useMemo(() => setTargets(ctx, packsForGift), [ctx, packsForGift])
  const floor = ctx.run.floor ?? 1
  if (!ctx.profile.size) return null

  return (
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
                    <span className="plan-progress">{t.pieces.filter((p) => p.have).length}/{t.pieces.length}</span>
                  </div>
                  <ul className="pieces">{t.pieces.map((p) => <PieceChip key={p.gift.id} p={p} />)}</ul>
                  {t.combo.why && <p className="muted small">{t.combo.why}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  )
}
