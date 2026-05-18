'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, FileText, Calendar, Trash2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PaymentDialog } from '@/components/billing/payment-dialog'
import { BatchDeleteDialog } from '@/components/billing/batch-delete-dialog'
import { GenerateMonthlyDialog } from '@/components/billing/generate-monthly-dialog'
import { BatchGenerateInvoiceDialog } from '@/components/invoices/batch-generate-dialog'
import { formatCurrency, formatCompact, exportToCSV, roomLabel, sortRoomsByNumber } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useSession } from 'next-auth/react'
import { useLanguage } from '@/contexts/language-context'

type Billing = {
  id: string; billingMonth: string; roomRentUsd: number
  waterUsage: number; waterCostRiel: number; electricUsage: number; electricCostRiel: number
  totalUsd: number; totalRiel: number; outstandingDebtUsd: number; lateDays: number
  discountUsd: number; latePenaltyUsd: number; paymentStatus: string; paymentDate: string
  exchangeRate: number; createdAt: Date
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

export function BillingListClient({ billings: initial }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const { t } = useLanguage()
  const [billings, setBillings] = useState(initial)
  useEffect(() => { setBillings(initial) }, [initial])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const latestMonth = [...new Set(initial.map((b) => b.billingMonth))].sort().reverse()[0] ?? 'all'
  const [monthFilter, setMonthFilter] = useState(latestMonth)
  const [branchFilter, setBranchFilter] = useState('all')
  const [payDialog, setPayDialog] = useState<Billing | null>(null)
  const [showBatchDelete, setShowBatchDelete] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [showBatchInvoice, setShowBatchInvoice] = useState(false)

  const branches = [...new Set(billings.map((b) => b.room?.branch ?? 'Takmoa'))].sort()

  const filtered = sortRoomsByNumber(
    billings.filter((b) => {
      const matchSearch =
        (b.tenant?.fullName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (b.room?.roomNumber ?? '').includes(search) ||
        b.billingMonth.includes(search)
      const matchStatus = statusFilter === 'all' || b.paymentStatus === statusFilter
      const matchMonth = monthFilter === 'all' || b.billingMonth === monthFilter
      const matchBranch = branchFilter === 'all' || (b.room?.branch ?? 'Takmoa') === branchFilter
      return matchSearch && matchStatus && matchMonth && matchBranch
    }).map((b) => ({ ...b, roomNumber: b.room?.roomNumber ?? '' }))
  )

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

  const handleDelete = async (id: string) => {
    if (!confirm(t('billing_delete_confirm'))) return
    const res = await fetch(`/api/billing/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.ok) {
      setBillings((prev) => prev.filter((b) => b.id !== id))
      toast({ title: t('billing_deleted') })
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('billing_title')}</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} {t('billing_records')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>{t('billing_export')}</Button>
          <Button variant="outline" size="sm" onClick={() => setShowBatchInvoice(true)}>
            <Printer className="w-4 h-4 mr-2" />Batch Invoice
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowGenerate(true)}>
                <Calendar className="w-4 h-4 mr-2" />{t('billing_generate')}
              </Button>
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setShowBatchDelete(true)}>
                <Trash2 className="w-4 h-4 mr-2" />Batch Delete
              </Button>
              <Link href="/billing/create"><Button><Plus className="w-4 h-4 mr-2" />{t('billing_create')}</Button></Link>
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"><div className="p-4"><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_revenue')}</p><p className="text-xl font-bold text-green-600 mt-1.5 tabular-nums">{formatCompact(totalRevenue)}</p></div></Card>
        <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"><div className="p-4"><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_outstanding')}</p><p className="text-xl font-bold text-red-500 mt-1.5 tabular-nums">{formatCompact(totalOutstanding)}</p></div></Card>
        <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"><div className="p-4"><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_paid_count')}</p><p className="text-xl font-bold text-foreground mt-1.5 tabular-nums">{filtered.filter((b) => b.paymentStatus === 'paid').length}</p></div></Card>
        <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"><div className="p-4"><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_unpaid_count')}</p><p className="text-xl font-bold text-orange-500 mt-1.5 tabular-nums">{filtered.filter((b) => b.paymentStatus !== 'paid').length}</p></div></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('billing_search')} className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {(['all', ...branches] as const).map((b) => {
          const unpaidCount = (b === 'all' ? billings : billings.filter((bl) => (bl.room?.branch ?? 'Takmoa') === b))
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
            <SelectItem value="paid">{t('status_paid')}</SelectItem>
            <SelectItem value="unpaid">{t('status_unpaid')}</SelectItem>
            <SelectItem value="partial">{t('status_partial')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
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
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('billing_empty')}</p>
          </div>
        )}
        {filtered.map((b) => {
          const totalPaid = b.payments.reduce((s, p) => s + p.amountUsd, 0)
          const balance = Math.max(0, b.totalUsd - totalPaid)
          const payDay = b.tenant?.payDay ?? 1
          const { daysLate, isPaid } = getDueInfo(b.billingMonth, payDay, b.paymentStatus)
          return (
            <Card key={b.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <Link href={`/tenants/${b.tenant?.id}`} className="font-semibold hover:text-primary block truncate">
                    {b.tenant?.fullName ?? '—'}
                  </Link>
                  <p className="text-xs text-muted-foreground">{b.room ? `${t('room')} ${roomLabel(b.room)}` : '—'} · {b.billingMonth}</p>
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
              <div className="flex gap-2 pt-2 border-t border-border">
                <Link href={`/billing/${b.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full h-10">{t('view')}</Button>
                </Link>
                {isAdmin && b.paymentStatus !== 'paid' && (
                  <Button variant="outline" size="sm" className="flex-1 h-10 text-green-600 border-green-200"
                    onClick={() => setPayDialog(b)}>
                    {t('billing_pay')}
                  </Button>
                )}
                <Link href={`/invoices/${b.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full h-10">{t('billing_invoice')}</Button>
                </Link>
                {isAdmin && (
                  <Button variant="outline" size="sm" className="h-10 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => handleDelete(b.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Desktop table — hidden on small screens */}
      <Card className="hidden md:block hover:shadow-md transition-shadow duration-200">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[1250px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('room')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('branch')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenant')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('billing_col_month')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('billing_col_due_date')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('billing_col_rent')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('billing_col_electric')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('billing_col_water')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('billing_col_total')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('billing_col_paid')}</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">{t('billing_col_status')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('billing_col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => {
                const totalPaid = b.payments.reduce((s, p) => s + p.amountUsd, 0)
                const balance = Math.max(0, b.totalUsd - totalPaid)
                const payDay = b.tenant?.payDay ?? 1
                const { dueDate, daysLate, isPaid } = getDueInfo(b.billingMonth, payDay, b.paymentStatus)
                const dueDateStr = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                return (
                  <tr key={b.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 ${i % 2 ? 'bg-muted/10' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium">{b.room ? roomLabel(b.room) : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{b.room?.branch ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Link href={`/tenants/${b.tenant?.id}`} className="font-medium hover:text-primary">
                        {b.tenant?.fullName ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">{b.billingMonth}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm">{dueDateStr}</p>
                      {isPaid ? (
                        <p className="text-xs text-green-600">{t('status_paid')}</p>
                      ) : daysLate > 0 ? (
                        <p className="text-xs text-red-500 font-medium">{daysLate}{t('billing_due_days')} {t('billing_late')}</p>
                      ) : daysLate === 0 ? (
                        <p className="text-xs text-orange-500 font-medium">{t('billing_due_today')}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t('billing_due_in')} {-daysLate}{t('billing_due_days')}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(b.roomRentUsd)}</td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-medium">{Math.round(b.electricCostRiel).toLocaleString()} ៛</p>
                      <p className="text-xs text-muted-foreground">{b.electricUsage} {t('unit_kw')}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-medium">{Math.round(b.waterCostRiel).toLocaleString()} ៛</p>
                      <p className="text-xs text-muted-foreground">{b.waterUsage} {t('unit_kib')}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold">{formatCurrency(b.totalUsd)}</p>
                      <p className="text-xs text-muted-foreground">{Math.round(b.totalRiel).toLocaleString()} ៛</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-green-600 font-medium">{formatCurrency(totalPaid)}</p>
                      {balance > 0 && <p className="text-xs text-red-500">-{formatCurrency(balance)}</p>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={b.paymentStatus === 'paid' ? 'success' : b.paymentStatus === 'partial' ? 'warning' : 'error'} className="capitalize">
                        {b.paymentStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/billing/${b.id}`}>
                          <Button variant="ghost" size="sm" className="text-xs h-8 px-2">{t('view')}</Button>
                        </Link>
                        {isAdmin && b.paymentStatus !== 'paid' && (
                          <Button variant="ghost" size="sm" className="text-xs h-8 px-2 text-green-600"
                            onClick={() => setPayDialog(b)}>
                            {t('billing_pay')}
                          </Button>
                        )}
                        <Link href={`/invoices/${b.id}`}>
                          <Button variant="ghost" size="sm" className="text-xs h-8 px-2">{t('billing_invoice')}</Button>
                        </Link>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" className="text-xs h-8 px-2 text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(b.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
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
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('billing_empty')}</p>
            </div>
          )}
        </div>
      </Card>

      {payDialog && (
        <PaymentDialog
          billing={payDialog}
          onClose={() => setPayDialog(null)}
          onSave={() => { setPayDialog(null); router.refresh() }}
        />
      )}

      {showBatchDelete && (
        <BatchDeleteDialog
          months={months}
          branches={branches}
          onClose={() => setShowBatchDelete(false)}
          onDeleted={() => { setShowBatchDelete(false); router.refresh() }}
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
    </div>
  )
}
