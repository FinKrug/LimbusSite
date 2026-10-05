import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { ArtVariant } from '../lib/images'
import type { Identity, Sinner } from '../lib/types'
import { Portrait } from './Portrait'

const DIVIDER = '|divider|'

interface Props {
  /** Selected sinners in deployment order (#1 first). */
  selection: Sinner[]
  equipped: Record<Sinner, Identity>
  deployed: number
  minDeployed: number
  maxDeployed: number
  /** Pending lineup suggestions per sinner ("→ #8"). */
  suggested: Partial<Record<Sinner, number>>
  suggestionCount: number
  /** Base or threadspun portraits (the Team tab's art toggle). */
  art: ArtVariant
  onSelectionChange: (selection: Sinner[]) => void
  onDeployedChange: (n: number) => void
  /** Clicking a sinner (without dragging) opens the Team tab. */
  onOpenTeam: () => void
}

interface Drag {
  key: string
  pointerId: number
  startX: number
  grabDx: number
  startLeft: number
  x: number
  moved: boolean
  order: Sinner[]
  deployed: number
}

/**
 * The lineup as a strip, like the bar along the bottom of the formation screen.
 * It's shown on every tab. Drag a sinner to change their slot, or drag the
 * Backups divider to change how many are deployed. With a mouse, the whole
 * portrait drags; on touch, hold the portrait (the strip scrolls sideways
 * otherwise). ←/→ keys work too.
 */
export function FormationBar({
  selection, equipped, deployed, minDeployed, maxDeployed, suggested, suggestionCount, art, onSelectionChange, onDeployedChange, onOpenTeam,
}: Props) {
  const [drag, setDragState] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d) }
  const listRef = useRef<HTMLOListElement>(null)
  const items = useRef(new Map<string, HTMLLIElement>())
  const prevLefts = useRef(new Map<string, number>())

  const shownOrder = drag?.order ?? selection
  const shownDeployed = drag?.deployed ?? deployed
  const maxHere = Math.min(maxDeployed, selection.length)
  const showDivider = selection.length > minDeployed && shownDeployed < selection.length
  const keys: string[] = [...shownOrder]
  if (showDivider) keys.splice(shownDeployed, 0, DIVIDER)

  // Items slide into place (FLIP); the dragged one follows the pointer.
  useLayoutEffect(() => {
    for (const key of keys) {
      const el = items.current.get(key)
      if (!el) continue
      const left = el.offsetLeft
      if (drag && key === drag.key) {
        el.style.transition = 'none'
        el.style.transform = `translateX(${drag.startLeft + drag.x - drag.startX - left}px)`
      } else {
        const before = prevLefts.current.get(key)
        if (before !== undefined && before !== left) {
          el.style.transition = 'none'
          el.style.transform = `translateX(${before - left}px)`
          void el.offsetWidth
          el.style.transition = 'transform 150ms ease'
          el.style.transform = ''
        }
      }
      prevLefts.current.set(key, left)
    }
  })

  const middle = (key: string) => {
    const el = items.current.get(key)!
    return el.offsetLeft + el.offsetWidth / 2
  }

  const onPointerDown = (key: string) => (e: PointerEvent<HTMLLIElement>) => {
    if (e.button !== 0) return
    const el = e.currentTarget
    if (e.pointerType === 'mouse') e.preventDefault()
    setDrag({
      key, pointerId: e.pointerId, startX: e.clientX, grabDx: e.clientX - el.getBoundingClientRect().left,
      startLeft: el.offsetLeft, x: e.clientX, moved: false, order: [...selection], deployed,
    })
  }

  const onPointerMove = (e: globalThis.PointerEvent) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId || !listRef.current) return
    const moved = d.moved || Math.abs(e.clientX - d.startX) > 5
    if (!moved) return
    const el = items.current.get(d.key)!
    const list = listRef.current
    const center = e.clientX - list.getBoundingClientRect().left + list.scrollLeft - d.grabDx + el.offsetWidth / 2
    let next = { ...d, x: e.clientX, moved }
    if (d.key === DIVIDER) {
      const before = d.order.filter((s) => middle(s) < center).length
      next = { ...next, deployed: Math.max(minDeployed, Math.min(maxHere, before)) }
    } else {
      const others = d.order.filter((s) => s !== d.key)
      const at = others.filter((s) => middle(s) < center).length
      next = { ...next, order: [...others.slice(0, at), d.key as Sinner, ...others.slice(at)] }
    }
    setDrag(next)
  }

  const onPointerUp = (e: globalThis.PointerEvent) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const el = items.current.get(d.key)
    if (el) {
      el.style.transition = 'transform 150ms ease'
      el.style.transform = ''
    }
    if (d.moved) {
      if (d.order.join() !== selection.join()) onSelectionChange(d.order)
      if (d.deployed !== deployed) onDeployedChange(d.deployed)
    } else if (d.key !== DIVIDER && e.type === 'pointerup') {
      onOpenTeam()
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
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0
    if (!step) {
      if (e.key === 'Enter' && key !== DIVIDER) onOpenTeam()
      return
    }
    e.preventDefault()
    if (key === DIVIDER) {
      const n = deployed + step
      if (n >= minDeployed && n <= maxHere) onDeployedChange(n)
      return
    }
    const from = selection.indexOf(key as Sinner)
    const to = from + step
    if (to < 0 || to >= selection.length) return
    const next = [...selection]
    next.splice(from, 1)
    next.splice(to, 0, key as Sinner)
    onSelectionChange(next)
  }

  if (!selection.length) {
    return (
      <div className="formation-bar empty-bar">
        <span className="muted">No sinners selected.</span>
        <button className="btn" onClick={onOpenTeam}>Pick your team</button>
      </div>
    )
  }

  return (
    <div className="formation-bar">
      <ol className={drag?.moved ? 'bar-list dragging' : 'bar-list'} ref={listRef} aria-label="Deployment order">
        {keys.map((key) => {
          const active = drag?.moved && drag.key === key
          const bind = {
            ref: (el: HTMLLIElement | null) => { if (el) items.current.set(key, el); else items.current.delete(key) },
            onPointerDown: onPointerDown(key),
          }
          if (key === DIVIDER) {
            return (
              <li key={key} {...bind} className={active ? 'bar-divider active' : 'bar-divider'}
                tabIndex={0} onKeyDown={onKey(key)} role="separator" aria-orientation="vertical"
                aria-label={`${deployed} deployed. Drag or use arrow keys to change`}
                title="Drag to change how many sinners are deployed">
                <span className="bar-divider-line" />
                <span className="bar-divider-label">Backups</span>
              </li>
            )
          }
          const s = key as Sinner
          const k = shownOrder.indexOf(s)
          const i = equipped[s]
          const to = suggested[s]
          return (
            <li key={key} {...bind} tabIndex={0} onKeyDown={onKey(key)}
              className={`bar-item ${k < shownDeployed ? 'deployed' : 'backup'}${active ? ' active' : ''}`}
              aria-label={`#${k + 1} ${s}, ${i.name}. Drag or use arrow keys to move`}
              title={`#${k + 1} ${i.name}${to !== undefined ? `\nSuggested: move to #${to + 1} (see the Team tab)` : ''}`}>
              <span className="bar-face">
                <Portrait identity={i} kind="profile" variant={art} />
                <span className="bar-slot">{k + 1}</span>
                {to !== undefined && <span className="bar-suggest">→{to + 1}</span>}
              </span>
              <span className="bar-name">{s}</span>
            </li>
          )
        })}
      </ol>
      {suggestionCount > 0 && (
        <button className="bar-suggestions" onClick={onOpenTeam}>
          {suggestionCount} lineup suggestion{suggestionCount > 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}
