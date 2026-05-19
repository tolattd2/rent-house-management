'use client'

import { useState, useCallback } from 'react'
import { toast } from '@/hooks/use-toast'

interface DeleteOptions {
  itemName?: string
  onRemove?: () => void
  onRestore?: () => void
  onExecute: () => Promise<{ ok: boolean; error?: string }>
  onSuccess?: () => void
}

interface RunDeleteOptions extends DeleteOptions {
  toastTitle?: string
  toastDescription?: string
}

interface DialogState {
  open: boolean
  itemName?: string
  onConfirm: () => void
}

export function runDeleteWithUndo(options: RunDeleteOptions) {
  const {
    onRemove, onRestore, onExecute, onSuccess,
    toastTitle = 'Deleted',
    toastDescription = 'Click Undo to restore.',
  } = options

  onRemove?.()

  let cancelled = false
  const timerId = setTimeout(async () => {
    if (cancelled) return
    const result = await onExecute()
    if (!result.ok) {
      onRestore?.()
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    } else {
      onSuccess?.()
    }
  }, 5000)

  toast({
    title: toastTitle,
    description: toastDescription,
    action: {
      label: 'Undo',
      onClick: () => {
        cancelled = true
        clearTimeout(timerId)
        onRestore?.()
      },
    },
  })
}

export function useDeleteWithUndo() {
  const [dialogState, setDialogState] = useState<DialogState>({
    open: false,
    onConfirm: () => {},
  })

  const triggerDelete = useCallback((options: DeleteOptions) => {
    const { itemName } = options
    setDialogState({
      open: true,
      itemName,
      onConfirm: () => runDeleteWithUndo(options),
    })
  }, [])

  const closeDialog = useCallback(() => {
    setDialogState((d) => ({ ...d, open: false }))
  }, [])

  return { triggerDelete, dialogState, closeDialog }
}
