import { useMemo } from 'react'
import { packOnFloor, type RunSettings } from './scoring'
import type { ThemePack } from './types'

/** The floor's theme packs, by name (the "Theme pack on this floor" picker). */
export function usePacksOnFloor(packs: ThemePack[], run: RunSettings): ThemePack[] {
  return useMemo(
    () => run.floor === null ? [] : packs.filter((p) => packOnFloor(p, run.difficulty, run.floor!))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [packs, run.difficulty, run.floor],
  )
}

/** Move to a floor (null = end the run). Going back to a floor brings back the pack you picked
 *  there; starting a run clears the old picks. */
export function withFloor(run: RunSettings, floor: number | null): RunSettings {
  return run.floor === null
    ? { ...run, floor, pack: null, visited: {} }
    : { ...run, floor, pack: floor === null ? null : run.visited?.[floor] ?? null }
}
