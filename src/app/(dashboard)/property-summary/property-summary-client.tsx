'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { Building2, MapPin, Phone, ArrowUpDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MonthRangePicker, monthRange } from '@/components/ui/month-range-picker'
import { TableScroll } from '@/components/ui/table-scroll'
import { formatCurrency, formatCompact, formatMonth, mapHref, cn } from '@/lib/utils'
import { useLanguage } from '@/contexts/language-context'
import { useBranches } from '@/contexts/branches-context'
import { resolveBranchRates, type RateKey } from '@/lib/branches'
import { CARD_STYLES, type CardColor } from '@/lib/card-colors'
import { usePersistentState } from '@/hooks/use-persistent-state'

/**
 * Aggregated shapes from `getPropertySummaryData()` — already grouped at
 * the SQL level so this page does only cheap per-branch reductions.
 */
interface Props {
  rooms: { branch: string; status: string; count: number }[]
  tenants: { branch: string | null; active: number; allTime: number }[]
  billings: {
    branch: string | null
    billingMonth: string
    paid: number
    unpaid: number
    paidOnBilling: number
    billings: number
    paidBillings: number
  }[]
  expenses: { branch: string | null; billingMonth: string; total: number }[]
  maintenance: { branch: string | null; open: number; total: number }[]
  settings: Record<string, string>
}

interface PropertyRow {
  slug: string
  name: string
  companyName: string
  address: string
  phone: string
  mapLink: string
  total: number
  occupied: number
  vacant: number
  maint: number
  occupancy: number
  activeTenants: number
  allTimeTenants: number
  revenue: number
  expenseTotal: number
  net: number
  outstanding: number
  collection: number
  openMaintenance: number
  rates: Record<RateKey, string>
}

type SortKey =
  | 'name' | 'total' | 'occupancy' | 'activeTenants' | 'allTimeTenants'
  | 'revenue' | 'expenseTotal' | 'net' | 'outstanding' | 'collection'

const CARD_CYCLE: CardColor[] = ['blue', 'green', 'purple', 'orange', 'cyan', 'pink', 'indigo', 'amber']

export function PropertySummaryClient({ rooms, tenants, billings, expenses, maintenance, settings }: Props) {
  const { t } = useLanguage()
  const branches = useBranches()
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = usePersistentState('property/month', currentMonth)
  const [monthFrom, setMonthFrom] = usePersistentState('property/monthFrom', '')
  const [monthTo, setMonthTo] = usePersistentState('property/monthTo', '')
  const [sortKey, setSortKey] = usePersistentState<SortKey>('property/sortKey', 'revenue')
  const [sortDir, setSortDir] = usePersistentState<'asc' | 'desc'>('property/sortDir', 'desc')

  // Distinct billing/expense months (plus the current month), newest first.
  const months = useMemo(() => {
    const set = new Set<string>([currentMonth])
    billings.forEach((b) => { if (b.billingMonth) set.add(b.billingMonth) })
    expenses.forEach((e) => { if (e.billingMonth) set.add(e.billingMonth) })
    return [...set].sort().reverse()
  }, [billings, expenses, currentMonth])

  const range = monthRange(monthFrom, monthTo)
  const rows: PropertyRow[] = useMemo(() => {
    const inMonthFilter = (m: string) =>
      range ? m >= range[0] && m <= range[1] : month === 'all' || m === month
    return branches.map((br) => {
      const brRooms = rooms.filter((r) => r.branch === br.name)
      const total = brRooms.reduce((s, r) => s + r.count, 0)
      const occupied = brRooms.filter((r) => r.status === 'occupied').reduce((s, r) => s + r.count, 0)
      const vacant = brRooms.filter((r) => r.status === 'vacant').reduce((s, r) => s + r.count, 0)
      const maint = brRooms.filter((r) => r.status === 'maintenance').reduce((s, r) => s + r.count, 0)

      const brBillings = billings.filter((b) => b.branch === br.name && inMonthFilter(b.billingMonth))
      const revenue = brBillings.reduce((s, b) => s + b.paid, 0)
      const outstanding = brBillings.reduce(
        (s, b) => s + Math.max(0, b.unpaid - b.paidOnBilling),
        0,
      )
      const totalBillings = brBillings.reduce((s, b) => s + b.billings, 0)
      const paidBillings = brBillings.reduce((s, b) => s + b.paidBillings, 0)

      const expenseTotal = expenses
        .filter((e) => e.branch === br.name && inMonthFilter(e.billingMonth))
        .reduce((s, e) => s + e.total, 0)

      const brTenants = tenants.find((tn) => tn.branch === br.name)
      const brMaint = maintenance.find((m) => m.branch === br.name)

      return {
        slug: br.slug,
        name: br.name,
        companyName: settings[`company_${br.slug}_name`] || '',
        address: settings[`company_${br.slug}_address`] || '',
        phone: settings[`company_${br.slug}_phone`] || '',
        mapLink: settings[`company_${br.slug}_maplink`] || '',
        total,
        occupied,
        vacant,
        maint,
        occupancy: total ? Math.round((occupied / total) * 100) : 0,
        activeTenants: brTenants?.active ?? 0,
        allTimeTenants: brTenants?.allTime ?? 0,
        revenue,
        expenseTotal,
        net: revenue - expenseTotal,
        outstanding,
        collection: totalBillings ? Math.round((paidBillings / totalBillings) * 100) : 0,
        openMaintenance: brMaint?.open ?? 0,
        rates: resolveBranchRates(settings, branches, br.name),
      }
    })
  }, [branches, rooms, tenants, billings, expenses, maintenance, settings, month, monthFrom, monthTo, range])

  const sortedRows = useMemo(() => {
    const arr = [...rows]
    arr.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [rows, sortKey, sortDir])

  const totals = useMemo(() => ({
    total: rows.reduce((s, r) => s + r.total, 0),
    occupied: rows.reduce((s, r) => s + r.occupied, 0),
    activeTenants: rows.reduce((s, r) => s + r.activeTenants, 0),
    allTimeTenants: rows.reduce((s, r) => s + r.allTimeTenants, 0),
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
    expenseTotal: rows.reduce((s, r) => s + r.expenseTotal, 0),
    net: rows.reduce((s, r) => s + r.net, 0),
    outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
  }), [rows])

  const chartData = rows.map((p) => ({
    name: p.name,
    revenue: parseFloat(p.revenue.toFixed(2)),
    expenses: parseFloat(p.expenseTotal.toFixed(2)),
    net: parseFloat(p.net.toFixed(2)),
  }))

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('desc') }
  }

  const rateLabels: { key: RateKey; label: string }[] = [
    { key: 'exchange_rate', label: t('settings_exchange_rate') },
    { key: 'late_penalty_usd', label: t('settings_late_penalty') },
    { key: 'water_rate_riel', label: t('settings_water_rate') },
    { key: 'electric_rate_riel', label: t('settings_electric_rate') },
  ]

  if (branches.length === 0) {
    return (
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold">{t('property_summary_title')}</h1>
        <p className="text-muted-foreground text-sm mt-8 text-center">{t('ps_no_branches')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('property_summary_title')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t('property_summary_subtitle')} · {range
              ? `${formatMonth(range[0])} – ${formatMonth(range[1])}`
              : month === 'all' ? t('billing_all_months') : formatMonth(month)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder={t('billing_all_months')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('billing_all_months')}</SelectItem>
              {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <MonthRangePicker months={months} from={monthFrom} to={monthTo}
            onChange={(f, to) => { setMonthFrom(f); setMonthTo(to) }} />
        </div>
      </div>

      {/* ── Section 1: Per-property snapshot cards ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('ps_snapshot')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((p, i) => {
            const cs = CARD_STYLES[CARD_CYCLE[i % CARD_CYCLE.length]]
            return (
              <div key={p.slug} className={cn('rounded-2xl border shadow-sm p-5', cs.card)}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', cs.icon)}>
                    <Building2 className={cn('w-5 h-5', cs.value)} />
                  </div>
                  <div className="min-w-0">
                    <h3 className={cn('font-bold leading-tight', cs.value)}>{p.name}</h3>
                    <p className="text-xs text-muted-foreground">{p.total} {t('dashboard_total_rooms')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-3">
                  <Metric label={t('dashboard_occupancy_pct')} value={`${p.occupancy}%`} />
                  <Metric label={t('dashboard_active_tenants')} value={p.activeTenants} />
                  <Metric label={t('ps_all_time_tenants')} value={p.allTimeTenants} />
                  <Metric label={t('dashboard_monthly_revenue')} value={formatCompact(p.revenue)} />
                  <Metric label={t('dashboard_monthly_expenses')} value={formatCompact(p.expenseTotal)} />
                  <Metric
                    label={t('dashboard_net_income')}
                    value={formatCompact(p.net)}
                    valueClass={p.net >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-400'}
                  />
                  <Metric label={t('dashboard_outstanding')} value={formatCompact(p.outstanding)} />
                  <Metric label={t('collection_rate')} value={`${p.collection}%`} />
                  <Metric label={t('ps_open_maintenance')} value={p.openMaintenance} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Section 2: Comparison table ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('ps_comparison')}</h2>
        {/* Mobile card list */}
        <div className="md:hidden space-y-3">
          {sortedRows.map((p) => (
            <Card key={p.slug} className="p-4">
              <p className="font-bold mb-3">{p.name}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t('dashboard_total_rooms')}</p>
                  <p className="tabular-nums">{p.total}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('dashboard_occupancy_pct')}</p>
                  <p className="tabular-nums">{p.occupancy}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('dashboard_active_tenants')}</p>
                  <p className="tabular-nums">{p.activeTenants}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('ps_all_time_tenants')}</p>
                  <p className="tabular-nums">{p.allTimeTenants}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('dashboard_monthly_revenue')}</p>
                  <p className="tabular-nums text-green-600 dark:text-green-400">{formatCurrency(p.revenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('dashboard_monthly_expenses')}</p>
                  <p className="tabular-nums text-orange-600 dark:text-orange-400">{formatCurrency(p.expenseTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('dashboard_net_income')}</p>
                  <p className={cn('tabular-nums font-semibold', p.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>{formatCurrency(p.net)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('dashboard_outstanding')}</p>
                  <p className="tabular-nums text-red-600 dark:text-red-400">{formatCurrency(p.outstanding)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('collection_rate')}</p>
                  <p className="tabular-nums">{p.collection}%</p>
                </div>
              </div>
            </Card>
          ))}
          <Card className="p-4 bg-muted/40">
            <p className="font-bold mb-3">{t('all_branches')}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t('dashboard_total_rooms')}</p>
                <p className="tabular-nums font-semibold">{totals.total}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('dashboard_occupancy_pct')}</p>
                <p className="tabular-nums font-semibold">{totals.total ? Math.round((totals.occupied / totals.total) * 100) : 0}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('dashboard_active_tenants')}</p>
                <p className="tabular-nums font-semibold">{totals.activeTenants}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('ps_all_time_tenants')}</p>
                <p className="tabular-nums font-semibold">{totals.allTimeTenants}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('dashboard_monthly_revenue')}</p>
                <p className="tabular-nums font-semibold">{formatCurrency(totals.revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('dashboard_monthly_expenses')}</p>
                <p className="tabular-nums font-semibold">{formatCurrency(totals.expenseTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('dashboard_net_income')}</p>
                <p className="tabular-nums font-semibold">{formatCurrency(totals.net)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('dashboard_outstanding')}</p>
                <p className="tabular-nums font-semibold">{formatCurrency(totals.outstanding)}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Desktop table */}
        <Card className="hidden md:block">
          <CardContent className="p-0">
            <TableScroll>
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <SortableTh label={t('branch')}                  k="name"           onSort={toggleSort} active={sortKey} dir={sortDir} align="left" />
                    <SortableTh label={t('dashboard_total_rooms')}    k="total"          onSort={toggleSort} active={sortKey} dir={sortDir} />
                    <SortableTh label={t('dashboard_occupancy_pct')}  k="occupancy"      onSort={toggleSort} active={sortKey} dir={sortDir} />
                    <SortableTh label={t('dashboard_active_tenants')} k="activeTenants"  onSort={toggleSort} active={sortKey} dir={sortDir} />
                    <SortableTh label={t('ps_all_time_tenants')}      k="allTimeTenants" onSort={toggleSort} active={sortKey} dir={sortDir} />
                    <SortableTh label={t('dashboard_monthly_revenue')} k="revenue"      onSort={toggleSort} active={sortKey} dir={sortDir} />
                    <SortableTh label={t('dashboard_monthly_expenses')} k="expenseTotal" onSort={toggleSort} active={sortKey} dir={sortDir} />
                    <SortableTh label={t('dashboard_net_income')}     k="net"           onSort={toggleSort} active={sortKey} dir={sortDir} />
                    <SortableTh label={t('dashboard_outstanding')}    k="outstanding"   onSort={toggleSort} active={sortKey} dir={sortDir} />
                    <SortableTh label={t('collection_rate')}          k="collection"    onSort={toggleSort} active={sortKey} dir={sortDir} />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((p) => (
                    <tr key={p.slug} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.total}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.occupancy}%</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.activeTenants}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.allTimeTenants}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-600 dark:text-green-400">{formatCurrency(p.revenue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400">{formatCurrency(p.expenseTotal)}</td>
                      <td className={cn('px-4 py-3 text-right tabular-nums font-semibold', p.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>{formatCurrency(p.net)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-600 dark:text-red-400">{formatCurrency(p.outstanding)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.collection}%</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                    <td className="px-4 py-3">{t('all_branches')}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{totals.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {totals.total ? Math.round((totals.occupied / totals.total) * 100) : 0}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{totals.activeTenants}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{totals.allTimeTenants}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.revenue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.expenseTotal)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.net)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.outstanding)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">—</td>
                  </tr>
                </tbody>
              </table>
            </TableScroll>
          </CardContent>
        </Card>
      </section>

      {/* ── Section 3: Financial comparison chart ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('ps_financial')}</h2>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(val) => `$${Number(val).toFixed(2)}`}
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                />
                <Legend />
                <Bar dataKey="revenue" name={t('dashboard_monthly_revenue')} fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name={t('dashboard_monthly_expenses')} fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="net" name={t('dashboard_net_income')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      {/* ── Section 4: Property profile panel ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('ps_profile')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((p) => (
            <Card key={p.slug}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />{p.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {p.companyName && p.companyName !== p.name && (
                  <p className="font-medium">{p.companyName}</p>
                )}
                <div className="space-y-1.5 text-muted-foreground">
                  <p className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      {p.address || '—'}
                      {p.mapLink.trim() && (
                        <>
                          {p.address ? ' · ' : ''}
                          <a
                            href={mapHref(p.mapLink)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {t('view_on_map')}
                          </a>
                        </>
                      )}
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    {p.phone || '—'}
                  </p>
                </div>
                <div className="space-y-1.5 pt-3 border-t border-border">
                  {rateLabels.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground text-xs">{label}</span>
                      <span className="font-semibold tabular-nums">{Number(p.rates[key]).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums mt-0.5', valueClass)}>{value}</p>
    </div>
  )
}

function SortableTh({
  label, k, onSort, active, dir, align = 'right',
}: {
  label: string
  k: SortKey
  onSort: (k: SortKey) => void
  active: SortKey
  dir: 'asc' | 'desc'
  align?: 'left' | 'right'
}) {
  const isActive = active === k
  return (
    <th className={cn('px-4 py-2.5 text-xs font-medium text-muted-foreground', align === 'left' ? 'text-left' : 'text-right')}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
          align === 'right' && 'flex-row-reverse',
          isActive && 'text-foreground font-semibold',
        )}
      >
        <ArrowUpDown className={cn('w-3 h-3', isActive ? 'opacity-100' : 'opacity-40')} />
        {label}{isActive ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  )
}
