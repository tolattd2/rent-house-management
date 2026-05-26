'use client'

import { useMemo, useRef, type RefObject, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/utils'
import { useRoomMapStore } from '@/store/use-room-map-store'

type Direction = 'tl' | 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l'

interface Props {
  innerRef: RefObject<HTMLDivElement | null>
  zoom: number
  editable: boolean
}

const HANDLES: Array<{ dir: Direction; cursor: string; style: React.CSSProperties }> = [
  { dir: 'tl', cursor: 'nwse-resize', style: { top: 0, left: 0, transform: 'translate(-50%, -50%)' } },
  { dir: 't',  cursor: 'ns-resize',   style: { top: 0, left: '50%', transform: 'translate(-50%, -50%)' } },
  { dir: 'tr', cursor: 'nesw-resize', style: { top: 0, right: 0, transform: 'translate(50%, -50%)' } },
  { dir: 'r',  cursor: 'ew-resize',   style: { top: '50%', right: 0, transform: 'translate(50%, -50%)' } },
  { dir: 'br', cursor: 'nwse-resize', style: { bottom: 0, right: 0, transform: 'translate(50%, 50%)' } },
  { dir: 'b',  cursor: 'ns-resize',   style: { bottom: 0, left: '50%', transform: 'translate(-50%, 50%)' } },
  { dir: 'bl', cursor: 'nesw-resize', style: { bottom: 0, left: 0, transform: 'translate(-50%, 50%)' } },
  { dir: 'l',  cursor: 'ew-resize',   style: { top: '50%', left: 0, transform: 'translate(-50%, -50%)' } },
]

const MIN_BBOX = 20

// Given the active handle and a new pointer position (in canvas-inner
// coordinates), return the resulting bbox geometry plus the anchor and
// per-axis scale factor relative to the initial bbox.
function resizeFromHandle(
  dir: Direction,
  pointer: { x: number; y: number },
  init: { x: number; y: number; w: number; h: number },
): { anchor: { x: number; y: number }; sx: number; sy: number } {
  let left = init.x
  let top = init.y
  let right = init.x + init.w
  let bottom = init.y + init.h

  if (dir.includes('l')) left = pointer.x
  if (dir.includes('r')) right = pointer.x
  if (dir.includes('t')) top = pointer.y
  if (dir.includes('b')) bottom = pointer.y

  // Enforce a minimum bbox so a flipped handle doesn't collapse everything.
  if (right - left < MIN_BBOX) {
    if (dir.includes('l')) left = right - MIN_BBOX
    else right = left + MIN_BBOX
  }
  if (bottom - top < MIN_BBOX) {
    if (dir.includes('t')) top = bottom - MIN_BBOX
    else bottom = top + MIN_BBOX
  }

  const newW = right - left
  const newH = bottom - top
  const sx = init.w === 0 ? 1 : newW / init.w
  const sy = init.h === 0 ? 1 : newH / init.h
  const anchorX = dir.includes('l') ? init.x + init.w : init.x
  const anchorY = dir.includes('t') ? init.y + init.h : init.y

  // Edge handles only scale one axis; force the other to 1.
  const effSx = dir === 't' || dir === 'b' ? 1 : sx
  const effSy = dir === 'l' || dir === 'r' ? 1 : sy
  return { anchor: { x: anchorX, y: anchorY }, sx: effSx, sy: effSy }
}

export function SelectionTransform({ innerRef, zoom, editable }: Props) {
  const blocks = useRoomMapStore((s) => s.blocks)
  const selectedIds = useRoomMapStore((s) => s.selectedIds)
  const setBlockGeoms = useRoomMapStore((s) => s.setBlockGeoms)
  const pushHistorySnapshot = useRoomMapStore((s) => s.pushHistorySnapshot)

  // Active gesture state — null when no handle is being dragged.
  const gestureRef = useRef<{
    dir: Direction
    initBbox: { x: number; y: number; w: number; h: number }
    initBlocks: Array<{ id: string; x: number; y: number; w: number; h: number }>
  } | null>(null)

  const bbox = useMemo(() => {
    if (selectedIds.length === 0) return null
    const selected = blocks.filter((b) => selectedIds.includes(b.id))
    if (selected.length === 0) return null
    let x1 = Infinity
    let y1 = Infinity
    let x2 = -Infinity
    let y2 = -Infinity
    for (const b of selected) {
      if (b.x < x1) x1 = b.x
      if (b.y < y1) y1 = b.y
      if (b.x + b.width > x2) x2 = b.x + b.width
      if (b.y + b.height > y2) y2 = b.y + b.height
    }
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
  }, [blocks, selectedIds])

  if (!bbox || !editable) return null

  const toCanvasCoords = (clientX: number, clientY: number) => {
    const rect = innerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom }
  }

  const onHandleDown = (dir: Direction) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.preventDefault()
    const target = e.currentTarget
    try { target.setPointerCapture(e.pointerId) } catch { /* ignore */ }

    const state = useRoomMapStore.getState()
    const selected = state.blocks.filter((b) => state.selectedIds.includes(b.id))
    gestureRef.current = {
      dir,
      initBbox: { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height },
      initBlocks: selected.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.width, h: b.height })),
    }
    pushHistorySnapshot()
  }

  const onHandleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current
    if (!g) return
    e.stopPropagation()
    const pointer = toCanvasCoords(e.clientX, e.clientY)
    const { anchor, sx, sy } = resizeFromHandle(g.dir, pointer, g.initBbox)
    setBlockGeoms(
      g.initBlocks.map((b) => ({
        id: b.id,
        x: anchor.x + (b.x - anchor.x) * sx,
        y: anchor.y + (b.y - anchor.y) * sy,
        width: b.w * sx,
        height: b.h * sy,
      })),
    )
  }

  const onHandleUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!gestureRef.current) return
    e.stopPropagation()
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    gestureRef.current = null
  }

  // Counter-scale the chrome so border + handles stay readable at any zoom.
  const handleSize = Math.max(10, 16 / Math.max(zoom, 0.001))
  const borderWidth = 2 / Math.max(zoom, 0.001)

  return (
    <div
      aria-hidden
      className="absolute pointer-events-none"
      style={{
        left: bbox.x,
        top: bbox.y,
        width: bbox.width,
        height: bbox.height,
        zIndex: 100000,
      }}
    >
      <div
        className="absolute inset-0 border-dashed border-primary rounded-sm"
        style={{ borderWidth }}
      />
      {HANDLES.map(({ dir, cursor, style }) => (
        <div
          key={dir}
          role="presentation"
          onPointerDown={onHandleDown(dir)}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          className={cn(
            'absolute bg-background border-2 border-primary rounded-sm shadow-sm',
            'pointer-events-auto',
          )}
          style={{
            ...style,
            width: handleSize,
            height: handleSize,
            cursor,
            touchAction: 'none',
            borderWidth: Math.max(1, 2 / Math.max(zoom, 0.001)),
          }}
        />
      ))}
    </div>
  )
}
