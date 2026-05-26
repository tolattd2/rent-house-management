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
}

type Actions = {
  hydrate: (params: { branch: string; floor: string; rooms: RoomMapRoom[]; blocks: RoomMapBlock[] }) => void
  setSelected: (id: string | null) => void
  addBlockForRoom: (roomId: string) => void
  removeBlock: (id: string) => void
  duplicateBlock: (id: string) => void
  updateBlock: (id: string, patch: Partial<DraftBlock>) => void
  setZoom: (z: number) => void
  setSnap: (snap: boolean) => void
  markSaving: (saving: boolean) => void
  markClean: () => void
}

const GRID = 10

function nextZIndex(blocks: DraftBlock[]): number {
  return blocks.length === 0 ? 1 : Math.max(...blocks.map((b) => b.zIndex)) + 1
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

  hydrate: ({ branch, floor, rooms, blocks }) =>
    set({
      branch,
      floor,
      rooms,
      blocks: blocks.map((b) => ({ ...b })),
      selectedId: null,
      dirty: false,
    }),

  setSelected: (id) => set({ selectedId: id }),

  addBlockForRoom: (roomId) => {
    const { blocks, branch, floor, rooms } = get()
    if (blocks.some((b) => b.roomId === roomId && !b.pendingDelete)) return
    const room = rooms.find((r) => r.id === roomId)
    if (!room) return
    // Stagger new blocks so duplicates don't stack into one spot.
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
    set({ blocks: [...blocks.filter((b) => b.roomId !== roomId), draft], selectedId: draft.id, dirty: true })
  },

  removeBlock: (id) => {
    const { blocks, selectedId } = get()
    const next = blocks.filter((b) => b.id !== id)
    set({ blocks: next, selectedId: selectedId === id ? null : selectedId, dirty: true })
  },

  duplicateBlock: (id) => {
    const { blocks, rooms } = get()
    const source = blocks.find((b) => b.id === id)
    if (!source) return
    // A room only ever has one rectangle on a floor — pick the next
    // un-mapped room in the same branch+floor for the duplicate.
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
    set({ blocks: [...blocks, draft], selectedId: draft.id, dirty: true })
  },

  updateBlock: (id, patch) => {
    const { blocks, snapToGrid, gridSize } = get()
    const snap = (v: number) => (snapToGrid ? Math.round(v / gridSize) * gridSize : v)
    set({
      blocks: blocks.map((b) =>
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
      ),
      dirty: true,
    })
  },

  setZoom: (z) => set({ zoom: Math.min(2.5, Math.max(0.25, z)) }),
  setSnap: (snap) => set({ snapToGrid: snap }),
  markSaving: (saving) => set({ saving }),
  markClean: () => set({ dirty: false, saving: false }),
}))
