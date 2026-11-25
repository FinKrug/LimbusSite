import { useState } from 'react'
import { hiddenStageAdvice, hiddenStagesFor } from '../lib/hiddenstage'
import type { RunContext } from '../lib/scoring'

/**
 * Hidden stages this pack can turn up, and whether to enter one (Finley, 2026-11-24: the Dimension
 * Reversal Zone in Line 4 - Section #3). Shown on Fights & events for the floor's pack.
 */
export function HiddenStageCard({ ctx, packId, onStrugglingChange }: {
  ctx: RunContext
  packId: string | null | undefined
  /** Fights are going badly (the same setting as in Run settings). */
  onStrugglingChange: (v: boolean) => void
}) {
  const [down, setDown] = useState(false)
  const stages = hiddenStagesFor(packId)
  if (!stages.length || ctx.run.difficulty === 'normal') return null
  return (
    <>
      {stages.map((s) => {
        const a = hiddenStageAdvice(ctx, s, { down })
        return (
          <section key={s.name} className="panel hidden-stage">
            <h3>If a fight turns into the <span className="hidden-stage-name">{s.name}</span></h3>
            <p className="small muted">A hidden stage this pack can turn up: {s.rules.join(' ')} Clear reward: {s.reward.cost} Cost{a.rewardGifts.length ? <> and {a.rewardGifts.map((r) => r.gift.name).join(', ')}</> : null}.</p>
            <p className={`hidden-stage-verdict ${a.verdict}`}>
              <b>{a.verdict === 'enter' ? 'Enter it' : 'Skip it'}</b>
              {a.verdict === 'enter' ? ': the reward is worth the fight unless your team is already struggling.' : ': the reward isn\'t worth risking the run.'}
            </p>
            <ul className="small hidden-stage-why">{a.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
            <div className="hidden-stage-opts small">
              <label><input type="checkbox" checked={!!ctx.run.struggling} onChange={(e) => onStrugglingChange(e.target.checked)} /> Fights are going badly</label>
              <label><input type="checkbox" checked={down} onChange={(e) => setDown(e.target.checked)} /> Allies are down or low on HP</label>
            </div>
            <p className="muted small">Not on the wiki yet: from a player's run ({s.seen}), so the fight or reward may differ elsewhere.</p>
          </section>
        )
      })}
    </>
  )
}
