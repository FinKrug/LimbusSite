import { useState } from 'react'
import type { Ego } from '../lib/ego'
import type { ArtVariant } from '../lib/images'
import { ownedEgoSet } from '../lib/myegos'
import { ownedIdentitySet } from '../lib/myidentities'
import type { Identity } from '../lib/types'
import { MyEgoTab } from './MyEgoTab'
import { MyIdentitiesTab } from './MyIdentitiesTab'

export type CollectionKind = 'identities' | 'ego'

/** Home › My identities & E.G.O: what you own, with a switch between identities and E.G.O. */
export function MyCollection({ identities, storedIdentities, onIdentitiesChange, egos, storedEgos, onEgosChange, art, onOpenData, importOpen = false }: {
  identities: Identity[]
  storedIdentities: string[]
  onIdentitiesChange: (ids: string[]) => void
  egos: Ego[]
  storedEgos: string[]
  onEgosChange: (ids: string[]) => void
  art: ArtVariant
  onOpenData: () => void
  importOpen?: boolean
}) {
  const [kind, setKind] = useState<CollectionKind>('identities')
  const nIds = ownedIdentitySet(storedIdentities, identities).size
  const nEgos = ownedEgoSet(storedEgos, egos).size
  return (
    <div className="collection">
      <div className="seg collection-switch" role="tablist" aria-label="What you own">
        <button role="tab" aria-selected={kind === 'identities'} className={kind === 'identities' ? 'seg-btn on' : 'seg-btn'}
          onClick={() => setKind('identities')}>Identities <span className="muted">{nIds}/{identities.length}</span></button>
        <button role="tab" aria-selected={kind === 'ego'} className={kind === 'ego' ? 'seg-btn on' : 'seg-btn'}
          onClick={() => setKind('ego')}>E.G.O <span className="muted">{nEgos}/{egos.length}</span></button>
      </div>
      {kind === 'identities'
        ? <MyIdentitiesTab identities={identities} stored={storedIdentities} onChange={onIdentitiesChange} art={art}
          onOpenData={onOpenData} importOpen={importOpen} />
        : <MyEgoTab egos={egos} stored={storedEgos} onChange={onEgosChange} onOpenData={onOpenData} importOpen={importOpen} />}
    </div>
  )
}
