import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

export interface TourStep<T extends string = string> {
  /** The element to point at: `[data-tour="<target>"]`. Missing → the box sits in the middle. */
  target?: string
  /** A screen to open first. */
  tab?: T
  title: string
  text: React.ReactNode
}

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 6
const BOX_W = 340

/**
 * The guided tour: dims the page, lights up one part of it and explains it, step by step.
 * It points at the real screens (each step can open one), so what you learn is where it is.
 */
export function Tour<T extends string>({ steps, onOpenTab, onClose }: {
  steps: TourStep<T>[]
  onOpenTab: (t: T) => void
  onClose: () => void
}) {
  const [k, setK] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [vw, setVw] = useState(() => window.innerWidth)
  const [vh, setVh] = useState(() => window.innerHeight)
  const boxRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const step = steps[k]
  const last = k === steps.length - 1

  // Open the step's screen, then find and scroll to its target.
  useEffect(() => {
    if (step.tab) onOpenTab(step.tab)
    setRect(null)
    let tries = 0
    let timer = 0
    const find = () => {
      const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null
      if (el && el.getClientRects().length) {
        const r = el.getBoundingClientRect()
        if (r.top < 70 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
        measure()
      } else if (step.target && tries++ < 20) {
        timer = window.setTimeout(find, 60)
      }
    }
    timer = window.setTimeout(find, 40)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k])

  const measure = useCallback(() => {
    setVw(window.innerWidth)
    setVh(window.innerHeight)
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null
    if (!el || !el.getClientRects().length) { setRect(null); return }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
  }, [step.target])

  useLayoutEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [measure])

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setK((x) => Math.min(steps.length - 1, x + 1))
      else if (e.key === 'ArrowLeft') setK((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [k, steps.length, onClose])

  // The box goes below the target if there's room, else above, else in the middle.
  const w = Math.min(BOX_W, vw - 24)
  const boxH = boxRef.current?.offsetHeight ?? 180
  let boxStyle: CSSProperties
  if (!rect) {
    boxStyle = { width: w, left: (vw - w) / 2, top: Math.max(16, (vh - boxH) / 2) }
  } else {
    const left = Math.max(12, Math.min(vw - w - 12, rect.left + rect.width / 2 - w / 2))
    const below = rect.top + rect.height + 12
    const above = rect.top - boxH - 12
    const top = below + boxH < vh - 8 ? below : above > 8 ? above : Math.max(8, vh - boxH - 8)
    boxStyle = { width: w, left, top }
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect
        ? <div className="tour-spot" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
        : <div className="tour-dim" />}
      {/* Clicks on the page are caught so nothing changes behind the tour. */}
      <div className="tour-catch" onClick={() => undefined} />
      <div className="tour-box" ref={boxRef} style={boxStyle}>
        <p className="tour-count">Step {k + 1} of {steps.length}</p>
        <h2 id="tour-title">{step.title}</h2>
        <div className="tour-text">{step.text}</div>
        <div className="tour-dots" aria-hidden="true">
          {steps.map((_, i) => <i key={i} className={i === k ? 'on' : i < k ? 'seen' : ''} />)}
        </div>
        <div className="tour-btns">
          <button className="link-btn" onClick={onClose}>{last ? 'Close' : 'Skip the tour'}</button>
          <span>
            {k > 0 && <button className="btn" onClick={() => setK(k - 1)}>Back</button>}
            <button ref={nextRef} className="btn primary" onClick={() => (last ? onClose() : setK(k + 1))}>{last ? 'Done' : 'Next'}</button>
          </span>
        </div>
      </div>
    </div>
  )
}
