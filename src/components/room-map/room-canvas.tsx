'use client'

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/utils'
import { useRoomMapStore } from '@/store/use-room-map-store'
import { RoomRectangle } from './room-rectangle'
import { SelectionTransform } from './selection-transform'

interface Props {
  editable: boolean
}

type GestureState =
  | { kind: 'idle' }
  | { kind: 'marquee' }
  | {
      kind: 'pinch'
      initialDistance: number
      initialCenterX: number
      initialCenterY: number
      initialZoom: number
      initialScrollLeft: number
      initialScrollTop: number
    }

export function RoomCanvas({ editable }: Props) {
  const blocks = useRoomMapStore((s) => s.blocks)
  const rooms = useRoomMapStore((s) => s.rooms)
  const selectedIds = useRoomMapStore((s) => s.selectedIds)
  const setSelected = useRoomMapStore((s) => s.setSelected)
  const toggleSelected = useRoomMapStore((s) => s.toggleSelected)
  const selectMany = useRoomMapStore((s) => s.selectMany)
  const clearSelection = useRoomMapStore((s) => s.clearSelection)
  const zoom = useRoomMapStore((s) => s.zoom)
  const setZoom = useRoomMapStore((s) => s.setZoom)
  const gridSize = useRoomMapStore((s) => s.gridSize)
  const snap = useRoomMapStore((s) => s.snapToGrid)
  const canvasWidth = useRoomMapStore((s) => s.canvasWidth)
  const canvasHeight = useRoomMapStore((s) => s.canvasHeight)
  const moveSelected = useRoomMapStore((s) => s.moveSelected)
  const removeSelected = useRoomMapStore((s) => s.removeSelected)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  // Tracks every pointer that started on the canvas BACKGROUND. Block-children
  // pointers are NOT tracked here (react-rnd owns those). Indexed by pointerId
  // so we can support multi-touch.
  const pointersRef = useRef(new Map<number, { x: number; y: number; type: string }>())
  const gestureRef = useRef<GestureState>({ kind: 'idle' })

  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms])

  // Keyboard: Delete removes selection, arrows nudge all selected blocks.
  useEffect(() => {
    if (!editable) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const ids = useRoomMapStore.getState().selectedIds
      if (ids.length === 0) return
      const step = e.shiftKey ? 10 : 1
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        removeSelected()
      } else if (e.key === 'ArrowLeft') { e.preventDefault(); moveSelected(-step, 0) }
      else if (e.key === 'ArrowRight')  { e.preventDefault(); moveSelected(step, 0) }
      else if (e.key === 'ArrowUp')     { e.preventDefault(); moveSelected(0, -step) }
      else if (e.key === 'ArrowDown')   { e.preventDefault(); moveSelected(0, step) }
      else if (e.key === 'Escape')      { clearSelection() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editable, moveSelected, removeSelected, clearSelection])

  // Ctrl/Meta + wheel = zoom on desktop. We attach via useEffect with
  // passive:false so we can preventDefault and stop the browser from
  // zooming the page.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const next = useRoomMapStore.getState().zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)
      setZoom(next)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [setZoom])

  // Convert a viewport-space point into the canvas-inner coordinate system
  // (the same unscaled units block.x / block.y live in).
  const toCanvasCoords = (clientX: number, clientY: number) => {
    const rect = innerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Only act when the pointer started on the canvas BACKGROUND. Pointers
    // that started on a room block are owned by react-rnd.
    if (e.target !== innerRef.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
    try { innerRef.current?.setPointerCapture(e.pointerId) } catch { /* ignore */ }

    // Two touch pointers → pinch + pan. Cancel any in-progress marquee.
    if (e.pointerType === 'touch' && pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values())
      const [p1, p2] = pts
      gestureRef.current = {
        kind: 'pinch',
        initialDistance: Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1,
        initialCenterX: (p1.x + p2.x) / 2,
        initialCenterY: (p1.y + p2.y) / 2,
        initialZoom: zoom,
        initialScrollLeft: containerRef.current?.scrollLeft ?? 0,
        initialScrollTop: containerRef.current?.scrollTop ?? 0,
      }
      setMarquee(null)
      return
    }

    // One pointer → start marquee. Drawing rectangle stays in canvas-local
    // coords so it scales with the canvas zoom transform.
    if (pointersRef.current.size === 1) {
      const c = toCanvasCoords(e.clientX, e.clientY)
      gestureRef.current = { kind: 'marquee' }
      setMarquee({ x1: c.x, y1: c.y, x2: c.x, y2: c.y })
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })

    const g = gestureRef.current
    if (g.kind === 'pinch' && pointersRef.current.size >= 2) {
      const pts = Array.from(pointersRef.current.values())
      const [p1, p2] = pts
      const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1
      const centerX = (p1.x + p2.x) / 2
      const centerY = (p1.y + p2.y) / 2

      setZoom(g.initialZoom * (distance / g.initialDistance))

      // Two-finger pan: shift the outer scroll so the gesture's centre tracks
      // the user's finger midpoint.
      const outer = containerRef.current
      if (outer) {
        outer.scrollLeft = g.initialScrollLeft - (centerX - g.initialCenterX)
        outer.scrollTop = g.initialScrollTop - (centerY - g.initialCenterY)
      }
    } else if (g.kind === 'marquee') {
      const c = toCanvasCoords(e.clientX, e.clientY)
      setMarquee((m) => (m ? { ...m, x2: c.x, y2: c.y } : null))
    }
  }

  const finishMarquee = () => {
    if (!marquee) return
    const x1 = Math.min(marquee.x1, marquee.x2)
    const y1 = Math.min(marquee.y1, marquee.y2)
    const x2 = Math.max(marquee.x1, marquee.x2)
    const y2 = Math.max(marquee.y1, marquee.y2)
    const drag = x2 - x1 >= 4 || y2 - y1 >= 4
    const currentBlocks = useRoomMapStore.getState().blocks
    if (!drag) {
      clearSelection()
    } else {
      const ids = currentBlocks
        .filter((b) => b.x < x2 && b.x + b.width > x1 && b.y < y2 && b.y + b.height > y1)
        .map((b) => b.id)
      selectMany(ids)
    }
    setMarquee(null)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.delete(e.pointerId)
    try { innerRef.current?.releasePointerCapture(e.pointerId) } catch { /* ignore */ }

    if (gestureRef.current.kind === 'marquee') {
      finishMarquee()
    }

    if (pointersRef.current.size === 0) {
      gestureRef.current = { kind: 'idle' }
    } else if (gestureRef.current.kind === 'pinch' && pointersRef.current.size < 2) {
      // Coming out of a pinch with one finger left — drop straight to idle so
      // we don't accidentally start a marquee under the surviving finger.
      gestureRef.current = { kind: 'idle' }
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-auto bg-muted/30 rounded-lg border border-border"
    >
      <div
        ref={innerRef}
        data-room-map-canvas-inner
        className="relative origin-top-left bg-background shadow-md"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          transform: `scale(${zoom})`,
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          aria-hidden
          className={cn('absolute inset-0 pointer-events-none', !snap && 'opacity-40')}
          style={{
            backgroundImage:
              'linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px),' +
              'linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)',
            backgroundSize: `${gridSize * 5}px ${gridSize * 5}px`,
          }}
        />
        {blocks.map((b) => (
          <RoomRectangle
            key={b.id}
            block={b}
            room={roomsById.get(b.roomId)}
            selected={selectedIds.includes(b.id)}
            editable={editable}
            zoom={zoom}
            onSelect={(multi) => (multi ? toggleSelected(b.id) : setSelected(b.id))}
          />
        ))}
        {marquee && (
          <div
            aria-hidden
            className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
            style={{
              left: Math.min(marquee.x1, marquee.x2),
              top: Math.min(marquee.y1, marquee.y2),
              width: Math.abs(marquee.x2 - marquee.x1),
              height: Math.abs(marquee.y2 - marquee.y1),
            }}
          />
        )}
        <SelectionTransform innerRef={innerRef} zoom={zoom} editable={editable} />
        {blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none">
            {editable
              ? 'Pick a room from the left panel to drop it on the canvas.'
              : 'No layout saved for this branch + floor yet.'}
          </div>
        )}
      </div>
    </div>
  )
}
