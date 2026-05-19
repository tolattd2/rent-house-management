'use client'

import { useState, useCallback } from 'react'

export interface ToastAction {
  label: string
  onClick: () => void
}

interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
  action?: ToastAction
  duration?: number
}

let toastState: Toast[] = []
let listeners: ((toasts: Toast[]) => void)[] = []

function notify(toasts: Toast[]) {
  toastState = toasts
  listeners.forEach((l) => l(toasts))
}

export function dismissToast(id: string) {
  notify(toastState.filter((t) => t.id !== id))
}

export function toast(props: Omit<Toast, 'id'>): string {
  const id = Math.random().toString(36).slice(2)
  const duration = props.duration ?? 5000
  notify([...toastState, { id, ...props }])
  setTimeout(() => {
    notify(toastState.filter((t) => t.id !== id))
  }, duration)
  return id
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(toastState)

  const subscribe = useCallback((setter: (t: Toast[]) => void) => {
    listeners.push(setter)
    return () => {
      listeners = listeners.filter((l) => l !== setter)
    }
  }, [])

  useState(() => {
    const unsub = subscribe(setToasts)
    return unsub
  })

  const dismiss = useCallback((id: string) => {
    notify(toastState.filter((t) => t.id !== id))
  }, [])

  return { toasts, dismiss, toast }
}
