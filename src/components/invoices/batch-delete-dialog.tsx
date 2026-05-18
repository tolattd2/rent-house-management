'use client'

import { useState, useEffect } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'

interface Props {
  months: string[]
  branches: string[]
  onClose: () => void
  onDeleted: () => void
}

export function InvoiceBatchDeleteDialog({ months, branches, onClose, onDeleted }: Props) {
  const [month, setMonth] = useState(months[0] ?? '')
  const [branch, setBranch] = useState('all')
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!month) return
    setCount(null)
    setLoading(true)
    const params = new URLSearchParams({ month, branch })
    fetch(`/api/invoices/batch-delete?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setCount(d.count) })
      .finally(() => setLoading(false))
  }, [month, branch])

  const handleDelete = async () => {
    if (!month || count === 0) return
    setDeleting(true)
    const res = await fetch('/api/invoices/batch-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, branch }),
    })
    const data = await res.json()
    if (data.ok) {
      toast({ title: `Deleted ${data.deleted} invoice${data.deleted !== 1 ? 's' : ''}` })
      onDeleted()
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
    setDeleting(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-4 h-4" /> Batch Delete Invoices
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Branch</Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={`rounded-lg px-4 py-3 text-sm flex items-start gap-2.5 ${
            count === 0
              ? 'bg-muted/50 text-muted-foreground'
              : 'bg-destructive/8 border border-destructive/20 text-destructive'
          }`}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {loading ? 'Counting…' : count === null ? '—' : count === 0
                ? 'No invoices match this selection.'
                : `This will permanently delete ${count} invoice${count !== 1 ? 's' : ''} for ${month}${branch !== 'all' ? ` (${branch})` : ''}.`}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting || loading || !count}>
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            {deleting ? 'Deleting…' : `Delete ${count ?? '…'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
