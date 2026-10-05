import { useState } from 'react'
import { identityArt, identityProfile, type ArtVariant } from '../lib/images'
import type { Identity } from '../lib/types'

/**
 * Wiki art for an identity. If an image can't load it falls back: threadspun
 * art -> base art -> a plain tile with the sinner's initials.
 *
 * The wiki only has square profile portraits for the base art, so a threadspun
 * profile is a face crop of the threadspun card art (`portrait-crop`).
 */
export function Portrait({ identity, kind, variant = 'base', className }: {
  identity: Identity; kind: 'art' | 'profile'; variant?: ArtVariant; className?: string
}) {
  const sources = kind === 'profile'
    ? variant === 'uptie' ? [identityArt(identity, 240, 'uptie'), identityProfile(identity)] : [identityProfile(identity)]
    : variant === 'uptie' ? [identityArt(identity, 240, 'uptie'), identityArt(identity)] : [identityArt(identity)]
  const [failed, setFailed] = useState<string[]>([])
  const src = sources.find((s) => !failed.includes(s))
  const cls = `portrait portrait-${kind} sinner-bg-${identity.sinner.replace(/[^A-Za-z]/g, '').toLowerCase()} ${className ?? ''}`
  if (!src) {
    const initials = identity.sinner.split(' ').map((w) => w[0]).join('')
    return <span className={`${cls} portrait-fallback`} aria-hidden="true">{initials}</span>
  }
  if (kind === 'profile' && src.includes('_Uptied')) {
    return (
      <span className={`${cls} portrait-crop`}>
        <img key={src} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
          draggable={false} onError={() => setFailed((f) => [...f, src])} />
      </span>
    )
  }
  return (
    <img key={src} className={cls} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
      draggable={false} onError={() => setFailed((f) => [...f, src])} />
  )
}
