import { useEffect, useRef, useState } from 'react'

/** Every key the site saves starts with this. */
export const PREFIX = 'limbussite.'

type KeysListener = (keys: string[]) => void
/** Hooks listen here for values written from outside them (cloud sync, a backup file). */
const external = new Set<KeysListener>()
/** Cloud sync listens here for values the site itself changed. */
const local = new Set<KeysListener>()

function emit(set: Set<KeysListener>, keys: string[]) {
  if (keys.length) for (const l of [...set]) l(keys)
}

/** Called with the keys a hook just saved (only when the stored text actually changed). */
export function onLocalWrite(l: KeysListener): () => void {
  local.add(l)
  return () => { local.delete(l) }
}

/**
 * Write saved values from outside the hooks (null removes the key), then let every
 * hook on those keys re-read. `asLocal` also reports them as local changes, so cloud
 * sync uploads them (a loaded backup file) instead of treating them as already saved.
 */
export function writeStored(changes: Record<string, string | null>, { asLocal = false } = {}): string[] {
  const changed: string[] = []
  for (const [key, value] of Object.entries(changes)) {
    try {
      if (localStorage.getItem(key) === value) continue
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
      changed.push(key)
    } catch {
      // storage unavailable: nothing to sync either
    }
  }
  emit(external, changed)
  if (asLocal) emit(local, changed)
  return changed
}

function read<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? initial : (JSON.parse(raw) as T)
  } catch {
    return initial
  }
}

/**
 * useState that survives page reloads. Falls back to memory if storage is unavailable.
 *
 * The value is tied to its key: if the key changes (e.g. a version bump while the dev
 * server hot-reloads the page), it's read fresh from the new key instead of carrying
 * the old value over and saving it there.
 *
 * It also follows the key when something else changes it: cloud sync bringing in
 * another computer's data, a loaded backup, or the site open in another tab.
 */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState(() => ({ key, value: read(key, initial) }))
  let current = state
  if (state.key !== key) {
    current = { key, value: read(key, initial) }
    setState(current) // allowed during render: React re-renders right away with the new key's value
  }
  const initialRef = useRef(initial)
  useEffect(() => { initialRef.current = initial })
  useEffect(() => {
    const reread = () => setState({ key, value: read(key, initialRef.current) })
    const onExternal: KeysListener = (keys) => { if (keys.includes(key)) reread() }
    const onOtherTab = (e: StorageEvent) => { if (e.key === key || e.key === null) reread() }
    external.add(onExternal)
    window.addEventListener('storage', onOtherTab)
    return () => {
      external.delete(onExternal)
      window.removeEventListener('storage', onOtherTab)
    }
  }, [key])
  useEffect(() => {
    try {
      const text = JSON.stringify(current.value)
      if (localStorage.getItem(current.key) === text) return
      localStorage.setItem(current.key, text)
      emit(local, [current.key])
    } catch {
      // private mode / storage full: keep working in memory
    }
  }, [current.key, current.value])
  const setValue = (v: T | ((prev: T) => T)) =>
    setState((s) => ({ key: s.key, value: typeof v === 'function' ? (v as (prev: T) => T)(s.value) : v }))
  return [current.value, setValue]
}
