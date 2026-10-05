/**
 * Vestiges: a duplicate of a gift you own becomes a Vestige of its tier, a
 * "Sale & Fusion-only" gift that counts as that tier (wiki: Mirror Dungeon >
 * E.G.O Gifts). Unlike other gifts you can hold several of each.
 */
export const VESTIGE_BY_TIER: Record<number, string> = {
  1: 'dark-vestige',
  2: 'faint-vestige',
  3: 'twinkling-vestige',
  4: 'brilliant-vestige',
  5: 'lunar-vestige',
}
export const VESTIGES = Object.values(VESTIGE_BY_TIER)

export function isVestige(id: string): boolean {
  return VESTIGES.includes(id)
}

/** Add a gift to what you own: a gift you already have becomes a Vestige of its tier. */
export function addGift(owned: string[], id: string, tier: number | null): string[] {
  if (isVestige(id) || !owned.includes(id)) return [...owned, id]
  const v = VESTIGE_BY_TIER[tier ?? 1]
  return v ? [...owned, v] : owned
}

/** Remove one copy of a gift. */
export function removeOne(owned: string[], id: string): string[] {
  const k = owned.lastIndexOf(id)
  return k < 0 ? owned : [...owned.slice(0, k), ...owned.slice(k + 1)]
}

export function countOf(owned: string[], id: string): number {
  return owned.filter((x) => x === id).length
}
