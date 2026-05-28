'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, FileText, Calendar, Trash2, Printer, Pencil, Bell, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MonthRangePicker, monthRange } from '@/components/ui/month-range-picker'
import { PaymentDialog } from '@/components/billing/payment-dialog'
import { BatchDeleteDialog } from '@/components/billing/batch-delete-dialog'
import { GenerateMonthlyDialog } from '@/components/billing/generate-monthly-dialog'
import { BatchGenerateInvoiceDialog } from '@/components/invoices/batch-generate-dialog'
import { NoticeDialog } from '@/components/tenants/notice-dialog'
import { PromiseDialog } from '@/components/invoices/promise-dialog'
import { formatCurrency, formatCompact, formatMonth, formatDate, exportToCSV, groupByBranch, cn } from '@/lib/utils'
import { CARD_STYLES } from '@/lib/card-colors'
import { toast } from '@/hooks/use-toast'
import { useSession } from 'next-auth/react'
import { useLanguage } from '@/contexts/language-context'
import { useBranches, useRoomLabel } from '@/contexts/branches-context'
import { useDeleteWithUndo, runDeleteWithUndo } from '@/hooks/use-delete-with-undo'
import { usePersistentState } from '@/hooks/use-persistent-state'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'

type Billing = {
  id: string; billingMonth: string; roomRentUsd: number
  waterUsage: number; waterCostRiel: number; electricUsage: number; electricCostRiel: number
  totalUsd: number; totalRiel: number; outstandingDebtUsd: number; lateDays: number
  discountUsd: number; latePenaltyUsd: number; paymentStatus: string; paymentDate: string
  exchangeRate: number; createdAt: Date
  promiseDate?: string | null; promiseSetAt?: string | null
  tenant: { id: string; fullName: string; phone: string; payDay: number } | null
  room: { id: string; roomNumber: string; branch: string | null } | null
  payments: Array<{ id: string; amountUsd: number }>
}

interface Props { billings: Billing[] }

function getDueInfo(billingMonth: string, payDay: number, paymentStatus: string) {
  const [year, month] = billingMonth.split('-').map(Number)
  const dueDate = new Date(year, month - 1, payDay)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffMs = today.getTime() - dueDate.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return { dueDate, daysLate: diffDays, isPaid: paymentStatus === 'paid' }
}

// Days the promised pay date is past (>0 = overdue). null when no promise set.
function promiseDaysOverdue(promiseDate: string | null | undefined): number | null {
  if (!promiseDate) return null
  const d = new Date(promiseDate)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - d.getTime()) / 86_400_000)
}

export function BillingListClient({ billings: initial }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const canViewPromises = session?.user?.role === 'admin' || session?.user?.role === 'manager'
  const canBatch = session?.user?.role ? session.user.role !== 'guest' : false
  const canExport = session?.user?.role ? session.user.role !== 'guest' : false
  const { t, language } = useLanguage()
  const roomLabel = useRoomLabel()
  const [billings, setBillings] = useState(initial)
  useEffect(() => { setBillings(initial) }, [initial])
  const [search, setSearch] = usePersistentState('billing/search', '')
  const [statusFilter, setStatusFilter] = usePersistentState('billing/status', 'all')
  const [promiseFilter, setPromiseFilter] = usePersistentState('billing/promise', 'all')
  const latestMonth = [...new Set(initial.map((b) => b.billingMonth))].sort().reverse()[0] ?? 'all'
  const [monthFilter, setMonthFilter] = usePersistentState('billing/month', latestMonth)
  const [monthFrom, setMonthFrom] = usePersistentState('billing/monthFrom', '')
  const [monthTo, setMonthTo] = usePersistentState('billing/monthTo', '')
  const [branchFilter, setBranchFilter] = usePersistentState('billing/branch', 'all')
  const [payDialog, setPayDialog] = useState<Billing | null>(null)
  const [showBatchDelete, setShowBatchDelete] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [showBatchInvoice, setShowBatchInvoice] = useState(false)
  const [noticeTenantId, setNoticeTenantId] = useState<string | null>(null)
  const [promiseBillingId, setPromiseBillingId] = useState<string | null>(null)
  const { triggerDelete, dialogState, closeDialog } = useDeleteWithUndo()

  const branches = useBranches().map((b) => b.name)

  const range = monthRange(monthFrom, monthTo)

  // Paid / Unpaid / Partial count cards follow branch + month only, so the
  // status breakdown stays visible regardless of search/status filter.
  const branchScoped = billings.filter((b) => {
    const matchBranch = branchFilter === 'all' || b.room?.branch === branchFilter
    const matchMonth = range
      ? b.billingMonth >= range[0] && b.billingMonth <= range[1]
      : monthFilter === 'all' || b.billingMonth === monthFilter
    return matchBranch && matchMonth
  })

  const filtered = billings.filter((b) => {
    const matchSearch =
      (b.tenant?.fullName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (b.room?.roomNumber ?? '').includes(search) ||
      b.billingMonth.includes(search)
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'unpaid_partial'
        ? b.paymentStatus === 'unpaid' || b.paymentStatus === 'partial'
        : b.paymentStatus === statusFilter)
    const matchMonth = range
      ? b.billingMonth >= range[0] && b.billingMonth <= range[1]
      : monthFilter === 'all' || b.billingMonth === monthFilter
    const matchBranch = branchFilter === 'all' || b.room?.branch === branchFilter
    let matchPromise = true
    if (promiseFilter !== 'all') {
      const unpaid = b.paymentStatus !== 'paid'
      const overdue = promiseDaysOverdue(b.promiseDate)
      if (promiseFilter === 'has_promise') matchPromise = unpaid && !!b.promiseDate
      else if (promiseFilter === 'overdue_promise') matchPromise = unpaid && overdue !== null && overdue > 0
      else if (promiseFilter === 'no_promise') matchPromise = unpaid && !b.promiseDate
    }
    return matchSearch && matchStatus && matchMonth && matchBranch && matchPromise
  }).map((b) => ({ ...b, roomNumber: b.room?.roomNumber ?? '', branch: b.room?.branch ?? '' }))

  const grouped = groupByBranch(filtered)

  const totalRevenue = filtered
    .filter((b) => b.paymentStatus === 'paid')
    .reduce((s, b) => s + b.totalUsd, 0)
  const totalOutstanding = filtered
    .filter((b) => b.paymentStatus !== 'paid')
    .reduce((s, b) => {
      const paid = b.payments.reduce((ps, p) => ps + p.amountUsd, 0)
      return s + Math.max(0, b.totalUsd - paid)
    }, 0)

  const months = [...new Set(billings.map((b) => b.billingMonth))].sort().reverse()


  const handleExport = () => {
    const headers = ['Month', 'Tenant', 'Room', 'Rent(USD)', 'Water', 'Water(KHR)', 'Electric', 'Elec(KHR)', 'Debt', 'Days', 'Penalty', 'Discount', 'Total(USD)', 'Total(KHR)', 'Status']
    const rows = filtered.map((b) => [
      b.billingMonth, b.tenant?.fullName ?? '', b.room?.roomNumber ?? '',
      b.roomRentUsd, b.waterUsage, b.waterCostRiel, b.electricUsage, b.electricCostRiel,
      b.outstandingDebtUsd, b.lateDays, b.latePenaltyUsd, b.discountUsd,
      b.totalUsd, Math.round(b.totalRiel), b.paymentStatus,
    ])
    exportToCSV(headers, rows, `billing-${monthFilter || 'all'}.csv`)
  }

  const handleDelete = (billing: Billing) => {
    triggerDelete({
      itemName: `${billing.billingMonth} — ${billing.tenant?.fullName ?? ''}`,
      onRemove: () => setBillings((prev) => prev.filter((b) => b.id !== billing.id)),
      onRestore: () => setBillings((prev) => [billing, ...prev]),
      onExecute: () => fetch(`/api/billing/${billing.id}`, { method: 'DELETE' }).then((r) => r.json()),
    })
  }

  const handleBatchDelete = (month: string, branch: string, count: number) => {
    const affected = billings.filter(
      (b) => b.billingMonth === month && (branch === 'all' || b.room?.branch === branch)
    )
    if (affected.length === 0) return
    const ids = new Set(affected.map((b) => b.id))
    runDeleteWithUndo({
      onRemove: () => setBillings((prev) => prev.filter((b) => !ids.has(b.id))),
      onRestore: () => setBillings((prev) => [...affected, ...prev]),
      onExecute: () =>
        fetch('/api/billing/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month, branch }),
        }).then((r) => r.json()),
      onSuccess: () => router.refresh(),
      toastTitle: `Deleted ${count} billing record${count !== 1 ? 's' : ''}`,
    })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('billing_title')}</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} {t('billing_records')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExport}>{t('billing_export')}</Button>
          )}
          {canBatch && (
            <Button variant="outline" size="sm" onClick={() => setShowBatchInvoice(true)}>
              <Printer className="w-4 h-4 mr-2" />{t('batch_invoice')}
            </Button>
          )}
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowGenerate(true)}>
                <Calendar className="w-4 h-4 mr-2" />{t('billing_generate')}
              </Button>
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setShowBatchDelete(true)}>
                <Trash2 className="w-4 h-4 mr-2" />{t('batch_delete')}
              </Button>
              <Link href="/billing/create"><Button><Plus className="w-4 h-4 mr-2" />{t('billing_create')}</Button></Link>
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className={cn('hover:shadow-md transition-all duration-200 hover:-translate-y-0.5', CARD_STYLES.green.card)}><div className="p-4"><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_revenue')}</p><p className={cn('text-xl font-bold mt-1.5 tabular-nums', CARD_STYLES.green.value)}>{formatCompact(totalRevenue)}</p></div></Card>
        <Card className={cn('hover:shadow-md transition-all duration-200 hover:-translate-y-0.5', CARD_STYLES.red.card)}><div className="p-4"><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_outstanding')}</p><p className={cn('text-xl font-bold mt-1.5 tabular-nums', CARD_STYLES.red.value)}>{formatCompact(totalOutstanding)}</p></div></Card>
        <Card className={cn('hover:shadow-md transition-all duration-200 hover:-translate-y-0.5', CARD_STYLES.emerald.card)}><div className="p-4"><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_paid_count')}</p><p className={cn('text-xl font-bold mt-1.5 tabular-nums', CARD_STYLES.emerald.value)}>{branchScoped.filter((b) => b.paymentStatus === 'paid').length}</p></div></Card>
        <Card className={cn('hover:shadow-md transition-all duration-200 hover:-translate-y-0.5', CARD_STYLES.orange.card)}><div className="p-4"><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_unpaid_count')}</p><p className={cn('text-xl font-bold mt-1.5 tabular-nums', CARD_STYLES.orange.value)}>{branchScoped.filter((b) => b.paymentStatus === 'unpaid').length}</p></div></Card>
        <Card className={cn('hover:shadow-md transition-all duration-200 hover:-translate-y-0.5', CARD_STYLES.amber.card)}><div className="p-4"><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_partial_count')}</p><p className={cn('text-xl font-bold mt-1.5 tabular-nums', CARD_STYLES.amber.value)}>{branchScoped.filter((b) => b.paymentStatus === 'partial').length}</p></div></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('billing_search')} className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {(['all', ...branches] as const).map((b) => {
          const unpaidCount = (b === 'all' ? billings : billings.filter((bl) => bl.room?.branch === b))
            .filter((bl) => bl.paymentStatus !== 'paid').length
          return (
            <Button key={b} variant={branchFilter === b ? 'default' : 'outline'} size="sm"
              className="h-9 px-3 text-sm"
              onClick={() => setBranchFilter(b)}>
              {b === 'all' ? t('all_branches') : b}
              {unpaidCount > 0 && (
                <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 ${branchFilter === b ? 'bg-white/20' : 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'}`}>
                  {unpaidCount}
                </span>
              )}
            </Button>
          )
        })}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('billing_all_status')}</SelectItem>
            <SelectItem value="unpaid_partial">{t('status_unpaid_partial')}</SelectItem>
            <SelectItem value="paid">{t('status_paid')}</SelectItem>
            <SelectItem value="unpaid">{t('status_unpaid')}</SelectItem>
            <SelectItem value="partial">{t('status_partial')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={promiseFilter} onValueChange={setPromiseFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('promise_filter_all')}</SelectItem>
            <SelectItem value="has_promise">{t('promise_filter_has')}</SelectItem>
            <SelectItem value="overdue_promise">{t('promise_filter_overdue')}</SelectItem>
            <SelectItem value="no_promise">{t('promise_filter_none')}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={monthFilter}
          onValueChange={(v) => { setMonthFilter(v); setMonthFrom(''); setMonthTo('') }}
        >
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder={t('billing_all_months')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('billing_all_months')}</SelectItem>
            {months.map((m) => <SelectItem key={m} value={m}>{formatMonth(m, language)}</SelectItem>)}
          </SelectContent>
        </Select>
        <MonthRangePicker months={months} from={monthFrom} to={monthTo}
          onChange={(f, to) => { setMonthFrom(f); setMonthTo(to); if (f || to) setMonthFilter('all') }} />
      </div>

      {/* Card list — grouped by branch, rooms ascending inside each group */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t('billing_empty')}</p>
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
            {group.items.map((b) => {
          const totalPaid = b.payments.reduce((s, p) => s + p.amountUsd, 0)
          const balance = Math.max(0, b.totalUsd - totalPaid)
          const payDay = b.tenant?.payDay ?? 1
          const { daysLate, isPaid } = getDueInfo(b.billingMonth, payDay, b.paymentStatus)
          return (
            <Card key={b.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight truncate">
                    {b.room ? `${t('room')} ${roomLabel(b.room)}` : '—'}
                  </p>
                  <Link href={`/tenants/${b.tenant?.id}`} className="text-sm text-muted-foreground hover:text-primary block truncate mt-1">
                    {b.tenant?.fullName ?? '—'}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">{b.billingMonth}</p>
                </div>
                <Badge variant={b.paymentStatus === 'paid' ? 'success' : b.paymentStatus === 'partial' ? 'warning' : 'error'} className="shrink-0">
                  {t(b.paymentStatus === 'paid' ? 'status_paid' : b.paymentStatus === 'partial' ? 'status_partial' : 'status_unpaid')}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('billing_col_total')}</p>
                  <p className="font-semibold">{formatCurrency(b.totalUsd)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('billing_col_paid')}</p>
                  <p className="text-green-600 font-medium">{formatCurrency(totalPaid)}</p>
                  {balance > 0 && <p className="text-xs text-red-500">-{formatCurrency(balance)}</p>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('billing_col_rent')}</p>
                  <p>{formatCurrency(b.roomRentUsd)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('billing_col_due_date')}</p>
                  {isPaid ? (
                    <p className="text-xs text-green-600">{t('status_paid')}</p>
                  ) : daysLate > 0 ? (
                    <p className="text-xs text-red-500 font-medium">{daysLate}{t('billing_due_days')} {t('billing_late')}</p>
                  ) : daysLate === 0 ? (
                    <p className="text-xs text-orange-500 font-medium">{t('billing_due_today')}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t('billing_due_in')} {-daysLate}{t('billing_due_days')}</p>
                  )}
                </div>
              </div>
              {!isPaid && b.promiseDate && (() => {
                const overdue = promiseDaysOverdue(b.promiseDate)
                const isOverdue = overdue !== null && overdue > 0 && balance > 0
                const cls = cn(
                  'flex items-center gap-1.5 text-xs font-medium rounded-md px-2 py-1.5 mb-3',
                  isOverdue ? 'text-red-600 bg-red-500/10' : 'text-blue-600 bg-blue-500/10',
                  canViewPromises && 'hover:brightness-95 transition cursor-pointer',
                )
                const inner = (
                  <>
                    <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('promise_promised')} {formatDate(b.promiseDate, language)}</span>
                    {isOverdue && <span>· {overdue}{t('billing_due_days')} {t('promise_overdue')}</span>}
                  </>
                )
                return canViewPromises ? (
                  <Link href={`/promises?billing=${b.id}`} className={cls} title={t('promise_view_history')}>
                    {inner}
                  </Link>
                ) : (
                  <div className={cls}>{inner}</div>
                )
              })()}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <Link href={`/billing/${b.id}`} className="flex-1 min-w-[5rem]">
                  <Button variant="outline" size="sm" className="w-full h-10">{t('view')}</Button>
                </Link>
                {isAdmin && b.paymentStatus !== 'paid' && (
                  <Button variant="outline" size="sm" className="flex-1 min-w-[5rem] h-10 text-green-600 border-green-200"
                    onClick={() => setPayDialog(b)}>
                    {t('billing_pay')}
                  </Button>
                )}
                <Link href={`/invoices/${b.id}`} className="flex-1 min-w-[5rem]">
                  <Button variant="outline" size="sm" className="w-full h-10">{t('billing_invoice')}</Button>
                </Link>
                {isAdmin && (
                  <Link href={`/billing/${b.id}/edit`} className="shrink-0">
                    <Button variant="outline" size="sm" className="h-10 px-3">
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </Link>
                )}
                {isAdmin && b.paymentStatus !== 'paid' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 px-3 shrink-0 text-blue-600 border-blue-200 hover:bg-blue-500/10"
                    title={t('promise_to_pay')}
                    onClick={() => setPromiseBillingId(b.id)}
                  >
                    <CalendarClock className="w-4 h-4" />
                  </Button>
                )}
                {isAdmin && b.tenant && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 px-3 shrink-0 text-amber-600 border-amber-200 hover:bg-amber-500/10"
                    title={t('notice_add')}
                    onClick={() => setNoticeTenantId(b.tenant!.id)}
                  >
                    <Bell className="w-4 h-4" />
                  </Button>
                )}
                {isAdmin && (
                  <Button variant="outline" size="sm" className="h-10 px-3 shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => handleDelete(b)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
          </div>
        </div>
      ))}

      {payDialog && (
        <PaymentDialog
          billing={payDialog}
          onClose={() => setPayDialog(null)}
          onSave={() => { setPayDialog(null); router.refresh() }}
        />
      )}

      <DeleteConfirmDialog
        open={dialogState.open}
        itemName={dialogState.itemName}
        onClose={closeDialog}
        onConfirm={dialogState.onConfirm}
      />

      {showBatchDelete && (
        <BatchDeleteDialog
          months={months}
          branches={branches}
          onClose={() => setShowBatchDelete(false)}
          onConfirm={handleBatchDelete}
        />
      )}

      {showGenerate && (
        <GenerateMonthlyDialog
          branches={branches}
          onClose={() => setShowGenerate(false)}
          onGenerated={(month) => { setShowGenerate(false); setMonthFilter(month); router.refresh() }}
        />
      )}

      {showBatchInvoice && (
        <BatchGenerateInvoiceDialog
          months={months}
          branches={branches}
          onClose={() => setShowBatchInvoice(false)}
          onGenerated={() => setShowBatchInvoice(false)}
        />
      )}

      {noticeTenantId && (
        <NoticeDialog
          tenantId={noticeTenantId}
          onClose={() => setNoticeTenantId(null)}
          onSave={() => setNoticeTenantId(null)}
        />
      )}

      {promiseBillingId && (
        <PromiseDialog
          billingId={promiseBillingId}
          onClose={() => setPromiseBillingId(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  )
}
