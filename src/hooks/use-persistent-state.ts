'use client'

import { useEffect, useState } from 'react'

/**
 * Module-level filter cache: survives client-side route changes (back/forward,
 * Link navigation) but clears on a real page refresh because the JS bundle
 * reloads. This is exactly the "remember filters until refresh" UX we want.
 */
const cache = new Map<string, unknown>()

export function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    if (cache.has(key)) return cache.get(key) as T
    return initial
  })

  useEffect(() => {
    cache.set(key, state)
  }, [key, state])

  return [state, setState] as const
}
