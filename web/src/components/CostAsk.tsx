import { useState } from 'react'

/**
 * Asks for your Cost when you reach a floor's shop (Finley, 2026-11-24: "when you get to the shop tab
 * you should ask for the user's cost"), so the shop advice and price tracking work from the start.
 */
export function CostAsk({ last, onSet, onSkip }: {
  /** What was left after the last shop (Cost changes between floors, so it isn't filled in). */
  last: number | null
  onSet: (cost: number) => void
  onSkip: () => void
}) {
  const [value, setValue] = useState('')
  const n = value === '' ? null : Math.max(0, Math.round(Number(value)))
  const ok = n !== null && Number.isFinite(n)
  return (
    <form className="cost-ask" onSubmit={(e) => { e.preventDefault(); if (ok) onSet(n!) }}>
      <p className="small">
        It's at the top right of the game screen. With it, the shop advice works out what fits, and buying, enhancing,
        {' '}skill swaps and refreshes you mark here come off it.
        {last !== null && <> You had <b>{last}</b> left after the last shop.</>}
      </p>
      <label className="cost-ask-row">
        <span>Cost you have</span>
        <input type="number" min={0} step={10} inputMode="numeric" autoFocus value={value} placeholder="e.g. 450"
          onChange={(e) => setValue(e.target.value)} />
      </label>
      <div className="cost-ask-btns">
        <button type="submit" className="btn primary" disabled={!ok}>Use this</button>
        <button type="button" className="link-btn" onClick={onSkip}>Not now</button>
      </div>
    </form>
  )
}
