'use client'

import { useState, useEffect } from 'react'
import { Calendar, CheckCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import { formatMonth, type FormatLang } from '@/lib/utils'

interface Props {
  branches: string[]
  onClose: () => void
  onGenerated: (month: string) => void
}

function getMonthOptions(lang: FormatLang): { value: string; label: string; isUpcoming: boolean }[] {
  const options = []
  const now = new Date()
  for (let offset = -2; offset <= 3; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    options.push({ value, label: formatMonth(value, lang), isUpcoming: offset > 0 })
  }
  return options
}

export function GenerateMonthlyDialog({ branches, onClose, onGenerated }: Props) {
  const { language } = useLanguage()
  const monthOptions = getMonthOptions(language)
  // Default to next month (upcoming)
  const defaultMonth = monthOptions.find((m) => m.isUpcoming)?.value ?? monthOptions[2].value

  const [month, setMonth] = useState(defaultMonth)
  const [branch, setBranch] = useState('all')
  const [preview, setPreview] = useState<{ willGenerate: number; alreadyExists: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!month) return
    setPreview(null)
    setLoading(true)
    const params = new URLSearchParams({ month, branch })
    fetch(`/api/billing/generate?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setPreview({ willGenerate: d.willGenerate, alreadyExists: d.alreadyExists }) })
      .finally(() => setLoading(false))
  }, [month, branch])

  const handleGenerate = async () => {
    if (!month) return
    setGenerating(true)
    const res = await fetch('/api/billing/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, branch }),
    })
    const data = await res.json()
    if (data.ok) {
      toast({ title: `Generated ${data.created} invoice${data.created !== 1 ? 's' : ''}${data.skipped > 0 ? `, skipped ${data.skipped}` : ''}` })
      onGenerated(month)
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
    setGenerating(false)
  }

  const branchLabel = branch === 'all' ? 'All Branches' : branch
  const selectedMonthLabel = monthOptions.find((m) => m.value === month)?.label ?? month

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Generate Monthly Invoices
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}{m.isUpcoming ? ' (upcoming)' : ''}
                  </SelectItem>
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
          <div className="rounded-lg px-4 py-3 text-sm bg-muted/50 space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
              <span>
                {loading ? 'Checking…' : preview === null ? '—' : preview.willGenerate === 0
                  ? `No new invoices to generate for ${selectedMonthLabel} (${branchLabel}).`
                  : `Will generate ${preview.willGenerate} invoice${preview.willGenerate !== 1 ? 's' : ''} for ${selectedMonthLabel} — ${branchLabel}.`}
              </span>
            </div>
            {!loading && preview !== null && preview.alreadyExists > 0 && (
              <p className="text-xs text-muted-foreground pl-6">
                {preview.alreadyExists} already exist and will be skipped.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={generating || loading || preview?.willGenerate === 0}
          >
            <Calendar className="w-3.5 h-3.5 mr-1.5" />
            {generating ? 'Generating…' : `Generate ${preview?.willGenerate ?? '…'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
