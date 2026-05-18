'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import {
  Building2, Users, DollarSign, AlertTriangle,
  Home, Wrench, CheckCircle2, TrendingDown, TrendingUp,
} from 'lucide-react'
import { StatsCard } from '@/components/dashboard/stats-card'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatMonth, cn } from '@/lib/utils'
import Link from 'next/link'
import { useLanguage } from '@/contexts/language-context'

type Room     = { id: string; branch: string; status: string }
type Tenant   = { id: string; status: string; roomId: string | null }
type Billing  = {
  id: string; billingMonth: string; totalUsd: number; paymentStatus: string
  room: { branch: string } | null
  payments: { amountUsd: number }[]
}
type Expense  = { id: string; amountUsd: number; expenseDate: string; room: { branch: string } | null }
type UnpaidBilling = {
  id: string; billingMonth: string; totalUsd: number; totalRiel: number; paymentStatus: string
  tenant: { id: string; fullName: string; phone: string } | null
  room: { id: string; roomNumber: string; branch: string } | null
}

interface Props {
  rooms: Room[]
  tenants: Tenant[]
  billings: Billing[]
  expenses: Expense[]
  unpaidBillings: UnpaidBilling[]
}

const BRANCHES = ['all', 'Takmoa', 'Chamkadong'] as const
type Branch = typeof BRANCHES[number]

export function DashboardClient({ rooms, tenants, billings, expenses, unpaidBillings }: Props) {
  const { t } = useLanguage()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const [branch, setBranch] = useState<Branch>('all')
  const currentMonth = new Date().toISOString().slice(0, 7)

  const roomIds = useMemo(() => {
    const filtered = branch === 'all' ? rooms : rooms.filter(r => r.branch === branch)
    return new Set(filtered.map(r => r.id))
  }, [rooms, branch])

  const filteredRooms  = useMemo(() => (branch === 'all' ? rooms : rooms.filter(r => r.branch === branch)), [rooms, branch])
  const filteredTenants = useMemo(() => tenants.filter(t => t.roomId && roomIds.has(t.roomId)), [tenants, roomIds])
  const filteredBillings = useMemo(() => billings.filter(b => branch === 'all' || b.room?.branch === branch), [billings, branch])
  const filteredExpenses = useMemo(() => expenses.filter(e => branch === 'all' || e.room?.branch === branch || !e.room), [expenses, branch])
  const filteredUnpaid  = useMemo(() => unpaidBillings.filter(b => branch === 'all' || b.room?.branch === branch), [unpaidBillings, branch])

  const stats = useMemo(() => {
    const now = new Date()
    const month = currentMonth
    const monthBillings = filteredBillings.filter(b => b.billingMonth === month)

    const revenue = monthBillings
      .filter(b => b.paymentStatus === 'paid')
      .reduce((s, b) => s + b.totalUsd, 0)

    const outstanding = filteredBillings
      .filter(b => b.paymentStatus === 'unpaid' || b.paymentStatus === 'partial')
      .reduce((s, b) => {
        const paid = b.payments.reduce((ps, p) => ps + p.amountUsd, 0)
        return s + Math.max(0, b.totalUsd - paid)
      }, 0)

    const monthExpenses = filteredExpenses
      .filter(e => e.expenseDate.startsWith(month))
      .reduce((s, e) => s + e.amountUsd, 0)

    const chart = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const rev = filteredBillings
        .filter(b => b.billingMonth === m && b.paymentStatus === 'paid')
        .reduce((s, b) => s + b.totalUsd, 0)
      const exp = filteredExpenses
        .filter(e => e.expenseDate.startsWith(m))
        .reduce((s, e) => s + e.amountUsd, 0)
      return {
        month: m,
        label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        revenue: parseFloat(rev.toFixed(2)),
        expenses: parseFloat(exp.toFixed(2)),
      }
    })

    const occupied    = filteredRooms.filter(r => r.status === 'occupied').length
    const vacant      = filteredRooms.filter(r => r.status === 'vacant').length
    const maintenance = filteredRooms.filter(r => r.status === 'maintenance').length
    const total       = filteredRooms.length
    const active      = filteredTenants.filter(t => t.status === 'active').length

    return {
      totalRooms: total,
      occupied, vacant, maintenance,
      activeTenants: active,
      occupancyRate: total > 0 ? ((occupied / total) * 100).toFixed(1) : '0.0',
      monthlyRevenue: revenue.toFixed(2),
      outstanding: outstanding.toFixed(2),
      monthlyExpenses: monthExpenses.toFixed(2),
      netIncome: (revenue - monthExpenses).toFixed(2),
      paidBillings: monthBillings.filter(b => b.paymentStatus === 'paid').length,
      unpaidBillings: monthBillings.filter(b => b.paymentStatus !== 'paid').length,
      revenueChart: chart,
    }
  }, [filteredRooms, filteredTenants, filteredBillings, filteredExpenses, currentMonth])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('dashboard_title')}</h1>
          <p className="text-muted-foreground text-sm">{formatMonth(currentMonth)} {t('overview')}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Branch filter */}
          <div className="flex items-center bg-muted rounded-lg p-1 gap-1">
            {BRANCHES.map(b => (
              <button
                key={b}
                onClick={() => setBranch(b)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                  branch === b
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {b === 'all' ? t('billing_all_months').split(' ')[0] === 'All' ? 'All' : 'ទាំងអស់' : b}
              </button>
            ))}
          </div>
          {isAdmin && (
            <Link
              href="/billing/create"
              className="hidden sm:inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <span>+ {t('new_billing')}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatsCard title={t('dashboard_monthly_revenue')} value={formatCurrency(parseFloat(stats.monthlyRevenue))} subtitle={t('dashboard_this_month_collected')} icon={DollarSign} color="green" index={0} />
        <StatsCard title={t('dashboard_outstanding')} value={formatCurrency(parseFloat(stats.outstanding))} subtitle={t('dashboard_unpaid_balance')} icon={AlertTriangle} color="red" index={1} />
        <StatsCard title={t('dashboard_active_tenants')} value={stats.activeTenants} subtitle={`${stats.occupancyRate}% ${t('dashboard_occupancy_pct')}`} icon={Users} color="blue" index={2} />
        <StatsCard title={t('dashboard_total_rooms')} value={stats.totalRooms} subtitle={`${stats.occupied} ${t('dashboard_rooms_occupied')}`} icon={Building2} color="purple" index={3} />
        <StatsCard title={t('dashboard_monthly_expenses')} value={formatCurrency(parseFloat(stats.monthlyExpenses))} subtitle={t('dashboard_this_month_expenses')} icon={TrendingDown} color="orange" index={4} />
        <StatsCard
          title={t('dashboard_net_income')}
          value={formatCurrency(parseFloat(stats.netIncome))}
          subtitle={t('dashboard_revenue_minus_expenses')}
          icon={TrendingUp}
          color={parseFloat(stats.netIncome) >= 0 ? 'green' : 'red'}
          index={5}
        />
      </div>

      {/* Room status row */}
      <div className="grid grid-cols-3 gap-4">
        <StatsCard title={t('dashboard_occupied')} value={stats.occupied} icon={Home} color="green" index={4} />
        <StatsCard title={t('dashboard_vacant')} value={stats.vacant} icon={Home} color="indigo" index={5} />
        <StatsCard title={t('status_maintenance')} value={stats.maintenance} icon={Wrench} color="yellow" index={6} />
      </div>

      {/* Charts + Billing summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueChart data={stats.revenueChart} />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('dashboard_this_month_billing')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium">{t('status_paid')}</span>
              </div>
              <span className="text-sm font-bold text-green-600">{stats.paidBillings}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium">{t('status_unpaid')}</span>
              </div>
              <span className="text-sm font-bold text-red-600">{stats.unpaidBillings}</span>
            </div>
            <div className="pt-2 border-t border-border">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{t('collection_rate')}</span>
                <span>
                  {stats.paidBillings + stats.unpaidBillings > 0
                    ? Math.round((stats.paidBillings / (stats.paidBillings + stats.unpaidBillings)) * 100)
                    : 0}%
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${stats.paidBillings + stats.unpaidBillings > 0
                      ? (stats.paidBillings / (stats.paidBillings + stats.unpaidBillings)) * 100
                      : 0}%`
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unpaid billings table */}
      {filteredUnpaid.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{t('dashboard_outstanding_payments')}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{filteredUnpaid.length} {t('dashboard_unpaid_count')}</p>
              </div>
              <Link href="/billing?status=unpaid" className="text-xs text-primary hover:underline">
                {t('view_all')}
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('tenant')}</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('room')}</th>
                      {branch === 'all' && <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('branch')}</th>}
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('billing_col_month')}</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('amount')}</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUnpaid.slice(0, 10).map((bill, i) => (
                      <tr key={bill.id} className={`border-b border-border last:border-0 hover:bg-muted/40 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                        <td className="px-4 py-3">
                          <Link href={`/tenants/${bill.tenant?.id}`} className="font-medium hover:text-primary">
                            {bill.tenant?.fullName ?? '—'}
                          </Link>
                          <p className="text-xs text-muted-foreground">{bill.tenant?.phone}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {t('room')} {bill.room?.roomNumber ?? '—'}
                        </td>
                        {branch === 'all' && (
                          <td className="px-4 py-3">
                            <span className={cn(
                              'text-xs px-2 py-0.5 rounded-full font-medium',
                              bill.room?.branch === 'Takmoa'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                            )}>
                              {bill.room?.branch}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-muted-foreground">{bill.billingMonth}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold">{formatCurrency(bill.totalUsd)}</span>
                          <p className="text-xs text-muted-foreground">{Math.round(bill.totalRiel).toLocaleString()} ៛</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge variant={bill.paymentStatus === 'unpaid' ? 'error' : 'warning'} className="capitalize">
                            {t(bill.paymentStatus === 'unpaid' ? 'status_unpaid' : 'status_partial')}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
