'use client'

import { useEffect } from 'react'
import { signOut } from 'next-auth/react'

const IDLE_LIMIT_MS = 10 * 60 * 1000
const STORAGE_KEY = 'lastActivityAt'
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']

export function IdleTimeout() {
  useEffect(() => {
    const markActive = () => {
      localStorage.setItem(STORAGE_KEY, Date.now().toString())
    }

    // Throttle writes so we don't touch localStorage on every mousemove.
    let lastWrite = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - lastWrite > 1000) {
        lastWrite = now
        markActive()
      }
    }

    markActive()
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))

    const interval = setInterval(() => {
      const last = Number(localStorage.getItem(STORAGE_KEY) || Date.now())
      if (Date.now() - last >= IDLE_LIMIT_MS) {
        signOut({ callbackUrl: '/login' })
      }
    }, 15_000)

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity))
      clearInterval(interval)
    }
  }, [])

  return null
}
