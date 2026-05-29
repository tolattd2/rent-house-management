'use client'

import { useMemo } from 'react'
import {
  AlignLeft, AlignCenter, AlignRight, Bold, Trash2, Copy as CopyIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useRoomMapStore } from '@/store/use-room-map-store'
import { useLanguage } from '@/contexts/language-context'

const SHAPE_COLORS = [
  '#1f2937', '#dc2626', '#ea580c', '#d97706', '#65a30d',
  '#0ea5e9', '#2563eb', '#7c3aed', '#db2777', '#ffffff',
]
const FILL_COLORS = [
  '', '#fef3c7', '#fee2e2', '#dcfce7', '#dbeafe',
  '#ede9fe', '#fce7f3', '#f1f5f9', '#1f2937', '#000000',
]

export function ShapeEditor({ editable }: { editable: boolean }) {
  const { t } = useLanguage()
  const shapes = useRoomMapStore((s) => s.shapes)
  const selectedShapeIds = useRoomMapStore((s) => s.selectedShapeIds)
  const updateShape = useRoomMapStore((s) => s.updateShape)
  const duplicateShape = useRoomMapStore((s) => s.duplicateShape)
  const removeShape = useRoomMapStore((s) => s.removeShape)

  const shape = useMemo(
    () => shapes.find((s) => s.id === selectedShapeIds[0]) ?? null,
    [shapes, selectedShapeIds],
  )

  if (!shape || !editable) return null

  const isLine = shape.kind === 'line'
  const isText = shape.kind === 'text'
  const showText = isText || shape.kind === 'rectangle' || shape.kind === 'circle'

  return (
    <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:w-80 z-30 bg-background/95 backdrop-blur border border-border rounded-lg shadow-lg p-3 space-y-3 pointer-events-auto">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t(
            isText
              ? 'room_map_shape_text'
              : shape.kind === 'rectangle'
                ? 'room_map_shape_rect'
                : shape.kind === 'circle'
                  ? 'room_map_shape_circle'
                  : 'room_map_shape_line',
          )}
        </p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => duplicateShape(shape.id)} title={t('room_map_duplicate')}>
            <CopyIcon className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeShape(shape.id)} title={t('room_map_delete')}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {showText && (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">{t('room_map_shape_text_label')}</Label>
          <Textarea
            rows={2}
            value={shape.text}
            onChange={(e) => updateShape(shape.id, { text: e.target.value })}
            className="text-sm"
            placeholder="…"
          />
        </div>
      )}

      {/* Font + alignment row */}
      {showText && (
        <div className="grid grid-cols-3 gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">{t('room_map_shape_size')}</Label>
            <Input
              type="number"
              min={8} max={96}
              value={shape.fontSize}
              onChange={(e) => updateShape(shape.id, { fontSize: parseInt(e.target.value || '14', 10) })}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-[11px] text-muted-foreground">{t('room_map_shape_align')}</Label>
            <div className="flex gap-1">
              {([
                { v: 'left', Icon: AlignLeft },
                { v: 'center', Icon: AlignCenter },
                { v: 'right', Icon: AlignRight },
              ] as const).map(({ v, Icon }) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant={shape.textAlign === v ? 'default' : 'outline'}
                  className="h-8 w-8 p-0"
                  onClick={() => updateShape(shape.id, { textAlign: v })}
                >
                  <Icon className="w-3.5 h-3.5" />
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant={shape.fontWeight === 'bold' ? 'default' : 'outline'}
                className="h-8 w-8 p-0 ml-auto"
                onClick={() => updateShape(shape.id, { fontWeight: shape.fontWeight === 'bold' ? 'normal' : 'bold' })}
                title={t('room_map_shape_bold')}
              >
                <Bold className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stroke / text colour */}
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">
          {isLine ? t('room_map_shape_stroke') : t('room_map_shape_color')}
        </Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {SHAPE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => updateShape(shape.id, { color: c })}
              className={cn(
                'w-6 h-6 rounded-md border',
                shape.color.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-primary ring-offset-1' : 'border-border',
              )}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
          <input
            type="color"
            value={shape.color || '#1f2937'}
            onChange={(e) => updateShape(shape.id, { color: e.target.value })}
            className="w-6 h-6 rounded-md border border-border cursor-pointer"
            title={t('room_map_shape_custom_color')}
          />
        </div>
      </div>

      {/* Fill (not for lines) */}
      {!isLine && (
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{t('room_map_shape_fill')}</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILL_COLORS.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => updateShape(shape.id, { fill: c })}
                className={cn(
                  'w-6 h-6 rounded-md border',
                  (shape.fill || '').toLowerCase() === c.toLowerCase() ? 'ring-2 ring-primary ring-offset-1' : 'border-border',
                  !c && 'bg-[linear-gradient(45deg,transparent_45%,#dc2626_45%,#dc2626_55%,transparent_55%)]',
                )}
                style={c ? { backgroundColor: c } : undefined}
                aria-label={c || 'no fill'}
              />
            ))}
            <input
              type="color"
              value={shape.fill || '#ffffff'}
              onChange={(e) => updateShape(shape.id, { fill: e.target.value })}
              className="w-6 h-6 rounded-md border border-border cursor-pointer"
              title={t('room_map_shape_custom_color')}
            />
          </div>
        </div>
      )}
    </div>
  )
}
