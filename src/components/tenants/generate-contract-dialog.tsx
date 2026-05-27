'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, FileText, Printer, Save, RefreshCw, BookTemplate, Wand2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RichTextEditor, plainTextToHtml, looksLikeHtml } from '@/components/ui/rich-text-editor'
import { toast } from '@/hooks/use-toast'
import { formatGender } from '@/lib/utils'
import { useLanguage } from '@/contexts/language-context'
import {
  DEFAULT_AGREEMENT_TEMPLATE,
  fillPlaceholders,
  computeDurationLabel,
  type AgreementVars,
} from '@/lib/agreement-template'

interface SavedTemplate {
  id: string
  name: string
  html: string
}

interface Props {
  tenantId: string
  vars: AgreementVars
  onClose: () => void
  /** Existing saved agreement text/HTML, if any — opens directly in edit mode. */
  initialText?: string
}

/** Normalize any incoming string (plain text or HTML) into editor-ready HTML. */
function toEditorHtml(s: string): string {
  if (!s) return ''
  return looksLikeHtml(s) ? s : plainTextToHtml(s)
}

export function GenerateContractDialog({ tenantId, vars, onClose, initialText }: Props) {
  const { t } = useLanguage()
  const fileRef = useRef<HTMLInputElement>(null)
  // Template loads with {{placeholders}} intact — user clicks "Generate"
  // to substitute them with the tenant's actual values. Saved agreements
  // (initialText / API result) load exactly as they were stored.
  const [html, setHtml] = useState(() =>
    initialText && initialText.trim().length > 0
      ? toEditorHtml(initialText)
      : plainTextToHtml(DEFAULT_AGREEMENT_TEMPLATE),
  )
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [templates, setTemplates] = useState<SavedTemplate[]>([])
  const [savingTemplate, setSavingTemplate] = useState(false)

  const duration = useMemo(
    () => vars.durationLabel || computeDurationLabel(vars.contractStart, vars.contractEnd),
    [vars],
  )

  // On open, pull any previously-saved agreement so users keep editing the
  // version they last saved instead of restarting from the template.
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
        if (active?.agreementText) setHtml(toEditorHtml(active.agreementText))
      } catch {
        // Silent — fall back to the default template already in state.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tenantId, initialText])

  function resetToDefault() {
    setHtml(plainTextToHtml(DEFAULT_AGREEMENT_TEMPLATE))
    toast({ title: t('contract_gen_reset_done') })
  }

  /** Substitute every {{placeholder}} in the current editor HTML with this
   *  tenant's actual values. Triggered by the explicit "Generate" button so
   *  Save Template / Save to Tenant can still persist raw templates. */
  function handleGenerate() {
    setHtml((prev) => fillPlaceholders(prev, vars))
    toast({ title: t('contract_gen_generated') })
  }

  // Fetch saved templates so they appear in the picker.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/agreement-templates')
        const data = await res.json()
        if (!cancelled && data.ok) setTemplates(data.data ?? [])
      } catch {
        // Silent — picker just shows the default.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function loadTemplate(id: string) {
    const tmpl = templates.find((x) => x.id === id)
    if (!tmpl) return
    // Load template as-is (placeholders preserved). Click "Generate" to
    // substitute them with this tenant's actual data.
    setHtml(tmpl.html)
    toast({ title: t('contract_gen_template_loaded'), description: tmpl.name })
  }

  async function handleSaveAsTemplate() {
    const name = window.prompt(t('contract_gen_template_name_prompt'))
    if (!name || !name.trim()) return
    setSavingTemplate(true)
    try {
      const res = await fetch('/api/agreement-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), html }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast({ title: t('contract_gen_template_save_failed'), description: data.error, variant: 'destructive' })
        return
      }
      setTemplates((prev) => [data.data, ...prev])
      toast({ title: t('contract_gen_template_saved') })
    } finally {
      setSavingTemplate(false)
    }
  }

  async function handleDeleteTemplate(id: string) {
    const tmpl = templates.find((x) => x.id === id)
    if (!tmpl) return
    if (!window.confirm(t('contract_gen_template_delete_confirm').replace('{name}', tmpl.name))) return
    const res = await fetch(`/api/agreement-templates/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.ok) {
      setTemplates((prev) => prev.filter((x) => x.id !== id))
      toast({ title: t('contract_gen_template_deleted') })
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
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
      setHtml(plainTextToHtml(data.text || ''))
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
          agreementText: html,
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
    const title = `Agreement — ${vars.tenantName || ''}`
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: 'Khmer OS Siemreap', 'Noto Sans Khmer', 'Khmer OS', 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #111; }
  h1 { font-size: 18pt; text-align: center; margin: 0.4em 0; }
  h2 { font-size: 14pt; margin: 0.6em 0 0.3em; }
  h3 { font-size: 12pt; margin: 0.5em 0 0.25em; }
  p  { margin: 0.35em 0; }
  ul, ol { margin: 0.3em 0 0.3em 1.5em; }
  blockquote { border-left: 3px solid #888; margin: 0.5em 0; padding-left: 0.6em; color: #444; }
  pre { background: #f3f3f3; padding: 0.5em; border-radius: 4px; white-space: pre-wrap; }
</style></head><body>${html}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
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
            <div>⚧ {formatGender(vars.gender, t)}</div>
            <div>🎂 {vars.age > 0 ? vars.age : '—'}</div>
            <div>🌐 {vars.nationality || '—'}</div>
            <div>💼 {vars.occupation || '—'}</div>
            <div>🆔 {vars.nationalId || '—'}</div>
            <div>📞 {vars.phone || '—'}{vars.phonesExtra.length > 0 ? ` (+${vars.phonesExtra.length})` : ''}</div>
            <div>💬 {vars.telegramChatId || '—'}</div>
            <div>🚨 {vars.emergencyName || '—'}{vars.emergencyPhone ? ` (${vars.emergencyPhone})` : ''}</div>
            <div>📅 {vars.moveInDate || '—'}</div>
            <div>🏠 {vars.roomLabel || '—'}</div>
            <div>💵 ${vars.monthlyRent || 0}/mo</div>
            <div>🔒 {t('tenant_form_deposit')}: ${vars.depositAmount || 0}</div>
            <div>📅 {t('tenant_form_payday_label')}: {vars.payDay || '—'}</div>
            <div>⏱ {duration || '—'}</div>
          </div>
        </div>

        <PlaceholderHelp />


        <div className="flex flex-wrap gap-2 items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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

          <div className="inline-flex items-center gap-1">
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  loadTemplate(e.target.value)
                  e.target.value = ''
                }
              }}
              title={t('contract_gen_load_template')}
            >
              <option value="">📚 {t('contract_gen_load_template')} ({templates.length})</option>
              {templates.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
              ))}
            </select>
            {templates.length > 0 && (
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleDeleteTemplate(e.target.value)
                    e.target.value = ''
                  }
                }}
                title={t('contract_gen_template_delete')}
              >
                <option value="">🗑️</option>
                {templates.map((tmpl) => (
                  <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
                ))}
              </select>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveAsTemplate}
            loading={savingTemplate}
          >
            <BookTemplate className="w-4 h-4 mr-1" />{t('contract_gen_save_as_template')}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleGenerate}
          >
            <Wand2 className="w-4 h-4 mr-1" />{t('contract_gen_generate_btn')}
          </Button>

          <span className="text-xs text-muted-foreground">{t('contract_gen_upload_hint')}</span>
        </div>

        <RichTextEditor
          value={html}
          onChange={setHtml}
          className="flex-1 min-h-[55vh] overflow-hidden"
          ariaLabel={t('contract_gen_title')}
        />

        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="button" variant="outline" onClick={handleDownload}>
            <Printer className="w-4 h-4 mr-1" />{t('contract_gen_download_btn')}
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

/**
 * Collapsible "Available placeholders" panel listing every placeholder grouped
 * by category. Each chip is click-to-copy so users can paste `{{key}}` markers
 * straight into the editor.
 */
function PlaceholderHelp() {
  const { t } = useLanguage()

  const groups: Array<{ title: string; keys: string[] }> = [
    {
      title: t('contract_gen_ph_group_personal'),
      keys: [
        'tenant_name', 'gender', 'age', 'nationality', 'occupation',
        'national_id', 'phone', 'phones_extra', 'all_phones',
        'telegram_chat_id', 'emergency_name', 'emergency_phone',
        'notes', 'move_in_date',
      ],
    },
    {
      title: t('contract_gen_ph_group_rental'),
      keys: ['room', 'branch', 'rent', 'deposit', 'pay_day', 'rent_in_word', 'deposit_in_word'],
    },
    {
      title: t('contract_gen_ph_group_contract'),
      keys: ['contract_start', 'contract_end', 'contract_duration'],
    },
  ]

  function copy(key: string) {
    const token = `{{${key}}}`
    navigator.clipboard.writeText(token).then(
      () => toast({ title: t('contract_gen_ph_copied').replace('{token}', token) }),
      () => toast({ title: 'Copy failed', variant: 'destructive' }),
    )
  }

  return (
    <details className="text-xs border rounded-md bg-muted/20">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium flex items-center gap-1.5">
        <FileText className="w-3.5 h-3.5" />
        {t('contract_gen_ph_show')}
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-3">
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          {t('contract_gen_ph_intro')}
        </p>
        {groups.map((g) => (
          <div key={g.title} className="space-y-1.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{g.title}</div>
            <div className="flex flex-wrap gap-1.5">
              {g.keys.map((k) => (
                <span key={k} className="inline-flex rounded-md border bg-background overflow-hidden">
                  <button
                    type="button"
                    onClick={() => copy(k)}
                    className="px-2 py-0.5 font-mono text-[10.5px] hover:bg-muted"
                    title={t('contract_gen_ph_copy_en')}
                  >
                    {`{{${k}}}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => copy(`${k}_km`)}
                    className="px-1.5 py-0.5 font-mono text-[10.5px] bg-muted/60 hover:bg-muted border-l"
                    title={t('contract_gen_ph_copy_km')}
                  >
                    km
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
