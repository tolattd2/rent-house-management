'use client'

import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  itemName?: string
  description?: string
}

export function DeleteConfirmDialog({ open, onClose, onConfirm, itemName, description }: Props) {
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
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => { onConfirm(); onClose() }}>Delete</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
