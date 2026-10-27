/**
 * Click and drag to scroll anything that scrolls on its own (Finley: "everywhere it scrolls"):
 * the Fuse screen's gift grid, the lineup strip, rows of cards or tabs that don't fit, side
 * panels, lists in dialogs. Mouse only (touch already drags), and not the page itself.
 *
 * A drag only starts after the pointer moves a few pixels, so a plain click still works; after
 * a drag, the click that would follow is swallowed so you don't pick the item you let go on.
 * Text fields, selects and the lineup strip's sinners (dragged to reorder) are left alone.
 */
const THRESHOLD = 5
const SKIP = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], .bar-item, .bar-divider, [data-no-drag-scroll]'

function scrollable(el: Element): { el: HTMLElement; x: boolean; y: boolean } | null {
  for (let n: Element | null = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    if (!(n instanceof HTMLElement)) continue
    const cs = getComputedStyle(n)
    const x = /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1
    const y = /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1
    if (x || y) return { el: n, x, y }
  }
  return null
}

export function installDragScroll(): () => void {
  let drag: { el: HTMLElement; x: boolean; y: boolean; startX: number; startY: number; left: number; top: number; moved: boolean; id: number } | null = null

  const swallowClick = () => {
    const stop = (e: Event) => { e.preventDefault(); e.stopPropagation() }
    window.addEventListener('click', stop, { capture: true, once: true })
    // If no click comes (released outside the element), don't eat a later one.
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
  }

  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.defaultPrevented) return
    const target = e.target as Element | null
    if (!target || target.closest(SKIP)) return
    const s = scrollable(target)
    if (!s) return
    drag = { ...s, startX: e.clientX, startY: e.clientY, left: s.el.scrollLeft, top: s.el.scrollTop, moved: false, id: e.pointerId }
  }

  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.moved) {
      // Only along a direction the box can scroll.
      const along = (drag.x ? Math.abs(dx) : 0) + (drag.y ? Math.abs(dy) : 0)
      if (along < THRESHOLD) return
      drag.moved = true
      document.documentElement.classList.add('drag-scrolling')
      window.getSelection()?.removeAllRanges()
    }
    if (drag.x) drag.el.scrollLeft = drag.left - dx
    if (drag.y) drag.el.scrollTop = drag.top - dy
    e.preventDefault()
  }

  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    if (drag.moved) {
      document.documentElement.classList.remove('drag-scrolling')
      swallowClick()
    }
    drag = null
  }

  window.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove, { passive: false })
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  return () => {
    window.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    document.documentElement.classList.remove('drag-scrolling')
  }
}
