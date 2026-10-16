/**
 * Team presets: saved sets of identities (which version of each sinner you run,
 * e.g. The Thumb Rodion) that you can switch between on the Team tab instead of
 * swapping identities one by one.
 *
 * A preset is the identities plus, optionally, the lineup order. You don't need an
 * order to save one; a preset without an order leaves your current order alone when
 * loaded. Deployed count, E.G.O and run state (owned gifts, floor, packs) are never
 * part of a preset.
 *
 * Identities are stored for all 12 sinners (the effective one, so a sinner on their
 * base LCB identity is saved as that), which keeps a preset exact even if the
 * defaults change later.
 */
import { SINNERS, type Sinner } from './types'

/** Each sinner's equipped identity id. */
export type Equipped = Partial<Record<Sinner, string | null>>

export interface TeamPreset {
  id: string
  name: string
  /** Identity id per sinner. */
  team: Equipped
  /** Lineup order (#1, #2, ...), if one was picked when saving. Empty/missing = no order. */
  selection?: Sinner[]
  /** ms since epoch, last time it was saved or updated. */
  savedAt: number
}

export const MAX_NAME = 40

let counter = 0
function newId(now: number): string {
  counter = (counter + 1) % 1000
  return `p${now.toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
}

/** "Burn team", then "Burn team (2)" if that name's taken. */
export function uniqueName(name: string, presets: TeamPreset[], ignoreId?: string): string {
  const base = cleanName(name) || 'Team'
  const taken = new Set(presets.filter((p) => p.id !== ignoreId).map((p) => p.name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) {
    const next = `${base} (${n})`
    if (!taken.has(next.toLowerCase())) return next
  }
}

export function makePreset(
  name: string, team: Equipped, selection: Sinner[], presets: TeamPreset[], now = Date.now(),
): TeamPreset {
  return { id: newId(now), name: uniqueName(name, presets), team: { ...team }, selection: [...selection], savedAt: now }
}

/** Overwrite a preset with the current identities and order (keeps its name and place in the list). */
export function updatePreset(
  presets: TeamPreset[], id: string, team: Equipped, selection: Sinner[], now = Date.now(),
): TeamPreset[] {
  return presets.map((p) => (p.id === id ? { ...p, team: { ...team }, selection: [...selection], savedAt: now } : p))
}

export function renamePreset(presets: TeamPreset[], id: string, name: string): TeamPreset[] {
  if (!cleanName(name)) return presets
  return presets.map((p) => (p.id === id ? { ...p, name: uniqueName(name, presets, id) } : p))
}

/** Move a preset up (-1) or down (+1) in the list. */
export function movePreset(presets: TeamPreset[], id: string, by: -1 | 1): TeamPreset[] {
  const k = presets.findIndex((p) => p.id === id)
  const to = k + by
  if (k < 0 || to < 0 || to >= presets.length) return presets
  const out = [...presets]
  ;[out[k], out[to]] = [out[to], out[k]]
  return out
}

/** Does every sinner have the same identity in both? */
export function sameTeam(a: Equipped, b: Equipped): boolean {
  return SINNERS.every((s) => (a[s] ?? null) === (b[s] ?? null))
}

/** Does this preset have a lineup order saved? */
export function hasOrder(p: TeamPreset): boolean {
  return restoreSelection(p.selection).length > 0
}

export function sameOrder(a: Sinner[], b: Sinner[]): boolean {
  return a.length === b.length && a.every((s, k) => b[k] === s)
}

/**
 * Is this preset what you have now? Identities must match, and the order too if the
 * preset saved one (a preset without an order matches any order).
 */
export function presetMatches(p: TeamPreset, team: Equipped, selection: Sinner[]): boolean {
  return sameTeam(p.team, team) && (!hasOrder(p) || sameOrder(restoreSelection(p.selection), selection))
}

/** A saved order minus unknown or repeated sinners. */
export function restoreSelection(selection: readonly unknown[] | undefined): Sinner[] {
  if (!Array.isArray(selection)) return []
  return selection.filter((s, k, all): s is Sinner => (SINNERS as readonly unknown[]).includes(s) && all.indexOf(s) === k)
}

/**
 * The identities to equip from a preset, dropping any the current data no longer
 * has (removed by a wiki update), which fall back to the sinner's default.
 */
export function restoreTeam(team: Equipped, knownIdentities: Set<string>): Equipped {
  const out: Equipped = {}
  for (const s of SINNERS) {
    const id = team?.[s]
    if (id && knownIdentities.has(id)) out[s] = id
  }
  return out
}

/** Presets read from storage, minus anything malformed. */
export function validPresets(list: unknown): TeamPreset[] {
  if (!Array.isArray(list)) return []
  return list.filter((p): p is TeamPreset =>
    !!p && typeof p === 'object' && typeof (p as TeamPreset).id === 'string' && typeof (p as TeamPreset).name === 'string'
    && !!(p as TeamPreset).team && typeof (p as TeamPreset).team === 'object')
}
