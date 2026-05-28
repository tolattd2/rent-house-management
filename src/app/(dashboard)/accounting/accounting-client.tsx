'use client'

import { useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TableScroll } from '@/components/ui/table-scroll'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, cn } from '@/lib/utils'
import { Calculator, FileText, Lock, LockOpen, Search } from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'
import { useBranches } from '@/contexts/branches-context'
import { usePersistentState } from '@/hooks/use-persistent-state'
import { toast } from '@/hooks/use-toast'

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
  paymentStatus: string; paymentDate: string; createdAt: Date | string
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

type Tenant = {
  id: string; fullName: string
  room: { roomNumber: string; branch: string } | null
}

type Lock = {
  id: string; month: string; lockedAt: Date | string; notes: string
  lockedBy: { id: string; name: string } | null
}

interface Props { billings: Billing[]; expenses: Expense[]; tenants: Tenant[]; locks: Lock[] }

type MonthTotals = {
  rent: number; water: number; electric: number; penalty: number; discount: number
  netRevenue: number; collected: number; outstanding: number
  expensesByCat: Map<string, number>; expenseTotal: number; netIncome: number
}

function newMonthTotals(): MonthTotals {
  return { rent: 0, water: 0, electric: 0, penalty: 0, discount: 0, netRevenue: 0, collected: 0, outstanding: 0, expensesByCat: new Map(), expenseTotal: 0, netIncome: 0 }
}

export function AccountingClient({ billings, expenses, tenants, locks: initialLocks }: Props) {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const { t, language } = useLanguage()
  const branchOptions = ['all', ...useBranches().map((b) => b.name)]
  const [locks, setLocks] = useState<Lock[]>(initialLocks)

  // Year + branch state.
  const years = useMemo(() => {
    const set = new Set<number>()
    billings.forEach((b) => { const y = Number(b.billingMonth.slice(0, 4)); if (Number.isFinite(y)) set.add(y) })
    expenses.forEach((e) => { const y = Number(e.expenseDate.slice(0, 4)); if (Number.isFinite(y)) set.add(y) })
    set.add(new Date().getFullYear())
    return Array.from(set).sort((a, b) => b - a)
  }, [billings, expenses])
  const [year, setYear] = usePersistentState<number>('accounting/year', new Date().getFullYear())
  const [branchFilter, setBranchFilter] = usePersistentState<string>('accounting/branch', 'all')

  // Filter once per render — every section pulls from these.
  function inScope(branch: string | null | undefined): boolean {
    return branchFilter === 'all' || branch === branchFilter
  }
  function billingsForYear(y: number) {
    return billings.filter((b) => b.billingMonth.startsWith(String(y)) && inScope(b.room?.branch))
  }
  function expensesForYear(y: number) {
    return expenses.filter((e) => e.expenseDate.startsWith(String(y)) && inScope(e.room?.branch))
  }

  // ---- Monthly income statement matrix (12 columns + Year) ----
  const monthly: MonthTotals[] = useMemo(() => {
    const months = Array.from({ length: 12 }, () => newMonthTotals())
    for (const b of billingsForYear(year)) {
      const m = Number(b.billingMonth.slice(5, 7)) - 1
      if (m < 0 || m > 11) continue
      const ms = months[m]
      const rate = b.exchangeRate || 4100
      ms.rent += b.roomRentUsd
      ms.water += b.waterCostRiel / rate
      ms.electric += b.electricCostRiel / rate
      ms.penalty += b.latePenaltyUsd
      ms.discount += b.discountUsd
      const paid = b.payments.reduce((s, p) => s + p.amountUsd, 0)
      if (b.paymentStatus === 'paid') ms.collected += b.totalUsd
      else {
        ms.collected += Math.min(paid, b.totalUsd)
        ms.outstanding += Math.max(0, b.totalUsd - paid)
      }
    }
    for (const e of expensesForYear(year)) {
      const m = Number(e.expenseDate.slice(5, 7)) - 1
      if (m < 0 || m > 11) continue
      months[m].expensesByCat.set(e.category, (months[m].expensesByCat.get(e.category) ?? 0) + e.amountUsd)
    }
    // Finalize derived fields per month.
    for (const ms of months) {
      ms.netRevenue = ms.rent + ms.water + ms.electric + ms.penalty - ms.discount
      ms.expenseTotal = Array.from(ms.expensesByCat.values()).reduce((s, v) => s + v, 0)
      ms.netIncome = ms.collected - ms.expenseTotal
    }
    return months
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billings, expenses, year, branchFilter])

  // All expense categories that appear in any month of the year — drives the
  // rows of the expense block in the matrix.
  const expenseCategories = useMemo(() => {
    const all = new Set<string>()
    monthly.forEach((m) => m.expensesByCat.forEach((_, k) => all.add(k)))
    return Array.from(all).sort()
  }, [monthly])

  const yearTotals: MonthTotals = useMemo(() => {
    const t = newMonthTotals()
    for (const m of monthly) {
      t.rent += m.rent; t.water += m.water; t.electric += m.electric; t.penalty += m.penalty; t.discount += m.discount
      t.netRevenue += m.netRevenue; t.collected += m.collected; t.outstanding += m.outstanding
      t.expenseTotal += m.expenseTotal; t.netIncome += m.netIncome
      m.expensesByCat.forEach((v, k) => t.expensesByCat.set(k, (t.expensesByCat.get(k) ?? 0) + v))
    }
    return t
  }, [monthly])

  // ---- Quarterly summary + YoY ----
  function quarterTotals(year: number, q: 1 | 2 | 3 | 4) {
    const monthsInQ = q === 1 ? [1, 2, 3] : q === 2 ? [4, 5, 6] : q === 3 ? [7, 8, 9] : [10, 11, 12]
    let billed = 0, collected = 0, outstanding = 0, expensesUsd = 0
    for (const b of billingsForYear(year)) {
      const m = Number(b.billingMonth.slice(5, 7))
      if (!monthsInQ.includes(m)) continue
      billed += b.totalUsd
      const paid = b.payments.reduce((s, p) => s + p.amountUsd, 0)
      if (b.paymentStatus === 'paid') collected += b.totalUsd
      else { collected += Math.min(paid, b.totalUsd); outstanding += Math.max(0, b.totalUsd - paid) }
    }
    for (const e of expensesForYear(year)) {
      const m = Number(e.expenseDate.slice(5, 7))
      if (!monthsInQ.includes(m)) continue
      expensesUsd += e.amountUsd
    }
    return { billed, collected, outstanding, expenses: expensesUsd, net: collected - expensesUsd }
  }
  const quarters = useMemo(() => ([1, 2, 3, 4] as const).map((q) => quarterTotals(year, q)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [billings, expenses, year, branchFilter])
  const prevYearTotals = useMemo(() => {
    let billed = 0, collected = 0, outstanding = 0, expensesUsd = 0
    for (const b of billingsForYear(year - 1)) {
      billed += b.totalUsd
      const paid = b.payments.reduce((s, p) => s + p.amountUsd, 0)
      if (b.paymentStatus === 'paid') collected += b.totalUsd
      else { collected += Math.min(paid, b.totalUsd); outstanding += Math.max(0, b.totalUsd - paid) }
    }
    for (const e of expensesForYear(year - 1)) expensesUsd += e.amountUsd
    return { billed, collected, outstanding, expenses: expensesUsd, net: collected - expensesUsd }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billings, expenses, year, branchFilter])
  const hasPrevYearData = prevYearTotals.billed > 0 || prevYearTotals.expenses > 0
  function yoyPct(current: number, prev: number): number | null {
    if (prev === 0) return null
    return ((current - prev) / Math.abs(prev)) * 100
  }

  // ---- Tenant ledger ----
  const [tenantSearch, setTenantSearch] = useState('')
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const filteredTenants = useMemo(() => {
    const q = tenantSearch.trim().toLowerCase()
    if (!q) return tenants.slice(0, 50)
    return tenants.filter((tn) => tn.fullName.toLowerCase().includes(q) || (tn.room?.roomNumber ?? '').toLowerCase().includes(q)).slice(0, 50)
  }, [tenants, tenantSearch])
  const tenantLedger = useMemo(() => {
    if (!selectedTenantId) return null
    const tenant = tenants.find((tn) => tn.id === selectedTenantId)
    if (!tenant) return null
    const ts = String(year)
    // Opening balance: sum of outstanding from any billing whose month is BEFORE this year.
    // (Use totalUsd − sum(payments) for those billings.)
    const priorBillings = billings.filter((b) => b.tenant?.id === tenant.id && b.billingMonth < ts)
    const openingBalance = priorBillings.reduce((s, b) => {
      const paid = b.payments.reduce((ps, p) => ps + p.amountUsd, 0)
      return s + Math.max(0, b.totalUsd - paid)
    }, 0)
    type Entry = { date: string; kind: 'charge' | 'payment'; description: string; amount: number; balance: number }
    const entries: Entry[] = []
    const yearBillings = billings.filter((b) => b.tenant?.id === tenant.id && b.billingMonth.startsWith(ts))
    for (const b of yearBillings) {
      entries.push({
        date: `${b.billingMonth}-01`,
        kind: 'charge',
        description: `${t('billing_col_month')} ${b.billingMonth}${b.room ? ' · ' + b.room.roomNumber : ''}`,
        amount: b.totalUsd,
        balance: 0,
      })
      for (const p of b.payments) {
        const d = typeof p.createdAt === 'string' ? new Date(p.createdAt) : p.createdAt
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (!ym.startsWith(ts)) continue // payment posted in a different year
        entries.push({
          date: d.toISOString().slice(0, 10),
          kind: 'payment',
          description: `${p.paymentMethod}${p.transactionRef ? ' · ' + p.transactionRef : ''}`,
          amount: -p.amountUsd,
          balance: 0,
        })
      }
    }
    entries.sort((a, b) => a.date.localeCompare(b.date))
    let running = openingBalance
    for (const e of entries) { running += e.amount; e.balance = running }
    const charges = entries.filter((e) => e.kind === 'charge').reduce((s, e) => s + e.amount, 0)
    const payments = -entries.filter((e) => e.kind === 'payment').reduce((s, e) => s + e.amount, 0)
    const closingBalance = running
    return { tenant, openingBalance, entries, charges, payments, closingBalance }
  }, [selectedTenantId, tenants, billings, year, t])

  // ---- Period lock manager ----
  async function setLockState(month: string, lock: boolean) {
    if (!isAdmin) return
    try {
      const res = await fetch(lock ? '/api/period-locks' : `/api/period-locks/${month}`, {
        method: lock ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        ...(lock ? { body: JSON.stringify({ month }) } : {}),
      })
      const data = await res.json()
      if (!data.ok) { toast({ title: data.error ?? 'Error', variant: 'destructive' }); return }
      if (lock) setLocks((prev) => [...prev.filter((l) => l.month !== month), data.lock].sort((a, b) => a.month.localeCompare(b.month)))
      else setLocks((prev) => prev.filter((l) => l.month !== month))
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    }
  }

  // ---- Audit pack PDF ----
  const exportRootRef = useRef<HTMLDivElement | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  async function handleExportAuditPack() {
    if (!exportRootRef.current || exportingPdf) return
    setExportingPdf(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(exportRootRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW
      const imgH = (canvas.height * imgW) / canvas.width
      const branchLabel = branchFilter === 'all' ? t('all_branches') : branchFilter
      pdf.setFontSize(14)
      pdf.text(`${t('accounting_audit_pack')} — ${year}`, 10, 12)
      pdf.setFontSize(9)
      pdf.text(`${branchLabel} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, 10, 18)
      const topMargin = 24
      const usableH = pageH - topMargin - 6
      let remaining = imgH
      let yCanvas = 0
      let positionMm = topMargin
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
        if (remaining > 0) { pdf.addPage(); positionMm = topMargin }
      }
      pdf.save(`audit-pack-${branchLabel}-${year}.pdf`.replace(/[^a-z0-9._-]/gi, '_'))
    } finally { setExportingPdf(false) }
  }

  // Tenant statement PDF (a single-tenant PDF for the selected ledger).
  const ledgerRef = useRef<HTMLDivElement | null>(null)
  async function handleExportTenantStatement() {
    if (!ledgerRef.current || !tenantLedger) return
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])
    const canvas = await html2canvas(ledgerRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const imgW = pageW
    const imgH = (canvas.height * imgW) / canvas.width
    pdf.setFontSize(14)
    pdf.text(`${tenantLedger.tenant.fullName} — ${year}`, 10, 12)
    pdf.setFontSize(9)
    pdf.text(new Date().toISOString().slice(0, 16).replace('T', ' '), 10, 18)
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 24, imgW, imgH)
    pdf.save(`statement-${tenantLedger.tenant.fullName.replace(/\s+/g, '-')}-${year}.pdf`.replace(/[^a-z0-9._-]/gi, '_'))
  }

  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  function catLabel(cat: string) {
    const key = `expense_cat_${cat}` as Parameters<typeof t>[0]
    const v = t(key)
    return v === key ? cat : v
  }
  const lockedSet = useMemo(() => new Set(locks.map((l) => l.month)), [locks])
  const months12 = useMemo(() => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`), [year])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Calculator className="w-6 h-6" /> {t('accounting_title')}</h1>
          <p className="text-muted-foreground text-sm">{t('accounting_subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            {branchOptions.map((b) => (
              <Button key={b} size="sm" variant={branchFilter === b ? 'default' : 'outline'} className="h-10 px-3 text-xs sm:text-sm" onClick={() => setBranchFilter(b)}>
                {b === 'all' ? t('all') : b}
              </Button>
            ))}
          </div>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-32 h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" className="h-10" onClick={handleExportAuditPack} disabled={exportingPdf}>
            <FileText className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('accounting_audit_pack')}</span>
          </Button>
        </div>
      </div>

      <div ref={exportRootRef} className="space-y-6 bg-background">
        {/* Annual income statement */}
        <Card>
          <CardHeader><CardTitle className="text-base">{t('accounting_income_statement_annual')} — {year}</CardTitle></CardHeader>
          <TableScroll>
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-48">&nbsp;</th>
                  {MONTH_LABELS.map((m) => <th key={m} className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">{m}</th>)}
                  <th className="text-right px-3 py-2 text-xs font-semibold">{t('accounting_year_total')}</th>
                </tr>
              </thead>
              <tbody>
                <MatrixRow label={t('reports_revenue_room_rent')} values={monthly.map((m) => m.rent)} total={yearTotals.rent} />
                <MatrixRow label={t('reports_revenue_water')} values={monthly.map((m) => m.water)} total={yearTotals.water} />
                <MatrixRow label={t('reports_revenue_electric')} values={monthly.map((m) => m.electric)} total={yearTotals.electric} />
                <MatrixRow label={t('reports_revenue_penalty')} values={monthly.map((m) => m.penalty)} total={yearTotals.penalty} />
                <MatrixRow label={t('reports_revenue_discount')} values={monthly.map((m) => -m.discount)} total={-yearTotals.discount} muted />
                <MatrixRow label={t('reports_net_revenue')} values={monthly.map((m) => m.netRevenue)} total={yearTotals.netRevenue} bold border />
                <MatrixRow label={t('reports_of_which_collected')} values={monthly.map((m) => m.collected)} total={yearTotals.collected} muted />
                <MatrixRow label={t('reports_of_which_outstanding')} values={monthly.map((m) => m.outstanding)} total={yearTotals.outstanding} muted />
                <tr><td colSpan={14} className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('reports_total_expenses')}</td></tr>
                {expenseCategories.map((cat) => (
                  <MatrixRow
                    key={cat}
                    label={catLabel(cat)}
                    values={monthly.map((m) => m.expensesByCat.get(cat) ?? 0)}
                    total={yearTotals.expensesByCat.get(cat) ?? 0}
                    indent
                  />
                ))}
                <MatrixRow label={t('reports_total_expenses')} values={monthly.map((m) => m.expenseTotal)} total={yearTotals.expenseTotal} bold border />
                <MatrixRow label={t('reports_net_income')} values={monthly.map((m) => m.netIncome)} total={yearTotals.netIncome} bold border highlight />
              </tbody>
            </table>
          </TableScroll>
        </Card>

        {/* Quarterly summary */}
        <Card>
          <CardHeader><CardTitle className="text-base">{t('accounting_quarterly_summary')} — {year}</CardTitle></CardHeader>
          <TableScroll>
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">&nbsp;</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">{t('accounting_quarter_q1')}</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">{t('accounting_quarter_q2')}</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">{t('accounting_quarter_q3')}</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">{t('accounting_quarter_q4')}</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold">{t('accounting_year_total')}</th>
                  {hasPrevYearData && <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">{t('accounting_yoy')}</th>}
                </tr>
              </thead>
              <tbody>
                {([
                  { label: t('reports_revenue_billed'), values: quarters.map((q) => q.billed), year: yearTotals.netRevenue, prev: prevYearTotals.billed, bold: false },
                  { label: t('reports_revenue_collected'), values: quarters.map((q) => q.collected), year: yearTotals.collected, prev: prevYearTotals.collected, bold: false },
                  { label: t('reports_outstanding'), values: quarters.map((q) => q.outstanding), year: yearTotals.outstanding, prev: prevYearTotals.outstanding, bold: false },
                  { label: t('reports_total_expenses'), values: quarters.map((q) => q.expenses), year: yearTotals.expenseTotal, prev: prevYearTotals.expenses, bold: false },
                  { label: t('reports_net_income'), values: quarters.map((q) => q.net), year: yearTotals.netIncome, prev: prevYearTotals.net, bold: true },
                ] as const).map((row) => {
                  const delta = hasPrevYearData ? yoyPct(row.year, row.prev) : null
                  return (
                    <tr key={row.label} className="border-b border-border last:border-0">
                      <td className={cn('px-3 py-2', row.bold && 'font-semibold')}>{row.label}</td>
                      {row.values.map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{formatCurrency(v)}</td>)}
                      <td className={cn('px-3 py-2 text-right tabular-nums', row.bold && 'font-bold')}>{formatCurrency(row.year)}</td>
                      {hasPrevYearData && (
                        <td className={cn('px-3 py-2 text-right text-xs tabular-nums', delta === null ? 'text-muted-foreground' : delta >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                          {delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>
        </Card>

        {/* Tenant ledger */}
        <Card>
          <CardHeader><CardTitle className="text-base">{t('accounting_tenant_ledger')} — {year}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder={t('accounting_search_tenant')} className="pl-9" value={tenantSearch} onChange={(e) => setTenantSearch(e.target.value)} />
                </div>
                <ul className="max-h-72 overflow-auto border border-border rounded-lg divide-y divide-border">
                  {filteredTenants.map((tn) => (
                    <li key={tn.id}>
                      <button
                        type="button"
                        className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted/50', selectedTenantId === tn.id && 'bg-primary/10 font-semibold')}
                        onClick={() => setSelectedTenantId(tn.id)}
                      >
                        {tn.fullName}
                        {tn.room && <span className="text-xs text-muted-foreground ml-1.5">· {tn.room.roomNumber}</span>}
                      </button>
                    </li>
                  ))}
                  {filteredTenants.length === 0 && (
                    <li className="px-3 py-4 text-sm text-center text-muted-foreground">—</li>
                  )}
                </ul>
              </div>
              <div className="md:col-span-2">
                {!tenantLedger ? (
                  <div className="text-center text-sm text-muted-foreground py-16 border border-dashed border-border rounded-lg">{t('accounting_pick_tenant')}</div>
                ) : (
                  <div ref={ledgerRef} className="space-y-3 bg-background">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p className="font-semibold text-base">{tenantLedger.tenant.fullName}</p>
                        {tenantLedger.tenant.room && <p className="text-xs text-muted-foreground">{tenantLedger.tenant.room.roomNumber} · {tenantLedger.tenant.room.branch}</p>}
                      </div>
                      <Button size="sm" variant="outline" onClick={handleExportTenantStatement}>
                        <FileText className="w-3.5 h-3.5 mr-1.5" />{t('accounting_download_statement')}
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 bg-muted/40 rounded">
                        <p className="text-muted-foreground">{t('accounting_opening_balance')}</p>
                        <p className="font-semibold tabular-nums">{formatCurrency(tenantLedger.openingBalance)}</p>
                      </div>
                      <div className="p-2 bg-muted/40 rounded">
                        <p className="text-muted-foreground">{t('accounting_period_charges')}</p>
                        <p className="font-semibold tabular-nums">{formatCurrency(tenantLedger.charges)}</p>
                      </div>
                      <div className="p-2 bg-muted/40 rounded">
                        <p className="text-muted-foreground">{t('accounting_period_payments')}</p>
                        <p className="font-semibold tabular-nums text-emerald-600">{formatCurrency(tenantLedger.payments)}</p>
                      </div>
                      <div className={cn('p-2 rounded', tenantLedger.closingBalance > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20')}>
                        <p className="text-muted-foreground">{t('accounting_closing_balance')}</p>
                        <p className="font-bold tabular-nums">{formatCurrency(tenantLedger.closingBalance)}</p>
                      </div>
                    </div>
                    <TableScroll>
                      <table className="w-full min-w-[560px] text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{t('expenses_col_date')}</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">&nbsp;</th>
                            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">{t('accounting_ledger_charge')}</th>
                            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">{t('accounting_ledger_payment')}</th>
                            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">{t('accounting_ledger_balance')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-border text-muted-foreground">
                            <td className="px-3 py-1.5 font-mono text-xs">{year}-01-01</td>
                            <td className="px-3 py-1.5 italic text-xs">{t('accounting_opening_balance')}</td>
                            <td className="px-3 py-1.5 text-right">—</td>
                            <td className="px-3 py-1.5 text-right">—</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(tenantLedger.openingBalance)}</td>
                          </tr>
                          {tenantLedger.entries.map((e, i) => (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{e.date}</td>
                              <td className="px-3 py-1.5">{e.description}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{e.kind === 'charge' ? formatCurrency(e.amount) : '—'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">{e.kind === 'payment' ? formatCurrency(-e.amount) : '—'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatCurrency(e.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableScroll>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Period lock manager */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('accounting_period_lock')} — {year}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{t('accounting_period_lock_help')}</p>
          </CardHeader>
          <TableScroll>
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">&nbsp;</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">&nbsp;</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{t('accounting_locked_on')}</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{t('accounting_locked_by')}</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {months12.map((m, i) => {
                  const lock = locks.find((l) => l.month === m)
                  const locked = !!lock
                  return (
                    <tr key={m} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">{m}</td>
                      <td className="px-3 py-2">
                        {locked ? (
                          <Badge variant="error" className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> {t('accounting_locked')}</Badge>
                        ) : (
                          <Badge variant="success" className="inline-flex items-center gap-1"><LockOpen className="w-3 h-3" /> {t('accounting_open')}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{lock ? new Date(lock.lockedAt).toISOString().slice(0, 10) : '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{lock?.lockedBy?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {isAdmin && (
                          <Button size="sm" variant={locked ? 'outline' : 'default'} onClick={() => setLockState(m, !locked)}>
                            {locked ? t('accounting_unlock') : t('accounting_lock')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      </div>
    </div>
  )
}

function MatrixRow({ label, values, total, bold, muted, border, highlight, indent }: {
  label: string
  values: number[]
  total: number
  bold?: boolean
  muted?: boolean
  border?: boolean
  highlight?: boolean
  indent?: boolean
}) {
  return (
    <tr className={cn(
      'border-b border-border last:border-0',
      border && 'border-t-2 border-t-border',
      highlight && (total >= 0 ? 'bg-emerald-50/40 dark:bg-emerald-900/10' : 'bg-red-50/40 dark:bg-red-900/10'),
    )}>
      <td className={cn('px-3 py-1.5', bold && 'font-semibold', muted && 'text-muted-foreground', indent && 'pl-6 text-muted-foreground')}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={cn('px-2 py-1.5 text-right tabular-nums', muted && 'text-muted-foreground', bold && 'font-semibold')}>
          {v === 0 ? <span className="text-muted-foreground/40">·</span> : formatCurrency(v)}
        </td>
      ))}
      <td className={cn('px-3 py-1.5 text-right tabular-nums', bold ? 'font-bold' : 'font-medium', muted && 'text-muted-foreground')}>
        {formatCurrency(total)}
      </td>
    </tr>
  )
}
