'use client'

import { useState, useCallback } from 'react'

interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
}

let toastState: Toast[] = []
let listeners: ((toasts: Toast[]) => void)[] = []

function notify(toasts: Toast[]) {
  toastState = toasts
  listeners.forEach((l) => l(toasts))
}

export function toast(props: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).slice(2)
  notify([...toastState, { id, ...props }])
  setTimeout(() => {
    notify(toastState.filter((t) => t.id !== id))
  }, 5000)
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(toastState)

  const subscribe = useCallback((setter: (t: Toast[]) => void) => {
    listeners.push(setter)
    return () => {
      listeners = listeners.filter((l) => l !== setter)
    }
  }, [])

  // Auto-subscribe on mount
  useState(() => {
    const unsub = subscribe(setToasts)
    return unsub
  })

  const dismiss = useCallback((id: string) => {
    notify(toastState.filter((t) => t.id !== id))
  }, [])

  return { toasts, dismiss, toast }
}
