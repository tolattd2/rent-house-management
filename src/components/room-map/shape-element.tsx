'use client'

import { memo, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Rnd } from 'react-rnd'
import { cn } from '@/lib/utils'
import { useRoomMapStore, type DraftShape } from '@/store/use-room-map-store'
import { useShiftKeyRef } from '@/hooks/use-shift-key'

interface Props {
  shape: DraftShape
  selected: boolean
  editable: boolean
  zoom: number
}

function ShapeElementInner({ shape, selected, editable, zoom }: Props) {
  const updateShape = useRoomMapStore((s) => s.updateShape)
  const setShapeSelected = useRoomMapStore((s) => s.setShapeSelected)
  const shiftRef = useShiftKeyRef()
  // Captured at drag start so we can lock movement to the dominant axis
  // (whichever has the larger pointer delta) while Shift is held.
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null)

  const editingRef = useRef<HTMLDivElement | null>(null)
  const [editingText, setEditingText] = useState(false)
  const movedRef = useRef(false)

  // Sync the contentEditable DOM with the store text on first edit only —
  // after that React owns the source of truth via onBlur.
  useEffect(() => {
    if (editingText && editingRef.current) {
      editingRef.current.textContent = shape.text
      editingRef.current.focus()
      // Place caret at end so the user can keep typing.
      const range = document.createRange()
      range.selectNodeContents(editingRef.current)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [editingText, shape.text])

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
    setShapeSelected(shape.id)
  }

  const handleDoubleClick = (e: MouseEvent) => {
    if (!editable || shape.kind === 'line' || shape.kind === 'circle' && shape.text === undefined) return
    e.stopPropagation()
    setShapeSelected(shape.id)
    setEditingText(true)
  }

  const finishEdit = () => {
    if (!editingRef.current) {
      setEditingText(false)
      return
    }
    const next = editingRef.current.textContent ?? ''
    if (next !== shape.text) updateShape(shape.id, { text: next })
    setEditingText(false)
  }

  // ── Line shape: SVG with two endpoint handles ──────────────────────────
  if (shape.kind === 'line') {
    return (
      <LineShape
        shape={shape}
        editable={editable}
        selected={selected}
        zoom={zoom}
        onSelect={() => setShapeSelected(shape.id)}
      />
    )
  }

  // ── Rectangle / circle / text: Rnd-driven rectangle with style overrides
  const baseStyle: React.CSSProperties = {
    color: shape.color || '#1f2937',
    backgroundColor: shape.fill || 'transparent',
    fontSize: shape.fontSize || 14,
    fontWeight: shape.fontWeight || 'normal',
    textAlign: (shape.textAlign as React.CSSProperties['textAlign']) || 'center',
    transform: shape.rotation ? `rotate(${shape.rotation}deg)` : undefined,
  }

  const isCircle = shape.kind === 'circle'
  const isRect = shape.kind === 'rectangle'
  const isText = shape.kind === 'text'

  return (
    <Rnd
      bounds="parent"
      size={{ width: Math.abs(shape.width), height: Math.abs(shape.height) }}
      position={{ x: shape.x, y: shape.y }}
      scale={zoom}
      enableResizing={editable && !editingText}
      disableDragging={!editable || editingText}
      onDragStart={() => {
        movedRef.current = false
        dragOriginRef.current = { x: shape.x, y: shape.y }
      }}
      onDrag={(_, d) => {
        if (Math.abs(d.x - shape.x) > 1 || Math.abs(d.y - shape.y) > 1) movedRef.current = true
      }}
      onDragStop={(_, d) => {
        if (!movedRef.current) {
          dragOriginRef.current = null
          return
        }
        // Shift-drag locks motion to the dominant axis (whichever total delta
        // is larger) — matches the design-tool muscle memory.
        const o = dragOriginRef.current
        let nx = d.x
        let ny = d.y
        if (shiftRef.current && o) {
          if (Math.abs(d.x - o.x) >= Math.abs(d.y - o.y)) ny = o.y
          else nx = o.x
        }
        dragOriginRef.current = null
        updateShape(shape.id, { x: nx, y: ny })
      }}
      onResizeStop={(_, __, ref, ___, position) => {
        updateShape(shape.id, {
          width: parseFloat(ref.style.width),
          height: parseFloat(ref.style.height),
          x: position.x,
          y: position.y,
        })
      }}
      style={{ zIndex: shape.zIndex + (selected ? 1000 : 0), touchAction: 'none' }}
      className={cn(
        'transition-shadow',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        editable && !editingText ? 'cursor-move' : editingText ? 'cursor-text' : 'cursor-pointer',
      )}
    >
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className={cn(
          'w-full h-full flex items-center justify-center px-2 leading-tight break-words select-none overflow-hidden',
          isRect && 'border-2 border-current rounded-md',
          isCircle && 'border-2 border-current rounded-full',
          isText && 'border border-dashed border-transparent hover:border-muted-foreground/30',
        )}
        style={baseStyle}
      >
        {editingText ? (
          <div
            ref={editingRef}
            contentEditable
            suppressContentEditableWarning
            onBlur={finishEdit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); finishEdit() }
            }}
            className="w-full h-full outline-none flex items-center justify-center text-center break-words whitespace-pre-wrap"
            style={{ textAlign: shape.textAlign as React.CSSProperties['textAlign'] }}
          />
        ) : (
          <span className="block w-full text-center whitespace-pre-wrap break-words">
            {shape.text || (isText ? '' : '')}
          </span>
        )}
      </div>
    </Rnd>
  )
}

export const ShapeElement = memo(ShapeElementInner)

// ── Line ────────────────────────────────────────────────────────────────
// A line's bounding box is computed from its two endpoints, but to keep the
// drag math simple we treat (shape.x, shape.y) as the START and
// (shape.x + shape.width, shape.y + shape.height) as the END. Width/height
// can be negative if the line goes up-and-left.
interface LineProps {
  shape: DraftShape
  selected: boolean
  editable: boolean
  zoom: number
  onSelect: () => void
}

function LineShape({ shape, selected, editable, zoom, onSelect }: LineProps) {
  const updateShape = useRoomMapStore((s) => s.updateShape)
  const shiftRef = useShiftKeyRef()
  const x1 = shape.x
  const y1 = shape.y
  const x2 = shape.x + shape.width
  const y2 = shape.y + shape.height

  // SVG covers the full bounding box of the line + a little padding for the
  // endpoint handles. We position it at the top-left of that bounding box.
  const pad = 8
  const left = Math.min(x1, x2) - pad
  const top = Math.min(y1, y2) - pad
  const w = Math.abs(shape.width) + pad * 2
  const h = Math.abs(shape.height) + pad * 2
  const sx1 = x1 - left
  const sy1 = y1 - top
  const sx2 = x2 - left
  const sy2 = y2 - top

  const draggingRef = useRef<{ which: 'start' | 'end' | 'whole'; startX: number; startY: number; origin: { x1: number; y1: number; x2: number; y2: number } } | null>(null)

  const onPointerDown = (which: 'start' | 'end' | 'whole') => (e: React.PointerEvent) => {
    if (!editable) return
    e.preventDefault()
    e.stopPropagation()
    onSelect()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    draggingRef.current = {
      which,
      startX: e.clientX,
      startY: e.clientY,
      origin: { x1, y1, x2, y2 },
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = draggingRef.current
    if (!d) return
    let dx = (e.clientX - d.startX) / zoom
    let dy = (e.clientY - d.startY) / zoom
    // Shift locks endpoint motion to the dominant axis (or to 45° increments
    // when both axes carry roughly equal travel). For 'whole' it locks the
    // translation; for endpoint drags it locks the new edge angle.
    if (shiftRef.current || e.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0
      else dx = 0
    }
    if (d.which === 'start') {
      const newX = d.origin.x1 + dx
      const newY = d.origin.y1 + dy
      updateShape(shape.id, { x: newX, y: newY, width: d.origin.x2 - newX, height: d.origin.y2 - newY })
    } else if (d.which === 'end') {
      updateShape(shape.id, { width: (d.origin.x2 + dx) - d.origin.x1, height: (d.origin.y2 + dy) - d.origin.y1 })
    } else {
      updateShape(shape.id, { x: d.origin.x1 + dx, y: d.origin.y1 + dy })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    draggingRef.current = null
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect() }}
      style={{
        position: 'absolute',
        left,
        top,
        width: w,
        height: h,
        zIndex: shape.zIndex + (selected ? 1000 : 0),
        touchAction: 'none',
      }}
    >
      <svg
        width={w}
        height={h}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ overflow: 'visible' }}
      >
        {/* Hit-target — invisible but wide so the line is easy to grab. */}
        <line
          x1={sx1} y1={sy1} x2={sx2} y2={sy2}
          stroke="transparent"
          strokeWidth={14}
          style={{ cursor: editable ? 'move' : 'pointer' }}
          onPointerDown={onPointerDown('whole')}
        />
        {/* Visible stroke */}
        <line
          x1={sx1} y1={sy1} x2={sx2} y2={sy2}
          stroke={shape.color || '#1f2937'}
          strokeWidth={Math.max(2, shape.fontSize / 5)}
          strokeLinecap="round"
        />
        {selected && editable && (
          <>
            <circle
              cx={sx1} cy={sy1} r={6}
              fill="hsl(var(--background))"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              style={{ cursor: 'crosshair' }}
              onPointerDown={onPointerDown('start')}
            />
            <circle
              cx={sx2} cy={sy2} r={6}
              fill="hsl(var(--background))"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              style={{ cursor: 'crosshair' }}
              onPointerDown={onPointerDown('end')}
            />
          </>
        )}
      </svg>
    </div>
  )
}
