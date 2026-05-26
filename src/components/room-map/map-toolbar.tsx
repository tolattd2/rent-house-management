'use client'

import { useMemo, useState } from 'react'
import { Plus, Save, Trash2, Copy, Grid3x3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useRoomMapStore } from '@/store/use-room-map-store'
import { useRoomLabel } from '@/contexts/branches-context'
import { useLanguage } from '@/contexts/language-context'
import { sortRoomsByNumber, cn } from '@/lib/utils'

interface Props {
  editable: boolean
  onSave: () => void
}

// Left rail: room picker + add/duplicate/delete + grid toggle + save.
export function MapToolbar({ editable, onSave }: Props) {
  const { t } = useLanguage()
  const roomLabel = useRoomLabel()
  const [search, setSearch] = useState('')

  const rooms = useRoomMapStore((s) => s.rooms)
  const blocks = useRoomMapStore((s) => s.blocks)
  const selectedId = useRoomMapStore((s) => s.selectedId)
  const dirty = useRoomMapStore((s) => s.dirty)
  const saving = useRoomMapStore((s) => s.saving)
  const snap = useRoomMapStore((s) => s.snapToGrid)
  const setSnap = useRoomMapStore((s) => s.setSnap)
  const addBlockForRoom = useRoomMapStore((s) => s.addBlockForRoom)
  const removeBlock = useRoomMapStore((s) => s.removeBlock)
  const duplicateBlock = useRoomMapStore((s) => s.duplicateBlock)

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
        <label className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-border text-xs">
          <span className="flex items-center gap-2">
            <Grid3x3 className="w-3.5 h-3.5 text-muted-foreground" />
            {t('room_map_snap')}
          </span>
          <Switch checked={snap} onCheckedChange={setSnap} disabled={!editable} />
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
