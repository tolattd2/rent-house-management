'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, User, Users, UserCheck, UserMinus, Phone, Home, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TableScroll } from '@/components/ui/table-scroll'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TenantFormDialog } from '@/components/tenants/tenant-form-dialog'
import { formatCurrency, formatDate, formatPhones, sortRoomsByNumber, cn } from '@/lib/utils'
import { CARD_STYLES, type CardColor } from '@/lib/card-colors'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import { useBranches, useRoomLabel } from '@/contexts/branches-context'

type Room = {
  id: string; roomNumber: string; branch?: string; status: string; rentPriceUsd: number
}
type Tenant = {
  id: string; fullName: string; gender: string; phone: string; phonesExtra: string[]; nationalId: string
  emergencyContact: string; occupation: string; moveInDate: string; moveOutDate: string
  depositAmount: number; payDay: number; status: string; notes: string; createdAt: Date
  roomId: string | null
  room: { id: string; roomNumber: string; branch?: string; rentPriceUsd: number } | null
  billings: Array<{ id: string; totalUsd: number; paymentStatus: string; billingMonth: string }>
}

interface Props { tenants: Tenant[]; rooms: Room[] }

export function TenantsClient({ tenants: initial, rooms }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const { t } = useLanguage()
  const branches = useBranches()
  const roomLabel = useRoomLabel()
  const [tenants, setTenants] = useState(initial)
  useEffect(() => { setTenants(initial) }, [initial])
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState('all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'movedout' | 'owing'>('active')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)

  // ── Monthly snapshot helpers ────────────────────────────────────────
  // Active / With Outstanding / All-Time describe the population as it
  // stood at the END of the selected month; Moved Out counts only the
  // move-outs that happened *within* that month. 'All months' is an alias
  // for the current month, so it always reads "up to now" — future-dated
  // records never inflate the totals.
  const monthOf = (d: string) => (d || '').slice(0, 7)
  const effMonth = month === 'all' ? currentMonth : month
  const existedBy = (tn: Tenant) => !!tn.moveInDate && monthOf(tn.moveInDate) <= effMonth
  // Moved out on or before the selected month — no longer active by then.
  const movedOutBy = (tn: Tenant) => !!tn.moveOutDate && monthOf(tn.moveOutDate) <= effMonth
  // Moved out exactly within the selected month.
  const movedOutInMonth = (tn: Tenant) =>
    !!tn.moveOutDate && monthOf(tn.moveOutDate) === effMonth
  const owingBy = (tn: Tenant) =>
    tn.billings.some((b) => b.totalUsd > 0 && monthOf(b.billingMonth) <= effMonth)

  // Continuous month list from the earliest move-in up to the current month,
  // newest first. Only well-formed "YYYY-MM" values at or before now are
  // considered, and the loop is hard-capped, so a stray far-future or
  // mistyped date can't blow the dropdown up.
  const months = (() => {
    const moveIns = tenants
      .map((tn) => monthOf(tn.moveInDate))
      .filter((mm) => /^\d{4}-\d{2}$/.test(mm) && mm <= currentMonth)
    let cursor = moveIns.length ? moveIns.reduce((a, b) => (a < b ? a : b)) : currentMonth
    if (cursor < '2000-01') cursor = currentMonth
    const list: string[] = []
    let [y, m] = cursor.split('-').map(Number)
    const [cy, cm] = currentMonth.split('-').map(Number)
    while ((y < cy || (y === cy && m <= cm)) && list.length < 600) {
      list.push(`${y}-${String(m).padStart(2, '0')}`)
      if (++m > 12) { m = 1; y++ }
    }
    return list.reverse()
  })()

  // Counts respect the active branch filter, so the cards always describe
  // exactly the population the table below is drawn from.
  const branchTenants = branchFilter === 'all'
    ? tenants
    : tenants.filter((tn) => tn.room?.branch === branchFilter)

  // All-Time = Active + Inactive: every tenant who existed by the period is
  // either still active or has moved out. "Moved Out" is a separate metric —
  // just the move-outs dated within the selected month.
  const snapshot = branchTenants.filter(existedBy)
  const stats = {
    total: snapshot.length,
    active: snapshot.filter((tn) => !movedOutBy(tn)).length,
    movedout: snapshot.filter(movedOutInMonth).length,
    owing: snapshot.filter(owingBy).length,
  }

  const filtered = sortRoomsByNumber(
    tenants.filter((t) => {
      const matchSearch =
        t.fullName.toLowerCase().includes(search.toLowerCase()) ||
        t.phone.includes(search) ||
        t.phonesExtra.some((p) => p.includes(search)) ||
        (t.room?.roomNumber ?? '').toLowerCase().includes(search.toLowerCase())
      const matchStatus =
        statusFilter === 'all' ? true
          : statusFilter === 'active' ? !movedOutBy(t)
            : statusFilter === 'inactive' ? movedOutBy(t)
              : statusFilter === 'movedout' ? movedOutInMonth(t)
                : owingBy(t)
      const matchBranch = branchFilter === 'all' || t.room?.branch === branchFilter
      return matchSearch && existedBy(t) && matchStatus && matchBranch
    }).map((t) => ({ ...t, roomNumber: t.room?.roomNumber ?? '' }))
  )

  const handleMoveOut = async (id: string) => {
    if (!confirm(t('tenant_moveout_confirm'))) return
    const date = new Date().toISOString().slice(0, 10)
    const res = await fetch(`/api/tenants/${id}/moveout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    })
    const data = await res.json()
    if (data.ok) {
      setTenants((prev) => prev.map((t) => t.id === id ? { ...t, status: 'inactive', moveOutDate: date } : t))
      toast({ title: t('tenant_moved_out') })
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('tenants_title')}</h1>
          <p className="text-muted-foreground text-sm">
            {stats.active} {t('tenants_active_count')}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" /> {t('tenants_add')}
          </Button>
        )}
      </div>

      {/* Summary cards — also act as the status filter */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        {([
          { key: 'active',   icon: UserCheck,   label: t('status_active'),           count: stats.active,   color: 'green' as CardColor },
          { key: 'owing',    icon: AlertCircle, label: t('tenants_owing_card'),      count: stats.owing,    color: 'red'   as CardColor },
          { key: 'movedout', icon: UserMinus,   label: t('tenants_moved_out'),       count: stats.movedout, color: 'slate' as CardColor },
          { key: 'all',      icon: Users,       label: t('tenants_alltime_card'),    count: stats.total,    color: 'blue'  as CardColor },
        ] as const).map(({ key, icon: Icon, label, count, color }) => {
          const cs = CARD_STYLES[color]
          const active = statusFilter === key
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key && key !== 'all' ? 'all' : key)}
              className={cn(
                'flex items-center gap-3 p-3 sm:p-4 rounded-2xl border shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5',
                cs.card,
                active ? 'ring-2 ring-primary' : '',
              )}
            >
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm', cs.icon)}>
                <Icon className={cn('w-4 h-4', cs.value)} />
              </div>
              <div className="text-left min-w-0">
                <p className={cn('text-2xl font-bold leading-none tabular-nums', cs.value)}>{count}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{label}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('tenants_search')} className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        {['all', ...branches.map((br) => br.name)].map((b) => (
          <Button key={b} variant={branchFilter === b ? 'default' : 'outline'} size="sm"
            className="h-9 px-3 text-sm"
            onClick={() => setBranchFilter(b)}>
            {b === 'all' ? t('all_branches') : b}
          </Button>
        ))}
        {(['all', 'active', 'inactive'] as const).map((s) => (
          <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm"
            className="h-9 px-3 text-sm"
            onClick={() => setStatusFilter(s)}>
            {t(`status_${s}` as Parameters<typeof t>[0])}
          </Button>
        ))}
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All months" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('billing_all_months')}</SelectItem>
            {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Mobile card list — visible on small screens */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('tenants_empty')}</p>
          </div>
        )}
        {filtered.map((tenant) => {
          const outstanding = tenant.billings.reduce((s, b) => s + b.totalUsd, 0)
          return (
            <Card key={tenant.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <Link href={`/tenants/${tenant.id}`} className="flex items-center gap-2.5 hover:text-primary min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{tenant.fullName}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" />{formatPhones(tenant.phone, tenant.phonesExtra) || '—'}
                    </p>
                  </div>
                </Link>
                <Badge variant={tenant.status === 'active' ? 'success' : 'secondary'} className="shrink-0">
                  {t(tenant.status === 'active' ? 'status_active' : 'status_inactive')}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('tenants_col_room')}</p>
                  <p>{tenant.room ? `${t('room')} ${roomLabel(tenant.room)}` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('tenants_col_monthly_rent')}</p>
                  <p>{tenant.room ? formatCurrency(tenant.room.rentPriceUsd) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('tenants_col_movein')}</p>
                  <p>{formatDate(tenant.moveInDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('tenants_col_outstanding')}</p>
                  {outstanding > 0 ? (
                    <span className="flex items-center gap-1 text-red-600 font-semibold text-sm">
                      <AlertCircle className="w-3.5 h-3.5" />{formatCurrency(outstanding)}
                    </span>
                  ) : <span className="text-green-600 text-xs">{t('tenants_paid_up')}</span>}
                </div>
              </div>
              <div className="flex gap-2 pt-2 border-t border-border">
                <Link href={`/tenants/${tenant.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full h-10">{t('view')}</Button>
                </Link>
                {isAdmin && tenant.status === 'active' && (
                  <Button variant="outline" size="sm" className="flex-1 h-10"
                    onClick={() => handleMoveOut(tenant.id)}>
                    {t('tenants_move_out')}
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Desktop table — hidden on small screens */}
      <Card className="hidden md:block hover:shadow-md transition-shadow duration-200">
        <TableScroll>
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenants_col_room')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenants_col_tenant')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('branch')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenants_col_monthly_rent')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenants_col_payday')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenants_col_movein')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenants_col_moveout')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenants_col_deposit')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenants_col_outstanding')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenants_col_status')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenants_col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tenant, i) => {
                const outstanding = tenant.billings.reduce((s, b) => s + b.totalUsd, 0)
                return (
                  <tr key={tenant.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/40 ${i % 2 ? 'bg-muted/10' : ''}`}
                  >
                    <td className="px-4 py-3">
                      {tenant.room ? (
                        <div className="flex items-center gap-1.5">
                          <Home className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{t('room')} {roomLabel(tenant.room)}</span>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/tenants/${tenant.id}`} className="flex items-center gap-2.5 hover:text-primary">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{tenant.fullName}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" />{formatPhones(tenant.phone, tenant.phonesExtra) || '—'}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{tenant.room?.branch ?? '—'}</td>
                    <td className="px-4 py-3">
                      {tenant.room ? formatCurrency(tenant.room.rentPriceUsd) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center font-medium">{tenant.payDay}<span className="text-xs text-muted-foreground"> {t('tenants_per_month')}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(tenant.moveInDate)}</td>
                    <td className="px-4 py-3">
                      {tenant.moveOutDate ? (
                        <span className="text-red-500">{formatDate(tenant.moveOutDate)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{formatCurrency(tenant.depositAmount)}</td>
                    <td className="px-4 py-3">
                      {outstanding > 0 ? (
                        <span className="flex items-center gap-1 text-red-600 font-semibold">
                          <AlertCircle className="w-3.5 h-3.5" />{formatCurrency(outstanding)}
                        </span>
                      ) : <span className="text-green-600 text-xs">{t('tenants_paid_up')}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={tenant.status === 'active' ? 'success' : 'secondary'}>
                        {t(tenant.status === 'active' ? 'status_active' : 'status_inactive')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/tenants/${tenant.id}`}>
                          <Button variant="ghost" size="sm">{t('view')}</Button>
                        </Link>
                        {isAdmin && tenant.status === 'active' && (
                          <Button variant="outline" size="sm" onClick={() => handleMoveOut(tenant.id)}
                            className="text-xs">{t('tenants_move_out')}</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('tenants_empty')}</p>
            </div>
          )}
        </TableScroll>
      </Card>

      {showForm && (
        <TenantFormDialog
          rooms={rooms}
          onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); router.refresh() }}
        />
      )}
    </div>
  )
}
