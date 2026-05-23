'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, FileText, Download, Save, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import {
  DEFAULT_AGREEMENT_TEMPLATE,
  fillPlaceholders,
  computeDurationLabel,
  type AgreementVars,
} from '@/lib/agreement-template'

interface Props {
  tenantId: string
  vars: AgreementVars
  onClose: () => void
  /** Existing saved agreement text, if any — opens directly in edit mode. */
  initialText?: string
}

export function GenerateContractDialog({ tenantId, vars, onClose, initialText }: Props) {
  const { t } = useLanguage()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() =>
    initialText && initialText.trim().length > 0
      ? initialText
      : fillPlaceholders(DEFAULT_AGREEMENT_TEMPLATE, vars),
  )
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)

  const duration = useMemo(
    () => vars.durationLabel || computeDurationLabel(vars.contractStart, vars.contractEnd),
    [vars],
  )

  // On open, pull any previously-saved agreement text so users keep editing
  // the version they last saved instead of restarting from the template.
  useEffect(() => {
    if (initialText) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/tenants/${tenantId}`)
        const data = await res.json()
        if (cancelled || !data.ok) return
        const contracts: Array<{ status: string; agreementText?: string; createdAt: string }> =
          data.data?.contracts ?? []
        const active = contracts
          .filter((c) => c.status === 'active' && c.agreementText)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
        if (active?.agreementText) setText(active.agreementText)
      } catch {
        // Silent — fall back to the default template already in state.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tenantId, initialText])

  function resetToDefault() {
    setText(fillPlaceholders(DEFAULT_AGREEMENT_TEMPLATE, vars))
    toast({ title: t('contract_gen_reset_done') })
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExtracting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/contracts/extract-text', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.ok) {
        toast({ title: t('contract_gen_upload_failed'), description: data.error, variant: 'destructive' })
        return
      }
      const filled = fillPlaceholders(data.text || '', vars)
      setText(filled)
      toast({ title: t('contract_gen_upload_loaded') })
    } catch (err) {
      toast({
        title: t('contract_gen_upload_failed'),
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    } finally {
      setExtracting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/tenants/${tenantId}/agreement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agreementText: text,
          contractStart: vars.contractStart,
          contractEnd: vars.contractEnd,
          monthlyRent: vars.monthlyRent,
          depositAmount: vars.depositAmount,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast({ title: t('contract_gen_save_failed'), description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: t('contract_gen_saved') })
    } finally {
      setSaving(false)
    }
  }

  function handleDownload() {
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) {
      toast({ title: t('contract_gen_popup_blocked'), variant: 'destructive' })
      return
    }
    const safe = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    const title = `Agreement — ${vars.tenantName || ''}`
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: 'Khmer OS Siemreap', 'Noto Sans Khmer', 'Khmer OS', 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #111; white-space: pre-wrap; }
  h1 { font-size: 16pt; text-align: center; }
</style></head><body>${safe}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 250)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('contract_gen_title')}</DialogTitle>
        </DialogHeader>

        <div className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/30">
          <div className="font-medium mb-1">{t('contract_gen_autofill_summary')}</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5">
            <div>👤 {vars.tenantName || '—'}</div>
            <div>⚧ {vars.gender || '—'}</div>
            <div>💼 {vars.occupation || '—'}</div>
            <div>🆔 {vars.nationalId || '—'}</div>
            <div>📞 {vars.phone || '—'}</div>
            <div>🚨 {vars.emergencyName || '—'}{vars.emergencyPhone ? ` (${vars.emergencyPhone})` : ''}</div>
            <div>🏠 {vars.roomLabel || '—'}</div>
            <div>💵 ${vars.monthlyRent || 0}/mo</div>
            <div>🔒 {t('tenant_form_deposit')}: ${vars.depositAmount || 0}</div>
            <div>📅 {t('tenant_form_payday_label')}: {vars.payDay || '—'}</div>
            <div>⏱ {duration || '—'}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            loading={extracting}
          >
            <Upload className="w-4 h-4 mr-1" />{t('contract_gen_upload_btn')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={resetToDefault}>
            <RefreshCw className="w-4 h-4 mr-1" />{t('contract_gen_reset_btn')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('contract_gen_upload_hint')}</span>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 min-h-[55vh] font-mono text-sm leading-relaxed"
          spellCheck={false}
        />

        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="button" variant="outline" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-1" />{t('contract_gen_download_btn')}
          </Button>
          <Button type="button" onClick={handleSave} loading={saving}>
            <Save className="w-4 h-4 mr-1" />{t('contract_gen_save_btn')}
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <FileText className="w-3 h-3" />
          {t('contract_gen_placeholder_hint')}
        </p>
      </DialogContent>
    </Dialog>
  )
}
