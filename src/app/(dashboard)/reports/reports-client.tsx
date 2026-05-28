'use client'

import { Fragment, useRef, useState, useMemo, useEffect } from 'react'
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
import { Download, FileText, TrendingDown, ExternalLink } from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'
import { useBranches, useRoomLabel } from '@/contexts/branches-context'
import { usePersistentState } from '@/hooks/use-persistent-state'

type Payment = {
  id: string
  createdAt: Date | string
  amountUsd: number
  amountRiel: number
  paymentMethod: string
  transactionRef: string
  notes: string
  receivedBy: { name: string } | null
}

type Billing = {
  id: string; billingMonth: string; roomRentUsd: number; waterCostRiel: number
  electricCostRiel: number; totalUsd: number; totalRiel: number; exchangeRate: number
  outstandingDebtUsd: number; latePenaltyUsd: number; discountUsd: number
  paymentStatus: string; paymentDate: string
  tenant: { id: string; fullName: string } | null
  room: { id: string; roomNumber: string; branch: string } | null
  payments: Payment[]
}

type Expense = {
  id: string; title: string; category: string; amountUsd: number
  expenseDate: string; paidTo: string; notes: string; receiptUrl: string
  room: { id: string; roomNumber: string; branch: string } | null
  maintenance: { id: string; title: string } | null
}

type RoomLite = { id: string; branch: string | null; status: string }

interface Props { billings: Billing[]; expenses: Expense[]; rooms: RoomLite[] }

export function ReportsClient({ billings, expenses, rooms }: Props) {
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

  // === Tax / audit aggregations ===

  // Income statement: sum each revenue/expense line over the selected period
  // and branch filter. Water/electric are billed in Riel — convert each
  // billing's Riel components into USD at that billing's stored exchange rate
  // (mirrors how totalUsd is computed on the billing form) so the statement
  // is a pure USD report.
  const incomeStatement = useMemo(() => {
    let rent = 0, water = 0, electric = 0, penalty = 0, discount = 0
    let collected = 0, outstandingTotal = 0
    for (const b of monthBillings) {
      rent += b.roomRentUsd
      const rate = b.exchangeRate || 4100
      water += b.waterCostRiel / rate
      electric += b.electricCostRiel / rate
      penalty += b.latePenaltyUsd
      discount += b.discountUsd
      const paid = b.payments.reduce((s, p) => s + p.amountUsd, 0)
      if (b.paymentStatus === 'paid') collected += b.totalUsd
      else {
        collected += Math.min(paid, b.totalUsd)
        outstandingTotal += Math.max(0, b.totalUsd - paid)
      }
    }
    const grossRevenue = rent + water + electric + penalty
    const netRevenue = grossRevenue - discount
    const expByCat = new Map<string, number>()
    for (const e of monthExpenses) expByCat.set(e.category, (expByCat.get(e.category) ?? 0) + e.amountUsd)
    const expenseLines = Array.from(expByCat.entries()).sort((a, b) => b[1] - a[1])
    const expenseTotal = expenseLines.reduce((s, [, v]) => s + v, 0)
    return {
      rent, water, electric, penalty, discount,
      grossRevenue, netRevenue, collected, outstanding: outstandingTotal,
      expenseLines, expenseTotal,
      netIncome: collected - expenseTotal,
    }
  }, [monthBillings, monthExpenses])

  // Per-branch P&L — independent of branchFilter so the table always shows
  // every configured branch as a row.
  const branchPnL = useMemo(() => {
    const allBranches = Array.from(new Set([
      ...billings.map((b) => b.room?.branch ?? '—'),
      ...expenses.map((e) => e.room?.branch ?? '—'),
    ]))
    return allBranches.map((br) => {
      const bs = monthBillings.filter((b) => (b.room?.branch ?? '—') === br && (branchFilter === 'all' || br === branchFilter))
      const es = monthExpenses.filter((e) => (e.room?.branch ?? '—') === br && (branchFilter === 'all' || br === branchFilter))
      const billed = bs.reduce((s, b) => s + b.totalUsd, 0)
      const collected = bs.reduce((s, b) => {
        const paid = b.payments.reduce((ps, p) => ps + p.amountUsd, 0)
        return s + (b.paymentStatus === 'paid' ? b.totalUsd : Math.min(paid, b.totalUsd))
      }, 0)
      const outstanding = bs.reduce((s, b) => {
        const paid = b.payments.reduce((ps, p) => ps + p.amountUsd, 0)
        return s + (b.paymentStatus === 'paid' ? 0 : Math.max(0, b.totalUsd - paid))
      }, 0)
      const expensesUsd = es.reduce((s, e) => s + e.amountUsd, 0)
      return { branch: br, billed, collected, outstanding, expenses: expensesUsd, net: collected - expensesUsd }
    }).filter((r) => branchFilter === 'all' || r.branch === branchFilter)
      .filter((r) => r.billed > 0 || r.expenses > 0)
      .sort((a, b) => a.branch.localeCompare(b.branch))
  }, [billings, expenses, monthBillings, monthExpenses, branchFilter])

  // Collection rate KPI — paid / (paid + outstanding) over the period.
  const collectionRate = useMemo(() => {
    const denom = incomeStatement.collected + incomeStatement.outstanding
    return denom > 0 ? Math.round((incomeStatement.collected / denom) * 100) : 0
  }, [incomeStatement.collected, incomeStatement.outstanding])

  // Occupancy KPI — branch-aware, based on Room.status.
  const occupancy = useMemo(() => {
    const scoped = branchFilter === 'all' ? rooms : rooms.filter((r) => (r.branch ?? '') === branchFilter)
    const total = scoped.length
    const occ = scoped.filter((r) => r.status === 'occupied').length
    return { occupied: occ, total, rate: total > 0 ? Math.round((occ / total) * 100) : 0 }
  }, [rooms, branchFilter])

  // Receivables aging — cutoff is the end of the selected period (or today
  // when "All months" / a range is active). Buckets measure days since the
  // end of the billingMonth (last calendar day).
  const cutoffDate = useMemo(() => {
    if (selectedMonth !== 'all' && !range) {
      const [y, m] = selectedMonth.split('-').map(Number)
      return new Date(y, m, 0) // day 0 of next month = last day of this month
    }
    if (range) {
      const [, end] = range
      const [y, m] = end.split('-').map(Number)
      return new Date(y, m, 0)
    }
    return new Date()
  }, [selectedMonth, range])
  function endOfMonth(ym: string): Date {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m, 0)
  }
  function bucketFor(days: number): 'current' | '30_60' | '60_90' | '90_plus' {
    if (days <= 30) return 'current'
    if (days <= 60) return '30_60'
    if (days <= 90) return '60_90'
    return '90_plus'
  }
  const agingRows = useMemo(() => {
    const cutMs = cutoffDate.getTime()
    return branchBillings
      .filter((b) => b.paymentStatus !== 'paid')
      .filter((b) => {
        if (range) return b.billingMonth >= range[0] && b.billingMonth <= range[1]
        if (selectedMonth === 'all') return endOfMonth(b.billingMonth).getTime() <= cutMs
        return b.billingMonth === selectedMonth
      })
      .map((b) => {
        const paid = b.payments.reduce((s, p) => s + p.amountUsd, 0)
        const outstanding = Math.max(0, b.totalUsd - paid)
        const days = Math.max(0, Math.floor((cutMs - endOfMonth(b.billingMonth).getTime()) / 86400000))
        return {
          id: b.id,
          tenant: b.tenant?.fullName ?? '—',
          room: b.room?.roomNumber ?? '—',
          branch: b.room?.branch ?? '—',
          billingMonth: b.billingMonth,
          total: b.totalUsd,
          paid,
          outstanding,
          days,
          bucket: bucketFor(days),
        }
      })
      .filter((r) => r.outstanding > 0.005)
  }, [branchBillings, selectedMonth, range, cutoffDate])
  const agingBuckets = useMemo(() => {
    const init = { current: 0, '30_60': 0, '60_90': 0, '90_plus': 0 } as Record<string, number>
    for (const r of agingRows) init[r.bucket] += r.outstanding
    return init
  }, [agingRows])
  type AgingSortKey = 'tenant' | 'room' | 'branch' | 'billingMonth' | 'total' | 'paid' | 'outstanding' | 'days'
  const [agingSort, setAgingSort] = useState<{ key: AgingSortKey; dir: SortDir }>({ key: 'days', dir: 'desc' })
  const sortedAging = useMemo(() => {
    const sign = agingSort.dir === 'asc' ? 1 : -1
    return [...agingRows].sort((a, b) => {
      const k = agingSort.key
      if (k === 'days' || k === 'total' || k === 'paid' || k === 'outstanding') {
        return sign * ((a[k] as number) - (b[k] as number))
      }
      return sign * String(a[k]).localeCompare(String(b[k]))
    })
  }, [agingRows, agingSort])
  const toggleAgingSort = (k: AgingSortKey) => setAgingSort((s) => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' })

  // Payments received journal — every Payment whose createdAt falls in the
  // selected period. Bound to branchBillings so the branch filter applies.
  const paymentsJournal = useMemo(() => {
    const inRange = (d: Date) => {
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (range) return ym >= range[0] && ym <= range[1]
      if (selectedMonth === 'all') return ym <= currentMonth
      return ym === selectedMonth
    }
    const rows: Array<{
      id: string; date: Date; tenant: string; room: string; branch: string
      billingMonth: string; method: string; ref: string; receivedBy: string
      amountUsd: number; amountRiel: number; notes: string
    }> = []
    for (const b of branchBillings) {
      for (const p of b.payments) {
        const d = typeof p.createdAt === 'string' ? new Date(p.createdAt) : p.createdAt
        if (!inRange(d)) continue
        rows.push({
          id: p.id,
          date: d,
          tenant: b.tenant?.fullName ?? '—',
          room: b.room?.roomNumber ?? '—',
          branch: b.room?.branch ?? '—',
          billingMonth: b.billingMonth,
          method: p.paymentMethod,
          ref: p.transactionRef,
          receivedBy: p.receivedBy?.name ?? '',
          amountUsd: p.amountUsd,
          amountRiel: p.amountRiel,
          notes: p.notes,
        })
      }
    }
    return rows.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [branchBillings, selectedMonth, range, currentMonth])
  const paymentsJournalTotal = paymentsJournal.reduce((s, p) => s + p.amountUsd, 0)

  // Expense register — every expense in the period (already filtered by
  // branch/month via monthExpenses), sorted by date asc for an audit feel.
  const expenseRegister = useMemo(() => [...monthExpenses].sort((a, b) => a.expenseDate.localeCompare(b.expenseDate)), [monthExpenses])

  // CSV exports for each new section.
  function fmt(n: number) { return Number(n.toFixed(2)) }
  const exportAgingCSV = () => {
    const headers = ['Tenant', 'Room', 'Branch', 'Billing Month', 'Total USD', 'Paid USD', 'Outstanding USD', 'Days Overdue', 'Bucket']
    const rows = sortedAging.map((r) => [r.tenant, r.room, r.branch, r.billingMonth, fmt(r.total), fmt(r.paid), fmt(r.outstanding), r.days, r.bucket])
    exportToCSV(headers, rows, `aging-${selectedMonth || 'all'}.csv`)
  }
  const exportPaymentsCSV = () => {
    const headers = ['Date', 'Tenant', 'Room', 'Branch', 'Billing Month', 'Method', 'Ref', 'Received By', 'Amount USD', 'Amount Riel', 'Notes']
    const rows = paymentsJournal.map((p) => [
      p.date.toISOString().slice(0, 10),
      p.tenant, p.room, p.branch, p.billingMonth, p.method, p.ref, p.receivedBy,
      fmt(p.amountUsd), Math.round(p.amountRiel), p.notes,
    ])
    exportToCSV(headers, rows, `payments-${selectedMonth || 'all'}.csv`)
  }
  const exportExpenseRegisterCSV = () => {
    const headers = ['Date', 'Title', 'Category', 'Paid To', 'Room', 'Branch', 'Notes', 'Receipt URL', 'Amount USD']
    const rows = expenseRegister.map((e) => [
      e.expenseDate, e.title, e.category, e.paidTo,
      e.room?.roomNumber ?? '', e.room?.branch ?? '', e.notes, e.receiptUrl, fmt(e.amountUsd),
    ])
    exportToCSV(headers, rows, `expense-register-${selectedMonth || 'all'}.csv`)
  }

  // PDF export — snapshots the root container into a multi-page A4 PDF using
  // html2canvas + jspdf (both already in package.json). Done dynamically so
  // the heavy libs aren't bundled into the initial page chunk.
  const exportRootRef = useRef<HTMLDivElement | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const handleExportPDF = async () => {
    if (!exportRootRef.current || exportingPdf) return
    setExportingPdf(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(exportRootRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const img = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW
      const imgH = (canvas.height * imgW) / canvas.width
      // Header band
      const periodLabel = range ? `${range[0]} → ${range[1]}` : (selectedMonth === 'all' ? t('billing_all_months') : formatMonth(selectedMonth, language))
      const branchLabel = branchFilter === 'all' ? t('all_branches') : branchFilter
      pdf.setFontSize(12)
      pdf.text(t('reports_title'), 10, 10)
      pdf.setFontSize(9)
      pdf.text(`${branchLabel} · ${periodLabel} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, 10, 16)
      const topMargin = 22
      let positionMm = topMargin
      // Slice the canvas into A4-height bands so long reports paginate.
      const usableH = pageH - topMargin - 6
      let remaining = imgH
      let yCanvas = 0
      while (remaining > 0) {
        const bandHmm = Math.min(usableH, remaining)
        const bandHpx = Math.floor((bandHmm * canvas.width) / imgW)
        const band = document.createElement('canvas')
        band.width = canvas.width
        band.height = bandHpx
        const ctx = band.getContext('2d')
        if (!ctx) break
        ctx.drawImage(canvas, 0, yCanvas, canvas.width, bandHpx, 0, 0, canvas.width, bandHpx)
        pdf.addImage(band.toDataURL('image/png'), 'PNG', 0, positionMm, imgW, bandHmm)
        yCanvas += bandHpx
        remaining -= bandHmm
        if (remaining > 0) {
          pdf.addPage()
          positionMm = topMargin
        }
      }
      const fname = `reports-${branchLabel}-${range ? `${range[0]}_${range[1]}` : selectedMonth}.pdf`
      pdf.save(fname.replace(/[^a-z0-9._-]/gi, '_'))
    } finally {
      setExportingPdf(false)
    }
  }

  // Read bilingual custom expense categories so the summary card can display
  // them in Khmer when the UI language is set to kh. The expenses page is the
  // source of truth — we just mirror that localStorage entry here.
  type CustomCat = { en: string; km: string }
  const [customCategories, setCustomCategories] = useState<CustomCat[]>([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem('expenses/custom-categories')
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const next: CustomCat[] = parsed.map((c) =>
        typeof c === 'string'
          ? { en: c, km: c }
          : { en: String((c as CustomCat).en ?? ''), km: String((c as CustomCat).km ?? '') }
      ).filter((c) => c.en)
      setCustomCategories(next)
    } catch { /* ignore */ }
  }, [])
  function catLabel(cat: string) {
    const key = `expense_cat_${cat}` as Parameters<typeof t>[0]
    const v = t(key)
    if (v !== key) return v
    const custom = customCategories.find((c) => c.en === cat)
    if (custom) return language === 'kh' ? (custom.km || custom.en) : custom.en
    return cat
  }

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
          <Button variant="outline" className="h-10" onClick={handleExportPDF} disabled={exportingPdf}>
            <FileText className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('reports_export_pdf')}</span>
          </Button>
        </div>
      </div>

      <div ref={exportRootRef} className="space-y-6 bg-background">
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
        <Card className={CARD_STYLES.indigo.card}><CardContent className="p-3 sm:p-4">
          <p className="text-xs text-muted-foreground leading-tight">{t('reports_collection_rate')}</p>
          <p className={cn('text-base sm:text-xl font-bold mt-0.5', CARD_STYLES.indigo.value)}>{collectionRate}%</p>
        </CardContent></Card>
        <Card className={CARD_STYLES.purple.card}><CardContent className="p-3 sm:p-4">
          <p className="text-xs text-muted-foreground leading-tight">{t('reports_occupancy_rate')}</p>
          <p className={cn('text-base sm:text-xl font-bold mt-0.5', CARD_STYLES.purple.value)}>{occupancy.rate}% <span className="text-xs text-muted-foreground font-normal">({occupancy.occupied}/{occupancy.total})</span></p>
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
                  <p className="text-xs text-muted-foreground capitalize">{catLabel(cat)}</p>
                  <p className="font-bold text-orange-600">{formatCurrency(amt)}</p>
                  <p className="text-xs text-muted-foreground">{totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Income Statement (P&L) */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('reports_income_statement')}</CardTitle></CardHeader>
        <CardContent>
          <div className="max-w-xl mx-auto space-y-1 text-sm">
            <div className="flex justify-between"><span>{t('reports_revenue_room_rent')}</span><span className="tabular-nums">{formatCurrency(incomeStatement.rent)}</span></div>
            <div className="flex justify-between"><span>{t('reports_revenue_water')}</span><span className="tabular-nums">{formatCurrency(incomeStatement.water)}</span></div>
            <div className="flex justify-between"><span>{t('reports_revenue_electric')}</span><span className="tabular-nums">{formatCurrency(incomeStatement.electric)}</span></div>
            <div className="flex justify-between"><span>{t('reports_revenue_penalty')}</span><span className="tabular-nums">{formatCurrency(incomeStatement.penalty)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>{t('reports_revenue_discount')}</span><span className="tabular-nums">({formatCurrency(incomeStatement.discount)})</span></div>
            <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-1.5"><span>{t('reports_net_revenue')}</span><span className="tabular-nums">{formatCurrency(incomeStatement.netRevenue)}</span></div>
            <div className="flex justify-between text-muted-foreground text-xs"><span>{t('reports_of_which_collected')}</span><span className="tabular-nums">{formatCurrency(incomeStatement.collected)}</span></div>
            <div className="flex justify-between text-muted-foreground text-xs"><span>{t('reports_of_which_outstanding')}</span><span className="tabular-nums">{formatCurrency(incomeStatement.outstanding)}</span></div>
            <div className="h-3" />
            <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">{t('reports_total_expenses')}</p>
            {incomeStatement.expenseLines.map(([cat, amt]) => (
              <div key={cat} className="flex justify-between pl-3"><span className="capitalize">{catLabel(cat)}</span><span className="tabular-nums">{formatCurrency(amt)}</span></div>
            ))}
            <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-1.5"><span>{t('reports_total_expenses')}</span><span className="tabular-nums">{formatCurrency(incomeStatement.expenseTotal)}</span></div>
            <div className="h-3" />
            <div className={cn('flex justify-between font-bold text-base border-t-2 border-border pt-2', incomeStatement.netIncome >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              <span>{t('reports_net_income')}</span><span className="tabular-nums">{formatCurrency(incomeStatement.netIncome)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Branch P&L */}
      {branchPnL.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('reports_branch_pnl')}</CardTitle></CardHeader>
          <TableScroll>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('branch')}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('reports_revenue_billed')}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('reports_revenue_collected')}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('reports_outstanding')}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('reports_total_expenses')}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('reports_net_income')}</th>
                </tr>
              </thead>
              <tbody>
                {branchPnL.map((r) => (
                  <tr key={r.branch} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium">{r.branch === '—' ? t('branch_shared') : r.branch}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(r.billed)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{formatCurrency(r.collected)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{formatCurrency(r.outstanding)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-orange-600">{formatCurrency(r.expenses)}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums font-semibold', r.net >= 0 ? 'text-emerald-600' : 'text-red-600')}>{formatCurrency(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      )}

      {/* Receivables Aging */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{t('reports_aging')}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{t('reports_aging_subtitle')} · {cutoffDate.toISOString().slice(0, 10)}</p>
            </div>
            {sortedAging.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportAgingCSV}>
                <Download className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">{t('billing_export')}</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {(['current', '30_60', '60_90', '90_plus'] as const).map((b) => (
              <div key={b} className={cn('text-center p-3 rounded-xl border border-border/50',
                b === 'current' ? 'bg-emerald-50 dark:bg-emerald-900/20' :
                b === '30_60' ? 'bg-amber-50 dark:bg-amber-900/20' :
                b === '60_90' ? 'bg-orange-50 dark:bg-orange-900/20' :
                'bg-red-50 dark:bg-red-900/20'
              )}>
                <p className="text-[11px] text-muted-foreground">
                  {b === 'current' ? t('aging_current') : b === '30_60' ? t('aging_30_60') : b === '60_90' ? t('aging_60_90') : t('aging_90_plus')}
                </p>
                <p className="font-bold tabular-nums mt-0.5">{formatCurrency(agingBuckets[b] ?? 0)}</p>
              </div>
            ))}
          </div>
          {sortedAging.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">{t('expenses_empty') /* close-enough fallback */}</p>
          ) : (
            <TableScroll>
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <SortableTh align="left" k="tenant" label={t('tenant')} active={agingSort.key} dir={agingSort.dir} onSort={toggleAgingSort} />
                    <SortableTh align="left" k="room" label={t('room')} active={agingSort.key} dir={agingSort.dir} onSort={toggleAgingSort} />
                    <SortableTh align="left" k="branch" label={t('branch')} active={agingSort.key} dir={agingSort.dir} onSort={toggleAgingSort} />
                    <SortableTh align="left" k="billingMonth" label={t('billing_col_month')} active={agingSort.key} dir={agingSort.dir} onSort={toggleAgingSort} />
                    <SortableTh align="right" k="total" label={t('aging_total')} active={agingSort.key} dir={agingSort.dir} onSort={toggleAgingSort} />
                    <SortableTh align="right" k="paid" label={t('aging_paid')} active={agingSort.key} dir={agingSort.dir} onSort={toggleAgingSort} />
                    <SortableTh align="right" k="outstanding" label={t('reports_outstanding')} active={agingSort.key} dir={agingSort.dir} onSort={toggleAgingSort} />
                    <SortableTh align="right" k="days" label={t('aging_days_overdue')} active={agingSort.key} dir={agingSort.dir} onSort={toggleAgingSort} />
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('aging_bucket')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAging.map((r, i) => (
                    <tr key={r.id} className={`border-b border-border last:border-0 hover:bg-muted/30 ${i % 2 ? 'bg-muted/10' : ''}`}>
                      <td className="px-4 py-2">{r.tenant}</td>
                      <td className="px-4 py-2">{r.room}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.branch}</td>
                      <td className="px-4 py-2 font-mono text-xs">{r.billingMonth}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(r.total)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(r.paid)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-red-600">{formatCurrency(r.outstanding)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.days}</td>
                      <td className="px-4 py-2 text-center text-xs">
                        <Badge variant={r.bucket === 'current' ? 'success' : r.bucket === '90_plus' ? 'error' : 'warning'}>
                          {r.bucket === 'current' ? '0–30' : r.bucket === '30_60' ? '31–60' : r.bucket === '60_90' ? '61–90' : '90+'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </CardContent>
      </Card>

      {/* Payments Received Journal */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{t('reports_payments_journal')} <span className="text-sm font-normal text-muted-foreground">— {formatCurrency(paymentsJournalTotal)}</span></CardTitle>
            {paymentsJournal.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportPaymentsCSV}>
                <Download className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">{t('billing_export')}</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <TableScroll>
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('expenses_col_date')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('tenant')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('room')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('billing_col_month')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('payment_method')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('payment_ref')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('received_by')}</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('reports_total_usd')}</th>
              </tr>
            </thead>
            <tbody>
              {paymentsJournal.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-sm text-muted-foreground py-6">—</td></tr>
              ) : paymentsJournal.map((p, i) => (
                <tr key={p.id} className={`border-b border-border last:border-0 hover:bg-muted/30 ${i % 2 ? 'bg-muted/10' : ''}`}>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2">{p.tenant}</td>
                  <td className="px-4 py-2">{p.room} <span className="text-xs text-muted-foreground">· {p.branch}</span></td>
                  <td className="px-4 py-2 font-mono text-xs">{p.billingMonth}</td>
                  <td className="px-4 py-2 text-xs"><Badge variant="secondary">{p.method}</Badge></td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.ref || '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.receivedBy || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-emerald-600">{formatCurrency(p.amountUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {/* Expense Register */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{t('reports_expense_register')} <span className="text-sm font-normal text-muted-foreground">— {formatCurrency(totalExpenses)}</span></CardTitle>
            {expenseRegister.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportExpenseRegisterCSV}>
                <Download className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">{t('billing_export')}</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <TableScroll>
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('expenses_col_date')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('expenses_col_title')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('expenses_col_category')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('expenses_col_paid_to')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('expenses_col_room')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('expense_receipt')}</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('expenses_col_amount')}</th>
              </tr>
            </thead>
            <tbody>
              {expenseRegister.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-sm text-muted-foreground py-6">—</td></tr>
              ) : expenseRegister.map((e, i) => (
                <tr key={e.id} className={`border-b border-border last:border-0 hover:bg-muted/30 ${i % 2 ? 'bg-muted/10' : ''}`}>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{e.expenseDate}</td>
                  <td className="px-4 py-2">
                    {e.title}
                    {e.maintenance && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-orange-600">· {t('maintenance_expense_auto')}</span>
                    )}
                    {e.notes && <p className="text-xs text-muted-foreground truncate max-w-xs">{e.notes}</p>}
                  </td>
                  <td className="px-4 py-2 capitalize">{catLabel(e.category)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{e.paidTo || '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {e.room ? `${e.room.roomNumber} · ${e.room.branch}` : t('branch_shared')}
                  </td>
                  <td className="px-4 py-2">
                    {e.receiptUrl ? (
                      <a href={e.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        {t('expense_view_receipt')} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-red-600">{formatCurrency(e.amountUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>

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
    </div>
  )
}
