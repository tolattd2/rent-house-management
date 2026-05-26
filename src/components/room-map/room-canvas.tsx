'use client'

import { useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useRoomMapStore } from '@/store/use-room-map-store'
import { RoomRectangle } from './room-rectangle'

interface Props {
  editable: boolean
}

export function RoomCanvas({ editable }: Props) {
  const blocks = useRoomMapStore((s) => s.blocks)
  const rooms = useRoomMapStore((s) => s.rooms)
  const selectedId = useRoomMapStore((s) => s.selectedId)
  const setSelected = useRoomMapStore((s) => s.setSelected)
  const zoom = useRoomMapStore((s) => s.zoom)
  const gridSize = useRoomMapStore((s) => s.gridSize)
  const snap = useRoomMapStore((s) => s.snapToGrid)
  const canvasWidth = useRoomMapStore((s) => s.canvasWidth)
  const canvasHeight = useRoomMapStore((s) => s.canvasHeight)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const roomsById = useMemo(() => {
    const m = new Map(rooms.map((r) => [r.id, r]))
    return m
  }, [rooms])

  // Keyboard shortcuts: Delete removes selected, arrows nudge by 1px (10 with shift).
  const updateBlock = useRoomMapStore((s) => s.updateBlock)
  const removeBlock = useRoomMapStore((s) => s.removeBlock)
  useEffect(() => {
    if (!editable) return
    const handler = (e: KeyboardEvent) => {
      if (!selectedId) return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const block = useRoomMapStore.getState().blocks.find((b) => b.id === selectedId)
      if (!block) return
      const step = e.shiftKey ? 10 : 1
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        removeBlock(selectedId)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        updateBlock(block.id, { x: block.x - step })
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        updateBlock(block.id, { x: block.x + step })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        updateBlock(block.id, { y: block.y - step })
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        updateBlock(block.id, { y: block.y + step })
      } else if (e.key === 'Escape') {
        setSelected(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editable, selectedId, updateBlock, removeBlock, setSelected])

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        if (e.target === e.currentTarget) setSelected(null)
      }}
      className="relative w-full h-full overflow-auto bg-muted/30 rounded-lg border border-border"
    >
      <div
        data-room-map-canvas-inner
        className="relative origin-top-left bg-background shadow-md"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          transform: `scale(${zoom})`,
        }}
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
            selected={selectedId === b.id}
            editable={editable}
            zoom={zoom}
            onSelect={() => setSelected(b.id)}
          />
        ))}
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
