'use client'

import { useState, useEffect } from 'react'
import { FileText, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'

interface Props {
  months: string[]
  branches: string[]
  onClose: () => void
  onGenerated: () => void
}

export function BatchGenerateInvoiceDialog({ months, branches, onClose, onGenerated }: Props) {
  const [month, setMonth] = useState(months[0] ?? '')
  const [branch, setBranch] = useState('all')
  const [preview, setPreview] = useState<{ willGenerate: number; alreadyExists: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!month) return
    setPreview(null)
    setLoading(true)
    const params = new URLSearchParams({ month, branch })
    fetch(`/api/invoices/generate?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setPreview({ willGenerate: d.willGenerate, alreadyExists: d.alreadyExists }) })
      .finally(() => setLoading(false))
  }, [month, branch])

  const handleGenerate = async () => {
    if (!month || preview?.willGenerate === 0) return
    setGenerating(true)
    const res = await fetch('/api/invoices/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, branch }),
    })
    const data = await res.json()
    if (data.ok) {
      toast({ title: `${data.created} invoice${data.created !== 1 ? 's' : ''} issued to Invoice page` })
      onGenerated()
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
    setGenerating(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" /> Batch Invoice
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

          {/* Preview */}
          <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm space-y-1">
            {loading ? (
              <p className="text-muted-foreground">Checking…</p>
            ) : preview ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Will issue</span>
                  <span className="font-semibold">{preview.willGenerate} invoice{preview.willGenerate !== 1 ? 's' : ''}</span>
                </div>
                {preview.alreadyExists > 0 && (
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" />Already issued</span>
                    <span>{preview.alreadyExists}</span>
                  </div>
                )}
                {preview.willGenerate === 0 && (
                  <p className="text-muted-foreground text-xs">All billing records for this selection already have invoices.</p>
                )}
              </>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={generating || loading || preview?.willGenerate === 0}>
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            {generating ? 'Issuing…' : `Issue ${preview?.willGenerate ?? '…'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
