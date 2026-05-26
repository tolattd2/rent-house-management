'use client'

import { Fragment, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import {
  Building2, Users, DollarSign, AlertTriangle,
  Home, Wrench, CheckCircle2, TrendingDown, TrendingUp, Bell, BookmarkCheck,
} from 'lucide-react'
import { StatsCard } from '@/components/dashboard/stats-card'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TableScroll } from '@/components/ui/table-scroll'
import { Badge } from '@/components/ui/badge'
import { formatCompact, formatDate, formatMonth, formatPhones, groupByBranch, cn } from '@/lib/utils'
import Link from 'next/link'
import { useLanguage } from '@/contexts/language-context'
import { useBranches, useRoomLabel } from '@/contexts/branches-context'

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
  tenant: { id: string; fullName: string; phone: string; phonesExtra: string[] } | null
  room: { id: string; roomNumber: string; branch: string } | null
}
type OpenNotice = {
  id: string; type: string; message: string; expectedDate: string; createdAt: Date | string
  tenant: { id: string; fullName: string; room: { roomNumber: string; branch: string } | null } | null
}

interface Props {
  rooms: Room[]
  tenants: Tenant[]
  billings: Billing[]
  expenses: Expense[]
  unpaidBillings: UnpaidBilling[]
  openNotices: OpenNotice[]
}

const BRANCH_CHIP_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
]

function trendLabel(current: number, prev: number): { label: string; up: boolean } | undefined {
  if (prev === 0) return undefined
  const pct = ((current - prev) / prev) * 100
  return { label: `${Math.abs(pct).toFixed(1)}% vs last month`, up: pct >= 0 }
}

export function DashboardClient({ rooms, tenants, billings, expenses, unpaidBillings, openNotices }: Props) {
  const { t } = useLanguage()
  const branchList = useBranches()
  const roomLabel = useRoomLabel()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const [branch, setBranch] = useState<string>('all')
  const branchOptions = ['all', ...branchList.map((b) => b.name)]
  const branchChipColor = (name: string | null | undefined) =>
    BRANCH_CHIP_COLORS[Math.max(0, branchList.findIndex((b) => b.name === name)) % BRANCH_CHIP_COLORS.length]
  const currentMonth = new Date().toISOString().slice(0, 7)

  const roomIds = useMemo(() => {
    const filtered = branch === 'all' ? rooms : rooms.filter(r => r.branch === branch)
    return new Set(filtered.map(r => r.id))
  }, [rooms, branch])

  const filteredRooms    = useMemo(() => (branch === 'all' ? rooms : rooms.filter(r => r.branch === branch)), [rooms, branch])
  const filteredTenants  = useMemo(() => tenants.filter(t => t.roomId && roomIds.has(t.roomId)), [tenants, roomIds])
  const filteredBillings = useMemo(() => billings.filter(b => branch === 'all' || b.room?.branch === branch), [billings, branch])
  const filteredExpenses = useMemo(() => expenses.filter(e => branch === 'all' || e.room?.branch === branch || !e.room), [expenses, branch])
  const filteredUnpaid   = useMemo(() => unpaidBillings.filter(b => branch === 'all' || b.room?.branch === branch), [unpaidBillings, branch])
  const filteredNotices  = useMemo(() => openNotices.filter(n => branch === 'all' || n.tenant?.room?.branch === branch), [openNotices, branch])

  const stats = useMemo(() => {
    const now   = new Date()
    const month = currentMonth

    const prevDate  = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

    const monthBillings    = filteredBillings.filter(b => b.billingMonth === month)
    const prevMonthBillings = filteredBillings.filter(b => b.billingMonth === prevMonth)

    const revenue = monthBillings
      .filter(b => b.paymentStatus === 'paid')
      .reduce((s, b) => s + b.totalUsd, 0)

    const prevRevenue = prevMonthBillings
      .filter(b => b.paymentStatus === 'paid')
      .reduce((s, b) => s + b.totalUsd, 0)

    const outstanding = filteredBillings
      .filter(b => b.paymentStatus === 'unpaid' || b.paymentStatus === 'partial')
      .reduce((s, b) => {
        const paid = b.payments.reduce((ps, p) => ps + p.amountUsd, 0)
        return s + Math.max(0, b.totalUsd - paid)
      }, 0)

    const overdueCount = filteredBillings.filter(
      b => b.paymentStatus === 'unpaid' || b.paymentStatus === 'partial'
    ).length

    const monthExpenses = filteredExpenses
      .filter(e => e.expenseDate.startsWith(month))
      .reduce((s, e) => s + e.amountUsd, 0)

    const prevExpenses = filteredExpenses
      .filter(e => e.expenseDate.startsWith(prevMonth))
      .reduce((s, e) => s + e.amountUsd, 0)

    const netIncome     = revenue - monthExpenses
    const prevNetIncome = prevRevenue - prevExpenses

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
    const reserved    = filteredRooms.filter(r => r.status === 'reserved').length
    const maintenance = filteredRooms.filter(r => r.status === 'maintenance').length
    const total       = filteredRooms.length
    const active      = filteredTenants.filter(t => t.status === 'active').length
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0

    return {
      totalRooms: total, occupied, vacant, reserved, maintenance,
      activeTenants: active, occupancyRate,
      monthlyRevenue: revenue,
      prevRevenue,
      outstanding,
      overdueCount,
      monthlyExpenses: monthExpenses,
      prevExpenses,
      netIncome,
      prevNetIncome,
      paidBillings:   monthBillings.filter(b => b.paymentStatus === 'paid').length,
      unpaidBillings: monthBillings.filter(b => b.paymentStatus !== 'paid').length,
      revenueChart: chart,
    }
  }, [filteredRooms, filteredTenants, filteredBillings, filteredExpenses, currentMonth])

  const collectionRate = stats.paidBillings + stats.unpaidBillings > 0
    ? Math.round((stats.paidBillings / (stats.paidBillings + stats.unpaidBillings)) * 100)
    : 0

  // Top-10 preview lists are grouped by branch and rooms inside each branch
  // count up, so the same branch's rooms always cluster together — easier to
  // glance at than a mixed list. We cap at 10 items across all groups.
  const limitGroups = <T,>(groups: Array<{ branch: string; items: T[] }>, max: number) => {
    const out: Array<{ branch: string; items: T[] }> = []
    let count = 0
    for (const g of groups) {
      if (count >= max) break
      const take = Math.min(g.items.length, max - count)
      out.push({ branch: g.branch, items: g.items.slice(0, take) })
      count += take
    }
    return out
  }

  const unpaidGroups = useMemo(() => limitGroups(
    groupByBranch(filteredUnpaid.map((b) => ({ ...b, roomNumber: b.room?.roomNumber ?? '', branch: b.room?.branch ?? '' }))),
    10,
  ), [filteredUnpaid])

  const noticeGroups = useMemo(() => limitGroups(
    groupByBranch(filteredNotices.map((n) => ({ ...n, roomNumber: n.tenant?.room?.roomNumber ?? '', branch: n.tenant?.room?.branch ?? '' }))),
    10,
  ), [filteredNotices])

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('dashboard_title')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{formatMonth(currentMonth)} {t('overview')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-muted rounded-lg p-1 gap-0.5">
            {branchOptions.map(b => (
              <button
                key={b}
                onClick={() => setBranch(b)}
                className={cn(
                  'px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all min-h-[32px]',
                  branch === b
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {b === 'all' ? 'All' : b}
              </button>
            ))}
          </div>
          {isAdmin && (
            <Link
              href="/billing/create"
              className="hidden sm:inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              + {t('new_billing')}
            </Link>
          )}
        </div>
      </div>

      {/* ── KPI grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatsCard
          title={t('dashboard_monthly_revenue')}
          value={formatCompact(stats.monthlyRevenue)}
          subtitle={t('dashboard_this_month_collected')}
          icon={DollarSign}
          color="green"
          index={0}
          trend={trendLabel(stats.monthlyRevenue, stats.prevRevenue)}
        />
        <StatsCard
          title={t('dashboard_outstanding')}
          value={formatCompact(stats.outstanding)}
          subtitle={`${stats.overdueCount} ${t('dashboard_unpaid_balance')}`}
          icon={AlertTriangle}
          color="red"
          index={1}
          trend={stats.overdueCount > 0 ? { label: `${stats.overdueCount} overdue`, up: false } : undefined}
        />
        <StatsCard
          title={t('dashboard_active_tenants')}
          value={stats.activeTenants}
          subtitle={`${stats.occupancyRate}% ${t('dashboard_occupancy_pct')}`}
          icon={Users}
          color="blue"
          index={2}
          trend={{ label: `${stats.occupancyRate}% occupancy`, up: stats.occupancyRate >= 80 }}
        />
        <StatsCard
          title={t('dashboard_total_rooms')}
          value={stats.totalRooms}
          subtitle={`${stats.occupied} occupied · ${stats.vacant} vacant`}
          icon={Building2}
          color="purple"
          index={3}
        />
        <StatsCard
          title={t('dashboard_monthly_expenses')}
          value={formatCompact(stats.monthlyExpenses)}
          subtitle={t('dashboard_this_month_expenses')}
          icon={TrendingDown}
          color="orange"
          index={4}
          trend={trendLabel(stats.monthlyExpenses, stats.prevExpenses) && {
            ...trendLabel(stats.monthlyExpenses, stats.prevExpenses)!,
            up: (stats.monthlyExpenses <= stats.prevExpenses),
          }}
        />
        <StatsCard
          title={t('dashboard_net_income')}
          value={formatCompact(stats.netIncome)}
          subtitle={t('dashboard_revenue_minus_expenses')}
          icon={TrendingUp}
          color={stats.netIncome >= 0 ? 'green' : 'red'}
          index={5}
          trend={trendLabel(stats.netIncome, stats.prevNetIncome)}
        />
      </div>

      {/* ── Room status strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatsCard title={t('dashboard_occupied')}    value={stats.occupied}    icon={Home}          color="green"  index={6} compact />
        <StatsCard title={t('dashboard_vacant')}      value={stats.vacant}      icon={Home}          color="indigo" index={7} compact />
        <StatsCard title={t('status_reserved')}       value={stats.reserved}    icon={BookmarkCheck} color="orange" index={8} compact />
        <Link href="/maintenance" className="block">
          <StatsCard title={t('status_maintenance')}    value={stats.maintenance} icon={Wrench}      color="yellow" index={9} compact />
        </Link>
        <Link href="/notices" className="block">
          <StatsCard title={t('notices_title')}         value={filteredNotices.length} icon={Bell}   color="amber"  index={10} compact />
        </Link>
      </div>

      {/* ── Chart + billing summary ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <RevenueChart data={stats.revenueChart} />
        </div>

        <Card className="shadow-sm border-0">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-sm font-semibold">{t('dashboard_this_month_billing')}</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded-xl">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium">{t('status_paid')}</span>
              </div>
              <span className="text-sm font-bold text-green-600 tabular-nums">{stats.paidBillings}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-xl">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium">{t('status_unpaid')}</span>
              </div>
              <span className="text-sm font-bold text-red-500 tabular-nums">{stats.unpaidBillings}</span>
            </div>

            {/* Collection rate bar */}
            <div className="pt-1">
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>{t('collection_rate')}</span>
                <span className="font-semibold text-foreground tabular-nums">{collectionRate}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all duration-700"
                  style={{
                    width: `${collectionRate}%`,
                    background: collectionRate >= 80
                      ? 'rgb(34 197 94)'
                      : collectionRate >= 50
                        ? 'rgb(234 179 8)'
                        : 'rgb(239 68 68)',
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Unpaid billings table ── */}
      {filteredUnpaid.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="shadow-sm border-0">
            <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">{t('dashboard_outstanding_payments')}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{filteredUnpaid.length} {t('dashboard_unpaid_count')}</p>
              </div>
              <Link href="/billing?status=unpaid" className="text-xs text-primary hover:underline font-medium">
                {t('view_all')}
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mobile card list — grouped by branch */}
              <div className="md:hidden p-3 space-y-4">
                {unpaidGroups.map((group) => (
                  <div key={group.branch} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', branchChipColor(group.branch))}>
                        {group.branch}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">({group.items.length})</span>
                    </div>
                    {group.items.map((bill) => (
                      <div key={bill.id} className="p-3 rounded-lg border border-border">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {bill.room ? `${t('room')} ${roomLabel(bill.room)}` : '—'}
                            </p>
                            <Link href={`/tenants/${bill.tenant?.id}`} className="text-sm text-muted-foreground truncate hover:text-primary block">
                              {bill.tenant?.fullName ?? '—'}
                            </Link>
                            {bill.tenant && (
                              <p className="text-xs text-muted-foreground">{formatPhones(bill.tenant.phone, bill.tenant.phonesExtra)}</p>
                            )}
                          </div>
                          <Badge variant={bill.paymentStatus === 'unpaid' ? 'error' : 'warning'} className="shrink-0 capitalize">
                            {t(bill.paymentStatus === 'unpaid' ? 'status_unpaid' : 'status_partial')}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground tabular-nums">{bill.billingMonth}</span>
                          <div className="text-right">
                            <span className="font-semibold tabular-nums">${bill.totalUsd.toFixed(2)}</span>
                            <p className="text-xs text-muted-foreground tabular-nums">{Math.round(bill.totalRiel).toLocaleString()} ៛</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Desktop table — branch header rows split each group */}
              <div className="hidden md:block">
              <TableScroll>
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">{t('room')}</th>
                      <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">{t('tenant')}</th>
                      <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">{t('billing_col_month')}</th>
                      <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">{t('amount')}</th>
                      <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaidGroups.map((group) => (
                      <Fragment key={group.branch}>
                        <tr className="bg-muted/40">
                          <td colSpan={5} className="px-5 py-2">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', branchChipColor(group.branch))}>
                              {group.branch}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground tabular-nums">({group.items.length})</span>
                          </td>
                        </tr>
                        {group.items.map((bill, i) => (
                          <tr
                            key={bill.id}
                            className={`border-b border-border last:border-0 hover:bg-muted/40 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}
                          >
                            <td className="px-5 py-3 text-muted-foreground">
                              {bill.room ? `${t('room')} ${roomLabel(bill.room)}` : '—'}
                            </td>
                            <td className="px-5 py-3">
                              <Link href={`/tenants/${bill.tenant?.id}`} className="font-medium hover:text-primary">
                                {bill.tenant?.fullName ?? '—'}
                              </Link>
                              <p className="text-xs text-muted-foreground">{bill.tenant && formatPhones(bill.tenant.phone, bill.tenant.phonesExtra)}</p>
                            </td>
                            <td className="px-5 py-3 text-muted-foreground tabular-nums">{bill.billingMonth}</td>
                            <td className="px-5 py-3 text-right">
                              <span className="font-semibold tabular-nums">${bill.totalUsd.toFixed(2)}</span>
                              <p className="text-xs text-muted-foreground">{Math.round(bill.totalRiel).toLocaleString()} ៛</p>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <Badge variant={bill.paymentStatus === 'unpaid' ? 'error' : 'warning'} className="capitalize">
                                {t(bill.paymentStatus === 'unpaid' ? 'status_unpaid' : 'status_partial')}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Open tenant notices ── */}
      {filteredNotices.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="shadow-sm border-0">
            <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" />{t('notice_dashboard_title')}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{filteredNotices.length} {t('notice_open_count')}</p>
              </div>
              <Link href="/notices" className="text-xs text-primary hover:underline font-medium">
                {t('view_all')}
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mobile card list — grouped by branch */}
              <div className="md:hidden p-3 space-y-4">
                {noticeGroups.map((group) => (
                  <div key={group.branch} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', branchChipColor(group.branch))}>
                        {group.branch}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">({group.items.length})</span>
                    </div>
                    {group.items.map((n) => (
                      <div key={n.id} className="p-3 rounded-lg border border-border">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {n.tenant?.room ? `${t('room')} ${roomLabel(n.tenant.room)}` : '—'}
                            </p>
                            <Link href={`/tenants/${n.tenant?.id}`} className="text-sm text-muted-foreground truncate hover:text-primary block">
                              {n.tenant?.fullName ?? '—'}
                            </Link>
                          </div>
                          <Badge variant={n.type === 'move_out' ? 'error' : n.type === 'general' ? 'secondary' : 'warning'} className="shrink-0">
                            {t(`notice_type_${n.type}` as Parameters<typeof t>[0])}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{n.message}</p>
                        {n.expectedDate && (
                          <p className="text-xs text-amber-700 dark:text-amber-500 mt-2 tabular-nums">
                            {t('notice_expected')}: {formatDate(n.expectedDate)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Desktop table — branch header rows split each group */}
              <div className="hidden md:block">
              <TableScroll>
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">{t('room')}</th>
                      <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">{t('tenant')}</th>
                      <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">{t('notice_type')}</th>
                      <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">{t('notice_message')}</th>
                      <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">{t('notice_expected')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noticeGroups.map((group) => (
                      <Fragment key={group.branch}>
                        <tr className="bg-muted/40">
                          <td colSpan={5} className="px-5 py-2">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', branchChipColor(group.branch))}>
                              {group.branch}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground tabular-nums">({group.items.length})</span>
                          </td>
                        </tr>
                        {group.items.map((n, i) => (
                          <tr
                            key={n.id}
                            className={`border-b border-border last:border-0 hover:bg-muted/40 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}
                          >
                            <td className="px-5 py-3 text-muted-foreground">
                              {n.tenant?.room ? `${t('room')} ${roomLabel(n.tenant.room)}` : '—'}
                            </td>
                            <td className="px-5 py-3">
                              <Link href={`/tenants/${n.tenant?.id}`} className="font-medium hover:text-primary">
                                {n.tenant?.fullName ?? '—'}
                              </Link>
                            </td>
                            <td className="px-5 py-3">
                              <Badge variant={n.type === 'move_out' ? 'error' : n.type === 'general' ? 'secondary' : 'warning'}>
                                {t(`notice_type_${n.type}` as Parameters<typeof t>[0])}
                              </Badge>
                            </td>
                            <td className="px-5 py-3 text-muted-foreground max-w-[260px] truncate">{n.message}</td>
                            <td className="px-5 py-3 text-muted-foreground tabular-nums">
                              {n.expectedDate ? formatDate(n.expectedDate) : '—'}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
