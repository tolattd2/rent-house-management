'use client'

import { create } from 'zustand'
import type { RoomMapBlock, RoomMapRoom } from '@/lib/room-map-service'

export type DraftBlock = Omit<RoomMapBlock, 'id'> & { id: string; pendingDelete?: boolean }

type State = {
  branch: string
  floor: string
  rooms: RoomMapRoom[]
  blocks: DraftBlock[]
  selectedId: string | null
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
  // History snapshots taken BEFORE each block-mutating action so undo
  // restores the previous state. Capped at HISTORY_LIMIT to bound memory.
  past: DraftBlock[][]
  future: DraftBlock[][]
}

type Actions = {
  hydrate: (params: { branch: string; floor: string; rooms: RoomMapRoom[]; blocks: RoomMapBlock[] }) => void
  setSelected: (id: string | null) => void
  addBlockForRoom: (roomId: string) => void
  removeBlock: (id: string) => void
  duplicateBlock: (id: string) => void
  updateBlock: (id: string, patch: Partial<DraftBlock>) => void
  replaceAll: (blocks: DraftBlock[]) => void
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

function pushHistory(past: DraftBlock[][], snapshot: DraftBlock[]): DraftBlock[][] {
  const next = [...past, snapshot.map((b) => ({ ...b }))]
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next
}

export const useRoomMapStore = create<State & Actions>((set, get) => ({
  branch: '',
  floor: '1',
  rooms: [],
  blocks: [],
  selectedId: null,
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

  hydrate: ({ branch, floor, rooms, blocks }) =>
    set({
      branch,
      floor,
      rooms,
      blocks: blocks.map((b) => ({ ...b })),
      selectedId: null,
      dirty: false,
      past: [],
      future: [],
    }),

  setSelected: (id) => set({ selectedId: id }),

  addBlockForRoom: (roomId) => {
    const { blocks, branch, floor, rooms, past } = get()
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
      past: pushHistory(past, blocks),
      future: [],
      blocks: [...blocks.filter((b) => b.roomId !== roomId), draft],
      selectedId: draft.id,
      dirty: true,
    })
  },

  removeBlock: (id) => {
    const { blocks, selectedId, past } = get()
    const next = blocks.filter((b) => b.id !== id)
    set({
      past: pushHistory(past, blocks),
      future: [],
      blocks: next,
      selectedId: selectedId === id ? null : selectedId,
      dirty: true,
    })
  },

  duplicateBlock: (id) => {
    const { blocks, rooms, past } = get()
    const source = blocks.find((b) => b.id === id)
    if (!source) return
    const taken = new Set(blocks.map((b) => b.roomId))
    const candidate = rooms.find((r) => !taken.has(r.id) && r.branch === source.branch && r.floor === source.floor)
    if (!candidate) return
    const draft: DraftBlock = {
      ...source,
      id: `tmp-${candidate.id}`,
      roomId: candidate.id,
      x: source.x + 20,
      y: source.y + 20,
      zIndex: nextZIndex(blocks),
    }
    set({
      past: pushHistory(past, blocks),
      future: [],
      blocks: [...blocks, draft],
      selectedId: draft.id,
      dirty: true,
    })
  },

  updateBlock: (id, patch) => {
    const { blocks, snapToGrid, gridSize, past } = get()
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
      past: pushHistory(past, blocks),
      future: [],
      blocks: nextBlocks,
      dirty: true,
    })
  },

  // Bulk replace — used by Import JSON. Coordinates and dimensions are
  // already trusted (parsed from the JSON), so we don't re-snap here.
  replaceAll: (next) => {
    const { blocks, past } = get()
    set({
      past: pushHistory(past, blocks),
      future: [],
      blocks: next.map((b) => ({ ...b })),
      selectedId: null,
      dirty: true,
    })
  },

  undo: () => {
    const { past, future, blocks } = get()
    if (past.length === 0) return
    const prev = past[past.length - 1]
    const nextPast = past.slice(0, -1)
    set({
      past: nextPast,
      future: [...future, blocks.map((b) => ({ ...b }))],
      blocks: prev.map((b) => ({ ...b })),
      selectedId: null,
      dirty: true,
    })
  },

  redo: () => {
    const { past, future, blocks } = get()
    if (future.length === 0) return
    const next = future[future.length - 1]
    const nextFuture = future.slice(0, -1)
    set({
      past: [...past, blocks.map((b) => ({ ...b }))],
      future: nextFuture,
      blocks: next.map((b) => ({ ...b })),
      selectedId: null,
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
