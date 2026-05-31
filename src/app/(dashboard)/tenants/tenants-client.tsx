'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, User, Users, UserCheck, UserMinus, Phone, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MonthRangePicker, monthRange } from '@/components/ui/month-range-picker'
import { TenantFormDialog } from '@/components/tenants/tenant-form-dialog'
import { formatCurrency, formatDate, formatMonth, formatPhones, groupByBranch, cn } from '@/lib/utils'
import { CARD_STYLES, type CardColor } from '@/lib/card-colors'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import { useBranches, useRoomLabel } from '@/contexts/branches-context'
import { usePersistentState } from '@/hooks/use-persistent-state'

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
  const { t, language } = useLanguage()
  const branches = useBranches()
  const roomLabel = useRoomLabel()
  const [tenants, setTenants] = useState(initial)
  useEffect(() => { setTenants(initial) }, [initial])
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = usePersistentState('tenants/month', currentMonth)
  const [monthFrom, setMonthFrom] = usePersistentState('tenants/monthFrom', '')
  const [monthTo, setMonthTo] = usePersistentState('tenants/monthTo', '')
  const [search, setSearch] = usePersistentState('tenants/search', '')
  const [statusFilter, setStatusFilter] = usePersistentState<'all' | 'active' | 'inactive' | 'movedout' | 'owing'>('tenants/status', 'active')
  const [branchFilter, setBranchFilter] = usePersistentState<string>('tenants/branch', 'all')
  const [showForm, setShowForm] = useState(false)

  // ── Monthly snapshot helpers ────────────────────────────────────────
  // Active / With Outstanding / All-Time describe the population as it
  // stood at the END of the selected month; Moved Out counts only the
  // move-outs that happened *within* that month. 'All months' is an alias
  // for the current month, so it always reads "up to now" — future-dated
  // records never inflate the totals.
  // Normalise a stored date to "YYYY-MM". Handles ISO strings and, defensively,
  // Excel serial numbers (days since 1899-12-30) so a stray imported value can
  // never silently misplace a tenant again.
  const monthOf = (d: string) => {
    const s = (d || '').trim()
    if (/^\d{4,6}(\.\d+)?$/.test(s)) {
      const n = parseFloat(s)
      if (n >= 20000 && n <= 60000) {
        return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 7)
      }
    }
    return s.slice(0, 7)
  }
  // When the From/To range is set it overrides the single-month dropdown.
  // Cumulative metrics (existed by, owing by) use the upper bound; the
  // "Moved Out" metric counts moves that fall inside the range.
  const range = monthRange(monthFrom, monthTo)
  const effMonth = range ? range[1] : (month === 'all' ? currentMonth : month)
  const existedBy = (tn: Tenant) => !!tn.moveInDate && monthOf(tn.moveInDate) <= effMonth
  // Moved out on or before the selected month — no longer active by then.
  const movedOutBy = (tn: Tenant) => !!tn.moveOutDate && monthOf(tn.moveOutDate) <= effMonth
  // Moved out exactly within the selected month / within the active range.
  const movedOutInMonth = (tn: Tenant) => {
    if (!tn.moveOutDate) return false
    const mo = monthOf(tn.moveOutDate)
    return range ? mo >= range[0] && mo <= range[1] : mo === effMonth
  }
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

  // Cards summarise the branch-filtered tenants as a monthly snapshot. The
  // table itself (below) is filtered only by search / branch / status — never
  // hidden by date — so a tenant can't silently drop off the list.
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

  const filtered = tenants.filter((t) => {
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
    return matchSearch && matchStatus && matchBranch
  }).map((t) => ({ ...t, roomNumber: t.room?.roomNumber ?? '', branch: t.room?.branch ?? '' }))

  const grouped = groupByBranch(filtered)

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
          { key: 'active',   icon: UserCheck,   label: t('tenant_status_active'),    count: stats.active,   color: 'green' as CardColor },
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
            {t(s === 'active' ? 'tenant_status_active' : s === 'inactive' ? 'tenant_status_inactive' : 'status_all')}
          </Button>
        ))}
        <Select
          value={month}
          onValueChange={(v) => { setMonth(v); setMonthFrom(''); setMonthTo('') }}
        >
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder={t('billing_all_months')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('billing_all_months')}</SelectItem>
            {months.map((m) => <SelectItem key={m} value={m}>{formatMonth(m, language)}</SelectItem>)}
          </SelectContent>
        </Select>
        <MonthRangePicker months={months} from={monthFrom} to={monthTo}
          onChange={(f, to) => { setMonthFrom(f); setMonthTo(to); if (f || to) setMonth('all') }} />
      </div>

      {/* Card list — grouped by branch, rooms ascending inside each group */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t('tenants_empty')}</p>
        </div>
      )}
      {grouped.map((group) => (
        <div key={group.branch} className="space-y-3">
          <div className="flex items-center gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 py-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{group.branch}</h2>
            <span className="text-xs text-muted-foreground tabular-nums">({group.items.length})</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {group.items.map((tenant) => {
          const outstanding = tenant.billings.reduce((s, b) => s + b.totalUsd, 0)
          return (
            <Card key={tenant.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-3">
                <Link href={`/tenants/${tenant.id}`} className="min-w-0 hover:text-primary">
                  <p className="text-lg font-bold leading-tight truncate">
                    {tenant.room ? `${t('room')} ${roomLabel(tenant.room)}` : t('tenants_col_room')}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground min-w-0">
                    <User className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{tenant.fullName}</span>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3" />{formatPhones(tenant.phone, tenant.phonesExtra) || '—'}
                  </p>
                </Link>
                <Badge variant={tenant.status === 'active' ? 'success' : 'secondary'} className="shrink-0">
                  {t(tenant.status === 'active' ? 'tenant_status_active' : 'tenant_status_inactive')}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('tenants_col_monthly_rent')}</p>
                  <p>{tenant.room ? formatCurrency(tenant.room.rentPriceUsd) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('tenants_col_movein')}</p>
                  <p>{formatDate(tenant.moveInDate, language)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('tenants_col_outstanding')}</p>
                  {outstanding > 0 ? (
                    <span className="flex items-center gap-1 text-red-600 font-semibold text-sm">
                      <AlertCircle className="w-3.5 h-3.5" />{formatCurrency(outstanding)}
                    </span>
                  ) : <span className="text-green-600 text-xs">{t('tenants_paid_up')}</span>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('branch')}</p>
                  <p className="truncate">{tenant.room?.branch ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('tenants_col_payday')}</p>
                  <p className="tabular-nums">{tenant.payDay ?? '—'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <Link href={`/tenants/${tenant.id}`} className="flex-1 min-w-[5rem]">
                  <Button variant="outline" size="sm" className="w-full h-10">{t('view')}</Button>
                </Link>
                {isAdmin && tenant.status === 'active' && (
                  <Button variant="outline" size="sm" className="flex-1 min-w-[5rem] h-10"
                    onClick={() => handleMoveOut(tenant.id)}>
                    {t('tenants_move_out')}
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
          </div>
        </div>
      ))}

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
