import { useState } from 'react'
import { giftIcon } from '../lib/images'
import type { Gift } from '../lib/types'

/** A gift's wiki icon; falls back to a plain tile (sin-coloured edge) when offline. */
export function GiftIcon({ gift, size }: { gift: Gift; size: number }) {
  const sources = giftIcon(gift, size * 2)
  const [failed, setFailed] = useState(0)
  const style = { width: size, height: size }
  const cls = `gift-icon${gift.sin ? ` gift-icon-${gift.sin}` : ''}`
  if (failed >= sources.length) return <span className={`${cls} gift-icon-fallback`} style={style} aria-hidden="true" />
  return (
    <img key={sources[failed]} className={cls} style={style} src={sources[failed]} alt="" loading="lazy" decoding="async"
      referrerPolicy="no-referrer" draggable={false} onError={() => setFailed((n) => n + 1)} />
  )
}
