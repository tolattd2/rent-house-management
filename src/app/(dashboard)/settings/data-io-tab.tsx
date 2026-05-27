'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, FileSpreadsheet, FileDown, Upload, AlertTriangle, CheckCircle2, Loader2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import type { ImportPlan } from '@/lib/data-io/types'

interface ImportApiResponse {
  ok: boolean
  plan?: ImportPlan
  applied?: boolean
  error?: string
}

export function DataIoTab() {
  const { t } = useLanguage()
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement | null>(null)

  const [busy, setBusy] = useState<'export-xlsx' | 'export-csv' | 'template' | 'preview' | 'apply' | null>(null)
  const [picked, setPicked] = useState<File | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  async function download(url: string, kind: 'export-xlsx' | 'export-csv' | 'template') {
    setBusy(kind)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = /filename="([^"]+)"/.exec(disposition)
      const filename = match?.[1] ?? 'data-export'
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = filename
      link.click()
      URL.revokeObjectURL(link.href)
      toast({ title: t('data_io_downloaded') })
    } catch (e) {
      toast({ title: t('data_io_download_failed'), description: String(e), variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  function onFilePicked(file: File | undefined) {
    if (!file) return
    setPicked(file)
    void runPreview(file)
  }

  async function runPreview(file: File) {
    setBusy('preview')
    setPlan(null)
    setPreviewOpen(true)
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('dryRun', '1')
      const res = await fetch('/api/data-io/import', { method: 'POST', body: form })
      const json = (await res.json()) as ImportApiResponse
      if (!json.ok || !json.plan) throw new Error(json.error ?? 'Preview failed')
      setPlan(json.plan)
    } catch (e) {
      toast({ title: t('data_io_preview_failed'), description: String(e), variant: 'destructive' })
      setPreviewOpen(false)
    } finally {
      setBusy(null)
    }
  }

  async function applyImport() {
    if (!picked) return
    setBusy('apply')
    try {
      const form = new FormData()
      form.set('file', picked)
      form.set('dryRun', '0')
      const res = await fetch('/api/data-io/import', { method: 'POST', body: form })
      const json = (await res.json()) as ImportApiResponse
      if (!json.ok) throw new Error(json.error ?? 'Import failed')
      toast({ title: t('data_io_import_applied') })
      setPreviewOpen(false)
      setPicked(null)
      setPlan(null)
      router.refresh()
    } catch (e) {
      toast({ title: t('data_io_import_failed'), description: String(e), variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const totals = plan
    ? plan.sheets.reduce(
        (acc, s) => ({
          create: acc.create + s.create,
          update: acc.update + s.update,
          error: acc.error + s.error,
        }),
        { create: 0, update: 0, error: 0 },
      )
    : null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />{t('data_io_export_title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('data_io_export_desc')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => download('/api/data-io/export?format=xlsx', 'export-xlsx')}
            >
              {busy === 'export-xlsx' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              {t('data_io_export_xlsx')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => download('/api/data-io/export?format=csv', 'export-csv')}
            >
              {busy === 'export-csv' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              {t('data_io_export_csv')}
            </Button>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{t('data_io_gsheets_hint')}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileDown className="w-4 h-4" />{t('data_io_template_title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('data_io_template_desc')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => download('/api/data-io/template', 'template')}
          >
            {busy === 'template' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
            {t('data_io_template_btn')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />{t('data_io_import_title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('data_io_import_desc')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            {t('data_io_import_btn')}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.zip"
            className="sr-only"
            onChange={(e) => {
              onFilePicked(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </CardContent>
      </Card>

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          if (busy === 'apply') return
          setPreviewOpen(open)
          if (!open) {
            setPicked(null)
            setPlan(null)
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('data_io_preview_title')}</DialogTitle>
          </DialogHeader>

          {busy === 'preview' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('data_io_analyzing')}
            </div>
          )}

          {plan && totals && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <Stat label={t('data_io_will_create')} value={totals.create} tone="positive" />
                <Stat label={t('data_io_will_update')} value={totals.update} tone="warning" />
                <Stat label={t('data_io_has_errors')} value={totals.error} tone={totals.error > 0 ? 'destructive' : 'neutral'} />
              </div>

              <div className="border border-border rounded-md max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr className="text-left">
                      <th className="p-2 font-medium">{t('data_io_sheet')}</th>
                      <th className="p-2 font-medium text-right">{t('data_io_create')}</th>
                      <th className="p-2 font-medium text-right">{t('data_io_update')}</th>
                      <th className="p-2 font-medium text-right">{t('data_io_errors')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.sheets.length === 0 && (
                      <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">{t('data_io_no_rows')}</td></tr>
                    )}
                    {plan.sheets.map((s) => (
                      <tr key={s.sheet} className="border-t border-border">
                        <td className="p-2">{s.sheet}</td>
                        <td className="p-2 text-right">{s.create}</td>
                        <td className="p-2 text-right">{s.update}</td>
                        <td className={`p-2 text-right ${s.error > 0 ? 'text-destructive font-medium' : ''}`}>{s.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {plan.unknownSheets.length > 0 && (
                <div className="flex items-start gap-2 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-md p-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{t('data_io_unknown_sheets')}: {plan.unknownSheets.join(', ')}</span>
                </div>
              )}

              {plan.hasErrors && (
                <ErrorList plan={plan} />
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy === 'apply'}
              onClick={() => setPreviewOpen(false)}
            >
              {t('data_io_cancel')}
            </Button>
            <Button
              type="button"
              disabled={!plan || plan.hasErrors || busy !== null || (totals?.create ?? 0) + (totals?.update ?? 0) === 0}
              onClick={applyImport}
            >
              {busy === 'apply' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              {t('data_io_apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'positive' | 'warning' | 'destructive' | 'neutral' }) {
  const color =
    tone === 'positive' ? 'text-emerald-600 dark:text-emerald-400' :
    tone === 'warning'  ? 'text-amber-600 dark:text-amber-400' :
    tone === 'destructive' ? 'text-destructive' : 'text-foreground'
  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  )
}

function ErrorList({ plan }: { plan: ImportPlan }) {
  const errored = plan.sheets.flatMap((s) =>
    s.rows
      .filter((r) => r.outcome === 'error')
      .map((r) => ({ sheet: s.sheet, ...r })),
  )
  if (errored.length === 0) return null
  return (
    <div className="border border-destructive/40 bg-destructive/5 rounded-md max-h-48 overflow-y-auto">
      <div className="px-2.5 py-1.5 text-xs font-medium text-destructive border-b border-destructive/30">
        Errors must be fixed before import
      </div>
      <ul className="divide-y divide-destructive/20">
        {errored.slice(0, 50).map((e, i) => (
          <li key={i} className="px-2.5 py-1.5 text-xs">
            <span className="font-medium">{e.sheet}</span>
            <span className="text-muted-foreground"> · row {e.rowIndex + 2}</span>
            {e.label && <span className="text-muted-foreground"> · {e.label}</span>}
            <ul className="mt-0.5 pl-3 text-destructive">
              {e.errors?.map((err, j) => (
                <li key={j}>· {err.column ? `${err.column}: ` : ''}{err.message}</li>
              ))}
            </ul>
          </li>
        ))}
        {errored.length > 50 && (
          <li className="px-2.5 py-1.5 text-xs text-muted-foreground italic">
            … and {errored.length - 50} more
          </li>
        )}
      </ul>
    </div>
  )
}
