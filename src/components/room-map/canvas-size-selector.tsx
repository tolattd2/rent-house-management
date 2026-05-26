'use client'

import { useEffect, useMemo, useState } from 'react'
import { Frame } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRoomMapStore } from '@/store/use-room-map-store'
import { useLanguage } from '@/contexts/language-context'

// Each entry is a concrete pixel size the canvas can adopt. Paper sizes are
// at 96 DPI (CSS standard) so the design pixels match how it will read on
// screen; export-time scaling provides the high-quality output.
type Template = {
  key: string
  label: string
  group: 'screen' | 'paper' | 'special'
  w: number
  h: number
}

const TEMPLATES: Template[] = [
  // Screen — landscape
  { key: 'hd-l',      label: 'HD 1280×720',          group: 'screen', w: 1280, h: 720 },
  { key: 'fhd-l',     label: 'Full HD 1920×1080',    group: 'screen', w: 1920, h: 1080 },
  { key: '2k-l',      label: '2K 2560×1440',         group: 'screen', w: 2560, h: 1440 },
  { key: '4k-l',      label: '4K 3840×2160',         group: 'screen', w: 3840, h: 2160 },
  // Screen — portrait
  { key: 'hd-p',      label: 'HD 720×1280 (P)',      group: 'screen', w: 720,  h: 1280 },
  { key: 'fhd-p',     label: 'Full HD 1080×1920 (P)', group: 'screen', w: 1080, h: 1920 },
  { key: '2k-p',      label: '2K 1440×2560 (P)',     group: 'screen', w: 1440, h: 2560 },
  // Special
  { key: 'square',    label: 'Square 1080×1080',     group: 'special', w: 1080, h: 1080 },
  // Paper — landscape (96 DPI)
  { key: 'a4-l',      label: 'A4 Landscape',         group: 'paper', w: 1123, h: 794 },
  { key: 'a3-l',      label: 'A3 Landscape',         group: 'paper', w: 1587, h: 1123 },
  { key: 'a5-l',      label: 'A5 Landscape',         group: 'paper', w: 794,  h: 559 },
  { key: 'letter-l',  label: 'Letter Landscape',     group: 'paper', w: 1056, h: 816 },
  { key: 'legal-l',   label: 'Legal Landscape',      group: 'paper', w: 1344, h: 816 },
  // Paper — portrait
  { key: 'a4-p',      label: 'A4 Portrait',          group: 'paper', w: 794,  h: 1123 },
  { key: 'a3-p',      label: 'A3 Portrait',          group: 'paper', w: 1123, h: 1587 },
  { key: 'a5-p',      label: 'A5 Portrait',          group: 'paper', w: 559,  h: 794 },
  { key: 'letter-p',  label: 'Letter Portrait',      group: 'paper', w: 816,  h: 1056 },
  { key: 'legal-p',   label: 'Legal Portrait',       group: 'paper', w: 816,  h: 1344 },
]

const CUSTOM_KEY = 'custom'
const STORAGE_KEY = 'room-map/canvas-template-v1'
const MIN_DIM = 400
const MIN_DIM_H = 300
const MAX_DIM = 8000

function clampDim(value: number, min: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(MAX_DIM, Math.max(min, Math.round(value)))
}

function detectKey(w: number, h: number): string {
  for (const tpl of TEMPLATES) {
    if (tpl.w === w && tpl.h === h) return tpl.key
  }
  return CUSTOM_KEY
}

export function CanvasSizeSelector() {
  const { t } = useLanguage()
  const canvasWidth = useRoomMapStore((s) => s.canvasWidth)
  const canvasHeight = useRoomMapStore((s) => s.canvasHeight)
  const setCanvasSize = useRoomMapStore((s) => s.setCanvasSize)

  const initialKey = useMemo(() => detectKey(canvasWidth, canvasHeight), [canvasWidth, canvasHeight])
  const [templateKey, setTemplateKey] = useState<string>(initialKey)
  const [customW, setCustomW] = useState<number>(canvasWidth)
  const [customH, setCustomH] = useState<number>(canvasHeight)

  // Restore the user's previous choice on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as { w?: number; h?: number }
      if (saved.w && saved.h) {
        setCanvasSize(saved.w, saved.h)
        setCustomW(saved.w)
        setCustomH(saved.h)
        setTemplateKey(detectKey(saved.w, saved.h))
      }
    } catch {
      // ignore malformed JSON
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist whenever the size changes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ w: canvasWidth, h: canvasHeight }))
    } catch {
      // ignore quota errors
    }
  }, [canvasWidth, canvasHeight])

  const handleTemplateChange = (key: string) => {
    setTemplateKey(key)
    if (key === CUSTOM_KEY) {
      setCanvasSize(customW, customH)
      return
    }
    const tpl = TEMPLATES.find((x) => x.key === key)
    if (!tpl) return
    setCanvasSize(tpl.w, tpl.h)
    setCustomW(tpl.w)
    setCustomH(tpl.h)
  }

  const handleCustomChange = (w: number, h: number) => {
    const nextW = clampDim(w, MIN_DIM)
    const nextH = clampDim(h, MIN_DIM_H)
    setCustomW(nextW)
    setCustomH(nextH)
    setTemplateKey(CUSTOM_KEY)
    setCanvasSize(nextW, nextH)
  }

  return (
    <div className="flex items-center gap-1.5 rounded-md bg-background/90 border border-border shadow-sm px-1.5 py-1">
      <Frame className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <Select value={templateKey} onValueChange={handleTemplateChange}>
        <SelectTrigger className="h-7 px-2 text-xs gap-1 border-0 bg-transparent shadow-none focus:ring-0 w-auto min-w-[10rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-wider">{t('room_map_canvas_group_screen')}</SelectLabel>
            {TEMPLATES.filter((x) => x.group === 'screen' || x.group === 'special').map((tpl) => (
              <SelectItem key={tpl.key} value={tpl.key}>{tpl.label}</SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-wider">{t('room_map_canvas_group_paper')}</SelectLabel>
            {TEMPLATES.filter((x) => x.group === 'paper').map((tpl) => (
              <SelectItem key={tpl.key} value={tpl.key}>{tpl.label}</SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectItem value={CUSTOM_KEY}>{t('room_map_canvas_custom')}</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {templateKey === CUSTOM_KEY && (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={MIN_DIM}
            max={MAX_DIM}
            value={customW}
            onChange={(e) => handleCustomChange(Number(e.target.value), customH)}
            className="h-7 w-16 px-1.5 text-xs tabular-nums"
            title={t('room_map_export_width')}
          />
          <span className="text-[10px] text-muted-foreground">×</span>
          <Input
            type="number"
            min={MIN_DIM_H}
            max={MAX_DIM}
            value={customH}
            onChange={(e) => handleCustomChange(customW, Number(e.target.value))}
            className="h-7 w-16 px-1.5 text-xs tabular-nums"
            title={t('room_map_export_height')}
          />
        </div>
      )}
    </div>
  )
}
