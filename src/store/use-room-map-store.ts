'use client'

import { create } from 'zustand'
import type { RoomMapBlock, RoomMapRoom, RoomMapShape, RoomMapShapeKind } from '@/lib/room-map-service'
import { sortRoomsByNumber } from '@/lib/utils'

export type DraftBlock = Omit<RoomMapBlock, 'id'> & { id: string; pendingDelete?: boolean }
export type DraftShape = Omit<RoomMapShape, 'id'> & { id: string }

type HistoryFrame = { blocks: DraftBlock[]; shapes: DraftShape[] }

type State = {
  branch: string
  floor: string
  rooms: RoomMapRoom[]
  blocks: DraftBlock[]
  shapes: DraftShape[]
  // Multi-select. selectedIds[0] is treated as the "primary" selection for
  // single-room editors; the full array drives bulk operations + visuals.
  selectedIds: string[]
  // Shape selection lives in its own array — shapes and rooms move under
  // different gesture machinery (Rnd resizes for rectangles, custom logic for
  // lines), so mixing them would tangle the canvas code.
  selectedShapeIds: string[]
  dirty: boolean
  saving: boolean
  zoom: number
  snapToGrid: boolean
  gridSize: number
  autoSave: boolean
  // Design-time canvas size — the user picks a screen / paper template so the
  // layout is composed at the target output resolution. Defaults to Full HD.
  canvasWidth: number
  canvasHeight: number
  // History snapshots taken BEFORE each mutating action so undo restores the
  // previous state. Frames carry both blocks AND shapes so a shape edit can
  // be undone independently of a room edit. Capped at HISTORY_LIMIT.
  past: HistoryFrame[]
  future: HistoryFrame[]
}

type Actions = {
  hydrate: (params: {
    branch: string; floor: string; rooms: RoomMapRoom[];
    blocks: RoomMapBlock[]; shapes?: RoomMapShape[];
  }) => void
  setSelected: (id: string | null) => void
  toggleSelected: (id: string) => void
  selectMany: (ids: string[]) => void
  clearSelection: () => void
  addBlockForRoom: (roomId: string) => void
  removeBlock: (id: string) => void
  removeSelected: () => void
  duplicateBlock: (id: string) => void
  updateBlock: (id: string, patch: Partial<DraftBlock>) => void
  moveSelected: (dx: number, dy: number) => void
  // Group-drag / group-resize helpers. setBlockGeoms writes a batch without
  // pushing history; the caller (onDragStart / onResizeStart) calls
  // pushHistorySnapshot once at the start of the gesture so undo collapses
  // the whole gesture into one entry.
  setBlockGeoms: (
    updates: Array<{ id: string; x?: number; y?: number; width?: number; height?: number; rotation?: number }>,
  ) => void
  pushHistorySnapshot: () => void
  replaceAll: (blocks: DraftBlock[]) => void
  // Shape actions
  addShape: (kind: RoomMapShapeKind) => void
  removeShape: (id: string) => void
  duplicateShape: (id: string) => void
  updateShape: (id: string, patch: Partial<DraftShape>) => void
  setShapeGeoms: (
    updates: Array<{ id: string; x?: number; y?: number; width?: number; height?: number; rotation?: number }>,
  ) => void
  setShapeSelected: (id: string | null) => void
  toggleShapeSelected: (id: string) => void
  selectManyShapes: (ids: string[]) => void
  undo: () => void
  redo: () => void
  setZoom: (z: number) => void
  setSnap: (snap: boolean) => void
  setAutoSave: (on: boolean) => void
  setCanvasSize: (w: number, h: number) => void
  markSaving: (saving: boolean) => void
  markClean: () => void
}

const GRID = 10
const HISTORY_LIMIT = 50

function nextZIndex(blocks: DraftBlock[]): number {
  return blocks.length === 0 ? 1 : Math.max(...blocks.map((b) => b.zIndex)) + 1
}

function nextShapeZ(shapes: DraftShape[], blocks: DraftBlock[]): number {
  const max = Math.max(0, ...shapes.map((s) => s.zIndex), ...blocks.map((b) => b.zIndex))
  return max + 1
}

function frame(blocks: DraftBlock[], shapes: DraftShape[]): HistoryFrame {
  return { blocks: blocks.map((b) => ({ ...b })), shapes: shapes.map((s) => ({ ...s })) }
}

function pushHistory(past: HistoryFrame[], snapshot: HistoryFrame): HistoryFrame[] {
  const next = [...past, snapshot]
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next
}

function defaultShape(kind: RoomMapShapeKind, branch: string, floor: string, z: number): Omit<DraftShape, 'id'> {
  const base = {
    branch,
    floor,
    kind,
    rotation: 0,
    zIndex: z,
    fontWeight: 'normal',
    textAlign: 'center',
    color: '#1f2937',
    fill: '',
    text: '',
    fontSize: 14,
  }
  switch (kind) {
    case 'text':
      return { ...base, x: 80, y: 80, width: 160, height: 40, text: 'Text', fill: '' }
    case 'rectangle':
      return { ...base, x: 80, y: 80, width: 180, height: 120, fill: '#fef3c7' }
    case 'circle':
      return { ...base, x: 80, y: 80, width: 120, height: 120, fill: '#dbeafe' }
    case 'line':
      // For lines we treat (x,y) as the start and (x+width, y+height) as the
      // end. Default to a 200px horizontal line.
      return { ...base, x: 80, y: 120, width: 200, height: 0, color: '#1f2937' }
  }
}

export const useRoomMapStore = create<State & Actions>((set, get) => ({
  branch: '',
  floor: '1',
  rooms: [],
  blocks: [],
  shapes: [],
  selectedIds: [],
  selectedShapeIds: [],
  dirty: false,
  saving: false,
  zoom: 1,
  snapToGrid: true,
  gridSize: GRID,
  autoSave: false,
  canvasWidth: 1920,
  canvasHeight: 1080,
  past: [],
  future: [],

  hydrate: ({ branch, floor, rooms, blocks, shapes }) =>
    set({
      branch,
      floor,
      rooms,
      blocks: blocks.map((b) => ({ ...b })),
      shapes: (shapes ?? []).map((s) => ({ ...s })),
      selectedIds: [],
      selectedShapeIds: [],
      dirty: false,
      past: [],
      future: [],
    }),

  setSelected: (id) => set({ selectedIds: id ? [id] : [], selectedShapeIds: [] }),

  toggleSelected: (id) => {
    const { selectedIds } = get()
    set({
      selectedIds: selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
      selectedShapeIds: [],
    })
  },

  selectMany: (ids) => set({ selectedIds: [...ids] }),

  clearSelection: () => set({ selectedIds: [], selectedShapeIds: [] }),

  addBlockForRoom: (roomId) => {
    const { blocks, shapes, branch, floor, rooms, past } = get()
    if (blocks.some((b) => b.roomId === roomId && !b.pendingDelete)) return
    const room = rooms.find((r) => r.id === roomId)
    if (!room) return
    const offset = blocks.length * 16
    const draft: DraftBlock = {
      id: `tmp-${roomId}`,
      roomId,
      branch,
      floor,
      x: 40 + (offset % 320),
      y: 40 + (offset % 200),
      width: 120,
      height: 80,
      rotation: 0,
      zIndex: nextZIndex(blocks),
    }
    set({
      past: pushHistory(past, frame(blocks, shapes)),
      future: [],
      blocks: [...blocks.filter((b) => b.roomId !== roomId), draft],
      selectedIds: [draft.id],
      selectedShapeIds: [],
      dirty: true,
    })
  },

  removeBlock: (id) => {
    const { blocks, shapes, selectedIds, past } = get()
    const next = blocks.filter((b) => b.id !== id)
    set({
      past: pushHistory(past, frame(blocks, shapes)),
      future: [],
      blocks: next,
      selectedIds: selectedIds.filter((x) => x !== id),
      dirty: true,
    })
  },

  removeSelected: () => {
    const { blocks, shapes, selectedIds, selectedShapeIds, past } = get()
    if (selectedIds.length === 0 && selectedShapeIds.length === 0) return
    const blockIds = new Set(selectedIds)
    const shapeIds = new Set(selectedShapeIds)
    set({
      past: pushHistory(past, frame(blocks, shapes)),
      future: [],
      blocks: blocks.filter((b) => !blockIds.has(b.id)),
      shapes: shapes.filter((s) => !shapeIds.has(s.id)),
      selectedIds: [],
      selectedShapeIds: [],
      dirty: true,
    })
  },

  duplicateBlock: (id) => {
    const { blocks, shapes, rooms, past } = get()
    const source = blocks.find((b) => b.id === id)
    if (!source) return

    // Order every room in the branch by room number so the duplicate
    // continues across floor naming conventions — e.g. duplicating 109
    // (last 1xx) picks 201 (first 2xx). Search forward first, then wrap
    // backward so the action still does something at the end of the list.
    const siblings = sortRoomsByNumber(
      rooms.filter((r) => r.branch === source.branch),
    )
    const sourceIdx = siblings.findIndex((r) => r.id === source.roomId)
    if (sourceIdx === -1) return

    const taken = new Set(blocks.map((b) => b.roomId))
    let candidateIdx = -1
    for (let i = sourceIdx + 1; i < siblings.length; i++) {
      if (!taken.has(siblings[i].id)) { candidateIdx = i; break }
    }
    if (candidateIdx === -1) {
      for (let i = sourceIdx - 1; i >= 0; i--) {
        if (!taken.has(siblings[i].id)) { candidateIdx = i; break }
      }
    }
    if (candidateIdx === -1) return
    const candidate = siblings[candidateIdx]

    // Per-step spacing — try to read it off an already-placed neighbour so
    // the new block lines up with the existing layout. Forward neighbour
    // wins; if there isn't one, mirror a backward neighbour. Falls back to
    // 'just to the right of the source by its width' when nothing's placed.
    let dx = source.width
    let dy = 0
    let foundDelta = false
    for (let i = sourceIdx + 1; i < siblings.length && !foundDelta; i++) {
      const ref = blocks.find((b) => b.roomId === siblings[i].id)
      if (ref) {
        const steps = i - sourceIdx
        dx = (ref.x - source.x) / steps
        dy = (ref.y - source.y) / steps
        foundDelta = true
      }
    }
    if (!foundDelta) {
      for (let i = sourceIdx - 1; i >= 0 && !foundDelta; i--) {
        const ref = blocks.find((b) => b.roomId === siblings[i].id)
        if (ref) {
          const steps = sourceIdx - i
          dx = (source.x - ref.x) / steps
          dy = (source.y - ref.y) / steps
          foundDelta = true
        }
      }
    }

    // Anchor = the latest placed block at or before the candidate in the
    // sequence (we start from source and walk forward). Lets us extend the
    // pattern even when the candidate is several slots past source.
    let anchorIdx = sourceIdx
    let anchorBlock: DraftBlock = source
    for (let i = sourceIdx + 1; i < candidateIdx; i++) {
      const ref = blocks.find((b) => b.roomId === siblings[i].id)
      if (ref) {
        anchorIdx = i
        anchorBlock = ref
      }
    }
    const steps = candidateIdx - anchorIdx
    const newX = anchorBlock.x + dx * steps
    const newY = anchorBlock.y + dy * steps

    const draft: DraftBlock = {
      ...source,
      id: `tmp-${candidate.id}`,
      roomId: candidate.id,
      x: newX,
      y: newY,
      zIndex: nextZIndex(blocks),
    }
    set({
      past: pushHistory(past, frame(blocks, shapes)),
      future: [],
      blocks: [...blocks, draft],
      selectedIds: [draft.id],
      selectedShapeIds: [],
      dirty: true,
    })
  },

  updateBlock: (id, patch) => {
    const { blocks, shapes, snapToGrid, gridSize, past } = get()
    const snap = (v: number) => (snapToGrid ? Math.round(v / gridSize) * gridSize : v)
    const nextBlocks = blocks.map((b) =>
      b.id === id
        ? {
            ...b,
            ...patch,
            ...(patch.x !== undefined ? { x: snap(patch.x) } : {}),
            ...(patch.y !== undefined ? { y: snap(patch.y) } : {}),
            ...(patch.width !== undefined ? { width: snap(patch.width) } : {}),
            ...(patch.height !== undefined ? { height: snap(patch.height) } : {}),
          }
        : b,
    )
    set({
      past: pushHistory(past, frame(blocks, shapes)),
      future: [],
      blocks: nextBlocks,
      dirty: true,
    })
  },

  // Batch geometry update — no history push. Used during group drag / group
  // resize so every frame doesn't fatten the undo stack. snapToGrid still
  // applies so the visual matches a single-block gesture.
  setBlockGeoms: (updates) => {
    const { blocks, snapToGrid, gridSize } = get()
    const snap = (v: number) => (snapToGrid ? Math.round(v / gridSize) * gridSize : v)
    const map = new Map(updates.map((u) => [u.id, u]))
    const nextBlocks = blocks.map((b) => {
      const u = map.get(b.id)
      if (!u) return b
      return {
        ...b,
        ...(u.x !== undefined ? { x: snap(u.x) } : {}),
        ...(u.y !== undefined ? { y: snap(u.y) } : {}),
        ...(u.width !== undefined ? { width: Math.max(20, snap(u.width)) } : {}),
        ...(u.height !== undefined ? { height: Math.max(20, snap(u.height)) } : {}),
        ...(u.rotation !== undefined ? { rotation: u.rotation } : {}),
      }
    })
    set({ blocks: nextBlocks, dirty: true })
  },

  // Save the current blocks to the undo stack without changing them. The
  // start of a group drag uses this so undo restores the pre-drag layout.
  pushHistorySnapshot: () => {
    const { blocks, shapes, past } = get()
    set({ past: pushHistory(past, frame(blocks, shapes)), future: [] })
  },

  // Nudge every selected block by the same delta. Used by arrow-key navigation
  // and for moving a marquee selection as a group.
  moveSelected: (dx, dy) => {
    const { blocks, shapes, selectedIds, snapToGrid, gridSize, past } = get()
    if (selectedIds.length === 0) return
    const ids = new Set(selectedIds)
    const snap = (v: number) => (snapToGrid ? Math.round(v / gridSize) * gridSize : v)
    const nextBlocks = blocks.map((b) =>
      ids.has(b.id) ? { ...b, x: snap(b.x + dx), y: snap(b.y + dy) } : b,
    )
    set({
      past: pushHistory(past, frame(blocks, shapes)),
      future: [],
      blocks: nextBlocks,
      dirty: true,
    })
  },

  // Bulk replace — used by Import JSON. Coordinates and dimensions are
  // already trusted (parsed from the JSON), so we don't re-snap here.
  replaceAll: (next) => {
    const { blocks, shapes, past } = get()
    set({
      past: pushHistory(past, frame(blocks, shapes)),
      future: [],
      blocks: next.map((b) => ({ ...b })),
      selectedIds: [],
      dirty: true,
    })
  },

  addShape: (kind) => {
    const { blocks, shapes, branch, floor, past } = get()
    const z = nextShapeZ(shapes, blocks)
    const id = `tmp-shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const draft: DraftShape = { id, ...defaultShape(kind, branch, floor || '1', z) }
    set({
      past: pushHistory(past, frame(blocks, shapes)),
      future: [],
      shapes: [...shapes, draft],
      selectedShapeIds: [id],
      selectedIds: [],
      dirty: true,
    })
  },

  removeShape: (id) => {
    const { blocks, shapes, selectedShapeIds, past } = get()
    set({
      past: pushHistory(past, frame(blocks, shapes)),
      future: [],
      shapes: shapes.filter((s) => s.id !== id),
      selectedShapeIds: selectedShapeIds.filter((x) => x !== id),
      dirty: true,
    })
  },

  duplicateShape: (id) => {
    const { blocks, shapes, past } = get()
    const src = shapes.find((s) => s.id === id)
    if (!src) return
    const dup: DraftShape = {
      ...src,
      id: `tmp-shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      x: src.x + 20,
      y: src.y + 20,
      zIndex: nextShapeZ(shapes, blocks),
    }
    set({
      past: pushHistory(past, frame(blocks, shapes)),
      future: [],
      shapes: [...shapes, dup],
      selectedShapeIds: [dup.id],
      selectedIds: [],
      dirty: true,
    })
  },

  updateShape: (id, patch) => {
    const { blocks, shapes, past } = get()
    const nextShapes = shapes.map((s) => (s.id === id ? { ...s, ...patch } : s))
    set({
      past: pushHistory(past, frame(blocks, shapes)),
      future: [],
      shapes: nextShapes,
      dirty: true,
    })
  },

  // Batch geometry update — no history push. Mirrors setBlockGeoms so a
  // drag / rotate gesture collapses into a single undo entry via the
  // pushHistorySnapshot the caller takes at gesture start.
  setShapeGeoms: (updates) => {
    const { shapes } = get()
    const map = new Map(updates.map((u) => [u.id, u]))
    const nextShapes = shapes.map((s) => {
      const u = map.get(s.id)
      if (!u) return s
      return {
        ...s,
        ...(u.x !== undefined ? { x: u.x } : {}),
        ...(u.y !== undefined ? { y: u.y } : {}),
        ...(u.width !== undefined ? { width: u.width } : {}),
        ...(u.height !== undefined ? { height: u.height } : {}),
        ...(u.rotation !== undefined ? { rotation: u.rotation } : {}),
      }
    })
    set({ shapes: nextShapes, dirty: true })
  },

  setShapeSelected: (id) =>
    set({ selectedShapeIds: id ? [id] : [], selectedIds: [] }),

  toggleShapeSelected: (id) => {
    const { selectedShapeIds } = get()
    set({
      selectedShapeIds: selectedShapeIds.includes(id)
        ? selectedShapeIds.filter((x) => x !== id)
        : [...selectedShapeIds, id],
      selectedIds: [],
    })
  },

  selectManyShapes: (ids) => set({ selectedShapeIds: [...ids], selectedIds: [] }),

  undo: () => {
    const { past, future, blocks, shapes } = get()
    if (past.length === 0) return
    const prev = past[past.length - 1]
    const nextPast = past.slice(0, -1)
    set({
      past: nextPast,
      future: [...future, frame(blocks, shapes)],
      blocks: prev.blocks.map((b) => ({ ...b })),
      shapes: prev.shapes.map((s) => ({ ...s })),
      selectedIds: [],
      selectedShapeIds: [],
      dirty: true,
    })
  },

  redo: () => {
    const { past, future, blocks, shapes } = get()
    if (future.length === 0) return
    const next = future[future.length - 1]
    const nextFuture = future.slice(0, -1)
    set({
      past: [...past, frame(blocks, shapes)],
      future: nextFuture,
      blocks: next.blocks.map((b) => ({ ...b })),
      shapes: next.shapes.map((s) => ({ ...s })),
      selectedIds: [],
      selectedShapeIds: [],
      dirty: true,
    })
  },

  setZoom: (z) => set({ zoom: Math.min(2.5, Math.max(0.25, z)) }),
  setSnap: (snap) => set({ snapToGrid: snap }),
  setAutoSave: (on) => set({ autoSave: on }),
  setCanvasSize: (w, h) =>
    set({
      canvasWidth: Math.min(8000, Math.max(400, Math.round(w))),
      canvasHeight: Math.min(8000, Math.max(300, Math.round(h))),
    }),
  markSaving: (saving) => set({ saving }),
  markClean: () => set({ dirty: false, saving: false }),
}))
