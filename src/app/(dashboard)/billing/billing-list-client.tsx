'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, Filter, FileText, CheckCircle, AlertTriangle, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PaymentDialog } from '@/components/billing/payment-dialog'
import { formatCurrency, exportToCSV } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
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
  const { t } = useLanguage()
  const [billings, setBillings] = useState(initial)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [payDialog, setPayDialog] = useState<Billing | null>(null)

  const branches = [...new Set(billings.map((b) => b.room?.branch ?? 'Takmoa'))].sort()

  const filtered = billings.filter((b) => {
    const matchSearch =
      (b.tenant?.fullName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (b.room?.roomNumber ?? '').includes(search) ||
      b.billingMonth.includes(search)
    const matchStatus = statusFilter === 'all' || b.paymentStatus === statusFilter
    const matchMonth = monthFilter === 'all' || b.billingMonth === monthFilter
    const matchBranch = branchFilter === 'all' || (b.room?.branch ?? 'Takmoa') === branchFilter
    return matchSearch && matchStatus && matchMonth && matchBranch
  })

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

  const handleGenerateMonthly = async () => {
    const month = prompt('Generate billings for month (YYYY-MM):', new Date().toISOString().slice(0, 7))
    if (!month) return
    const res = await fetch('/api/billing/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month }),
    })
    const data = await res.json()
    if (data.ok) {
      toast({ title: `Generated ${data.created} billings, skipped ${data.skipped}` })
      router.refresh()
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
  }

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

  const handleMarkPaid = async (id: string) => {
    const res = await fetch(`/api/billing/${id}/mark-paid`, { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      setBillings((prev) => prev.map((b) => b.id === id ? { ...b, paymentStatus: 'paid', paymentDate: new Date().toISOString().slice(0, 10) } : b))
      toast({ title: 'Marked as paid' })
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
          <Button variant="outline" size="sm" onClick={handleGenerateMonthly}>
            <Calendar className="w-4 h-4 mr-2" />{t('billing_generate')}
          </Button>
          <Link href="/billing/create"><Button><Plus className="w-4 h-4 mr-2" />{t('billing_create')}</Button></Link>
        </div>
      </div>

      {/* Branch filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', ...branches] as const).map((b) => {
          const branchBillings = b === 'all' ? billings : billings.filter((bl) => (bl.room?.branch ?? 'Takmoa') === b)
          const unpaidCount = branchBillings.filter((bl) => bl.paymentStatus !== 'paid').length
          return (
            <button
              key={b}
              onClick={() => setBranchFilter(b)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                branchFilter === b
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background border-border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {b === 'all' ? t('all_branches') : b}
              {unpaidCount > 0 && (
                <span className={`ml-2 text-xs rounded-full px-1.5 py-0.5 ${branchFilter === b ? 'bg-white/20' : 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'}`}>
                  {unpaidCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><div className="p-4"><p className="text-xs text-muted-foreground">{t('billing_revenue')}</p><p className="text-xl font-bold text-green-600">{formatCurrency(totalRevenue)}</p></div></Card>
        <Card><div className="p-4"><p className="text-xs text-muted-foreground">{t('billing_outstanding')}</p><p className="text-xl font-bold text-red-600">{formatCurrency(totalOutstanding)}</p></div></Card>
        <Card><div className="p-4"><p className="text-xs text-muted-foreground">{t('billing_paid_count')}</p><p className="text-xl font-bold">{filtered.filter((b) => b.paymentStatus === 'paid').length}</p></div></Card>
        <Card><div className="p-4"><p className="text-xs text-muted-foreground">{t('billing_unpaid_count')}</p><p className="text-xl font-bold text-orange-500">{filtered.filter((b) => b.paymentStatus !== 'paid').length}</p></div></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('billing_search')} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('billing_all_status')}</SelectItem>
            <SelectItem value="paid">{t('status_paid')}</SelectItem>
            <SelectItem value="unpaid">{t('status_unpaid')}</SelectItem>
            <SelectItem value="partial">{t('status_partial')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All months" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('billing_all_months')}</SelectItem>
            {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[1050px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('billing_col_tenant_room')}</th>
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
                  <motion.tr key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 ${i % 2 ? 'bg-muted/10' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/tenants/${b.tenant?.id}`} className="font-medium hover:text-primary">
                        {b.tenant?.fullName ?? '—'}
                      </Link>
                      <p className="text-xs text-muted-foreground">{t('room')} {b.room?.roomNumber ?? '—'}</p>
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
                          <Button variant="ghost" size="sm" className="text-xs h-7 px-2">{t('view')}</Button>
                        </Link>
                        {b.paymentStatus !== 'paid' && (
                          <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-green-600"
                            onClick={() => setPayDialog(b)}>
                            {t('billing_pay')}
                          </Button>
                        )}
                        <Link href={`/invoices/${b.id}`}>
                          <Button variant="ghost" size="sm" className="text-xs h-7 px-2">{t('billing_invoice')}</Button>
                        </Link>
                      </div>
                    </td>
                  </motion.tr>
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
    </div>
  )
}
