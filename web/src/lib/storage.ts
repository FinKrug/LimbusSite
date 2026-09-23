import { useEffect, useState } from 'react'

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
 */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState(() => ({ key, value: read(key, initial) }))
  let current = state
  if (state.key !== key) {
    current = { key, value: read(key, initial) }
    setState(current) // allowed during render: React re-renders right away with the new key's value
  }
  useEffect(() => {
    try {
      localStorage.setItem(current.key, JSON.stringify(current.value))
    } catch {
      // private mode / storage full: keep working in memory
    }
  }, [current.key, current.value])
  const setValue = (v: T | ((prev: T) => T)) =>
    setState((s) => ({ key: s.key, value: typeof v === 'function' ? (v as (prev: T) => T)(s.value) : v }))
  return [current.value, setValue]
}
