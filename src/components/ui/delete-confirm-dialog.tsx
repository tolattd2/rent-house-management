'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  itemName?: string
  description?: string
  // When set, user must retype this exact phrase before Delete is enabled.
  // Used for high-blast-radius deletes like removing a whole branch.
  confirmPhrase?: string
  confirmLoading?: boolean
}

export function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  itemName,
  description,
  confirmPhrase,
  confirmLoading,
}: Props) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  const phraseRequired = typeof confirmPhrase === 'string' && confirmPhrase.length > 0
  const phraseOk = !phraseRequired || typed.trim() === confirmPhrase

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Confirm Delete
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-1">
          {description ?? (itemName
            ? `Are you sure you want to delete "${itemName}"?`
            : 'Are you sure you want to delete this item?'
          )}
          {' '}This cannot be undone.
        </p>
        {phraseRequired && (
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs">
              Type <span className="font-semibold text-foreground">{confirmPhrase}</span> to confirm
            </Label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmPhrase}
              autoFocus
            />
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={confirmLoading}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!phraseOk || confirmLoading}
            loading={confirmLoading}
            onClick={() => {
              onConfirm()
              // For typed-phrase deletes the parent closes the dialog after
              // the async work — for the legacy quick path we still want the
              // dialog to dismiss synchronously.
              if (!phraseRequired) onClose()
            }}
          >
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
