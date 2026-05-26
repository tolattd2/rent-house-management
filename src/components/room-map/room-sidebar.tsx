'use client'

import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useRoomMapStore } from '@/store/use-room-map-store'
import { useRoomLabel } from '@/contexts/branches-context'
import { useLanguage } from '@/contexts/language-context'
import { formatCurrency, cn } from '@/lib/utils'
import { ROOM_MAP_MAX, ROOM_MAP_MIN, type RoomMapRoom } from '@/lib/room-map-service'

interface Props {
  editable: boolean
}

function statusBadge(room: RoomMapRoom) {
  if (room.hasReservation) return { variant: 'warning' as const, key: 'room_map_status_reserved' as const }
  if (room.status === 'occupied') return { variant: 'error' as const, key: 'status_occupied' as const }
  if (room.status === 'maintenance') return { variant: 'secondary' as const, key: 'status_maintenance' as const }
  return { variant: 'success' as const, key: 'status_vacant' as const }
}

function NumberField({
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
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
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
        className="h-8"
      />
    </div>
  )
}

export function RoomSidebar({ editable }: Props) {
  const { t } = useLanguage()
  const roomLabel = useRoomLabel()

  const selectedId = useRoomMapStore((s) => s.selectedId)
  const blocks = useRoomMapStore((s) => s.blocks)
  const rooms = useRoomMapStore((s) => s.rooms)
  const updateBlock = useRoomMapStore((s) => s.updateBlock)

  const block = blocks.find((b) => b.id === selectedId) ?? null
  const room = block ? rooms.find((r) => r.id === block.roomId) ?? null : null

  if (!block || !room) {
    return (
      <aside className="w-72 shrink-0 border-l border-border bg-background/60 p-4 hidden lg:block">
        <p className="text-sm text-muted-foreground text-center py-10">
          {t('room_map_select_hint')}
        </p>
      </aside>
    )
  }

  const badge = statusBadge(room)

  return (
    <aside className="w-72 shrink-0 border-l border-border bg-background/60 p-4 hidden lg:flex lg:flex-col gap-4 overflow-y-auto">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{t('room')}</p>
            <h2 className="text-xl font-bold leading-tight truncate">{roomLabel(room)}</h2>
          </div>
          <Badge variant={badge.variant}>{t(badge.key)}</Badge>
        </div>
        <Link
          href={`/rooms?search=${encodeURIComponent(room.roomNumber)}`}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
        >
          {t('view')} <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <Separator />

      <div className="space-y-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t('room_map_tenant')}
        </p>
        {room.tenant ? (
          <div className="space-y-1 text-sm">
            <Link href={`/tenants/${room.tenant.id}`} className="font-medium hover:text-primary block truncate">
              {room.tenant.fullName}
            </Link>
            <p className="text-xs text-muted-foreground tabular-nums">{room.tenant.phone || '—'}</p>
            {room.tenant.moveInDate && (
              <p className="text-xs text-muted-foreground">{t('since')} {room.tenant.moveInDate}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('no_tenant')}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('tenants_col_monthly_rent')}</p>
          <p className="font-semibold tabular-nums">{formatCurrency(room.rentPriceUsd)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('tenants_col_outstanding')}</p>
          <p className={cn('font-semibold tabular-nums', room.outstandingUsd > 0 ? 'text-red-600' : 'text-green-600')}>
            {formatCurrency(room.outstandingUsd)}
          </p>
          {room.paymentStatus && (
            <p className="text-[10px] text-muted-foreground capitalize">
              {t(room.paymentStatus === 'paid'
                ? 'status_paid'
                : room.paymentStatus === 'partial'
                  ? 'status_partial'
                  : 'status_unpaid')}
            </p>
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t('room_map_position')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={block.x} min={0} max={3000} disabled={!editable}
            onChange={(v) => updateBlock(block.id, { x: v })} />
          <NumberField label="Y" value={block.y} min={0} max={3000} disabled={!editable}
            onChange={(v) => updateBlock(block.id, { y: v })} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t('room_map_size')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="W" value={block.width} min={ROOM_MAP_MIN.w} max={ROOM_MAP_MAX.w} disabled={!editable}
            onChange={(v) => updateBlock(block.id, { width: v })} />
          <NumberField label="H" value={block.height} min={ROOM_MAP_MIN.h} max={ROOM_MAP_MAX.h} disabled={!editable}
            onChange={(v) => updateBlock(block.id, { height: v })} />
        </div>
        <NumberField label={t('room_map_rotation')} value={block.rotation} min={-360} max={360} disabled={!editable}
          onChange={(v) => updateBlock(block.id, { rotation: ((v % 360) + 360) % 360 })} />
      </div>
    </aside>
  )
}
