'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  Plus, Search, Bell, Trash2, Pencil, CheckCircle2, RotateCcw,
  LogOut, Wrench, AlertTriangle, FileText, Hammer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TableScroll } from '@/components/ui/table-scroll'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'
import { NoticeDialog, type TenantNotice, type NoticeTenantOption } from '@/components/tenants/notice-dialog'
import { formatDate, cn } from '@/lib/utils'
import { CARD_STYLES, type CardColor } from '@/lib/card-colors'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import { useBranches, useRoomLabel } from '@/contexts/branches-context'
import { useDeleteWithUndo } from '@/hooks/use-delete-with-undo'
import { usePersistentState } from '@/hooks/use-persistent-state'

type NoticeType = 'move_out' | 'repair' | 'complaint' | 'general'

type NoticeRecord = {
  id: string
  type: NoticeType
  message: string
  expectedDate: string
  status: 'open' | 'resolved'
  resolvedAt: Date | string | null
  createdAt: Date | string
  tenant: {
    id: string; fullName: string
    room: { id: string; roomNumber: string; branch: string | null } | null
  } | null
}

interface Props {
  notices: NoticeRecord[]
  tenants: NoticeTenantOption[]
}

/** Gradient-wash colour for each status summary card. */
const STATUS_CARD_COLOR: Record<'all' | 'open' | 'resolved', CardColor> = {
  all: 'slate',
  open: 'amber',
  resolved: 'green',
}

/** Icon + badge colour per notice type. */
const NOTICE_META: Record<NoticeType, { icon: typeof LogOut; badge: 'error' | 'warning' | 'secondary' }> = {
  move_out: { icon: LogOut, badge: 'error' },
  repair: { icon: Wrench, badge: 'warning' },
  complaint: { icon: AlertTriangle, badge: 'warning' },
  general: { icon: FileText, badge: 'secondary' },
}

const NOTICE_TYPES: NoticeType[] = ['move_out', 'repair', 'complaint', 'general']

export function NoticesClient({ notices: initial, tenants }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const { t } = useLanguage()
  const roomLabel = useRoomLabel()
  const branches = useBranches().map((b) => b.name)

  const [notices, setNotices] = useState(initial)
  useEffect(() => { setNotices(initial) }, [initial])

  const [search, setSearch] = usePersistentState('notices/search', '')
  const [statusFilter, setStatusFilter] = usePersistentState<'all' | 'open' | 'resolved'>('notices/status', 'all')
  const [typeFilter, setTypeFilter] = usePersistentState<'all' | NoticeType>('notices/type', 'all')
  const [branchFilter, setBranchFilter] = usePersistentState('notices/branch', 'all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<NoticeRecord | null>(null)
  const { triggerDelete, dialogState, closeDialog } = useDeleteWithUndo()

  const filtered = notices.filter((n) => {
    const q = search.toLowerCase()
    const matchSearch =
      (n.tenant?.fullName ?? '').toLowerCase().includes(q) ||
      (n.tenant?.room?.roomNumber ?? '').toLowerCase().includes(q) ||
      n.message.toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || n.status === statusFilter
    const matchType = typeFilter === 'all' || n.type === typeFilter
    const matchBranch = branchFilter === 'all' || n.tenant?.room?.branch === branchFilter
    return matchSearch && matchStatus && matchType && matchBranch
  })

  const openCount = notices.filter((n) => n.status === 'open').length

  function openNew() {
    setEditing(null)
    setShowForm(true)
  }

  function openEdit(n: NoticeRecord) {
    setEditing(n)
    setShowForm(true)
  }

  function handleSaved(record: TenantNotice) {
    // Edit: merge the updated fields, keep the tenant we already know.
    if (editing) {
      setNotices((prev) => prev.map((n) => (n.id === record.id ? { ...n, ...record } : n)))
    }
    // Create: the new row arrives via the refreshed server data below.
    setShowForm(false)
    setEditing(null)
    router.refresh()
  }

  async function toggleResolved(n: NoticeRecord) {
    const next = n.status === 'open' ? 'resolved' : 'open'
    const res = await fetch(`/api/notices/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    const data = await res.json()
    if (data.ok) {
      setNotices((prev) => prev.map((x) => (x.id === n.id ? { ...x, ...data.record } : x)))
      toast({ title: next === 'resolved' ? t('notice_resolved_toast') : t('notice_reopened_toast') })
      router.refresh()
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
  }

  const [addingMaintenanceId, setAddingMaintenanceId] = useState<string | null>(null)
  async function handleAddToMaintenance(n: NoticeRecord) {
    if (!n.tenant?.room) {
      toast({ title: t('notice_add_to_maintenance_no_room'), variant: 'destructive' })
      return
    }
    setAddingMaintenanceId(n.id)
    const res = await fetch('/api/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: n.message,
        description: n.message,
        category: 'general',
        repairFeeUsd: 0,
        reportedDate: new Date().toISOString().slice(0, 10),
        notes: '',
        roomId: n.tenant.room.id,
        tenantId: n.tenant.id,
      }),
    })
    const data = await res.json()
    setAddingMaintenanceId(null)
    if (data.ok) {
      toast({ title: t('notice_added_to_maintenance_toast') })
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
  }

  function handleDelete(n: NoticeRecord) {
    triggerDelete({
      itemName: `${t('notice_tab')} — ${n.tenant?.fullName ?? ''}`,
      onRemove: () => setNotices((prev) => prev.filter((x) => x.id !== n.id)),
      onRestore: () => setNotices((prev) => [n, ...prev]),
      onExecute: () => fetch(`/api/notices/${n.id}`, { method: 'DELETE' }).then((r) => r.json()),
      onSuccess: () => router.refresh(),
    })
  }

  const tenantLabelOf = (n: NoticeRecord) =>
    `${n.tenant?.room ? `${t('room')} ${roomLabel(n.tenant.room)} · ` : ''}${n.tenant?.fullName ?? ''}`

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('notices_title')}</h1>
          <p className="text-muted-foreground text-sm">
            {openCount} {t('notice_open_count')}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> {t('notice_add')}
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {(['all', 'open', 'resolved'] as const).map((s) => {
          const count = s === 'all' ? notices.length : notices.filter((n) => n.status === s).length
          const cs = CARD_STYLES[STATUS_CARD_COLOR[s]]
          return (
            <Card
              key={s}
              className={cn(
                'p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5',
                cs.card,
                statusFilter === s ? 'ring-2 ring-primary' : '',
              )}
              onClick={() => setStatusFilter(s)}
            >
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {s === 'all' ? t('notices_total') : t(s === 'open' ? 'notice_status_open' : 'notice_status_resolved')}
              </p>
              <p className={cn('text-2xl font-bold mt-1.5 tabular-nums', cs.value)}>{count}</p>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('notices_search')}
            className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(['all', ...branches] as const).map((b) => (
          <Button
            key={b}
            variant={branchFilter === b ? 'default' : 'outline'}
            size="sm"
            className="h-9 px-3 text-sm"
            onClick={() => setBranchFilter(b)}
          >
            {b === 'all' ? t('all_branches') : b}
          </Button>
        ))}
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | NoticeType)}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('notices_all_types')}</SelectItem>
            {NOTICE_TYPES.map((ty) => (
              <SelectItem key={ty} value={ty}>{t(`notice_type_${ty}` as Parameters<typeof t>[0])}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('notices_empty')}</p>
          </div>
        )}
        {filtered.map((n) => {
          const meta = NOTICE_META[n.type]
          const resolved = n.status === 'resolved'
          return (
            <Card key={n.id} className={cn('p-4', resolved ? '' : 'border-amber-300 dark:border-amber-900/70')}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <Link href={`/tenants/${n.tenant?.id}`} className="font-semibold hover:text-primary">
                    {n.tenant?.fullName ?? '—'}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {n.tenant?.room ? `${t('room')} ${roomLabel(n.tenant.room)}` : '—'}
                    {n.tenant?.room?.branch ? ` · ${n.tenant.room.branch}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={resolved ? 'secondary' : meta.badge}>
                    {t(`notice_type_${n.type}` as Parameters<typeof t>[0])}
                  </Badge>
                  <Badge variant={resolved ? 'success' : 'warning'}>
                    {t(resolved ? 'notice_status_resolved' : 'notice_status_open')}
                  </Badge>
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words mb-2">{n.message}</p>
              <p className="text-xs text-muted-foreground mb-3">
                {n.expectedDate && (
                  <span className="font-medium text-amber-700 dark:text-amber-500">
                    {t('notice_expected')}: {formatDate(n.expectedDate)} ·{' '}
                  </span>
                )}
                {t('notice_added_on')} {formatDate(String(n.createdAt))}
              </p>
              {isAdmin && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  <Button variant="outline" size="sm" className="flex-1 min-w-[6rem] h-10" onClick={() => toggleResolved(n)}>
                    {resolved
                      ? <><RotateCcw className="w-3.5 h-3.5 mr-1.5" />{t('notice_reopen')}</>
                      : <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-green-600" />{t('notice_resolve')}</>}
                  </Button>
                  {n.type === 'repair' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 px-3 shrink-0 text-blue-600 border-blue-200 hover:bg-blue-500/10"
                      title={t('notice_add_to_maintenance')}
                      disabled={addingMaintenanceId === n.id}
                      onClick={() => handleAddToMaintenance(n)}
                    >
                      <Hammer className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-10 px-3 shrink-0" onClick={() => openEdit(n)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="outline" size="sm" className="h-10 px-3 shrink-0 text-destructive border-destructive/30"
                    onClick={() => handleDelete(n)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <TableScroll>
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenant')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('room')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('branch')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('notice_type')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('notice_message')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('notice_expected')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('status')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((n, i) => {
                const meta = NOTICE_META[n.type]
                const Icon = meta.icon
                const resolved = n.status === 'resolved'
                return (
                  <tr
                    key={n.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/40 ${i % 2 ? 'bg-muted/10' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/tenants/${n.tenant?.id}`} className="font-medium hover:text-primary">
                        {n.tenant?.fullName ?? '—'}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {t('notice_added_on')} {formatDate(String(n.createdAt))}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {n.tenant?.room ? `${t('room')} ${roomLabel(n.tenant.room)}` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{n.tenant?.room?.branch ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={resolved ? 'secondary' : meta.badge} className="flex items-center gap-1 w-fit">
                        <Icon className="w-3 h-3" />
                        {t(`notice_type_${n.type}` as Parameters<typeof t>[0])}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <p className="truncate" title={n.message}>{n.message}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {n.expectedDate
                        ? <span className="font-medium text-amber-700 dark:text-amber-500">{formatDate(n.expectedDate)}</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={resolved ? 'success' : 'warning'} className="w-fit">
                        {t(resolved ? 'notice_status_resolved' : 'notice_status_open')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="sm" className="h-8 px-2"
                            title={resolved ? t('notice_reopen') : t('notice_resolve')}
                            onClick={() => toggleResolved(n)}
                          >
                            {resolved
                              ? <RotateCcw className="w-3.5 h-3.5" />
                              : <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                          </Button>
                          {n.type === 'repair' && (
                            <Button
                              variant="ghost" size="sm" className="h-8 px-2 text-blue-600 hover:bg-blue-500/10"
                              title={t('notice_add_to_maintenance')}
                              disabled={addingMaintenanceId === n.id}
                              onClick={() => handleAddToMaintenance(n)}
                            >
                              <Hammer className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => openEdit(n)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-8 px-2 text-red-500 hover:text-red-600"
                            onClick={() => handleDelete(n)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('notices_empty')}</p>
            </div>
          )}
        </TableScroll>
      </Card>

      <DeleteConfirmDialog
        open={dialogState.open}
        itemName={dialogState.itemName}
        onClose={closeDialog}
        onConfirm={dialogState.onConfirm}
      />

      {showForm && (
        <NoticeDialog
          tenants={tenants}
          notice={editing}
          tenantLabel={editing ? tenantLabelOf(editing) : undefined}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSave={handleSaved}
        />
      )}
    </div>
  )
}
