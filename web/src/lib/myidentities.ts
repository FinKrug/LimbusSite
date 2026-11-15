// Identities you own ("My identities" in Tools). Saved as a list of identity ids under
// limbussite.identities.v1, so cloud sync carries it to your account like everything
// else (Firestore field `identities_v1`).
//
// The 12 base LCB Sinner identities come with the game, so they're always owned and
// never stored. An empty list means you haven't marked anything yet.
import { SINNERS, type Identity, type Sinner } from './types'

export const OWNED_IDENTITIES_KEY = 'limbussite.identities.v1'

/** The 12 identities every player starts with. */
export function isBaseIdentity(i: Identity): boolean {
  return (i.rarity ?? 1) === 1
}

/** The ids you own: the stored ones that still exist, plus every base identity. */
export function ownedIdentitySet(stored: readonly string[], identities: readonly Identity[]): Set<string> {
  const known = new Set(identities.map((i) => i.id))
  const out = new Set(stored.filter((id) => known.has(id)))
  for (const i of identities) if (isBaseIdentity(i)) out.add(i.id)
  return out
}

/** Have you marked any identity yet (beyond the base ones you always have)? */
export function hasMarkedIdentities(stored: readonly string[], identities: readonly Identity[]): boolean {
  const known = new Map(identities.map((i) => [i.id, i]))
  return stored.some((id) => { const i = known.get(id); return !!i && !isBaseIdentity(i) })
}

/** What to store: only non-base ids, no duplicates or unknown ones, in a stable order. */
export function normalizeOwned(ids: Iterable<string>, identities: readonly Identity[]): string[] {
  const want = new Set(ids)
  return identities.filter((i) => !isBaseIdentity(i) && want.has(i.id)).map((i) => i.id)
}

/** Mark or unmark one identity. Base identities can't be unmarked. */
export function setOwned(stored: readonly string[], id: string, own: boolean, identities: readonly Identity[]): string[] {
  const next = new Set(stored)
  if (own) next.add(id)
  else next.delete(id)
  return normalizeOwned(next, identities)
}

/** Mark (or clear) every identity of one sinner. */
export function setSinnerOwned(stored: readonly string[], sinner: Sinner, own: boolean, identities: readonly Identity[]): string[] {
  const next = new Set(stored)
  for (const i of identities) {
    if (i.sinner !== sinner) continue
    if (own) next.add(i.id)
    else next.delete(i.id)
  }
  return normalizeOwned(next, identities)
}

export interface SinnerGroup {
  sinner: Sinner
  /** Base first, then 000 → 00, alphabetical within each rarity (like the game's sort). */
  list: Identity[]
  owned: number
}

/** Every identity grouped by sinner in the game's sinner order. */
export function groupBySinner(identities: readonly Identity[], owned: ReadonlySet<string>, shortName: (i: Identity) => string): SinnerGroup[] {
  return SINNERS.map((sinner) => {
    const list = identities.filter((i) => i.sinner === sinner).sort((a, b) =>
      Number(isBaseIdentity(b)) - Number(isBaseIdentity(a))
      || (b.rarity ?? 1) - (a.rarity ?? 1)
      || shortName(a).localeCompare(shortName(b)))
    return { sinner, list, owned: list.filter((i) => owned.has(i.id)).length }
  }).filter((g) => g.list.length > 0)
}
