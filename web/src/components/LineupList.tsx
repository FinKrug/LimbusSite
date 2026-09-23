import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { Sinner } from '../lib/types'

const DIVIDER = '|divider|'

interface Props {
  order: Sinner[]
  deployed: number
  minDeployed: number
  maxDeployed: number
  onOrderChange: (order: Sinner[]) => void
  onDeployedChange: (n: number) => void
  /** Row content for a sinner at 0-based position k. */
  renderRow: (s: Sinner, k: number, isDeployed: boolean) => ReactNode
}

interface Drag {
  key: string
  pointerId: number
  startY: number
  /** Where the pointer grabbed the row, from its top edge. */
  grabDy: number
  /** The row's top (in the list) when the drag started. */
  startTop: number
  y: number
  moved: boolean
  order: Sinner[]
  deployed: number
}

/**
 * Drag-and-drop lineup: drag a sinner to a new slot, or drag the Backups
 * divider to change how many are deployed. With a mouse, the whole row drags.
 * On touch, the ⠿ handle drags, so the page still scrolls. The handles also
 * take ↑/↓ keys.
 */
export function LineupList({ order, deployed, minDeployed, maxDeployed, onOrderChange, onDeployedChange, renderRow }: Props) {
  const [drag, setDragState] = useState<Drag | null>(null)
  // Window listeners read the latest drag from here (rows move in the DOM while dragging,
  // so pointer capture on the row isn't reliable).
  const dragRef = useRef<Drag | null>(null)
  const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d) }
  const listRef = useRef<HTMLOListElement>(null)
  const rows = useRef(new Map<string, HTMLLIElement>())
  const prevTops = useRef(new Map<string, number>())

  const shownOrder = drag?.order ?? order
  const shownDeployed = drag?.deployed ?? deployed
  const maxHere = Math.min(maxDeployed, order.length)
  const showDivider = order.length > minDeployed && shownDeployed <= order.length
  const items: string[] = [...shownOrder]
  if (showDivider) items.splice(shownDeployed, 0, DIVIDER)

  // Rows slide into their new places (FLIP), and the dragged row follows the pointer.
  useLayoutEffect(() => {
    for (const key of items) {
      const el = rows.current.get(key)
      if (!el) continue
      const top = el.offsetTop
      if (drag && key === drag.key) {
        el.style.transition = 'none'
        el.style.transform = `translateY(${drag.startTop + drag.y - drag.startY - top}px)`
      } else {
        const before = prevTops.current.get(key)
        if (before !== undefined && before !== top) {
          el.style.transition = 'none'
          el.style.transform = `translateY(${before - top}px)`
          void el.offsetHeight // apply the jump before animating back
          el.style.transition = 'transform 150ms ease'
          el.style.transform = ''
        }
      }
      prevTops.current.set(key, top)
    }
  })

  const middle = (key: string) => {
    const el = rows.current.get(key)!
    return el.offsetTop + el.offsetHeight / 2
  }

  const onPointerDown = (key: string) => (e: PointerEvent<HTMLLIElement>) => {
    const target = e.target as HTMLElement
    if (e.button !== 0) return
    if (target.closest('a, select, input, button:not(.grip)')) return
    if (e.pointerType !== 'mouse' && !target.closest('.grip')) return // touch: handle only, so the page scrolls
    const el = e.currentTarget
    e.preventDefault() // no text selection or touch scrolling while dragging
    setDrag({
      key, pointerId: e.pointerId, startY: e.clientY, grabDy: e.clientY - el.getBoundingClientRect().top,
      startTop: el.offsetTop, y: e.clientY, moved: false, order: [...order], deployed,
    })
  }

  const onPointerMove = (e: globalThis.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId || !listRef.current) return
    const moved = drag.moved || Math.abs(e.clientY - drag.startY) > 4
    if (!moved) return
    const el = rows.current.get(drag.key)!
    const listTop = listRef.current.getBoundingClientRect().top
    const center = e.clientY - listTop - drag.grabDy + el.offsetHeight / 2
    let next = { ...drag, y: e.clientY, moved }
    if (drag.key === DIVIDER) {
      const above = drag.order.filter((s) => middle(s) < center).length
      next = { ...next, deployed: Math.max(minDeployed, Math.min(maxHere, above)) }
    } else {
      const others = drag.order.filter((s) => s !== drag.key)
      const at = others.filter((s) => middle(s) < center).length
      const reordered = [...others.slice(0, at), drag.key as Sinner, ...others.slice(at)]
      next = { ...next, order: reordered }
    }
    setDrag(next)
  }

  const onPointerUp = (e: globalThis.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    const el = rows.current.get(drag.key)
    if (el) {
      el.style.transition = 'transform 150ms ease'
      el.style.transform = ''
    }
    if (drag.moved) {
      if (drag.order.join() !== order.join()) onOrderChange(drag.order)
      if (drag.deployed !== deployed) onDeployedChange(drag.deployed)
    }
    setDrag(null)
  }

  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  })

  const onKey = (key: string) => (e: KeyboardEvent) => {
    const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    if (!step) return
    e.preventDefault()
    if (key === DIVIDER) {
      const n = deployed + step
      if (n >= minDeployed && n <= maxHere) onDeployedChange(n)
      return
    }
    const from = order.indexOf(key as Sinner)
    const to = from + step
    if (to < 0 || to >= order.length) return
    const next = [...order]
    next.splice(from, 1)
    next.splice(to, 0, key as Sinner)
    onOrderChange(next)
  }

  const bind = (key: string) => ({
    ref: (el: HTMLLIElement | null) => { if (el) rows.current.set(key, el); else rows.current.delete(key) },
    onPointerDown: onPointerDown(key),
  })

  return (
    <ol className={drag?.moved ? 'lineup dragging' : 'lineup'} ref={listRef}>
      {items.map((key) => {
        const active = drag?.moved && drag.key === key
        if (key === DIVIDER) {
          return (
            <li key={key} {...bind(key)} className={active ? 'lineup-divider-row active' : 'lineup-divider-row'}
              title="Drag to change how many sinners are deployed">
              <button className="grip" aria-label={`Deployed: ${deployed}. Use arrow keys to change`} onKeyDown={onKey(key)}>⠿</button>
              <span className="lineup-divider">Backups</span>
              <span className="lineup-divider-line" />
              <span className="muted small">{shownDeployed} deployed</span>
            </li>
          )
        }
        const k = shownOrder.indexOf(key as Sinner)
        const isDeployed = k < shownDeployed
        return (
          <li key={key} {...bind(key)}
            className={`${isDeployed ? 'deployed' : 'backup'}${active ? ' active' : ''}`}>
            <div className="lineup-row">
              <button className="grip" aria-label={`Move ${key} (#${k + 1}). Use arrow keys to move`} onKeyDown={onKey(key)}>⠿</button>
              {renderRow(key as Sinner, k, isDeployed)}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
