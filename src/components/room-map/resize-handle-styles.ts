import type { CSSProperties } from 'react'

/** Visible resize-handle visuals shared by room blocks and custom shapes.
 *  Corners are larger squares (diagonal resize); edges are thinner bars
 *  (single-axis resize). All eight handles are wired so the user can resize
 *  along any axis. Returns `undefined` when not selected so unselected
 *  elements stay clean. */
export function selectedResizeHandleStyles(selected: boolean) {
  if (!selected) return undefined
  const corner: CSSProperties = {
    width: 12,
    height: 12,
    background: 'hsl(var(--background))',
    border: '2px solid hsl(var(--primary))',
    borderRadius: 3,
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  }
  const edgeHorizontal: CSSProperties = {
    width: 16,
    height: 8,
    background: 'hsl(var(--background))',
    border: '2px solid hsl(var(--primary))',
    borderRadius: 3,
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  }
  const edgeVertical: CSSProperties = {
    width: 8,
    height: 16,
    background: 'hsl(var(--background))',
    border: '2px solid hsl(var(--primary))',
    borderRadius: 3,
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  }
  return {
    topLeft: corner,
    topRight: corner,
    bottomLeft: corner,
    bottomRight: corner,
    top: edgeHorizontal,
    bottom: edgeHorizontal,
    left: edgeVertical,
    right: edgeVertical,
  }
}
