'use client'

import { useState } from 'react'
import { Plus, Search, Home, Users, DollarSign, Wrench, Edit, Trash2, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { RoomFormDialog } from '@/components/rooms/room-form-dialog'
import { formatCurrency, formatPhones, sortRoomsByNumber } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useLanguage } from '@/contexts/language-context'
import { useBranches, useRoomLabel } from '@/contexts/branches-context'
import { useDeleteWithUndo } from '@/hooks/use-delete-with-undo'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'

type Room = {
  id: string
  roomNumber: string
  branch: string
  roomType: string
  rentPriceUsd: number
  depositAmount: number
  status: 'occupied' | 'vacant' | 'maintenance'
  waterRateRiel: number
  electricRateRiel: number
  notes: string
  createdAt: Date
  tenants: Array<{ id: string; fullName: string; phone: string; phonesExtra: string[]; moveInDate: string }>
}

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'secondary'> = {
  occupied: 'success',
  vacant: 'secondary',
  maintenance: 'warning',
}

const statusIcon: Record<string, React.ElementType> = {
  occupied: Users,
  vacant: Home,
  maintenance: Wrench,
}

interface Props { rooms: Room[] }

export function RoomsClient({ rooms: initialRooms }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const { t } = useLanguage()
  const branches = useBranches()
  const roomLabel = useRoomLabel()
  const [rooms, setRooms] = useState(initialRooms)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [editRoom, setEditRoom] = useState<Room | null>(null)
  const { triggerDelete, dialogState, closeDialog } = useDeleteWithUndo()

  const filtered = sortRoomsByNumber(rooms.filter((r) => {
    const matchSearch = r.roomNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.roomType.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    const matchBranch = branchFilter === 'all' || r.branch === branchFilter
    return matchSearch && matchStatus && matchBranch
  }))

  const handleDelete = (room: Room) => {
    triggerDelete({
      itemName: roomLabel(room),
      onRemove: () => setRooms((prev) => prev.filter((r) => r.id !== room.id)),
      onRestore: () => setRooms((prev) => [room, ...prev]),
      onExecute: () => fetch(`/api/rooms/${room.id}`, { method: 'DELETE' }).then((r) => r.json()),
    })
  }

  const handleSave = () => {
    router.refresh()
    setShowForm(false)
    setEditRoom(null)
  }

  const branchRooms = branchFilter === 'all' ? rooms : rooms.filter((r) => r.branch === branchFilter)
  const stats = {
    total: branchRooms.length,
    occupied: branchRooms.filter((r) => r.status === 'occupied').length,
    vacant: branchRooms.filter((r) => r.status === 'vacant').length,
    maintenance: branchRooms.filter((r) => r.status === 'maintenance').length,
  }

  const statusLabels: Record<string, string> = {
    occupied: t('status_occupied'),
    vacant: t('status_vacant'),
    maintenance: t('status_maintenance'),
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('rooms_title')}</h1>
          <p className="text-muted-foreground text-sm">{branchRooms.length} {t('rooms_total')}</p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditRoom(null); setShowForm(true) }}>
            <Plus className="w-4 h-4 mr-2" /> {t('rooms_add')}
          </Button>
        )}
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <button onClick={() => setStatusFilter('all')}
          className={`flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl border transition-all text-blue-600 bg-blue-50 dark:bg-blue-950/30 ${statusFilter === 'all' ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}
        >
          <Building2 className="w-5 h-5" />
          <div className="text-left">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs opacity-80">{t('rooms_total_card')}</p>
          </div>
        </button>
        {(['occupied', 'vacant', 'maintenance'] as const).map((s) => {
          const Icon = statusIcon[s]
          const colors = { occupied: 'text-green-600 bg-green-50 dark:bg-green-950/30', vacant: 'text-slate-600 bg-slate-50 dark:bg-slate-900/30', maintenance: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30' }
          return (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
              className={`flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl border transition-all ${statusFilter === s ? 'ring-2 ring-primary' : 'hover:bg-muted/50'} ${colors[s]}`}
            >
              <Icon className="w-5 h-5" />
              <div className="text-left">
                <p className="text-2xl font-bold">{stats[s]}</p>
                <p className="text-xs opacity-80">{statusLabels[s]}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Search & Branch filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('rooms_search')} className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {['all', ...branches.map((br) => br.name)].map((b) => (
          <Button key={b} variant={branchFilter === b ? 'default' : 'outline'} size="sm"
            className="h-9 px-3 text-sm"
            onClick={() => setBranchFilter(b)}>
            {b === 'all' ? t('all_branches') : b}
          </Button>
        ))}
      </div>

      {/* Room grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((room, i) => {
          const tenant = room.tenants[0]
          const StatusIcon = statusIcon[room.status] ?? Home
          return (
            <div key={room.id}>
              <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg">{t('room')} {roomLabel(room)}</h3>
                      <p className="text-xs text-muted-foreground">{room.roomType}</p>
                    </div>
                    <Badge variant={statusVariant[room.status] ?? 'secondary'}>
                      {statusLabels[room.status] ?? room.status}
                    </Badge>
                  </div>

                  {/* Rent */}
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold">{formatCurrency(room.rentPriceUsd)}{t('tenants_per_month')}</span>
                  </div>

                  {/* Tenant info */}
                  {tenant ? (
                    <Link href={`/tenants/${tenant.id}`} className="block p-2.5 bg-green-50 dark:bg-green-950/20 rounded-lg mb-3 hover:bg-green-100 transition-colors">
                      <p className="text-xs font-semibold text-green-700 dark:text-green-400">{tenant.fullName}</p>
                      <p className="text-xs text-green-600/70 dark:text-green-500/70">{formatPhones(tenant.phone, tenant.phonesExtra)}</p>
                      <p className="text-xs text-green-600/60">{t('since')} {tenant.moveInDate}</p>
                    </Link>
                  ) : (
                    <div className="p-2.5 bg-muted/50 rounded-lg mb-3">
                      <p className="text-xs text-muted-foreground">{t('no_tenant')}</p>
                    </div>
                  )}

                  {/* Rates */}
                  <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground mb-3">
                    <span>{t('water')}: {room.waterRateRiel.toLocaleString()} ៛</span>
                    <span>{t('electric')}: {room.electricRateRiel.toLocaleString()} ៛</span>
                    <span>{t('tenants_col_deposit')}: {formatCurrency(room.depositAmount)}</span>
                  </div>

                  {/* Actions */}
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => { setEditRoom(room); setShowForm(true) }}>
                        <Edit className="w-3.5 h-3.5 mr-1" /> {t('edit')}
                      </Button>
                      {!tenant && (
                        <Button variant="outline" size="sm" onClick={() => handleDelete(room)} className="text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <Home className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('rooms_empty')}</p>
          </div>
        )}
      </div>

      <DeleteConfirmDialog
        open={dialogState.open}
        itemName={dialogState.itemName}
        onClose={closeDialog}
        onConfirm={dialogState.onConfirm}
      />

      {/* Form dialog */}
      {showForm && (
        <RoomFormDialog
          room={editRoom}
          onClose={() => { setShowForm(false); setEditRoom(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
