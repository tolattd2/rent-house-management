'use client'

import { useMemo, useState } from 'react'
import { Plus, Save, Trash2, Copy, Grid3x3, Undo2, Redo2, Download, Maximize, Minimize, Wand2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useRoomMapStore } from '@/store/use-room-map-store'
import { useRoomLabel } from '@/contexts/branches-context'
import { useLanguage } from '@/contexts/language-context'
import { sortRoomsByNumber, cn } from '@/lib/utils'
import { ExportDialog } from './export-dialog'

interface Props {
  editable: boolean
  fullscreen: boolean
  onToggleFullscreen: () => void
  onSave: () => void
  // Mobile drawer controls — on desktop the toolbar is a static sidebar and
  // these are ignored.
  mobileOpen: boolean
  onMobileClose: () => void
}

// Left rail: room picker + add/duplicate/delete + grid toggle + undo/redo +
// export + auto-save toggle + save.
export function MapToolbar({ editable, fullscreen, onToggleFullscreen, onSave, mobileOpen, onMobileClose }: Props) {
  const { t } = useLanguage()
  const roomLabel = useRoomLabel()
  const [search, setSearch] = useState('')
  const [showExport, setShowExport] = useState(false)

  const rooms = useRoomMapStore((s) => s.rooms)
  const blocks = useRoomMapStore((s) => s.blocks)
  const selectedIds = useRoomMapStore((s) => s.selectedIds)
  const dirty = useRoomMapStore((s) => s.dirty)
  const saving = useRoomMapStore((s) => s.saving)
  const snap = useRoomMapStore((s) => s.snapToGrid)
  const autoSave = useRoomMapStore((s) => s.autoSave)
  const setSnap = useRoomMapStore((s) => s.setSnap)
  const setAutoSave = useRoomMapStore((s) => s.setAutoSave)
  const addBlockForRoom = useRoomMapStore((s) => s.addBlockForRoom)
  const removeSelected = useRoomMapStore((s) => s.removeSelected)
  const duplicateBlock = useRoomMapStore((s) => s.duplicateBlock)
  const undo = useRoomMapStore((s) => s.undo)
  const redo = useRoomMapStore((s) => s.redo)
  const canUndo = useRoomMapStore((s) => s.past.length > 0)
  const canRedo = useRoomMapStore((s) => s.future.length > 0)

  const primarySelectedId = selectedIds[0] ?? null
  const hasSelection = selectedIds.length > 0

  // On mobile we want the drawer to step out of the way as soon as the user
  // taps an action so they can see the canvas. `withClose` wraps a callback
  // to dismiss the drawer first.
  const withClose = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
    onMobileClose()
    fn(...args)
  }

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

  // Shared toolbar content — rendered into either the desktop aside or the
  // mobile drawer below. Extracted into a variable so we don't duplicate JSX.
  const content = (
    <>
      <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-background z-10">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('room_map_tools')}
        </span>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onMobileClose} aria-label="Close">
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="p-3 border-b border-border space-y-2">
        <Button
          size="sm"
          className="w-full"
          onClick={withClose(onSave)}
          disabled={!editable || !dirty}
          loading={saving}
        >
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {t('room_map_save')}
          {dirty && !saving && <span className="ml-auto text-[10px] opacity-80">●</span>}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" disabled={!editable || !canUndo} onClick={withClose(undo)} title="Ctrl+Z">
            <Undo2 className="w-3.5 h-3.5 mr-1" />
            <span className="truncate">{t('room_map_undo')}</span>
          </Button>
          <Button size="sm" variant="outline" disabled={!editable || !canRedo} onClick={withClose(redo)} title="Ctrl+Y">
            <Redo2 className="w-3.5 h-3.5 mr-1" />
            <span className="truncate">{t('room_map_redo')}</span>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!editable || !primarySelectedId}
            onClick={withClose(() => primarySelectedId && duplicateBlock(primarySelectedId))}
            title={t('room_map_duplicate')}
          >
            <Copy className="w-3.5 h-3.5 mr-1" />
            <span className="truncate">{t('room_map_duplicate')}</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!editable || !hasSelection}
            onClick={withClose(removeSelected)}
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            title={t('room_map_delete')}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            <span className="truncate">{t('room_map_delete')}</span>
            {selectedIds.length > 1 && (
              <span className="ml-1 text-[10px] opacity-80 tabular-nums">×{selectedIds.length}</span>
            )}
          </Button>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={withClose(() => setShowExport(true))}
          disabled={blocks.length === 0}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          <span className="truncate">{t('room_map_export')}</span>
        </Button>

        <Button size="sm" variant="outline" className="w-full" onClick={withClose(onToggleFullscreen)}>
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

      <div className="p-3 space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t('room_map_rooms')}
        </p>
        <Input
          placeholder={t('rooms_search')}
          className="h-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="space-y-1">
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
                onClick={withClose(() => addBlockForRoom(r.id))}
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
      <ExportDialog open={showExport} onClose={() => setShowExport(false)} />
    </>
  )

  return (
    <>
      {/* Desktop sidebar — always rendered at md+ */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-background/60 min-h-0 overflow-y-auto">
        {content}
      </aside>

      {/* Mobile drawer — only mounts when open; full backdrop dims the canvas */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-40"
            onClick={onMobileClose}
            aria-hidden
          />
          <aside className="md:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] flex flex-col border-r border-border bg-background shadow-xl overflow-y-auto">
            {content}
          </aside>
        </>
      )}
    </>
  )
}
