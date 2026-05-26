'use client'

import { memo } from 'react'
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
  onSelect: () => void
}

function statusClasses(room: RoomMapRoom | undefined): string {
  if (!room) return 'bg-muted/60 border-muted-foreground/30 text-muted-foreground'
  if (room.hasReservation) return 'bg-yellow-500/15 border-yellow-500 text-yellow-900 dark:text-yellow-100'
  if (room.status === 'maintenance') return 'bg-slate-500/15 border-slate-500 text-slate-900 dark:text-slate-100'
  if (room.status === 'occupied') return 'bg-red-500/15 border-red-500 text-red-900 dark:text-red-100'
  return 'bg-green-500/15 border-green-500 text-green-900 dark:text-green-100'
}

function RoomRectangleInner({ block, room, selected, editable, zoom, onSelect }: Props) {
  const updateBlock = useRoomMapStore((s) => s.updateBlock)
  const label = room?.roomNumber ?? '?'
  const tenantName = room?.tenant?.fullName ?? ''

  return (
    <Rnd
      bounds="parent"
      size={{ width: block.width, height: block.height }}
      position={{ x: block.x, y: block.y }}
      scale={zoom}
      enableResizing={editable}
      disableDragging={!editable}
      onDragStart={onSelect}
      onDragStop={(_, d) => updateBlock(block.id, { x: d.x, y: d.y })}
      onResizeStop={(_, __, ref, ___, position) => {
        updateBlock(block.id, {
          width: parseFloat(ref.style.width),
          height: parseFloat(ref.style.height),
          x: position.x,
          y: position.y,
        })
      }}
      style={{ zIndex: block.zIndex + (selected ? 1000 : 0) }}
      className={cn(
        'rounded-md border-2 shadow-sm transition-shadow',
        statusClasses(room),
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg',
        editable ? 'cursor-move' : 'cursor-pointer',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
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
