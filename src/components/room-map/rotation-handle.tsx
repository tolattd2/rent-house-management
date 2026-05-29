'use client'

import { useRef } from 'react'
import { RotateCcw } from 'lucide-react'

interface Props {
  /** Block / shape geometry — used to compute the rotation centre. */
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zoom: number
  /** Distance above the element top, in canvas units. */
  offset?: number
  onChange: (rotation: number) => void
  onStart?: () => void
  onCommit?: () => void
}

/** Small floating handle that appears above a selected block / shape. The
 *  user drags it in a circle to rotate the element around its centre.
 *  Shift snaps to 15° increments. */
export function RotationHandle({ x, y, width, height, rotation, zoom, offset = 24, onChange, onStart, onCommit }: Props) {
  const startRef = useRef<{ angle: number; centerX: number; centerY: number } | null>(null)

  const cx = x + width / 2
  const cy = y + height / 2

  // Place the handle above the un-rotated bbox top centre. We rotate the
  // handle position around the element centre so it tracks the element's
  // current rotation.
  const baseHx = cx
  const baseHy = y - offset
  const rad = (rotation * Math.PI) / 180
  const hx = cx + (baseHx - cx) * Math.cos(rad) - (baseHy - cy) * Math.sin(rad)
  const hy = cy + (baseHx - cx) * Math.sin(rad) + (baseHy - cy) * Math.cos(rad)

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    // Translate the pointer into the SAME coordinate system as the block
    // (canvas-inner units). The pointer is reported in viewport pixels; we
    // walk up to the canvas-inner element via the data attribute we set on
    // it, then divide out the zoom.
    const canvas = (e.currentTarget as HTMLElement).closest('[data-room-map-canvas-inner]') as HTMLElement | null
    const rect = canvas?.getBoundingClientRect()
    const mx = rect ? (e.clientX - rect.left) / zoom : e.clientX
    const my = rect ? (e.clientY - rect.top) / zoom : e.clientY
    startRef.current = {
      angle: rotation - Math.atan2(my - cy, mx - cx) * (180 / Math.PI),
      centerX: cx,
      centerY: cy,
    }
    onStart?.()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = startRef.current
    if (!s) return
    const canvas = (e.currentTarget as HTMLElement).closest('[data-room-map-canvas-inner]') as HTMLElement | null
    const rect = canvas?.getBoundingClientRect()
    const mx = rect ? (e.clientX - rect.left) / zoom : e.clientX
    const my = rect ? (e.clientY - rect.top) / zoom : e.clientY
    let deg = s.angle + Math.atan2(my - s.centerY, mx - s.centerX) * (180 / Math.PI)
    // Normalise to (-180, 180] for cleaner display.
    deg = ((deg + 540) % 360) - 180
    if (e.shiftKey) deg = Math.round(deg / 15) * 15
    onChange(deg)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    if (startRef.current) onCommit?.()
    startRef.current = null
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute',
        left: hx - 10,
        top: hy - 10,
        width: 20,
        height: 20,
        touchAction: 'none',
        cursor: 'grab',
        zIndex: 99999,
      }}
      className="flex items-center justify-center rounded-full bg-background border-2 border-primary shadow-md hover:bg-primary/10"
      title="Rotate (Shift = 15° snap)"
    >
      <RotateCcw className="w-3 h-3 text-primary" />
    </div>
  )
}
