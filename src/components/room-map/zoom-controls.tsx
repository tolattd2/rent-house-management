'use client'

import { Button } from '@/components/ui/button'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { useRoomMapStore } from '@/store/use-room-map-store'

export function ZoomControls() {
  const zoom = useRoomMapStore((s) => s.zoom)
  const setZoom = useRoomMapStore((s) => s.setZoom)

  return (
    <div className="flex items-center gap-1 rounded-md bg-background/90 border border-border shadow-sm p-1">
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom(zoom - 0.1)} title="Zoom out">
        <ZoomOut className="w-3.5 h-3.5" />
      </Button>
      <span className="text-xs tabular-nums w-10 text-center text-muted-foreground">
        {Math.round(zoom * 100)}%
      </span>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom(zoom + 0.1)} title="Zoom in">
        <ZoomIn className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom(1)} title="Reset zoom">
        <Maximize2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}
