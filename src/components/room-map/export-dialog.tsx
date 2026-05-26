'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, FileImage, FileText, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useRoomMapStore } from '@/store/use-room-map-store'
import { useLanguage } from '@/contexts/language-context'
import { toast } from '@/hooks/use-toast'

export type ExportFormat = 'png' | 'pdf'

interface Props {
  open: boolean
  onClose: () => void
}

// html2canvas scale multipliers. Higher = sharper PNG / larger file.
const RESOLUTIONS = [
  { value: '1', label: '1x', scale: 1 },
  { value: '2', label: '2x', scale: 2 },
  { value: '3', label: '3x', scale: 3 },
  { value: '4', label: '4x', scale: 4 },
] as const
type ResolutionValue = (typeof RESOLUTIONS)[number]['value']

// jsPDF page sizes — all native presets so we don't have to maintain mm tables.
const PAPER_SIZES = ['a4', 'a3', 'a5', 'letter', 'legal'] as const
type PaperSize = (typeof PAPER_SIZES)[number]

// Snapshot the room-map canvas to PNG via html2canvas. We momentarily set
// the inner div's transform to scale(1) so the export captures the layout
// at its natural size regardless of how the user has zoomed.
async function snapshotCanvas(scale: number): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (typeof window === 'undefined') return null
  const el = document.querySelector('[data-room-map-canvas-inner]') as HTMLElement | null
  if (!el) return null
  const prevTransform = el.style.transform
  el.style.transform = 'none'
  try {
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale,
      logging: false,
      useCORS: true,
      windowWidth: el.offsetWidth,
      windowHeight: el.offsetHeight,
    })
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    }
  } finally {
    el.style.transform = prevTransform
  }
}

export function ExportDialog({ open, onClose }: Props) {
  const { t } = useLanguage()
  const branch = useRoomMapStore((s) => s.branch)
  const floor = useRoomMapStore((s) => s.floor)
  const blocks = useRoomMapStore((s) => s.blocks)

  const [format, setFormat] = useState<ExportFormat>('png')
  const [resolution, setResolution] = useState<ResolutionValue>('2')
  const [paperSize, setPaperSize] = useState<PaperSize>('a4')
  const [imagePreview, setImagePreview] = useState<{ dataUrl: string; width: number; height: number } | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const resolutionScale = (RESOLUTIONS.find((r) => r.value === resolution) ?? RESOLUTIONS[1]).scale

  const renderImage = useCallback(async (scale: number) => {
    setRendering(true)
    setImageError(null)
    try {
      const snapshot = await snapshotCanvas(scale)
      if (!snapshot) throw new Error('Canvas element not found')
      setImagePreview(snapshot)
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'Could not render canvas')
      setImagePreview(null)
    } finally {
      setRendering(false)
    }
  }, [])

  // Re-render the preview when the dialog opens or resolution changes. We
  // key off (open, resolution) so PDF re-uses the same snapshot and only
  // PNG resolution edits force a re-render. Paper size never re-renders.
  useEffect(() => {
    if (!open) return
    renderImage(resolutionScale)
  }, [open, resolutionScale, renderImage])

  useEffect(() => {
    if (!open) {
      setImagePreview(null)
      setImageError(null)
      setFormat('png')
      setResolution('2')
      setPaperSize('a4')
    }
  }, [open])

  const baseName = `room-map-${branch}-floor-${floor}`

  const downloadPng = () => {
    if (!imagePreview) return
    const link = document.createElement('a')
    link.href = imagePreview.dataUrl
    link.download = `${baseName}.png`
    link.click()
  }

  const downloadPdf = async () => {
    if (!imagePreview) return
    const { default: JsPdfModule } = await import('jspdf')
    const Ctor: typeof import('jspdf').jsPDF = (JsPdfModule as unknown as { jsPDF?: typeof import('jspdf').jsPDF }).jsPDF
      ?? (JsPdfModule as unknown as typeof import('jspdf').jsPDF)
    const orientation = imagePreview.width >= imagePreview.height ? 'landscape' : 'portrait'
    const pdf = new Ctor({ orientation, unit: 'mm', format: paperSize })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 8
    const maxW = pageW - margin * 2
    const maxH = pageH - margin * 2 - 12 // leave room for the title
    const ratio = imagePreview.width / imagePreview.height
    let drawW = maxW
    let drawH = drawW / ratio
    if (drawH > maxH) {
      drawH = maxH
      drawW = drawH * ratio
    }
    const x = (pageW - drawW) / 2
    const y = margin + 10
    pdf.setFontSize(11)
    pdf.text(`${branch}${floor ? ` · Floor ${floor}` : ''}`, margin, margin + 5)
    pdf.addImage(imagePreview.dataUrl, 'PNG', x, y, drawW, drawH, undefined, 'FAST')
    pdf.save(`${baseName}-${paperSize}.pdf`)
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      if (format === 'png') downloadPng()
      else await downloadPdf()
      toast({ title: t('room_map_export_done') })
    } catch (e) {
      toast({
        title: t('room_map_export_failed'),
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setDownloading(false)
    }
  }

  const canDownload = !downloading && !!imagePreview

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('room_map_export_title')}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'png' as const, icon: FileImage, label: t('room_map_export_png') },
            { value: 'pdf' as const, icon: FileText, label: t('room_map_export_pdf') },
          ]).map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFormat(value)}
              className={cn(
                'flex items-center justify-center gap-2 py-2 px-3 rounded border text-sm transition',
                format === value
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:bg-muted/40',
              )}
            >
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {format === 'png' ? (
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('room_map_export_resolution')}
            </Label>
            <Select value={resolution} onValueChange={(v) => setResolution(v as ResolutionValue)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESOLUTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('room_map_export_resolution_hint')}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('room_map_export_paper_size')}
            </Label>
            <Select value={paperSize} onValueChange={(v) => setPaperSize(v as PaperSize)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAPER_SIZES.map((p) => (
                  <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('room_map_export_paper_size_hint')}</p>
          </div>
        )}

        <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
          {rendering ? (
            <div className="h-[420px] flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('room_map_export_rendering')}
            </div>
          ) : imageError ? (
            <div className="h-[420px] flex flex-col items-center justify-center gap-2 text-sm">
              <p className="text-destructive">{imageError}</p>
              <Button size="sm" variant="outline" onClick={() => renderImage(resolutionScale)}>
                {t('room_map_export_retry')}
              </Button>
            </div>
          ) : imagePreview ? (
            <div className="max-h-[420px] overflow-auto bg-background flex items-center justify-center p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview.dataUrl}
                alt="Room map preview"
                className="max-w-full h-auto"
                style={{ maxHeight: 400 }}
              />
            </div>
          ) : (
            <div className="h-[420px] flex items-center justify-center text-sm text-muted-foreground">
              {t('room_map_export_no_preview')}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="text-xs text-muted-foreground mr-auto">
            {blocks.length} {t('room_map_export_blocks')}
            {imagePreview && <> · {imagePreview.width}×{imagePreview.height}</>}
          </p>
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={handleDownload} disabled={!canDownload} loading={downloading}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {t('room_map_export_download')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
