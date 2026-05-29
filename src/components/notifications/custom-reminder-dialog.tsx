'use client'

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ImagePlus, X, Send } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'

const MAX_IMAGE = 5 * 1024 * 1024
const MAX_VIDEO = 20 * 1024 * 1024
const MAX_MESSAGE = 1024

interface Props {
  mode: 'bulk' | 'single'
  tenantId?: string
  tenantName?: string
  /** Bulk mode: the active branch filter ('all' or a branch name). */
  branch?: string
  /** Bulk mode: number of linked tenants who will receive it. */
  recipientCount?: number
  onClose: () => void
  onSent?: () => void
}

export function CustomReminderDialog({
  mode, tenantId, tenantName, branch, recipientCount, onClose, onSent,
}: Props) {
  const { t } = useLanguage()
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }
  }, [previewUrl])

  const isVideo = file?.type.startsWith('video/') ?? false

  function pickFile(f: File | undefined) {
    if (!f) return
    const video = f.type.startsWith('video/')
    const image = f.type.startsWith('image/')
    if (!video && !image) {
      toast({ title: t('notifications_media_invalid'), variant: 'destructive' })
      return
    }
    if (f.size > (video ? MAX_VIDEO : MAX_IMAGE)) {
      toast({
        title: t('notifications_media_too_large'),
        description: video ? 'Max 20 MB' : 'Max 5 MB',
        variant: 'destructive',
      })
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
  }

  async function handleSend() {
    if (!message.trim() && !file) return
    setSending(true)
    try {
      let mediaUrl: string | undefined
      let mediaKind: 'photo' | 'video' | undefined

      if (file) {
        const urlRes = await fetch('/api/notifications/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
        })
        const urlData = await urlRes.json()
        if (!urlData.ok) {
          toast({ title: t('notifications_send_error'), description: urlData.error, variant: 'destructive' })
          return
        }
        const put = await fetch(urlData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        })
        if (!put.ok) {
          toast({ title: t('notifications_send_error'), description: `Upload failed (${put.status})`, variant: 'destructive' })
          return
        }
        mediaUrl = urlData.publicUrl
        mediaKind = urlData.kind
      }

      const res = await fetch('/api/notifications/send-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          mediaUrl,
          mediaKind,
          tenantId: mode === 'single' ? tenantId : undefined,
          branch: mode === 'bulk' && branch && branch !== 'all' ? branch : undefined,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast({
          title: t('notifications_custom_sent'),
          description: `${data.sent} sent, ${data.failed} failed`,
        })
        onSent?.()
        onClose()
      } else {
        toast({ title: t('notifications_send_error'), description: data.error, variant: 'destructive' })
      }
    } finally {
      setSending(false)
    }
  }

  const title = mode === 'single' && tenantName
    ? `${t('tenant_send_message')} — ${tenantName}`
    : t('notifications_custom_reminder')

  const sendLabel = mode === 'bulk'
    ? `${t('notifications_send_to_all')}${typeof recipientCount === 'number' ? ` (${recipientCount})` : ''}`
    : t('notifications_send')

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>{t('notifications_custom_message')}</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
              placeholder={t('notifications_custom_placeholder')}
              rows={5}
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/{MAX_MESSAGE}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t('notifications_custom_media')}</Label>
            {previewUrl ? (
              <div className="relative border rounded-xl p-3 flex items-center gap-3">
                {isVideo ? (
                  <video src={previewUrl} className="w-24 h-24 object-cover rounded-lg bg-black" />
                ) : (
                  <img src={previewUrl} alt="preview" className="w-24 h-24 object-cover rounded-lg" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{file?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {((file?.size ?? 0) / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={clearFile}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="w-4 h-4 mr-2" />{t('notifications_custom_add_media')}
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={sending}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleSend}
              loading={sending}
              disabled={(!message.trim() && !file) || sending}
            >
              <Send className="w-4 h-4 mr-2" />{sendLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
