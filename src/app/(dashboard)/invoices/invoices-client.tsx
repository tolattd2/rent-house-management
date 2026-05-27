'use client'

import { Fragment, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, FileText, Printer, Trash2, CalendarClock, Bell } from 'lucide-react'
import { formatCurrency, groupByBranch, cn } from '@/lib/utils'
import { CARD_STYLES } from '@/lib/card-colors'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TableScroll } from '@/components/ui/table-scroll'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MonthRangePicker, monthRange } from '@/components/ui/month-range-picker'
import { useLanguage } from '@/contexts/language-context'
import { useBranches, useRoomLabel } from '@/contexts/branches-context'
import { useSession } from 'next-auth/react'
import { toast } from '@/hooks/use-toast'
import { InvoiceBatchPrintDialog } from '@/components/invoices/batch-print-dialog'
import { InvoiceBatchDeleteDialog } from '@/components/invoices/batch-delete-dialog'
import { PromiseDialog } from '@/components/invoices/promise-dialog'
import { NoticeDialog } from '@/components/tenants/notice-dialog'
import { useDeleteWithUndo, runDeleteWithUndo } from '@/hooks/use-delete-with-undo'
import { usePersistentState } from '@/hooks/use-persistent-state'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'

interface Invoice {
  id: string
  invoiceNumber: string
  billingId: string
  tenant: { id: string; fullName: string } | null
  billing: {
    billingMonth: string
    totalUsd: number
    paymentStatus: string
    room: { id: string; roomNumber: string; branch: string | null } | null
  } | null
}

interface Props {
  invoices: Invoice[]
}

export function InvoicesClient({ invoices: initial }: Props) {
  const router = useRouter()
  const { t } = useLanguage()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const canPrint = session?.user?.role ? session.user.role !== 'guest' : false
  const [invoices, setInvoices] = useState(initial)
  useEffect(() => { setInvoices(initial) }, [initial])
  const [search, setSearch] = usePersistentState('invoices/search', '')
  const [statusFilter, setStatusFilter] = usePersistentState('invoices/status', 'all')
  const latestInvoiceMonth = [...new Set(initial.map((inv) => inv.billing?.billingMonth).filter(Boolean) as string[])].sort().reverse()[0] ?? 'all'
  const [monthFilter, setMonthFilter] = usePersistentState('invoices/month', latestInvoiceMonth)
  const [monthFrom, setMonthFrom] = usePersistentState('invoices/monthFrom', '')
  const [monthTo, setMonthTo] = usePersistentState('invoices/monthTo', '')
  const [branchFilter, setBranchFilter] = usePersistentState('invoices/branch', 'all')
  const [showBatchPrint, setShowBatchPrint] = useState(false)
  const [showBatchDelete, setShowBatchDelete] = useState(false)
  const [promiseBillingId, setPromiseBillingId] = useState<string | null>(null)
  const [noticeTenantId, setNoticeTenantId] = useState<string | null>(null)
  const { triggerDelete, dialogState, closeDialog } = useDeleteWithUndo()

  const branches = useBranches().map((b) => b.name)
  const roomLabel = useRoomLabel()
  const months = [...new Set(invoices.map((inv) => inv.billing?.billingMonth).filter(Boolean) as string[])].sort().reverse()

  const range = monthRange(monthFrom, monthTo)
  const filtered = invoices.filter((inv) => {
    const matchSearch =
      (inv.tenant?.fullName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      (inv.billing?.billingMonth ?? '').includes(search) ||
      (inv.billing?.room?.roomNumber ?? '').includes(search)
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'unpaid_partial'
        ? inv.billing?.paymentStatus === 'unpaid' || inv.billing?.paymentStatus === 'partial'
        : inv.billing?.paymentStatus === statusFilter)
    const bm = inv.billing?.billingMonth ?? ''
    const matchMonth = range
      ? bm >= range[0] && bm <= range[1]
      : monthFilter === 'all' || bm === monthFilter
    const matchBranch = branchFilter === 'all' || inv.billing?.room?.branch === branchFilter
    return matchSearch && matchStatus && matchMonth && matchBranch
  })

  const grouped = groupByBranch(
    filtered.map((inv) => ({
      ...inv,
      roomNumber: inv.billing?.room?.roomNumber ?? '',
      branch: inv.billing?.room?.branch ?? '',
    })),
  )

  const totalAmount = filtered.reduce((s, inv) => s + (inv.billing?.totalUsd ?? 0), 0)
  const paidCount = filtered.filter((inv) => inv.billing?.paymentStatus === 'paid').length
  const unpaidCount = filtered.filter((inv) => inv.billing?.paymentStatus !== 'paid').length

  const handleDelete = (inv: Invoice) => {
    triggerDelete({
      itemName: `Invoice ${inv.invoiceNumber}`,
      onRemove: () => setInvoices((prev) => prev.filter((i) => i.id !== inv.id)),
      onRestore: () => setInvoices((prev) => [inv, ...prev]),
      onExecute: () => fetch(`/api/invoices/${inv.id}`, { method: 'DELETE' }).then((r) => r.json()),
    })
  }

  const handleBatchDelete = (month: string, branch: string, count: number) => {
    const affected = invoices.filter(
      (inv) =>
        inv.billing?.billingMonth === month &&
        (branch === 'all' || inv.billing?.room?.branch === branch)
    )
    if (affected.length === 0) return
    const ids = new Set(affected.map((i) => i.id))
    runDeleteWithUndo({
      onRemove: () => setInvoices((prev) => prev.filter((i) => !ids.has(i.id))),
      onRestore: () => setInvoices((prev) => [...affected, ...prev]),
      onExecute: () =>
        fetch('/api/invoices/batch-delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month, branch }),
        }).then((r) => r.json()),
      onSuccess: () => router.refresh(),
      toastTitle: `Deleted ${count} invoice${count !== 1 ? 's' : ''}`,
    })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('nav_invoices')}</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} {t('invoices_generated')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPrint && (
            <Button variant="outline" size="sm" onClick={() => setShowBatchPrint(true)}>
              <Printer className="w-4 h-4 mr-2" />{t('batch_print')}
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setShowBatchDelete(true)}>
              <Trash2 className="w-4 h-4 mr-2" />{t('batch_delete')}
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className={cn('hover:shadow-md transition-all duration-200 hover:-translate-y-0.5', CARD_STYLES.indigo.card)}>
          <div className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('invoices_generated')}</p>
            <p className={cn('text-xl font-bold mt-1.5 tabular-nums', CARD_STYLES.indigo.value)}>{filtered.length}</p>
          </div>
        </Card>
        <Card className={cn('hover:shadow-md transition-all duration-200 hover:-translate-y-0.5', CARD_STYLES.green.card)}>
          <div className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_paid_count')}</p>
            <p className={cn('text-xl font-bold mt-1.5 tabular-nums', CARD_STYLES.green.value)}>{paidCount}</p>
          </div>
        </Card>
        <Card className={cn('hover:shadow-md transition-all duration-200 hover:-translate-y-0.5', CARD_STYLES.orange.card)}>
          <div className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_unpaid_count')}</p>
            <p className={cn('text-xl font-bold mt-1.5 tabular-nums', CARD_STYLES.orange.value)}>{unpaidCount}</p>
          </div>
        </Card>
        <Card className={cn('hover:shadow-md transition-all duration-200 hover:-translate-y-0.5', CARD_STYLES.blue.card)}>
          <div className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('amount')}</p>
            <p className={cn('text-xl font-bold mt-1.5 tabular-nums', CARD_STYLES.blue.value)}>{formatCurrency(totalAmount)}</p>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tenant, invoice #, room, month…"
            className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(['all', ...branches] as const).map((b) => (
          <Button key={b} variant={branchFilter === b ? 'default' : 'outline'} size="sm"
            className="h-9 px-3 text-sm"
            onClick={() => setBranchFilter(b)}>
            {b === 'all' ? t('all_branches') : b}
          </Button>
        ))}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('billing_all_status')}</SelectItem>
            <SelectItem value="unpaid_partial">{t('status_unpaid_partial')}</SelectItem>
            <SelectItem value="paid">{t('status_paid')}</SelectItem>
            <SelectItem value="unpaid">{t('status_unpaid')}</SelectItem>
            <SelectItem value="partial">{t('status_partial')}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={monthFilter}
          onValueChange={(v) => { setMonthFilter(v); setMonthFrom(''); setMonthTo('') }}
        >
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All months" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('billing_all_months')}</SelectItem>
            {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <MonthRangePicker months={months} from={monthFrom} to={monthTo}
          onChange={(f, to) => { setMonthFrom(f); setMonthTo(to); if (f || to) setMonthFilter('all') }} />
      </div>

      {/* Mobile card list — grouped by branch */}
      <div className="md:hidden space-y-5">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('invoices_empty')}</p>
          </div>
        )}
        {grouped.map((group) => (
          <div key={group.branch} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{group.branch}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">({group.items.length})</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            {group.items.map((inv) => {
          const status = inv.billing?.paymentStatus
          return (
            <Card key={inv.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="font-bold leading-tight truncate">
                    {inv.billing?.room ? `${t('room')} ${roomLabel(inv.billing.room)}` : '—'}
                  </p>
                  <Link href={`/tenants/${inv.tenant?.id}`} className="text-sm text-muted-foreground hover:text-primary block truncate mt-1">
                    {inv.tenant?.fullName ?? '—'}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{inv.invoiceNumber}</p>
                </div>
                <Badge
                  variant={status === 'paid' ? 'success' : status === 'partial' ? 'warning' : 'error'}
                  className="shrink-0 capitalize"
                >
                  {status === 'paid' ? t('status_paid') : status === 'partial' ? t('status_partial') : t('status_unpaid')}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('billing_col_month')}</p>
                  <p>{inv.billing?.billingMonth ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('amount')}</p>
                  <p className="font-semibold">{formatCurrency(inv.billing?.totalUsd ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('branch')}</p>
                  <p className="truncate">{inv.billing?.room?.branch ?? '—'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <Link href={`/invoices/${inv.billingId}`} className="flex-1 min-w-[5rem]">
                  <Button variant="outline" size="sm" className="w-full h-10">{t('view')}</Button>
                </Link>
                {canPrint && (
                  <Button
                    variant="outline" size="sm" className="h-10 px-3 shrink-0"
                    onClick={() => window.open(`/invoices/${inv.billingId}`, '_blank')}
                  >
                    <Printer className="w-4 h-4" />
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="outline" size="sm"
                    className="h-10 px-3 shrink-0 text-blue-600 border-blue-200 hover:bg-blue-500/10"
                    title={t('promise_to_pay')}
                    onClick={() => setPromiseBillingId(inv.billingId)}
                  >
                    <CalendarClock className="w-4 h-4" />
                  </Button>
                )}
                {isAdmin && inv.tenant && (
                  <Button
                    variant="outline" size="sm"
                    className="h-10 px-3 shrink-0 text-amber-600 border-amber-200 hover:bg-amber-500/10"
                    title={t('notice_add')}
                    onClick={() => setNoticeTenantId(inv.tenant!.id)}
                  >
                    <Bell className="w-4 h-4" />
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="outline" size="sm"
                    className="h-10 px-3 shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => handleDelete(inv)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
          </div>
        ))}
      </div>

      {/* Desktop table — branch header rows split each group */}
      <Card className="hidden md:block">
        <TableScroll>
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('room')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('branch')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenant')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('billing_col_month')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('amount')}</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">{t('status')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('invoices_col_invoice')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => (
                <Fragment key={group.branch}>
                  <tr className="bg-muted/40">
                    <td colSpan={8} className="px-4 py-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.branch}</span>
                      <span className="ml-2 text-xs text-muted-foreground tabular-nums">({group.items.length})</span>
                    </td>
                  </tr>
                  {group.items.map((inv, i) => (
                <tr key={inv.id}
                  className={`border-b border-border last:border-0 hover:bg-muted/30 ${i % 2 ? 'bg-muted/10' : ''}`}>
                  <td className="px-4 py-3 font-medium">{inv.billing?.room ? roomLabel(inv.billing.room) : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.billing?.room?.branch ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/tenants/${inv.tenant?.id}`} className="hover:text-primary font-medium">
                      {inv.tenant?.fullName ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{inv.billing?.billingMonth ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(inv.billing?.totalUsd ?? 0)}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge
                      variant={
                        inv.billing?.paymentStatus === 'paid'
                          ? 'success'
                          : inv.billing?.paymentStatus === 'partial'
                          ? 'warning'
                          : 'error'
                      }
                      className="capitalize"
                    >
                      {inv.billing?.paymentStatus === 'paid'
                        ? t('status_paid')
                        : inv.billing?.paymentStatus === 'partial'
                        ? t('status_partial')
                        : t('status_unpaid')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/invoices/${inv.billingId}`}>
                        <Button variant="ghost" size="sm" className="text-xs h-8 px-2">{t('view')}</Button>
                      </Link>
                      {canPrint && (
                        <Button variant="ghost" size="sm" className="text-xs h-8 px-2"
                          onClick={() => window.open(`/invoices/${inv.billingId}`, '_blank')}>
                          <Printer className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-8 px-2 text-blue-600 hover:bg-blue-500/10"
                          title={t('promise_to_pay')}
                          onClick={() => setPromiseBillingId(inv.billingId)}
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {isAdmin && inv.tenant && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-8 px-2 text-amber-600 hover:bg-amber-500/10"
                          title={t('notice_add')}
                          onClick={() => setNoticeTenantId(inv.tenant!.id)}
                        >
                          <Bell className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button variant="ghost" size="sm" className="text-xs h-8 px-2 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(inv)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                  ))}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{t('invoices_empty')}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <DeleteConfirmDialog
        open={dialogState.open}
        itemName={dialogState.itemName}
        onClose={closeDialog}
        onConfirm={dialogState.onConfirm}
      />

      {showBatchPrint && (
        <InvoiceBatchPrintDialog
          months={months}
          branches={branches}
          onClose={() => setShowBatchPrint(false)}
        />
      )}

      {showBatchDelete && (
        <InvoiceBatchDeleteDialog
          months={months}
          branches={branches}
          onClose={() => setShowBatchDelete(false)}
          onConfirm={handleBatchDelete}
        />
      )}

      {promiseBillingId && (
        <PromiseDialog
          billingId={promiseBillingId}
          onClose={() => setPromiseBillingId(null)}
        />
      )}

      {noticeTenantId && (
        <NoticeDialog
          tenantId={noticeTenantId}
          onClose={() => setNoticeTenantId(null)}
          onSave={() => setNoticeTenantId(null)}
        />
      )}
    </div>
  )
}
