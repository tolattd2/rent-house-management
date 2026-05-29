'use client'

import { memo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Rnd } from 'react-rnd'
import { cn } from '@/lib/utils'
import { useRoomMapStore, type DraftBlock } from '@/store/use-room-map-store'
import type { RoomMapRoom } from '@/lib/room-map-service'
import { RotationHandle } from './rotation-handle'

interface Props {
  block: DraftBlock
  room: RoomMapRoom | undefined
  selected: boolean
  editable: boolean
  zoom: number
  onSelect: (multi: boolean) => void
}

function statusClasses(room: RoomMapRoom | undefined): string {
  if (!room) return 'bg-muted/60 border-muted-foreground/30 text-muted-foreground'
  if (room.status === 'reserved' || room.hasReservation) return 'bg-yellow-500/15 border-yellow-500 text-yellow-900 dark:text-yellow-100'
  if (room.status === 'maintenance') return 'bg-slate-500/15 border-slate-500 text-slate-900 dark:text-slate-100'
  if (room.status === 'occupied') return 'bg-red-500/15 border-red-500 text-red-900 dark:text-red-100'
  return 'bg-green-500/15 border-green-500 text-green-900 dark:text-green-100'
}

// Snapshot taken at the start of a group drag. `pushed` flips to true the
// first time the user crosses the move threshold so undo collapses the
// whole gesture into one entry.
type DragSnapshot = {
  pointerId: number
  startMx: number
  startMy: number
  basis: { x: number; y: number }
  others: Array<{ id: string; x: number; y: number }>
  pushed: boolean
  moved: boolean
}

type GroupResizeSnapshot = {
  basis: { x: number; y: number; w: number; h: number }
  others: Array<{ id: string; x: number; y: number; w: number; h: number }>
  snapshotted: boolean
}

function dragThreshold(zoom: number): number {
  return 5 / Math.max(zoom, 0.1)
}

function RoomRectangleInner({ block, room, selected, editable, zoom, onSelect }: Props) {
  const updateBlock = useRoomMapStore((s) => s.updateBlock)
  const setBlockGeoms = useRoomMapStore((s) => s.setBlockGeoms)
  const pushHistorySnapshot = useRoomMapStore((s) => s.pushHistorySnapshot)
  const setSelected = useRoomMapStore((s) => s.setSelected)
  const toggleSelected = useRoomMapStore((s) => s.toggleSelected)

  const dragRef = useRef<DragSnapshot | null>(null)
  const resizeGroupRef = useRef<GroupResizeSnapshot | null>(null)
  const resizeMovedRef = useRef(false)

  const label = room?.roomNumber ?? '?'
  const tenantName = room?.tenant?.fullName ?? ''

  // ── Custom drag (bypasses Rnd's react-draggable so shift can live-lock the
  // axis without the visual fighting back) ──────────────────────────────────

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editable) {
      // Read-only viewers should still be able to click-through to whatever
      // detail page the room links to; nothing else to do here.
      return
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return

    const multi = e.shiftKey || e.metaKey || e.ctrlKey
    // Selection rules: shift/ctrl click toggles, plain click selects unless
    // already in a multi-selection (then it preserves it for group drag).
    const stateBefore = useRoomMapStore.getState()
    if (multi) {
      toggleSelected(block.id)
    } else if (!stateBefore.selectedIds.includes(block.id)) {
      setSelected(block.id)
    }

    const state = useRoomMapStore.getState()
    const others = state.selectedIds
      .filter((id) => id !== block.id)
      .map((id) => state.blocks.find((b) => b.id === id))
      .filter((b): b is DraftBlock => !!b)
      .map((b) => ({ id: b.id, x: b.x, y: b.y }))

    dragRef.current = {
      pointerId: e.pointerId,
      startMx: e.clientX,
      startMy: e.clientY,
      basis: { x: block.x, y: block.y },
      others,
      pushed: false,
      moved: false,
    }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = dragRef.current
    if (!s || e.pointerId !== s.pointerId) return
    let dx = (e.clientX - s.startMx) / zoom
    let dy = (e.clientY - s.startMy) / zoom
    if (!s.moved) {
      const eps = dragThreshold(zoom)
      if (Math.abs(dx) < eps && Math.abs(dy) < eps) return
      s.moved = true
    }
    // Live shift-axis lock: dominant-direction wins so the user gets the
    // same axis throughout the gesture.
    if (e.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0
      else dx = 0
    }
    if (!s.pushed) {
      pushHistorySnapshot()
      s.pushed = true
    }
    setBlockGeoms([
      { id: block.id, x: s.basis.x + dx, y: s.basis.y + dy },
      ...s.others.map((o) => ({ id: o.id, x: o.x + dx, y: o.y + dy })),
    ])
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = dragRef.current
    if (!s || e.pointerId !== s.pointerId) return
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    dragRef.current = null
  }

  // ── Resize (still uses Rnd's handles) ─────────────────────────────────────

  const snapshotResizeGroup = (): GroupResizeSnapshot | null => {
    const state = useRoomMapStore.getState()
    if (!state.selectedIds.includes(block.id) || state.selectedIds.length < 2) return null
    const others = state.selectedIds
      .filter((id) => id !== block.id)
      .map((id) => state.blocks.find((b) => b.id === id))
      .filter((b): b is DraftBlock => !!b)
      .map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.width, h: b.height }))
    return {
      basis: { x: block.x, y: block.y, w: block.width, h: block.height },
      others,
      snapshotted: false,
    }
  }

  const computeGroupResize = (
    g: GroupResizeSnapshot,
    newW: number,
    newH: number,
    position: { x: number; y: number },
  ) => {
    const sx = g.basis.w === 0 ? 1 : newW / g.basis.w
    const sy = g.basis.h === 0 ? 1 : newH / g.basis.h
    const anchorX = position.x !== g.basis.x ? g.basis.x + g.basis.w : g.basis.x
    const anchorY = position.y !== g.basis.y ? g.basis.y + g.basis.h : g.basis.y
    return g.others.map((o) => ({
      id: o.id,
      x: anchorX + (o.x - anchorX) * sx,
      y: anchorY + (o.y - anchorY) * sy,
      width: o.w * sx,
      height: o.h * sy,
    }))
  }

  const handleResizeStart = () => {
    resizeMovedRef.current = false
    resizeGroupRef.current = snapshotResizeGroup()
  }

  const handleResize = (
    _: unknown,
    __: unknown,
    ref: HTMLElement,
    ___: unknown,
    position: { x: number; y: number },
  ) => {
    const newW = parseFloat(ref.style.width)
    const newH = parseFloat(ref.style.height)
    if (!resizeMovedRef.current) {
      const eps = dragThreshold(zoom)
      if (
        Math.abs(newW - block.width) <= eps &&
        Math.abs(newH - block.height) <= eps &&
        Math.abs(position.x - block.x) <= eps &&
        Math.abs(position.y - block.y) <= eps
      ) return
      resizeMovedRef.current = true
    }
    const g = resizeGroupRef.current
    if (!g) return
    if (!g.snapshotted) {
      pushHistorySnapshot()
      g.snapshotted = true
    }
    setBlockGeoms(computeGroupResize(g, newW, newH, position))
  }

  const handleResizeStop = (
    _: unknown,
    __: unknown,
    ref: HTMLElement,
    ___: unknown,
    position: { x: number; y: number },
  ) => {
    const g = resizeGroupRef.current
    if (!resizeMovedRef.current) {
      resizeGroupRef.current = null
      return
    }
    const newW = parseFloat(ref.style.width)
    const newH = parseFloat(ref.style.height)
    if (g) {
      if (!g.snapshotted) pushHistorySnapshot()
      setBlockGeoms([
        { id: block.id, x: position.x, y: position.y, width: newW, height: newH },
        ...computeGroupResize(g, newW, newH, position),
      ])
      resizeGroupRef.current = null
    } else {
      updateBlock(block.id, { width: newW, height: newH, x: position.x, y: position.y })
    }
  }

  return (
    <>
      <Rnd
        bounds="parent"
        size={{ width: block.width, height: block.height }}
        position={{ x: block.x, y: block.y }}
        scale={zoom}
        // Rnd's drag is fully delegated to pointer handlers below — keeps the
        // shift-axis lock live during the gesture instead of snap-on-release.
        disableDragging
        enableResizing={editable}
        onResizeStart={handleResizeStart}
        onResize={handleResize}
        onResizeStop={handleResizeStop}
        style={{ zIndex: block.zIndex + (selected ? 1000 : 0), touchAction: 'none' }}
        className={cn(
          'rounded-md border-2 shadow-sm transition-shadow',
          statusClasses(room),
          selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg',
          editable ? 'cursor-move' : 'cursor-pointer',
        )}
      >
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          // Click is no-op — selection already happened in pointerDown.
          onClick={(e) => e.stopPropagation()}
          className="w-full h-full flex flex-col items-center justify-center text-center px-1 leading-tight select-none overflow-hidden"
          style={{
            transform: block.rotation ? `rotate(${block.rotation}deg)` : undefined,
            touchAction: 'none',
          }}
        >
          <span className="font-bold text-sm sm:text-base tabular-nums pointer-events-none">{label}</span>
          {tenantName && (
            <span className="text-[10px] sm:text-xs opacity-80 px-1 leading-tight break-words whitespace-normal max-w-full pointer-events-none">
              {tenantName}
            </span>
          )}
        </button>
      </Rnd>
      {selected && editable && (
        <RotationHandle
          x={block.x} y={block.y} width={block.width} height={block.height}
          rotation={block.rotation} zoom={zoom}
          onStart={() => pushHistorySnapshot()}
          onChange={(deg) => setBlockGeoms([{ id: block.id, rotation: deg }])}
        />
      )}
    </>
  )
}

export const RoomRectangle = memo(RoomRectangleInner)
