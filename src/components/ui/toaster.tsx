'use client'

import { useToast } from '@/hooks/use-toast'
import { X } from 'lucide-react'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            flex flex-col rounded-xl border shadow-lg animate-fade-in overflow-hidden
            ${toast.variant === 'destructive'
              ? 'bg-destructive text-destructive-foreground border-destructive/30'
              : 'bg-card text-card-foreground border-border'
            }
          `}
        >
          <div className="flex items-start gap-3 p-4">
            <div className="flex-1 min-w-0">
              {toast.title && (
                <p className="text-sm font-semibold">{toast.title}</p>
              )}
              {toast.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{toast.description}</p>
              )}
            </div>
            {toast.action && (
              <button
                onClick={() => { toast.action!.onClick(); dismiss(toast.id) }}
                className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(toast.id)}
              className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {toast.action && (
            <div className="h-0.5 bg-muted w-full">
              <div className="h-full bg-primary animate-countdown" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
