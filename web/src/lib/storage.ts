import { useEffect, useState } from 'react'

/** useState that survives page reloads. Falls back to memory if storage is unavailable. */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // private mode / storage full: keep working in memory
    }
  }, [key, value])
  return [value, setValue]
}
