'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FileImage, FileText, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useRoomMapStore } from '@/store/use-room-map-store'
import { useLanguage } from '@/contexts/language-context'
import { toast } from '@/hooks/use-toast'

export type ExportFormat = 'png' | 'pdf'
type Orientation = 'landscape' | 'portrait'

interface Props {
  open: boolean
  onClose: () => void
}

// Resolution presets. Width/height are the LANDSCAPE form — the orientation
// toggle below swaps them for portrait. Square and Custom ignore orientation.
const RESOLUTION_PRESETS = [
  { key: 'hd',        label: 'HD',        w: 1280, h: 720  },
  { key: 'fullhd',    label: 'Full HD',   w: 1920, h: 1080 },
  { key: '2k',        label: '2K',        w: 2560, h: 1440 },
  { key: '4k',        label: '4K',        w: 3840, h: 2160 },
  { key: 'a4_300dpi', label: 'A4 300dpi', w: 3508, h: 2480 },
  { key: 'square',    label: 'Square',    w: 1080, h: 1080 },
  { key: 'custom',    label: 'Custom',    w: 0,    h: 0    },
] as const
type PresetKey = (typeof RESOLUTION_PRESETS)[number]['key']

const PAPER_SIZES = ['a4', 'a3', 'a5', 'letter', 'legal'] as const
type PaperSize = (typeof PAPER_SIZES)[number]

const MIN_DIM = 100
const MAX_DIM = 8000

// Snapshot the inner canvas at a higher-than-target scale, then composite
// it onto a target-sized canvas with white letterboxing so the content
// keeps its aspect ratio. Returns the exact requested pixel dimensions.
async function snapshotCanvasAt(targetW: number, targetH: number): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (typeof window === 'undefined') return null
  const el = document.querySelector('[data-room-map-canvas-inner]') as HTMLElement | null
  if (!el) return null
  const prevTransform = el.style.transform
  el.style.transform = 'none'
  try {
    // Pick a source scale that yields a source canvas at least as large as
    // the longest target axis, capped so we don't blow the GPU on 4× of 4K.
    const srcLong = Math.max(el.offsetWidth, el.offsetHeight)
    const targetLong = Math.max(targetW, targetH)
    const scale = Math.min(4, Math.max(1, Math.ceil(targetLong / srcLong)))

    const { default: html2canvas } = await import('html2canvas')
    const src = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale,
      logging: false,
      useCORS: true,
      windowWidth: el.offsetWidth,
      windowHeight: el.offsetHeight,
    })

    const target = document.createElement('canvas')
    target.width = targetW
    target.height = targetH
    const ctx = target.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, targetW, targetH)

    const srcRatio = src.width / src.height
    const tgtRatio = targetW / targetH
    let drawW: number
    let drawH: number
    if (srcRatio > tgtRatio) {
      drawW = targetW
      drawH = drawW / srcRatio
    } else {
      drawH = targetH
      drawW = drawH * srcRatio
    }
    const dx = (targetW - drawW) / 2
    const dy = (targetH - drawH) / 2
    ctx.drawImage(src, dx, dy, drawW, drawH)

    return { dataUrl: target.toDataURL('image/png'), width: targetW, height: targetH }
  } finally {
    el.style.transform = prevTransform
  }
}

function clampDim(value: number): number {
  if (!Number.isFinite(value)) return MIN_DIM
  return Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(value)))
}

export function ExportDialog({ open, onClose }: Props) {
  const { t } = useLanguage()
  const branch = useRoomMapStore((s) => s.branch)
  const floor = useRoomMapStore((s) => s.floor)
  const blocks = useRoomMapStore((s) => s.blocks)

  const [format, setFormat] = useState<ExportFormat>('png')
  const [preset, setPreset] = useState<PresetKey>('fullhd')
  const [orientation, setOrientation] = useState<Orientation>('landscape')
  const [customW, setCustomW] = useState(1920)
  const [customH, setCustomH] = useState(1080)
  const [paperSize, setPaperSize] = useState<PaperSize>('a4')
  const [pdfOrientation, setPdfOrientation] = useState<Orientation>('landscape')

  const [imagePreview, setImagePreview] = useState<{ dataUrl: string; width: number; height: number } | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Resolve the requested target dimensions from preset + orientation +
  // custom inputs. Square and Custom ignore orientation.
  const target = useMemo(() => {
    if (preset === 'custom') {
      return { w: clampDim(customW), h: clampDim(customH) }
    }
    const p = RESOLUTION_PRESETS.find((x) => x.key === preset) ?? RESOLUTION_PRESETS[1]
    if (p.w === p.h) return { w: p.w, h: p.h }
    return orientation === 'portrait' ? { w: p.h, h: p.w } : { w: p.w, h: p.h }
  }, [preset, orientation, customW, customH])

  const presetMeta = RESOLUTION_PRESETS.find((p) => p.key === preset) ?? RESOLUTION_PRESETS[1]
  const orientationDisabled = preset === 'square' || preset === 'custom'

  const renderImage = useCallback(async (w: number, h: number) => {
    setRendering(true)
    setImageError(null)
    try {
      const snapshot = await snapshotCanvasAt(w, h)
      if (!snapshot) throw new Error('Canvas element not found')
      setImagePreview(snapshot)
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'Could not render canvas')
      setImagePreview(null)
    } finally {
      setRendering(false)
    }
  }, [])

  // Re-render whenever the dialog opens or the target dimensions change.
  useEffect(() => {
    if (!open) return
    renderImage(target.w, target.h)
  }, [open, target.w, target.h, renderImage])

  useEffect(() => {
    if (!open) {
      setImagePreview(null)
      setImageError(null)
      setFormat('png')
      setPreset('fullhd')
      setOrientation('landscape')
      setCustomW(1920)
      setCustomH(1080)
      setPaperSize('a4')
      setPdfOrientation('landscape')
    }
  }, [open])

  const baseName = `room-map-${branch}-floor-${floor}`

  const downloadPng = () => {
    if (!imagePreview) return
    const link = document.createElement('a')
    link.href = imagePreview.dataUrl
    link.download = `${baseName}-${imagePreview.width}x${imagePreview.height}.png`
    link.click()
  }

  const downloadPdf = async () => {
    if (!imagePreview) return
    const { default: JsPdfModule } = await import('jspdf')
    const Ctor: typeof import('jspdf').jsPDF = (JsPdfModule as unknown as { jsPDF?: typeof import('jspdf').jsPDF }).jsPDF
      ?? (JsPdfModule as unknown as typeof import('jspdf').jsPDF)
    const pdf = new Ctor({ orientation: pdfOrientation, unit: 'mm', format: paperSize })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 8
    const maxW = pageW - margin * 2
    const maxH = pageH - margin * 2 - 12
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                {t('room_map_export_resolution')}
              </Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as PresetKey)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOLUTION_PRESETS.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.key === 'custom'
                        ? t('room_map_export_resolution_custom')
                        : `${p.label} ${p.w}×${p.h}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                {t('room_map_export_orientation')}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {(['landscape', 'portrait'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    disabled={orientationDisabled}
                    onClick={() => setOrientation(o)}
                    className={cn(
                      'h-9 rounded border text-sm transition',
                      orientation === o && !orientationDisabled
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border hover:bg-muted/40',
                      orientationDisabled && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {t(o === 'landscape' ? 'room_map_export_landscape' : 'room_map_export_portrait')}
                  </button>
                ))}
              </div>
            </div>
            {preset === 'custom' && (
              <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {t('room_map_export_width')}
                  </Label>
                  <Input
                    type="number"
                    min={MIN_DIM}
                    max={MAX_DIM}
                    value={customW}
                    onChange={(e) => setCustomW(clampDim(Number(e.target.value)))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {t('room_map_export_height')}
                  </Label>
                  <Input
                    type="number"
                    min={MIN_DIM}
                    max={MAX_DIM}
                    value={customH}
                    onChange={(e) => setCustomH(clampDim(Number(e.target.value)))}
                  />
                </div>
              </div>
            )}
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              {t('room_map_export_resolution_hint')} {presetMeta.key !== 'custom' && (
                <span className="ml-1 tabular-nums">{target.w}×{target.h}</span>
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                {t('room_map_export_orientation')}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {(['landscape', 'portrait'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setPdfOrientation(o)}
                    className={cn(
                      'h-9 rounded border text-sm transition',
                      pdfOrientation === o
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border hover:bg-muted/40',
                    )}
                  >
                    {t(o === 'landscape' ? 'room_map_export_landscape' : 'room_map_export_portrait')}
                  </button>
                ))}
              </div>
            </div>
            <p className="sm:col-span-2 text-xs text-muted-foreground">{t('room_map_export_paper_size_hint')}</p>
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
              <Button size="sm" variant="outline" onClick={() => renderImage(target.w, target.h)}>
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
