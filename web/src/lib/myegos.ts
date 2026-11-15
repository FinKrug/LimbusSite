// E.G.O you own (Home › My identities & E.G.O › E.G.O). Saved as a list of E.G.O ids under
// limbussite.egos.owned.v1, synced to your account like everything else (Firestore field
// `egos_owned_v1`). Each sinner's starting E.G.O comes with the game, so it's always owned and
// never stored. (Not to be confused with limbussite.egos.v1, the E.G.O equipped per sinner.)
import { GRADES, type Ego, type Grade } from './ego'
import { SINNERS, type Sinner } from './types'

export const OWNED_EGOS_KEY = 'limbussite.egos.owned.v1'

const GRADE_ORDER: readonly Grade[] = GRADES

export function isBaseEgo(e: Ego): boolean {
  return !!e.base
}

/** The ids you own: the stored ones that still exist, plus every starting E.G.O. */
export function ownedEgoSet(stored: readonly string[], egos: readonly Ego[]): Set<string> {
  const known = new Set(egos.map((e) => e.id))
  const out = new Set(stored.filter((id) => known.has(id)))
  for (const e of egos) if (isBaseEgo(e)) out.add(e.id)
  return out
}

export function hasMarkedEgos(stored: readonly string[], egos: readonly Ego[]): boolean {
  const known = new Map(egos.map((e) => [e.id, e]))
  return stored.some((id) => { const e = known.get(id); return !!e && !isBaseEgo(e) })
}

/** What to store: only non-starting ids, no duplicates or unknown ones, in a stable order. */
export function normalizeOwnedEgos(ids: Iterable<string>, egos: readonly Ego[]): string[] {
  const want = new Set(ids)
  return egos.filter((e) => !isBaseEgo(e) && want.has(e.id)).map((e) => e.id)
}

export function setOwnedEgo(stored: readonly string[], id: string, own: boolean, egos: readonly Ego[]): string[] {
  const next = new Set(stored)
  if (own) next.add(id)
  else next.delete(id)
  return normalizeOwnedEgos(next, egos)
}

export function setSinnerEgos(stored: readonly string[], sinner: Sinner, own: boolean, egos: readonly Ego[]): string[] {
  const next = new Set(stored)
  for (const e of egos) {
    if (e.sinner !== sinner) continue
    if (own) next.add(e.id)
    else next.delete(e.id)
  }
  return normalizeOwnedEgos(next, egos)
}

export function gradeRank(g: Grade): number {
  const k = GRADE_ORDER.indexOf(g)
  return k < 0 ? GRADE_ORDER.length : k
}

export interface EgoGroup { sinner: Sinner; list: Ego[]; owned: number }

/** Every E.G.O by sinner in the game's order: starting one first, then ZAYIN → WAW, then by name. */
export function groupEgosBySinner(egos: readonly Ego[], owned: ReadonlySet<string>): EgoGroup[] {
  return SINNERS.map((sinner) => {
    const list = egos.filter((e) => e.sinner === sinner).sort((a, b) =>
      Number(isBaseEgo(b)) - Number(isBaseEgo(a)) || gradeRank(a.grade) - gradeRank(b.grade) || a.name.localeCompare(b.name))
    return { sinner, list, owned: list.filter((e) => owned.has(e.id)).length }
  }).filter((g) => g.list.length > 0)
}
