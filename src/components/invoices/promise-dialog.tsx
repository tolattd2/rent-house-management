'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'

type PromiseEntry = { date: string; setAt: string; by?: string }
type PromiseRecord = {
  current: string | null
  currentSetAt: string | null
  history: PromiseEntry[]
  alerted: string[]
}

interface Props {
  billingId: string
  onClose: () => void
  onSaved?: (record: PromiseRecord) => void
}

/**
 * Lets the admin record (and update) the tenant's promised pay date for one
 * invoice, and view the full history of previous promises. The landlord
 * overdue-alert cron uses the latest current value to decide who to chase.
 */
export function PromiseDialog({ billingId, onClose, onSaved }: Props) {
  const [record, setRecord] = useState<PromiseRecord | null>(null)
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/billings/${billingId}/promise`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.ok) {
          const rec: PromiseRecord = {
            current: data.current ?? null,
            currentSetAt: data.currentSetAt ?? null,
            history: Array.isArray(data.history) ? data.history : [],
            alerted: Array.isArray(data.alerted) ? data.alerted : [],
          }
          setRecord(rec)
          setDate(rec.current ?? '')
        } else {
          toast({ title: 'Failed to load promise', description: data.error, variant: 'destructive' })
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [billingId])

  async function handleSave() {
    if (!date) {
      toast({ title: 'Pick a date first', variant: 'destructive' })
      return
    }
    setBusy('save')
    const res = await fetch(`/api/billings/${billingId}/promise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    })
    const data = await res.json()
    if (data.ok) {
      const next: PromiseRecord = {
        current: data.current,
        currentSetAt: data.currentSetAt,
        history: data.history ?? [],
        alerted: data.alerted ?? [],
      }
      setRecord(next)
      toast({ title: 'Promise saved' })
      onSaved?.(next)
    } else {
      toast({ title: 'Failed to save', description: data.error, variant: 'destructive' })
    }
    setBusy(null)
  }

  async function handleClear() {
    if (!confirm('Clear the current promise date? (History stays.)')) return
    setBusy('clear')
    const res = await fetch(`/api/billings/${billingId}/promise`, { method: 'DELETE' })
    const data = await res.json()
    if (data.ok) {
      const next: PromiseRecord = {
        current: null,
        currentSetAt: null,
        history: data.history ?? [],
        alerted: data.alerted ?? [],
      }
      setRecord(next)
      setDate('')
      toast({ title: 'Promise cleared' })
      onSaved?.(next)
    } else {
      toast({ title: 'Failed to clear', description: data.error, variant: 'destructive' })
    }
    setBusy(null)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-blue-500" />
            Promise to Pay
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="promise-date">Promised pay date</Label>
              <DateInput
                id="promise-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                If this date passes without payment, the landlord gets a Telegram alert
                (only when Overdue Alert For Landlord is enabled in Settings).
              </p>
            </div>

            <div className="flex justify-end gap-2">
              {record?.current && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  loading={busy === 'clear'}
                  disabled={busy !== null}
                  onClick={handleClear}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />Clear
                </Button>
              )}
              <Button
                type="button"
                loading={busy === 'save'}
                disabled={busy !== null}
                onClick={handleSave}
              >
                {record?.current ? 'Update' : 'Save'}
              </Button>
            </div>

            {record && record.history.length > 0 && (
              <div className="pt-3 border-t space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Previous promises</p>
                <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                  {record.history.map((h, idx) => (
                    <li key={`${h.date}-${h.setAt}-${idx}`} className="text-sm flex justify-between gap-3">
                      <span className="font-medium tabular-nums">{h.date}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(h.setAt)}{h.by ? ` · ${h.by}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
