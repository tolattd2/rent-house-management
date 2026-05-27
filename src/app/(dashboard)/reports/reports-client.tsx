'use client'

import { Fragment, useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TableScroll } from '@/components/ui/table-scroll'
import { SortableTh, type SortDir } from '@/components/ui/sortable-th'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MonthRangePicker, monthRange } from '@/components/ui/month-range-picker'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatMonth, formatMonthShort, exportToCSV, groupByBranch, cn } from '@/lib/utils'
import { CARD_STYLES } from '@/lib/card-colors'
import { Download, TrendingDown } from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'
import { useBranches, useRoomLabel } from '@/contexts/branches-context'
import { usePersistentState } from '@/hooks/use-persistent-state'

type Billing = {
  id: string; billingMonth: string; roomRentUsd: number; waterCostRiel: number
  electricCostRiel: number; totalUsd: number; totalRiel: number; exchangeRate: number
  outstandingDebtUsd: number; latePenaltyUsd: number; discountUsd: number
  paymentStatus: string; paymentDate: string
  tenant: { id: string; fullName: string } | null
  room: { id: string; roomNumber: string; branch: string } | null
  payments: Array<{ amountUsd: number }>
}

type Expense = {
  id: string; title: string; category: string; amountUsd: number
  expenseDate: string; paidTo: string; notes: string
  room: { id: string; roomNumber: string; branch: string } | null
}

interface Props { billings: Billing[]; expenses: Expense[] }

export function ReportsClient({ billings, expenses }: Props) {
  const { data: session } = useSession()
  const canExport = session?.user?.role ? session.user.role !== 'guest' : false
  const { t, language } = useLanguage()
  const roomLabel = useRoomLabel()
  const branchOptions = ['all', ...useBranches().map((b) => b.name)]
  const latestReportMonth = [...new Set(billings.map((b) => b.billingMonth))].sort().reverse()[0] ?? 'all'
  const [selectedMonth, setSelectedMonth] = usePersistentState<string>('reports/month', latestReportMonth)
  const [monthFrom, setMonthFrom] = usePersistentState<string>('reports/monthFrom', '')
  const [monthTo, setMonthTo] = usePersistentState<string>('reports/monthTo', '')
  const [branchFilter, setBranchFilter] = usePersistentState<string>('reports/branch', 'all')

  const months = useMemo(() =>
    [...new Set(billings.map((b) => b.billingMonth))].sort().reverse(),
    [billings]
  )

  const branchBillings = branchFilter === 'all' ? billings : billings.filter((b) => b.room?.branch === branchFilter)
  const branchExpenses = branchFilter === 'all' ? expenses : expenses.filter((e) => e.room?.branch === branchFilter)

  const revenueChart = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = formatMonthShort(m, language)
      const rev = branchBillings.filter((b) => b.billingMonth === m && b.paymentStatus === 'paid').reduce((s, b) => s + b.totalUsd, 0)
      const out = branchBillings.filter((b) => b.billingMonth === m && b.paymentStatus !== 'paid')
        .reduce((s, b) => {
          const paid = b.payments.reduce((ps, p) => ps + p.amountUsd, 0)
          return s + Math.max(0, b.totalUsd - paid)
        }, 0)
      const exp = branchExpenses.filter((e) => e.expenseDate.startsWith(m)).reduce((s, e) => s + e.amountUsd, 0)
      return { month: m, label, revenue: parseFloat(rev.toFixed(2)), outstanding: parseFloat(out.toFixed(2)), expenses: parseFloat(exp.toFixed(2)) }
    })
  }, [branchBillings, branchExpenses, language])

  // "All months" totals up to the current month — future-dated records are excluded
  // so a stray date in next month can't inflate lifetime totals.
  const currentMonth = new Date().toISOString().slice(0, 7)
  const range = monthRange(monthFrom, monthTo)
  const monthBillings = range
    ? branchBillings.filter((b) => b.billingMonth >= range[0] && b.billingMonth <= range[1])
    : selectedMonth === 'all'
      ? branchBillings.filter((b) => b.billingMonth <= currentMonth)
      : branchBillings.filter((b) => b.billingMonth === selectedMonth)

  const monthExpenses = range
    ? branchExpenses.filter((e) => {
      const m = e.expenseDate.slice(0, 7)
      return m >= range[0] && m <= range[1]
    })
    : selectedMonth === 'all'
      ? branchExpenses.filter((e) => e.expenseDate.slice(0, 7) <= currentMonth)
      : branchExpenses.filter((e) => e.expenseDate.startsWith(selectedMonth))

  const totalRevenue = monthBillings.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + b.totalUsd, 0)
  const totalOutstanding = monthBillings
    .filter((b) => b.paymentStatus !== 'paid')
    .reduce((s, b) => {
      const paid = b.payments.reduce((ps, p) => ps + p.amountUsd, 0)
      return s + Math.max(0, b.totalUsd - paid)
    }, 0)
  const totalExpenses = monthExpenses.reduce((s, e) => s + e.amountUsd, 0)
  const netIncome = totalRevenue - totalExpenses

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    monthExpenses.forEach((e) => { map[e.category] = (map[e.category] ?? 0) + e.amountUsd })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [monthExpenses])

  // Billing-detail table sort (applied within each branch group).
  type SortKey = 'room' | 'tenant' | 'month' | 'totalUsd' | 'totalRiel' | 'status'
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'room', dir: 'asc' })
  const toggleSort = (k: SortKey) => setSort((s) => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })

  // Group billing-detail rows by branch (rooms inside each branch count up)
  // and cap at 50 items total to keep the preview light.
  const detailGroups = useMemo(() => {
    const all = groupByBranch(monthBillings.map((b) => ({ ...b, roomNumber: b.room?.roomNumber ?? '', branch: b.room?.branch ?? '' })))
    const sign = sort.dir === 'asc' ? 1 : -1
    const sortedAll = all.map((g) => ({
      branch: g.branch,
      items: [...g.items].sort((a, b) => {
        switch (sort.key) {
          case 'room': return sign * a.roomNumber.localeCompare(b.roomNumber)
          case 'tenant': return sign * (a.tenant?.fullName ?? '').localeCompare(b.tenant?.fullName ?? '')
          case 'month': return sign * a.billingMonth.localeCompare(b.billingMonth)
          case 'totalUsd': return sign * (a.totalUsd - b.totalUsd)
          case 'totalRiel': return sign * (a.totalRiel - b.totalRiel)
          case 'status': return sign * a.paymentStatus.localeCompare(b.paymentStatus)
        }
      }),
    }))
    const out: Array<{ branch: string; items: typeof sortedAll[number]['items'] }> = []
    let count = 0
    for (const g of sortedAll) {
      if (count >= 50) break
      const take = Math.min(g.items.length, 50 - count)
      out.push({ branch: g.branch, items: g.items.slice(0, take) })
      count += take
    }
    return out
  }, [monthBillings, sort])

  const handleExport = () => {
    const headers = ['Month', 'Tenant', 'Room', 'Rent', 'Water', 'Electric', 'Penalty', 'Discount', 'Total USD', 'Total KHR', 'Status', 'Payment Date']
    const rows = monthBillings.map((b) => [
      b.billingMonth, b.tenant?.fullName ?? '', b.room?.roomNumber ?? '',
      b.roomRentUsd, b.waterCostRiel, b.electricCostRiel,
      b.latePenaltyUsd, b.discountUsd, b.totalUsd, Math.round(b.totalRiel),
      b.paymentStatus, b.paymentDate,
    ])
    exportToCSV(headers, rows, `report-${selectedMonth || 'all'}.csv`)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('reports_title')}</h1>
          <p className="text-muted-foreground text-sm">{t('reports_subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            {branchOptions.map((b) => (
              <Button key={b} size="sm" variant={branchFilter === b ? 'default' : 'outline'}
                className="h-10 px-3 text-xs sm:text-sm"
                onClick={() => setBranchFilter(b)}>
                {b === 'all' ? t('all') : b}
              </Button>
            ))}
          </div>
          <Select
            value={selectedMonth}
            onValueChange={(v) => { setSelectedMonth(v); setMonthFrom(''); setMonthTo('') }}
          >
            <SelectTrigger className="flex-1 sm:w-40 h-10">
              <SelectValue placeholder={t('billing_all_months')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('billing_all_months')}</SelectItem>
              {months.map((m) => <SelectItem key={m} value={m}>{formatMonth(m, language)}</SelectItem>)}
            </SelectContent>
          </Select>
          <MonthRangePicker months={months} from={monthFrom} to={monthTo}
            onChange={(f, to) => { setMonthFrom(f); setMonthTo(to); if (f || to) setSelectedMonth('all') }} />
          {canExport && (
            <Button variant="outline" className="h-10" onClick={handleExport}>
              <Download className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('billing_export')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <Card className={CARD_STYLES.green.card}><CardContent className="p-3 sm:p-4">
          <p className="text-xs text-muted-foreground leading-tight">{t('reports_revenue_collected')}</p>
          <p className={cn('text-base sm:text-xl font-bold mt-0.5 truncate', CARD_STYLES.green.value)}>{formatCurrency(totalRevenue)}</p>
        </CardContent></Card>
        <Card className={CARD_STYLES.red.card}><CardContent className="p-3 sm:p-4">
          <p className="text-xs text-muted-foreground leading-tight">{t('dashboard_outstanding')}</p>
          <p className={cn('text-base sm:text-xl font-bold mt-0.5 truncate', CARD_STYLES.red.value)}>{formatCurrency(totalOutstanding)}</p>
        </CardContent></Card>
        <Card className={CARD_STYLES.orange.card}><CardContent className="p-3 sm:p-4">
          <p className="text-xs text-muted-foreground leading-tight">{t('reports_total_expenses')}</p>
          <p className={cn('text-base sm:text-xl font-bold mt-0.5 truncate', CARD_STYLES.orange.value)}>{formatCurrency(totalExpenses)}</p>
        </CardContent></Card>
        <Card className={(netIncome >= 0 ? CARD_STYLES.emerald : CARD_STYLES.red).card}><CardContent className="p-3 sm:p-4">
          <p className="text-xs text-muted-foreground leading-tight">{t('reports_net_income')}</p>
          <p className={cn('text-base sm:text-xl font-bold mt-0.5 truncate', (netIncome >= 0 ? CARD_STYLES.emerald : CARD_STYLES.red).value)}>{formatCurrency(netIncome)}</p>
        </CardContent></Card>
        <Card className={CARD_STYLES.blue.card}><CardContent className="p-3 sm:p-4">
          <p className="text-xs text-muted-foreground leading-tight">{t('reports_paid_billings')}</p>
          <p className={cn('text-base sm:text-xl font-bold mt-0.5', CARD_STYLES.blue.value)}>{monthBillings.filter((b) => b.paymentStatus === 'paid').length}</p>
        </CardContent></Card>
        <Card className={CARD_STYLES.amber.card}><CardContent className="p-3 sm:p-4">
          <p className="text-xs text-muted-foreground leading-tight">{t('reports_unpaid_billings')}</p>
          <p className={cn('text-base sm:text-xl font-bold mt-0.5', CARD_STYLES.amber.value)}>{monthBillings.filter((b) => b.paymentStatus !== 'paid').length}</p>
        </CardContent></Card>
      </div>

      {/* Revenue trend */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('reports_chart_title')}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenueChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(val, name) => [`$${Number(val).toFixed(2)}`, name === 'revenue' ? t('reports_revenue_collected') : t('dashboard_outstanding')]}
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
              />
              <Legend />
              <Bar dataKey="revenue" name={t('reports_revenue_collected')} fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outstanding" name={t('dashboard_outstanding')} fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name={t('reports_total_expenses')} fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Expense summary */}
      {expenseByCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-orange-500" />
              {t('reports_expenses_title')} — {formatCurrency(totalExpenses)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {expenseByCategory.map(([cat, amt]) => (
                <div key={cat} className="text-center p-3 bg-muted/40 rounded-xl">
                  <p className="text-xs text-muted-foreground capitalize">{cat}</p>
                  <p className="font-bold text-orange-600">{formatCurrency(amt)}</p>
                  <p className="text-xs text-muted-foreground">{totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mobile card list — grouped by branch */}
      <div className="md:hidden space-y-5">
        <h3 className="text-base font-semibold">{t('reports_billing_detail')} ({monthBillings.length} {t('billing_records')})</h3>
        {detailGroups.map((group) => (
          <div key={group.branch} className="space-y-3">
            <div className="flex items-center gap-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{group.branch}</h4>
              <span className="text-xs text-muted-foreground tabular-nums">({group.items.length})</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            {group.items.map((b) => (
              <Card key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight truncate">
                      {b.room ? `${t('room')} ${roomLabel(b.room)}` : '—'}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">{b.tenant?.fullName ?? '—'}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{b.billingMonth}</p>
                  </div>
                  <Badge
                    variant={b.paymentStatus === 'paid' ? 'success' : b.paymentStatus === 'partial' ? 'warning' : 'error'}
                    className="shrink-0"
                  >
                    {t(b.paymentStatus === 'paid' ? 'status_paid' : b.paymentStatus === 'partial' ? 'status_partial' : 'status_unpaid')}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('reports_total_usd')}</p>
                    <p className="font-semibold tabular-nums">{formatCurrency(b.totalUsd)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{Math.round(b.totalRiel).toLocaleString()} ៛</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ))}
      </div>

      {/* Desktop billing table — branch header rows split each group */}
      <Card className="hidden md:block">
        <CardHeader><CardTitle className="text-base">{t('reports_billing_detail')} ({monthBillings.length} {t('billing_records')})</CardTitle></CardHeader>
        <TableScroll>
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <SortableTh align="left" k="room" label={t('room')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
                <SortableTh align="left" k="tenant" label={t('tenant')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
                <SortableTh align="left" k="month" label={t('billing_col_month')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
                <SortableTh align="right" k="totalUsd" label={t('reports_total_usd')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
                <SortableTh align="right" k="totalRiel" label={t('reports_total_khr')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
                <SortableTh align="left" k="status" label={t('status')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {detailGroups.map((group) => (
                <Fragment key={group.branch}>
                  <tr className="bg-muted/40">
                    <td colSpan={6} className="px-4 py-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.branch}</span>
                      <span className="ml-2 text-xs text-muted-foreground tabular-nums">({group.items.length})</span>
                    </td>
                  </tr>
                  {group.items.map((b, i) => (
                    <tr key={b.id} className={`border-b border-border last:border-0 hover:bg-muted/30 ${i % 2 ? 'bg-muted/10' : ''}`}>
                      <td className="px-4 py-2.5">{b.room ? `${t('room')} ${roomLabel(b.room)}` : '—'}</td>
                      <td className="px-4 py-2.5">{b.tenant?.fullName ?? '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{b.billingMonth}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(b.totalUsd)}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">{Math.round(b.totalRiel).toLocaleString()} ៛</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant={b.paymentStatus === 'paid' ? 'success' : b.paymentStatus === 'partial' ? 'warning' : 'error'}>
                          {t(b.paymentStatus === 'paid' ? 'status_paid' : b.paymentStatus === 'partial' ? 'status_partial' : 'status_unpaid')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>
    </div>
  )
}
