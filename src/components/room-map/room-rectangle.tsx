'use client'

import { memo, useRef, type MouseEvent } from 'react'
import { Rnd } from 'react-rnd'
import { cn } from '@/lib/utils'
import { useRoomMapStore, type DraftBlock } from '@/store/use-room-map-store'
import type { RoomMapRoom } from '@/lib/room-map-service'

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

// Initial geometry of every selected block plus the basis, captured on
// drag/resize start. `snapshotted` flips to true on the first real move so
// the undo stack only gets an entry when something actually changed.
type GroupSnapshot = {
  basis: { x: number; y: number; w: number; h: number }
  others: Array<{ id: string; x: number; y: number; w: number; h: number }>
  snapshotted: boolean
}

function RoomRectangleInner({ block, room, selected, editable, zoom, onSelect }: Props) {
  const updateBlock = useRoomMapStore((s) => s.updateBlock)
  const setBlockGeoms = useRoomMapStore((s) => s.setBlockGeoms)
  const pushHistorySnapshot = useRoomMapStore((s) => s.pushHistorySnapshot)

  const dragGroupRef = useRef<GroupSnapshot | null>(null)
  const resizeGroupRef = useRef<GroupSnapshot | null>(null)

  const label = room?.roomNumber ?? '?'
  const tenantName = room?.tenant?.fullName ?? ''

  // Snapshot every selected block (basis + others) for a group gesture.
  // Returns null when this block isn't part of a multi-selection.
  const snapshotGroup = (): GroupSnapshot | null => {
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

  const handleClick = (e: MouseEvent) => {
    const multi = e.shiftKey || e.metaKey || e.ctrlKey
    if (multi) {
      onSelect(true)
      return
    }
    // Plain click on a block already in a multi-selection keeps the selection
    // intact — only Escape or clicking outside clears it.
    const state = useRoomMapStore.getState()
    if (state.selectedIds.length > 1 && state.selectedIds.includes(block.id)) return
    onSelect(false)
  }

  const handleDragStart = () => {
    const g = snapshotGroup()
    if (g) {
      dragGroupRef.current = g
    } else {
      dragGroupRef.current = null
      onSelect(false)
    }
  }

  const handleDrag = (_: unknown, d: { x: number; y: number }) => {
    const g = dragGroupRef.current
    if (!g) return
    if (!g.snapshotted) {
      pushHistorySnapshot()
      g.snapshotted = true
    }
    const dx = d.x - g.basis.x
    const dy = d.y - g.basis.y
    setBlockGeoms(g.others.map((o) => ({ id: o.id, x: o.x + dx, y: o.y + dy })))
  }

  const handleDragStop = (_: unknown, d: { x: number; y: number }) => {
    const g = dragGroupRef.current
    // Pure clicks (mousedown without movement) report the same position
    // back to us — skip the update entirely so snap-to-grid doesn't shove
    // an off-grid room to the nearest cell on a tap.
    const moved = d.x !== block.x || d.y !== block.y
    if (g) {
      if (moved) {
        if (!g.snapshotted) pushHistorySnapshot()
        const dx = d.x - g.basis.x
        const dy = d.y - g.basis.y
        setBlockGeoms([
          { id: block.id, x: d.x, y: d.y },
          ...g.others.map((o) => ({ id: o.id, x: o.x + dx, y: o.y + dy })),
        ])
      }
      dragGroupRef.current = null
    } else if (moved) {
      updateBlock(block.id, { x: d.x, y: d.y })
    }
  }

  const handleResizeStart = () => {
    resizeGroupRef.current = snapshotGroup()
  }

  // Compute the resize anchor by comparing the new top-left to the initial
  // top-left of the basis. If x stayed put, the left edge is the anchor;
  // if x moved, the right edge stayed put and is the anchor (same for y).
  const computeGroupResize = (
    g: GroupSnapshot,
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

  const handleResize = (
    _: unknown,
    __: unknown,
    ref: HTMLElement,
    ___: unknown,
    position: { x: number; y: number },
  ) => {
    const g = resizeGroupRef.current
    if (!g) return
    if (!g.snapshotted) {
      pushHistorySnapshot()
      g.snapshotted = true
    }
    const newW = parseFloat(ref.style.width)
    const newH = parseFloat(ref.style.height)
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
    const newW = parseFloat(ref.style.width)
    const newH = parseFloat(ref.style.height)
    const changed =
      newW !== block.width || newH !== block.height ||
      position.x !== block.x || position.y !== block.y
    if (g) {
      if (changed) {
        if (!g.snapshotted) pushHistorySnapshot()
        setBlockGeoms([
          { id: block.id, x: position.x, y: position.y, width: newW, height: newH },
          ...computeGroupResize(g, newW, newH, position),
        ])
      }
      resizeGroupRef.current = null
    } else if (changed) {
      updateBlock(block.id, { width: newW, height: newH, x: position.x, y: position.y })
    }
  }

  return (
    <Rnd
      bounds="parent"
      size={{ width: block.width, height: block.height }}
      position={{ x: block.x, y: block.y }}
      scale={zoom}
      enableResizing={editable}
      disableDragging={!editable}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragStop={handleDragStop}
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
        onClick={handleClick}
        className="w-full h-full flex flex-col items-center justify-center text-center px-1 leading-tight select-none overflow-hidden"
        style={{ transform: block.rotation ? `rotate(${block.rotation}deg)` : undefined }}
      >
        <span className="font-bold text-sm sm:text-base tabular-nums">{label}</span>
        {tenantName && (
          <span className="text-[10px] sm:text-xs opacity-80 px-1 leading-tight break-words whitespace-normal max-w-full">
            {tenantName}
          </span>
        )}
      </button>
    </Rnd>
  )
}

export const RoomRectangle = memo(RoomRectangleInner)
