'use client'

import { useEffect, useRef } from 'react'

/** Tracks whether Shift is currently held. Returns a ref so consumers can
 *  read the live value inside event handlers without re-rendering on every
 *  key change. */
export function useShiftKeyRef() {
  const ref = useRef(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { ref.current = e.shiftKey }
    const onBlur = () => { ref.current = false }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
  return ref
}
