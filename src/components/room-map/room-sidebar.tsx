'use client'

import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useRoomMapStore } from '@/store/use-room-map-store'
import { useRoomLabel } from '@/contexts/branches-context'
import { useLanguage } from '@/contexts/language-context'
import { formatCurrency, cn } from '@/lib/utils'
import { ROOM_MAP_MAX, ROOM_MAP_MIN, type RoomMapRoom } from '@/lib/room-map-service'

interface Props {
  editable: boolean
}

function statusBadge(room: RoomMapRoom) {
  if (room.status === 'reserved' || room.hasReservation) return { variant: 'warning' as const, key: 'status_reserved' as const }
  if (room.status === 'occupied') return { variant: 'error' as const, key: 'status_occupied' as const }
  if (room.status === 'maintenance') return { variant: 'secondary' as const, key: 'status_maintenance' as const }
  return { variant: 'success' as const, key: 'status_vacant' as const }
}

function MiniField({
  label, value, min, max, onChange, disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className="uppercase tracking-wider font-semibold">{label}</span>
      <Input
        type="number"
        value={Math.round(value)}
        min={min}
        max={max}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
        disabled={disabled}
        className="h-7 w-16 px-1.5 text-xs tabular-nums"
      />
    </label>
  )
}

export function RoomSidebar({ editable }: Props) {
  const { t } = useLanguage()
  const roomLabel = useRoomLabel()

  const selectedIds = useRoomMapStore((s) => s.selectedIds)
  const blocks = useRoomMapStore((s) => s.blocks)
  const rooms = useRoomMapStore((s) => s.rooms)
  const updateBlock = useRoomMapStore((s) => s.updateBlock)

  const primaryId = selectedIds[0] ?? null
  const block = blocks.find((b) => b.id === primaryId) ?? null
  const room = block ? rooms.find((r) => r.id === block.roomId) ?? null : null

  if (selectedIds.length > 1) {
    return (
      <div className="border-b border-border bg-background/60 px-3 py-1.5">
        <p className="text-xs text-muted-foreground text-center tabular-nums">
          {selectedIds.length} {t('room_map_selected_count')}
        </p>
      </div>
    )
  }

  if (!block || !room) {
    return (
      <div className="border-b border-border bg-background/60 px-3 py-1.5">
        <p className="text-xs text-muted-foreground text-center">
          {t('room_map_select_hint')}
        </p>
      </div>
    )
  }

  const badge = statusBadge(room)

  return (
    <div className="border-b border-border bg-background/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Room + status + view link */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('room')}</span>
          <span className="text-sm font-bold truncate">{roomLabel(room)}</span>
          <Badge variant={badge.variant}>{t(badge.key)}</Badge>
          <Link
            href={`/rooms?search=${encodeURIComponent(room.roomNumber)}`}
            className="inline-flex items-center text-xs text-primary hover:underline"
            title={t('view')}
          >
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        <div className="h-5 w-px bg-border hidden sm:block" />

        {/* Tenant */}
        <div className="flex items-center gap-1.5 text-xs min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('room_map_tenant')}</span>
          {room.tenant ? (
            <Link href={`/tenants/${room.tenant.id}`} className="font-medium hover:text-primary truncate">
              {room.tenant.fullName}
            </Link>
          ) : (
            <span className="text-muted-foreground">{t('no_tenant')}</span>
          )}
          {room.tenant?.phone && <span className="text-muted-foreground tabular-nums">· {room.tenant.phone}</span>}
        </div>

        <div className="h-5 w-px bg-border hidden sm:block" />

        {/* Financials */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('tenants_col_monthly_rent')}</span>
            <span className="font-semibold tabular-nums">{formatCurrency(room.rentPriceUsd)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('tenants_col_outstanding')}</span>
            <span className={cn('font-semibold tabular-nums', room.outstandingUsd > 0 ? 'text-red-600' : 'text-green-600')}>
              {formatCurrency(room.outstandingUsd)}
            </span>
          </div>
        </div>

        <div className="h-5 w-px bg-border hidden md:block" />

        {/* Position + size editors */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <MiniField label="X" value={block.x} min={0} max={3000} disabled={!editable}
            onChange={(v) => updateBlock(block.id, { x: v })} />
          <MiniField label="Y" value={block.y} min={0} max={3000} disabled={!editable}
            onChange={(v) => updateBlock(block.id, { y: v })} />
          <MiniField label="W" value={block.width} min={ROOM_MAP_MIN.w} max={ROOM_MAP_MAX.w} disabled={!editable}
            onChange={(v) => updateBlock(block.id, { width: v })} />
          <MiniField label="H" value={block.height} min={ROOM_MAP_MIN.h} max={ROOM_MAP_MAX.h} disabled={!editable}
            onChange={(v) => updateBlock(block.id, { height: v })} />
          <MiniField label="R°" value={block.rotation} min={-360} max={360} disabled={!editable}
            onChange={(v) => updateBlock(block.id, { rotation: ((v % 360) + 360) % 360 })} />
        </div>
      </div>
    </div>
  )
}
