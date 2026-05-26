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

function RoomRectangleInner({ block, room, selected, editable, zoom, onSelect }: Props) {
  const updateBlock = useRoomMapStore((s) => s.updateBlock)
  const setBlockPositions = useRoomMapStore((s) => s.setBlockPositions)
  const pushHistorySnapshot = useRoomMapStore((s) => s.pushHistorySnapshot)

  // Snapshot of every selected block's position taken on drag start. Used to
  // translate the whole group by the same delta during the gesture. null = a
  // plain single-block drag (no group).
  const groupRef = useRef<{
    basis: { x: number; y: number }
    others: Array<{ id: string; x: number; y: number }>
  } | null>(null)

  const label = room?.roomNumber ?? '?'
  const tenantName = room?.tenant?.fullName ?? ''

  const handleClick = (e: MouseEvent) => {
    onSelect(e.shiftKey || e.metaKey || e.ctrlKey)
  }

  const handleDragStart = () => {
    const state = useRoomMapStore.getState()
    const inGroup = state.selectedIds.includes(block.id) && state.selectedIds.length > 1
    if (inGroup) {
      // Drag of a block already in a multi-selection → translate the whole
      // group. Snapshot positions and push ONE undo entry for the gesture.
      const others = state.selectedIds
        .filter((id) => id !== block.id)
        .map((id) => state.blocks.find((b) => b.id === id))
        .filter((b): b is DraftBlock => !!b)
        .map((b) => ({ id: b.id, x: b.x, y: b.y }))
      groupRef.current = { basis: { x: block.x, y: block.y }, others }
      pushHistorySnapshot()
    } else {
      // Single drag → replace selection with just this block (existing UX).
      groupRef.current = null
      onSelect(false)
    }
  }

  const handleDrag = (_: unknown, d: { x: number; y: number }) => {
    const g = groupRef.current
    if (!g) return
    const dx = d.x - g.basis.x
    const dy = d.y - g.basis.y
    // Move every OTHER selected block by the same delta. react-rnd already
    // owns the visual position of the basis block during the drag.
    setBlockPositions(g.others.map((o) => ({ id: o.id, x: o.x + dx, y: o.y + dy })))
  }

  const handleDragStop = (_: unknown, d: { x: number; y: number }) => {
    const g = groupRef.current
    if (g) {
      const dx = d.x - g.basis.x
      const dy = d.y - g.basis.y
      // Final commit — includes the basis so its store position matches the
      // drop point. History was already snapshotted at drag start.
      setBlockPositions([
        { id: block.id, x: d.x, y: d.y },
        ...g.others.map((o) => ({ id: o.id, x: o.x + dx, y: o.y + dy })),
      ])
      groupRef.current = null
    } else {
      updateBlock(block.id, { x: d.x, y: d.y })
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
      onResizeStop={(_, __, ref, ___, position) => {
        updateBlock(block.id, {
          width: parseFloat(ref.style.width),
          height: parseFloat(ref.style.height),
          x: position.x,
          y: position.y,
        })
      }}
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
