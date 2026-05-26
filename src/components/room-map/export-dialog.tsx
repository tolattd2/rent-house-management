'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useRoomMapStore } from '@/store/use-room-map-store'
import { useLanguage } from '@/contexts/language-context'
import { toast } from '@/hooks/use-toast'

interface Props {
  open: boolean
  onClose: () => void
}

// Snapshot the canvas at its native (design-time) dimensions. We render at
// devicePixelRatio so the PNG is crisp on hi-DPI displays without inflating
// the logical size the user picked in the canvas-size selector.
async function snapshotCanvas(width: number, height: number): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const el = document.querySelector('[data-room-map-canvas-inner]') as HTMLElement | null
  if (!el) return null
  const prevTransform = el.style.transform
  el.style.transform = 'none'
  try {
    const { default: html2canvas } = await import('html2canvas')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: dpr,
      logging: false,
      useCORS: true,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
    })
    return canvas.toDataURL('image/png')
  } finally {
    el.style.transform = prevTransform
  }
}

export function ExportDialog({ open, onClose }: Props) {
  const { t } = useLanguage()
  const branch = useRoomMapStore((s) => s.branch)
  const floor = useRoomMapStore((s) => s.floor)
  const blocks = useRoomMapStore((s) => s.blocks)
  const canvasWidth = useRoomMapStore((s) => s.canvasWidth)
  const canvasHeight = useRoomMapStore((s) => s.canvasHeight)

  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const render = useCallback(async () => {
    setRendering(true)
    setError(null)
    try {
      const dataUrl = await snapshotCanvas(canvasWidth, canvasHeight)
      if (!dataUrl) throw new Error('Canvas element not found')
      setPreview(dataUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not render canvas')
      setPreview(null)
    } finally {
      setRendering(false)
    }
  }, [canvasWidth, canvasHeight])

  useEffect(() => {
    if (!open) return
    render()
  }, [open, render])

  useEffect(() => {
    if (!open) {
      setPreview(null)
      setError(null)
    }
  }, [open])

  const baseName = `room-map-${branch}-floor-${floor}`

  const handleDownload = () => {
    if (!preview) return
    setDownloading(true)
    try {
      const link = document.createElement('a')
      link.href = preview
      link.download = `${baseName}-${canvasWidth}x${canvasHeight}.png`
      link.click()
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('room_map_export_title')}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground tabular-nums">
          {t('room_map_export_native_hint')} <span className="ml-1">{canvasWidth}×{canvasHeight}</span>
        </p>

        <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
          {rendering ? (
            <div className="h-[420px] flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('room_map_export_rendering')}
            </div>
          ) : error ? (
            <div className="h-[420px] flex flex-col items-center justify-center gap-2 text-sm">
              <p className="text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={render}>
                {t('room_map_export_retry')}
              </Button>
            </div>
          ) : preview ? (
            <div className="max-h-[420px] overflow-auto bg-background flex items-center justify-center p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
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
          </p>
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={handleDownload} disabled={!preview || downloading} loading={downloading}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {t('room_map_export_download')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
