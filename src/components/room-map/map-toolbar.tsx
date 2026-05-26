'use client'

import { useMemo, useRef, useState } from 'react'
import { Plus, Save, Trash2, Copy, Grid3x3, Undo2, Redo2, Download, Upload, Maximize, Minimize, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useRoomMapStore, type DraftBlock } from '@/store/use-room-map-store'
import { useRoomLabel } from '@/contexts/branches-context'
import { useLanguage } from '@/contexts/language-context'
import { sortRoomsByNumber, cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

interface Props {
  editable: boolean
  fullscreen: boolean
  onToggleFullscreen: () => void
  onSave: () => void
}

// Left rail: room picker + add/duplicate/delete + grid toggle + undo/redo +
// import/export + auto-save toggle + save.
export function MapToolbar({ editable, fullscreen, onToggleFullscreen, onSave }: Props) {
  const { t } = useLanguage()
  const roomLabel = useRoomLabel()
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const rooms = useRoomMapStore((s) => s.rooms)
  const blocks = useRoomMapStore((s) => s.blocks)
  const selectedId = useRoomMapStore((s) => s.selectedId)
  const dirty = useRoomMapStore((s) => s.dirty)
  const saving = useRoomMapStore((s) => s.saving)
  const snap = useRoomMapStore((s) => s.snapToGrid)
  const autoSave = useRoomMapStore((s) => s.autoSave)
  const setSnap = useRoomMapStore((s) => s.setSnap)
  const setAutoSave = useRoomMapStore((s) => s.setAutoSave)
  const addBlockForRoom = useRoomMapStore((s) => s.addBlockForRoom)
  const removeBlock = useRoomMapStore((s) => s.removeBlock)
  const duplicateBlock = useRoomMapStore((s) => s.duplicateBlock)
  const undo = useRoomMapStore((s) => s.undo)
  const redo = useRoomMapStore((s) => s.redo)
  const replaceAll = useRoomMapStore((s) => s.replaceAll)
  const canUndo = useRoomMapStore((s) => s.past.length > 0)
  const canRedo = useRoomMapStore((s) => s.future.length > 0)
  const branch = useRoomMapStore((s) => s.branch)
  const floor = useRoomMapStore((s) => s.floor)

  const onCanvas = useMemo(() => new Set(blocks.map((b) => b.roomId)), [blocks])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = rooms.filter((r) => {
      if (!q) return true
      return (
        r.roomNumber.toLowerCase().includes(q) ||
        (r.tenant?.fullName ?? '').toLowerCase().includes(q)
      )
    })
    return sortRoomsByNumber(list)
  }, [rooms, search])

  const handleExport = () => {
    const payload = {
      version: 1,
      branch,
      floor,
      exportedAt: new Date().toISOString(),
      blocks: blocks.map((b) => ({
        roomId: b.roomId,
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        rotation: b.rotation,
        zIndex: b.zIndex,
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `room-map-${branch}-floor-${floor}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImportClick = () => fileInputRef.current?.click()

  // Accepts the file we just exported, or any JSON of the shape
  // { blocks: [{ roomId, x, y, width, height, rotation, zIndex }] }.
  // We map each entry to an existing room (matching by roomId, or by
  // roomNumber if the export came from a copied DB), skip unknowns, and
  // replace the canvas — undo restores the prior layout.
  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as { blocks?: Array<Record<string, unknown>> }
      if (!parsed || !Array.isArray(parsed.blocks)) throw new Error('Missing "blocks" array')

      const roomById = new Map(rooms.map((r) => [r.id, r]))
      const roomByNumber = new Map(rooms.map((r) => [r.roomNumber, r]))
      const next: DraftBlock[] = []
      let skipped = 0
      for (const raw of parsed.blocks) {
        const roomId = typeof raw.roomId === 'string' ? raw.roomId : null
        const roomNumber = typeof raw.roomNumber === 'string' ? raw.roomNumber : null
        const room = (roomId && roomById.get(roomId)) || (roomNumber && roomByNumber.get(roomNumber)) || null
        if (!room) { skipped++; continue }
        next.push({
          id: `tmp-${room.id}`,
          roomId: room.id,
          branch,
          floor,
          x: Number(raw.x) || 0,
          y: Number(raw.y) || 0,
          width: Number(raw.width) || 120,
          height: Number(raw.height) || 80,
          rotation: Number(raw.rotation) || 0,
          zIndex: Number(raw.zIndex) || 0,
        })
      }
      if (next.length === 0) throw new Error('No matching rooms')
      replaceAll(next)
      toast({
        title: t('room_map_import_done'),
        description: skipped > 0 ? `${next.length} placed, ${skipped} skipped` : `${next.length} placed`,
      })
    } catch (e) {
      toast({
        title: t('room_map_import_failed'),
        description: e instanceof Error ? e.message : 'Invalid JSON',
        variant: 'destructive',
      })
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <aside className="w-60 shrink-0 flex flex-col gap-3 border-r border-border bg-background/60 p-3">
      <div className="space-y-2">
        <Button
          size="sm"
          className="w-full"
          onClick={onSave}
          disabled={!editable || !dirty}
          loading={saving}
        >
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {t('room_map_save')}
          {dirty && !saving && <span className="ml-auto text-[10px] opacity-80">●</span>}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" disabled={!editable || !canUndo} onClick={undo} title="Ctrl+Z">
            <Undo2 className="w-3.5 h-3.5 mr-1" />
            <span className="truncate">{t('room_map_undo')}</span>
          </Button>
          <Button size="sm" variant="outline" disabled={!editable || !canRedo} onClick={redo} title="Ctrl+Y">
            <Redo2 className="w-3.5 h-3.5 mr-1" />
            <span className="truncate">{t('room_map_redo')}</span>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!editable || !selectedId}
            onClick={() => selectedId && duplicateBlock(selectedId)}
            title={t('room_map_duplicate')}
          >
            <Copy className="w-3.5 h-3.5 mr-1" />
            <span className="truncate">{t('room_map_duplicate')}</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!editable || !selectedId}
            onClick={() => selectedId && removeBlock(selectedId)}
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            title={t('room_map_delete')}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            <span className="truncate">{t('room_map_delete')}</span>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={handleExport} disabled={blocks.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1" />
            <span className="truncate">{t('room_map_export')}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={handleImportClick} disabled={!editable}>
            <Upload className="w-3.5 h-3.5 mr-1" />
            <span className="truncate">{t('room_map_import')}</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImportFile(f)
            }}
          />
        </div>

        <Button size="sm" variant="outline" className="w-full" onClick={onToggleFullscreen}>
          {fullscreen
            ? <><Minimize className="w-3.5 h-3.5 mr-1.5" />{t('room_map_exit_fullscreen')}</>
            : <><Maximize className="w-3.5 h-3.5 mr-1.5" />{t('room_map_fullscreen')}</>}
        </Button>

        <label className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-border text-xs">
          <span className="flex items-center gap-2">
            <Grid3x3 className="w-3.5 h-3.5 text-muted-foreground" />
            {t('room_map_snap')}
          </span>
          <Switch checked={snap} onCheckedChange={setSnap} disabled={!editable} />
        </label>

        <label className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-border text-xs">
          <span className="flex items-center gap-2">
            <Wand2 className="w-3.5 h-3.5 text-muted-foreground" />
            {t('room_map_autosave')}
          </span>
          <Switch checked={autoSave} onCheckedChange={setAutoSave} disabled={!editable} />
        </label>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          {t('room_map_rooms')}
        </p>
        <Input
          placeholder={t('rooms_search')}
          className="h-8 mb-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">{t('room_map_no_rooms')}</p>
          )}
          {filtered.map((r) => {
            const placed = onCanvas.has(r.id)
            return (
              <button
                key={r.id}
                type="button"
                disabled={!editable || placed}
                onClick={() => addBlockForRoom(r.id)}
                className={cn(
                  'w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded border border-border text-xs transition',
                  placed
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'hover:bg-muted/60',
                )}
              >
                <span className="min-w-0">
                  <span className="font-medium block truncate">{t('room')} {roomLabel(r)}</span>
                  {r.tenant && (
                    <span className="text-muted-foreground block truncate">{r.tenant.fullName}</span>
                  )}
                </span>
                {placed ? (
                  <span className="text-[10px] uppercase tracking-wider opacity-70">{t('room_map_placed')}</span>
                ) : (
                  <Plus className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
