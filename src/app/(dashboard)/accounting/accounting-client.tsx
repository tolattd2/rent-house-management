'use client'

import { Fragment, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TableScroll } from '@/components/ui/table-scroll'
import { SortableTh, type SortDir } from '@/components/ui/sortable-th'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, groupByBranch, cn } from '@/lib/utils'
import { Calculator, FileText, Lock, LockOpen, Search, X } from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'
import { useBranches } from '@/contexts/branches-context'
import { useBranding } from '@/contexts/branding-context'
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
  status: string
  depositAmount: number
  moveInDate: string
  moveOutDate: string
  room: { roomNumber: string; branch: string } | null
}

type Lock = {
  id: string; month: string; lockedAt: Date | string; notes: string
  lockedBy: { id: string; name: string } | null
}

interface Props { billings: Billing[]; expenses: Expense[]; tenants: Tenant[]; locks: Lock[] }

const NONE_YEAR = '__none__'

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
  const canExport = session?.user?.role ? session.user.role !== 'guest' : false
  const { t } = useLanguage()
  const { title, subtitle } = useBranding()
  const branchOptions = ['all', ...useBranches().map((b) => b.name)]
  const [locks, setLocks] = useState<Lock[]>(initialLocks)

  // Year-range + branch state.
  const currentYear = new Date().getFullYear()
  const years = useMemo(() => {
    const set = new Set<number>()
    billings.forEach((b) => { const y = Number(b.billingMonth.slice(0, 4)); if (Number.isFinite(y)) set.add(y) })
    expenses.forEach((e) => { const y = Number(e.expenseDate.slice(0, 4)); if (Number.isFinite(y)) set.add(y) })
    set.add(currentYear)
    return Array.from(set).sort((a, b) => b - a)
  }, [billings, expenses, currentYear])
  // Two ways to choose the period (mirrors the Reports page's single-month +
  // month-range pattern): a single Year picker, plus an optional From→To year
  // range. When the range is set it overrides the single year; rangeFrom/To of
  // 0 means "unset" so the single year applies.
  const [year, setYear] = usePersistentState<number>('accounting/year', currentYear)
  const [rangeFrom, setRangeFrom] = usePersistentState<number>('accounting/rangeFrom', 0)
  const [rangeTo, setRangeTo] = usePersistentState<number>('accounting/rangeTo', 0)
  const [branchFilter, setBranchFilter] = usePersistentState<string>('accounting/branch', 'all')
  const rangeActive = rangeFrom > 0 && rangeTo > 0
  const fromYear = rangeActive ? Math.min(rangeFrom, rangeTo) : year
  const toYear = rangeActive ? Math.max(rangeFrom, rangeTo) : year
  const isSingleYear = fromYear === toYear
  const yearsInRange = useMemo(
    () => Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i),
    [fromYear, toYear],
  )
  // Picking a single year clears any active range; setting a range leaves the
  // single year untouched but overridden until the range is cleared.
  function pickYear(y: number) { setYear(y); setRangeFrom(0); setRangeTo(0) }
  function clearRange() { setRangeFrom(0); setRangeTo(0) }

  // Filter once per render — every section pulls from these.
  function inScope(branch: string | null | undefined): boolean {
    return branchFilter === 'all' || branch === branchFilter
  }
  function inRange(ym: string): boolean {
    const y = Number(ym.slice(0, 4))
    return y >= fromYear && y <= toYear
  }
  function billingsInRange() {
    return billings.filter((b) => inRange(b.billingMonth) && inScope(b.room?.branch))
  }
  function expensesInRange() {
    return expenses.filter((e) => inRange(e.expenseDate.slice(0, 7)) && inScope(e.room?.branch))
  }

  // Accumulate one income-statement column over the billings/expenses whose
  // period (YYYY-MM) matches the predicate. Used for both the monthly columns
  // (single year) and the per-year columns (multi-year range).
  function computeTotals(matches: (ym: string) => boolean): MonthTotals {
    const tot = newMonthTotals()
    for (const b of billings) {
      if (!inScope(b.room?.branch) || !matches(b.billingMonth)) continue
      const rate = b.exchangeRate || 4100
      tot.rent += b.roomRentUsd
      tot.water += b.waterCostRiel / rate
      tot.electric += b.electricCostRiel / rate
      tot.penalty += b.latePenaltyUsd
      tot.discount += b.discountUsd
      const paid = b.payments.reduce((s, p) => s + p.amountUsd, 0)
      if (b.paymentStatus === 'paid') tot.collected += b.totalUsd
      else {
        tot.collected += Math.min(paid, b.totalUsd)
        tot.outstanding += Math.max(0, b.totalUsd - paid)
      }
    }
    for (const e of expenses) {
      if (!inScope(e.room?.branch) || !matches(e.expenseDate.slice(0, 7))) continue
      tot.expensesByCat.set(e.category, (tot.expensesByCat.get(e.category) ?? 0) + e.amountUsd)
    }
    tot.netRevenue = tot.rent + tot.water + tot.electric + tot.penalty - tot.discount
    tot.expenseTotal = Array.from(tot.expensesByCat.values()).reduce((s, v) => s + v, 0)
    tot.netIncome = tot.collected - tot.expenseTotal
    return tot
  }

  // ---- Income statement matrix columns ----
  // Single year → 12 monthly columns (Jan–Dec). Multi-year → one column/year.
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const columns = useMemo(() => {
    if (isSingleYear) {
      return MONTH_LABELS.map((label, i) => ({ label, prefix: `${fromYear}-${String(i + 1).padStart(2, '0')}` }))
    }
    return yearsInRange.map((y) => ({ label: String(y), prefix: String(y) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSingleYear, fromYear, yearsInRange])

  const columnTotals = useMemo(
    () => columns.map((c) => computeTotals((ym) => ym.startsWith(c.prefix))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, billings, expenses, branchFilter],
  )
  const rangeTotals = useMemo(
    () => computeTotals(inRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [billings, expenses, fromYear, toYear, branchFilter],
  )
  const expenseCategories = useMemo(() => {
    const all = new Set<string>()
    columnTotals.forEach((c) => c.expensesByCat.forEach((_, k) => all.add(k)))
    rangeTotals.expensesByCat.forEach((_, k) => all.add(k))
    return Array.from(all).sort()
  }, [columnTotals, rangeTotals])

  // ---- Quarterly summary + YoY (single year only) ----
  function quarterTotals(y: number, q: 1 | 2 | 3 | 4) {
    const monthsInQ = q === 1 ? [1, 2, 3] : q === 2 ? [4, 5, 6] : q === 3 ? [7, 8, 9] : [10, 11, 12]
    let billed = 0, collected = 0, outstanding = 0, expensesUsd = 0
    for (const b of billings) {
      if (!inScope(b.room?.branch) || !b.billingMonth.startsWith(String(y))) continue
      const m = Number(b.billingMonth.slice(5, 7))
      if (!monthsInQ.includes(m)) continue
      billed += b.totalUsd
      const paid = b.payments.reduce((s, p) => s + p.amountUsd, 0)
      if (b.paymentStatus === 'paid') collected += b.totalUsd
      else { collected += Math.min(paid, b.totalUsd); outstanding += Math.max(0, b.totalUsd - paid) }
    }
    for (const e of expenses) {
      if (!inScope(e.room?.branch) || !e.expenseDate.startsWith(String(y))) continue
      const m = Number(e.expenseDate.slice(5, 7))
      if (!monthsInQ.includes(m)) continue
      expensesUsd += e.amountUsd
    }
    return { billed, collected, outstanding, expenses: expensesUsd, net: collected - expensesUsd }
  }
  const quarters = useMemo(() => ([1, 2, 3, 4] as const).map((q) => quarterTotals(fromYear, q)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [billings, expenses, fromYear, branchFilter])
  const prevYearTotals = useMemo(() => computeTotals((ym) => ym.startsWith(String(fromYear - 1))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [billings, expenses, fromYear, branchFilter])
  const hasPrevYearData = prevYearTotals.netRevenue !== 0 || prevYearTotals.expenseTotal !== 0
  function yoyPct(current: number, prev: number): number | null {
    if (prev === 0) return null
    return ((current - prev) / Math.abs(prev)) * 100
  }

  // ---- Balance Sheet snapshot ----
  // Cutoff = end of the "to" year (or today if that year is current/future), so
  // the snapshot reflects live data without future-dating.
  const todayStr = new Date().toISOString().slice(0, 10)
  const balanceSheetCutoff = useMemo(() => {
    if (toYear < currentYear) return `${toYear}-12-31`
    return todayStr
  }, [toYear, currentYear, todayStr])
  const cutoffYearMonth = balanceSheetCutoff.slice(0, 7)

  // Period span shown on each statement header. The range runs from Jan 1 of
  // the "from" year to the end of the "to" year (or today if it's current).
  const periodStart = `${fromYear}-01-01`
  const periodEnd = balanceSheetCutoff
  const periodIsToDate = toYear >= currentYear
  const periodLabel = `${periodIsToDate ? t('accounting_year_to_date') : t('accounting_for_period')}: ${periodStart} → ${periodEnd}`
  // Short label for PDF filenames / titles.
  const rangeLabel = isSingleYear ? String(fromYear) : `${fromYear}-${toYear}`

  const balanceSheet = useMemo(() => {
    // Accounts Receivable: outstanding USD on every unpaid/partial billing
    // whose month is <= cutoff month, ignoring payments dated after cutoff.
    let accountsReceivable = 0
    for (const b of billings) {
      if (!inScope(b.room?.branch)) continue
      if (b.billingMonth > cutoffYearMonth) continue
      const paidByCutoff = b.payments.reduce((s, p) => {
        const d = typeof p.createdAt === 'string' ? new Date(p.createdAt) : p.createdAt
        return d.toISOString().slice(0, 10) <= balanceSheetCutoff ? s + p.amountUsd : s
      }, 0)
      accountsReceivable += Math.max(0, b.totalUsd - paidByCutoff)
    }
    // Net Cash Position (derived): all payments collected through cutoff
    // minus all expenses paid through cutoff. Not a true cash account.
    let lifetimeReceipts = 0
    for (const b of billings) {
      if (!inScope(b.room?.branch)) continue
      for (const p of b.payments) {
        const d = typeof p.createdAt === 'string' ? new Date(p.createdAt) : p.createdAt
        if (d.toISOString().slice(0, 10) <= balanceSheetCutoff) lifetimeReceipts += p.amountUsd
      }
    }
    let lifetimeExpenses = 0
    for (const e of expenses) {
      if (!inScope(e.room?.branch)) continue
      if (e.expenseDate <= balanceSheetCutoff) lifetimeExpenses += e.amountUsd
    }
    const netCash = lifetimeReceipts - lifetimeExpenses
    // Security Deposits liability: every active tenant in scope.
    const activeDeposits = tenants.filter((tn) => tn.status === 'active' && (branchFilter === 'all' || tn.room?.branch === branchFilter))
    const securityDeposits = activeDeposits.reduce((s, tn) => s + tn.depositAmount, 0)
    const totalAssets = accountsReceivable + netCash
    const totalLiabilities = securityDeposits
    const retainedEarnings = totalAssets - totalLiabilities
    return { accountsReceivable, netCash, totalAssets, securityDeposits, totalLiabilities, retainedEarnings, activeDeposits }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billings, expenses, tenants, balanceSheetCutoff, cutoffYearMonth, branchFilter])

  // ---- Cash Flow Statement over the selected year range ----
  const cashFlow = useMemo(() => {
    let rentalReceipts = 0
    for (const b of billings) {
      if (!inScope(b.room?.branch)) continue
      for (const p of b.payments) {
        const d = typeof p.createdAt === 'string' ? new Date(p.createdAt) : p.createdAt
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (inRange(ym)) rentalReceipts += p.amountUsd
      }
    }
    const operatingExpenses = expensesInRange().reduce((s, e) => s + e.amountUsd, 0)
    const netOperating = rentalReceipts - operatingExpenses
    // Deposits received/refunded: tenants whose move-in / move-out falls in range.
    const inScopeTenants = tenants.filter((tn) => branchFilter === 'all' || tn.room?.branch === branchFilter)
    const depositsReceived = inScopeTenants
      .filter((tn) => tn.moveInDate && inRange(tn.moveInDate.slice(0, 7)))
      .reduce((s, tn) => s + tn.depositAmount, 0)
    const depositsRefunded = inScopeTenants
      .filter((tn) => tn.moveOutDate && inRange(tn.moveOutDate.slice(0, 7)))
      .reduce((s, tn) => s + tn.depositAmount, 0)
    const netDeposits = depositsReceived - depositsRefunded
    return {
      rentalReceipts, operatingExpenses, netOperating,
      depositsReceived, depositsRefunded, netDeposits,
      netChange: netOperating + netDeposits,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billings, expenses, tenants, fromYear, toYear, branchFilter])

  // ---- Tenant ledger ----
  const [tenantSearch, setTenantSearch] = useState('')
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const [tenantScope, setTenantScope] = usePersistentState<'active' | 'all'>('accounting/tenantScope', 'active')
  const filteredTenants = useMemo(() => {
    const q = tenantSearch.trim().toLowerCase()
    return tenants.filter((tn) => {
      if (tenantScope === 'active' && tn.status !== 'active') return false
      if (!q) return true
      return tn.fullName.toLowerCase().includes(q) || (tn.room?.roomNumber ?? '').toLowerCase().includes(q)
    })
  }, [tenants, tenantSearch, tenantScope])
  // Tenant picker grouped by branch (consistent with the other tables).
  const tenantPickerGroups = useMemo(
    () => groupByBranch(filteredTenants.map((tn) => ({ ...tn, roomNumber: tn.room?.roomNumber ?? '', branch: tn.room?.branch ?? '' }))),
    [filteredTenants],
  )
  const tenantLedger = useMemo(() => {
    if (!selectedTenantId) return null
    const tenant = tenants.find((tn) => tn.id === selectedTenantId)
    if (!tenant) return null
    const fromStr = String(fromYear)
    // Opening balance: sum of outstanding from any billing whose month is
    // BEFORE the start of the range. (totalUsd − sum(payments) for those.)
    const priorBillings = billings.filter((b) => b.tenant?.id === tenant.id && b.billingMonth < fromStr)
    const openingBalance = priorBillings.reduce((s, b) => {
      const paid = b.payments.reduce((ps, p) => ps + p.amountUsd, 0)
      return s + Math.max(0, b.totalUsd - paid)
    }, 0)
    type Entry = { date: string; kind: 'charge' | 'payment'; description: string; amount: number; balance: number }
    const entries: Entry[] = []
    const rangeBillings = billings.filter((b) => b.tenant?.id === tenant.id && inRange(b.billingMonth))
    for (const b of rangeBillings) {
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
        if (!inRange(ym)) continue // payment posted outside the range
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenantId, tenants, billings, fromYear, toYear, t])

  // ---- Period lock manager ----
  async function setLockState(month: string, lock: boolean) {
    if (!isAdmin) return
    try {
      const res = await fetch(lock ? '/api/period-locks' : `/api/period-locks/${month}`, {
        method: lock ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        ...(lock ? { body: JSON.stringify({ month }) } : {}),
      })
      const text = await res.text()
      let data: { ok?: boolean; error?: string; lock?: Lock } = {}
      try { data = text ? JSON.parse(text) : {} } catch { /* non-JSON body */ }
      if (!res.ok || !data.ok) {
        toast({
          title: data.error ?? `Server returned ${res.status}${text ? `: ${text.slice(0, 140)}` : ''}`,
          variant: 'destructive',
        })
        return
      }
      if (lock && data.lock) setLocks((prev) => [...prev.filter((l) => l.month !== month), data.lock as Lock].sort((a, b) => a.month.localeCompare(b.month)))
      else if (!lock) setLocks((prev) => prev.filter((l) => l.month !== month))
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    }
  }

  // ---- Audit pack PDF ----
  // Rendered from a dedicated, print-styled HTML document (auditDocRef) rather
  // than the live dashboard. The browser shapes Khmer correctly, so the PDF
  // supports both languages; the template uses clean white-paper styling so it
  // reads like a financial statement set, not a web capture.
  const auditDocRef = useRef<HTMLDivElement | null>(null)
  const tenantDocRef = useRef<HTMLDivElement | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const branchLabelText = branchFilter === 'all' ? t('all_branches') : branchFilter

  // Shared, high-quality PDF renderer used by both the Audit Pack and the
  // Tenant Statement: captures a print-styled HTML document at high resolution
  // (crisp text + correct Khmer shaping), then paginates onto A4 with margins,
  // breaking BETWEEN blocks rather than through a line. JPEG + stream
  // compression keep the file small.
  async function renderDocToPdf(el: HTMLElement, filename: string) {
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])
    const SCALE = 4
    const canvas = await html2canvas(el, { scale: SCALE, backgroundColor: '#ffffff', useCORS: true, windowWidth: el.scrollWidth })
    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4', compress: true })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const MT = 34, MB = 34
    const cpx = canvas.width / pageW
    const pageContentPx = (pageH - MT - MB) * cpx
    const docTop = el.getBoundingClientRect().top
    const ratio = canvas.height / el.scrollHeight
    const bounds = Array.from(el.children).map((c) => {
      const r = (c as HTMLElement).getBoundingClientRect()
      return { top: (r.top - docTop) * ratio, bottom: (r.bottom - docTop) * ratio }
    })
    const slices: { start: number; h: number }[] = []
    const H = canvas.height
    let start = 0
    let guard = 0
    while (start < H - 1 && guard++ < 4000) {
      let end = Math.min(start + pageContentPx, H)
      if (end < H) {
        let cut = end
        for (const b of bounds) {
          if (b.top > start + 1 && b.top < end - 1 && b.bottom > end + 1) cut = Math.min(cut, b.top)
        }
        if (cut > start + 1) end = cut
      }
      slices.push({ start, h: end - start })
      start = end
    }
    slices.forEach((s, i) => {
      const band = document.createElement('canvas')
      band.width = canvas.width
      band.height = Math.ceil(s.h)
      const ctx = band.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, band.width, band.height)
      ctx.drawImage(canvas, 0, s.start, canvas.width, s.h, 0, 0, canvas.width, s.h)
      if (i > 0) pdf.addPage()
      pdf.addImage(band.toDataURL('image/jpeg', 0.85), 'JPEG', 0, MT, pageW, s.h / cpx, undefined, 'FAST')
    })
    pdf.save(filename.replace(/[^a-z0-9._-]/gi, '_'))
  }

  async function handleExportAuditPack() {
    if (!auditDocRef.current || exportingPdf) return
    setExportingPdf(true)
    try {
      await renderDocToPdf(auditDocRef.current, `audit-pack-${branchLabelText}-${rangeLabel}.pdf`)
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'PDF export failed', variant: 'destructive' })
    } finally {
      setExportingPdf(false)
    }
  }

  async function handleExportTenantStatement() {
    if (!tenantDocRef.current || !tenantLedger || exportingPdf) return
    setExportingPdf(true)
    try {
      await renderDocToPdf(tenantDocRef.current, `statement-${tenantLedger.tenant.fullName.replace(/\s+/g, '-')}-${rangeLabel}.pdf`)
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'PDF export failed', variant: 'destructive' })
    } finally {
      setExportingPdf(false)
    }
  }

  function catLabel(cat: string) {
    const key = `expense_cat_${cat}` as Parameters<typeof t>[0]
    const v = t(key)
    return v === key ? cat : v
  }
  // Security Deposits Schedule grouped by branch, with sortable columns within
  // each group (mirrors the Reports billing-detail layout).
  type DepSortKey = 'tenant' | 'room' | 'moveIn' | 'deposit'
  const [depSort, setDepSort] = useState<{ key: DepSortKey; dir: SortDir }>({ key: 'tenant', dir: 'asc' })
  const toggleDepSort = (k: DepSortKey) => setDepSort((s) => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const depositGroups = useMemo(() => {
    const mapped = balanceSheet.activeDeposits.map((tn) => ({
      ...tn,
      roomNumber: tn.room?.roomNumber ?? '',
      branch: tn.room?.branch ?? '',
    }))
    const sign = depSort.dir === 'asc' ? 1 : -1
    return groupByBranch(mapped).map((g) => ({
      branch: g.branch,
      subtotal: g.items.reduce((s, t) => s + t.depositAmount, 0),
      items: [...g.items].sort((a, b) => {
        switch (depSort.key) {
          case 'tenant': return sign * a.fullName.localeCompare(b.fullName)
          case 'room': return sign * a.roomNumber.localeCompare(b.roomNumber)
          case 'moveIn': return sign * (a.moveInDate || '').localeCompare(b.moveInDate || '')
          case 'deposit': return sign * (a.depositAmount - b.depositAmount)
        }
      }),
    }))
  }, [balanceSheet.activeDeposits, depSort])

  // Period-lock manager lists every month across the selected year range.
  const lockMonths = useMemo(() => {
    const out: string[] = []
    for (const y of yearsInRange) {
      for (let m = 1; m <= 12; m++) out.push(`${y}-${String(m).padStart(2, '0')}`)
    }
    return out
  }, [yearsInRange])

  // ---- Audit Pack print-template helpers (plain functions returning JSX so
  // they stay independent of the app theme / dark mode). ----
  const generatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ')
  type DocRowOpts = { indent?: boolean; bold?: boolean; muted?: boolean; rule?: boolean; doubleRule?: boolean; red?: boolean }
  function docRow(key: string, label: string, value: number | string, o: DocRowOpts = {}) {
    return (
      <div key={key} style={{
        display: 'flex', justifyContent: 'space-between', gap: 16, padding: '3px 0',
        paddingLeft: o.indent ? 18 : 0,
        fontWeight: o.bold ? 700 : 400,
        color: o.red ? '#dc2626' : o.muted ? '#6b7280' : '#111827',
        borderTop: o.doubleRule ? '3px double #9ca3af' : o.rule ? '1px solid #d1d5db' : undefined,
        marginTop: o.rule || o.doubleRule ? 4 : 0,
      }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {typeof value === 'number' ? formatCurrency(value) : value}
        </span>
      </div>
    )
  }
  function docSection(key: string, label: string) {
    return <div key={key} style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: 0.6, margin: '16px 0 4px' }}>{label}</div>
  }
  function docStmtTitle(title1: string, sub?: string) {
    return (
      <div style={{ margin: '26px 0 8px', borderBottom: '1px solid #e5e7eb', paddingBottom: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{title1}</div>
        {sub && <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{sub}</div>}
      </div>
    )
  }
  const thStyle: React.CSSProperties = { textAlign: 'left', padding: '6px 6px', fontSize: 10, color: '#6b7280', borderBottom: '1px solid #d1d5db', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }
  const tdStyle: React.CSSProperties = { padding: '5px 6px', borderBottom: '1px solid #f0f1f3' }

  // Full month-by-month income statement matrix for the audit-pack PDF. Mirrors
  // the on-screen table but with a compact font so all 12 months + Total fit the
  // fixed 760px export page.
  type MatrixDocRow = { label: string; values: number[]; total: number; bold?: boolean; muted?: boolean; rule?: boolean; double?: boolean; indent?: boolean; highlight?: boolean }
  function docMatrix() {
    const headTh: React.CSSProperties = { fontSize: 7, color: '#6b7280', borderBottom: '1px solid #d1d5db', fontWeight: 700, padding: '4px 2px', textAlign: 'right', whiteSpace: 'nowrap' }
    const cell: React.CSSProperties = { fontSize: 7, padding: '2px 2px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
    const revenueRows: MatrixDocRow[] = [
      { label: t('reports_revenue_room_rent'), values: columnTotals.map((m) => m.rent), total: rangeTotals.rent },
      { label: t('reports_revenue_water'), values: columnTotals.map((m) => m.water), total: rangeTotals.water },
      { label: t('reports_revenue_electric'), values: columnTotals.map((m) => m.electric), total: rangeTotals.electric },
      { label: t('reports_revenue_penalty'), values: columnTotals.map((m) => m.penalty), total: rangeTotals.penalty },
      { label: t('reports_revenue_discount'), values: columnTotals.map((m) => -m.discount), total: -rangeTotals.discount, muted: true },
      { label: t('reports_net_revenue'), values: columnTotals.map((m) => m.netRevenue), total: rangeTotals.netRevenue, bold: true, rule: true },
      { label: t('reports_of_which_collected'), values: columnTotals.map((m) => m.collected), total: rangeTotals.collected, muted: true },
      { label: t('reports_of_which_outstanding'), values: columnTotals.map((m) => m.outstanding), total: rangeTotals.outstanding, muted: true },
    ]
    const expenseRows: MatrixDocRow[] = expenseCategories.map((cat) => ({ label: catLabel(cat), values: columnTotals.map((m) => m.expensesByCat.get(cat) ?? 0), total: rangeTotals.expensesByCat.get(cat) ?? 0, indent: true }))
    const totalRows: MatrixDocRow[] = [
      { label: t('reports_total_expenses'), values: columnTotals.map((m) => m.expenseTotal), total: rangeTotals.expenseTotal, bold: true, rule: true },
      { label: t('reports_net_income'), values: columnTotals.map((m) => m.netIncome), total: rangeTotals.netIncome, bold: true, double: true, highlight: true },
    ]
    const renderRow = (r: MatrixDocRow, key: string) => {
      const bg = r.highlight ? (r.total >= 0 ? '#ecfdf5' : '#fef2f2') : undefined
      const rule = r.double ? '3px double #9ca3af' : r.rule ? '1px solid #d1d5db' : undefined
      const base: React.CSSProperties = { ...cell, color: r.muted ? '#6b7280' : '#111827', fontWeight: r.bold ? 700 : 400, background: bg, borderTop: rule }
      return (
        <tr key={key}>
          <td style={{ ...base, textAlign: 'left', whiteSpace: 'normal', paddingLeft: r.indent ? 12 : 2 }}>{r.label}</td>
          {r.values.map((v, i) => <td key={i} style={base}>{v === 0 ? '·' : fmtMatrixNum(v)}</td>)}
          <td style={{ ...base, fontWeight: 700 }}>{fmtMatrixNum(r.total)}</td>
        </tr>
      )
    }
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: 6 }}>
        <colgroup>
          <col style={{ width: '13%' }} />
          {columns.map((c) => <col key={c.prefix} />)}
          <col />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...headTh, textAlign: 'left' }}>&nbsp;</th>
            {columns.map((c) => <th key={c.prefix} style={headTh}>{c.label}</th>)}
            <th style={{ ...headTh, color: '#111827' }}>{t('accounting_total')}</th>
          </tr>
        </thead>
        <tbody>
          {revenueRows.map((r, i) => renderRow(r, `rev-${i}`))}
          <tr>
            <td colSpan={columns.length + 2} style={{ fontSize: 7, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: 0.4, padding: '6px 2px 2px' }}>{t('reports_total_expenses')}</td>
          </tr>
          {expenseRows.map((r, i) => renderRow(r, `exp-${i}`))}
          {totalRows.map((r, i) => renderRow(r, `tot-${i}`))}
        </tbody>
      </table>
    )
  }

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
          {/* Single-year quick picker (disabled while a range is active). */}
          <Select value={rangeActive ? '' : String(year)} onValueChange={(v) => pickYear(Number(v))}>
            <SelectTrigger className="w-28 h-10" disabled={rangeActive}>
              <SelectValue placeholder={t('accounting_year')} />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* From → To year range. Setting both overrides the single year. */}
          <div className="flex items-center gap-1.5">
            <Select value={rangeFrom > 0 ? String(rangeFrom) : NONE_YEAR} onValueChange={(v) => setRangeFrom(v === NONE_YEAR ? 0 : Number(v))}>
              <SelectTrigger className="w-28 h-10 text-sm"><SelectValue placeholder={t('month_from')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_YEAR}>{t('month_from')}</SelectItem>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground select-none">—</span>
            <Select value={rangeTo > 0 ? String(rangeTo) : NONE_YEAR} onValueChange={(v) => setRangeTo(v === NONE_YEAR ? 0 : Number(v))}>
              <SelectTrigger className="w-28 h-10 text-sm"><SelectValue placeholder={t('month_to')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_YEAR}>{t('month_to')}</SelectItem>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            {(rangeFrom > 0 || rangeTo > 0) && (
              <Button variant="ghost" size="sm" className="h-10 w-9 p-0" onClick={clearRange} aria-label={t('month_range_clear')} title={t('month_range_clear')}>
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
          {canExport && (
            <Button variant="outline" className="h-10" onClick={handleExportAuditPack} disabled={exportingPdf}>
              <FileText className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('accounting_audit_pack')}</span>
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6 bg-background">
        {/* Annual income statement */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('accounting_income_statement_annual')} — {rangeLabel}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{periodLabel} · USD</p>
          </CardHeader>
          <TableScroll>
            <table className="w-full min-w-[1080px] text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">&nbsp;</th>
                  {columns.map((c) => <th key={c.prefix} className="text-right px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{c.label}</th>)}
                  <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap">{t('accounting_total')}</th>
                </tr>
              </thead>
              <tbody>
                <MatrixRow label={t('reports_revenue_room_rent')} values={columnTotals.map((m) => m.rent)} total={rangeTotals.rent} />
                <MatrixRow label={t('reports_revenue_water')} values={columnTotals.map((m) => m.water)} total={rangeTotals.water} />
                <MatrixRow label={t('reports_revenue_electric')} values={columnTotals.map((m) => m.electric)} total={rangeTotals.electric} />
                <MatrixRow label={t('reports_revenue_penalty')} values={columnTotals.map((m) => m.penalty)} total={rangeTotals.penalty} />
                <MatrixRow label={t('reports_revenue_discount')} values={columnTotals.map((m) => -m.discount)} total={-rangeTotals.discount} muted />
                <MatrixRow label={t('reports_net_revenue')} values={columnTotals.map((m) => m.netRevenue)} total={rangeTotals.netRevenue} bold border />
                <MatrixRow label={t('reports_of_which_collected')} values={columnTotals.map((m) => m.collected)} total={rangeTotals.collected} muted />
                <MatrixRow label={t('reports_of_which_outstanding')} values={columnTotals.map((m) => m.outstanding)} total={rangeTotals.outstanding} muted />
                <tr><td colSpan={columns.length + 2} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('reports_total_expenses')}</td></tr>
                {expenseCategories.map((cat) => (
                  <MatrixRow
                    key={cat}
                    label={catLabel(cat)}
                    values={columnTotals.map((m) => m.expensesByCat.get(cat) ?? 0)}
                    total={rangeTotals.expensesByCat.get(cat) ?? 0}
                    indent
                  />
                ))}
                <MatrixRow label={t('reports_total_expenses')} values={columnTotals.map((m) => m.expenseTotal)} total={rangeTotals.expenseTotal} bold border />
                <MatrixRow label={t('reports_net_income')} values={columnTotals.map((m) => m.netIncome)} total={rangeTotals.netIncome} bold border highlight />
              </tbody>
            </table>
          </TableScroll>
        </Card>

        {/* Quarterly summary — only meaningful for a single fiscal year. */}
        {isSingleYear && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('accounting_quarterly_summary')} — {fromYear}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{periodLabel}</p>
          </CardHeader>
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
                  { label: t('reports_revenue_billed'), values: quarters.map((q) => q.billed), year: rangeTotals.netRevenue, prev: prevYearTotals.netRevenue, bold: false },
                  { label: t('reports_revenue_collected'), values: quarters.map((q) => q.collected), year: rangeTotals.collected, prev: prevYearTotals.collected, bold: false },
                  { label: t('reports_outstanding'), values: quarters.map((q) => q.outstanding), year: rangeTotals.outstanding, prev: prevYearTotals.outstanding, bold: false },
                  { label: t('reports_total_expenses'), values: quarters.map((q) => q.expenses), year: rangeTotals.expenseTotal, prev: prevYearTotals.expenseTotal, bold: false },
                  { label: t('reports_net_income'), values: quarters.map((q) => q.net), year: rangeTotals.netIncome, prev: prevYearTotals.netIncome, bold: true },
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
        )}

        {/* Balance Sheet */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('accounting_balance_sheet')}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{t('accounting_balance_sheet_as_of')} {balanceSheetCutoff}</p>
          </CardHeader>
          <CardContent>
            <div className="max-w-2xl mx-auto space-y-1 text-sm">
              <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">{t('accounting_assets')}</p>
              <div className="flex justify-between pl-3">
                <span>{t('accounting_accounts_receivable')} <span className="text-xs text-muted-foreground">({t('accounting_ar_help')})</span></span>
                <span className="tabular-nums">{formatCurrency(balanceSheet.accountsReceivable)}</span>
              </div>
              <div className="flex justify-between pl-3">
                <span>{t('accounting_cash_position')} <span className="text-xs text-muted-foreground">({t('accounting_cash_help')})</span></span>
                <span className={cn('tabular-nums', balanceSheet.netCash < 0 && 'text-red-600')}>{formatCurrency(balanceSheet.netCash)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-1.5">
                <span>{t('accounting_total_assets')}</span>
                <span className="tabular-nums">{formatCurrency(balanceSheet.totalAssets)}</span>
              </div>
              <div className="h-3" />
              <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">{t('accounting_liabilities')}</p>
              <div className="flex justify-between pl-3">
                <span>{t('accounting_security_deposits')} <span className="text-xs text-muted-foreground">({t('accounting_deposits_help')})</span></span>
                <span className="tabular-nums">{formatCurrency(balanceSheet.securityDeposits)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-1.5">
                <span>{t('accounting_total_liabilities')}</span>
                <span className="tabular-nums">{formatCurrency(balanceSheet.totalLiabilities)}</span>
              </div>
              <div className="h-3" />
              <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">{t('accounting_equity')}</p>
              <div className="flex justify-between pl-3">
                <span>{t('accounting_retained_earnings')}</span>
                <span className={cn('tabular-nums', balanceSheet.retainedEarnings < 0 && 'text-red-600')}>{formatCurrency(balanceSheet.retainedEarnings)}</span>
              </div>
              <div className={cn('flex justify-between font-bold text-base border-t-2 border-border pt-2 mt-2',
                balanceSheet.retainedEarnings >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
                <span>{t('accounting_total_liab_equity')}</span>
                <span className="tabular-nums">{formatCurrency(balanceSheet.totalLiabilities + balanceSheet.retainedEarnings)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cash Flow Statement */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('accounting_cash_flow')} — {rangeLabel}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{periodLabel}</p>
          </CardHeader>
          <CardContent>
            <div className="max-w-2xl mx-auto space-y-1 text-sm">
              <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">{t('accounting_cf_operating')}</p>
              <div className="flex justify-between pl-3"><span>{t('accounting_cf_rental_receipts')}</span><span className="tabular-nums text-emerald-600">{formatCurrency(cashFlow.rentalReceipts)}</span></div>
              <div className="flex justify-between pl-3 text-muted-foreground"><span>{t('accounting_cf_operating_expenses')}</span><span className="tabular-nums">({formatCurrency(cashFlow.operatingExpenses)})</span></div>
              <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-1.5">
                <span>{t('accounting_cf_net_operating')}</span>
                <span className={cn('tabular-nums', cashFlow.netOperating < 0 && 'text-red-600')}>{formatCurrency(cashFlow.netOperating)}</span>
              </div>
              <div className="h-3" />
              <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">{t('accounting_cf_financing')}</p>
              <div className="flex justify-between pl-3"><span>{t('accounting_cf_deposits_received')}</span><span className="tabular-nums text-emerald-600">{formatCurrency(cashFlow.depositsReceived)}</span></div>
              <div className="flex justify-between pl-3 text-muted-foreground"><span>{t('accounting_cf_deposits_refunded')}</span><span className="tabular-nums">({formatCurrency(cashFlow.depositsRefunded)})</span></div>
              <div className={cn('flex justify-between font-bold text-base border-t-2 border-border pt-2 mt-2',
                cashFlow.netChange >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
                <span>{t('accounting_cf_net_change')}</span>
                <span className="tabular-nums">{formatCurrency(cashFlow.netChange)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Deposits schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('accounting_deposits_schedule')}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{t('accounting_deposits_schedule_help')}</p>
          </CardHeader>
          <TableScroll>
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <SortableTh align="left" k="tenant" label={t('tenant')} active={depSort.key} dir={depSort.dir} onSort={toggleDepSort} />
                  <SortableTh align="left" k="room" label={t('room')} active={depSort.key} dir={depSort.dir} onSort={toggleDepSort} />
                  <SortableTh align="left" k="moveIn" label={t('accounting_move_in')} active={depSort.key} dir={depSort.dir} onSort={toggleDepSort} />
                  <SortableTh align="right" k="deposit" label={t('accounting_security_deposits')} active={depSort.key} dir={depSort.dir} onSort={toggleDepSort} />
                </tr>
              </thead>
              <tbody>
                {balanceSheet.activeDeposits.length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-sm text-muted-foreground py-6">—</td></tr>
                ) : (
                  <>
                    {depositGroups.map((g) => (
                      <Fragment key={g.branch}>
                        <tr className="bg-muted/40">
                          <td colSpan={3} className="px-3 py-1.5">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{g.branch === '—' ? t('branch_shared') : g.branch}</span>
                            <span className="ml-2 text-xs text-muted-foreground tabular-nums">({g.items.length})</span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums text-muted-foreground">{formatCurrency(g.subtotal)}</td>
                        </tr>
                        {g.items.map((tn) => (
                          <tr key={tn.id} className="border-b border-border last:border-0">
                            <td className="px-3 py-2">{tn.fullName}</td>
                            <td className="px-3 py-2">{tn.roomNumber || '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{tn.moveInDate || '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(tn.depositAmount)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/30">
                      <td colSpan={3} className="px-3 py-2 font-semibold text-right">{t('accounting_total')}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{formatCurrency(balanceSheet.securityDeposits)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </TableScroll>
        </Card>

        {/* Tenant ledger */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('accounting_tenant_ledger')} — {rangeLabel}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{periodLabel}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder={t('accounting_search_tenant')} className="pl-9" value={tenantSearch} onChange={(e) => setTenantSearch(e.target.value)} />
                </div>
                <div className="flex gap-1">
                  {(['active', 'all'] as const).map((s) => (
                    <Button key={s} size="sm" variant={tenantScope === s ? 'default' : 'outline'} className="h-8 px-3 text-xs flex-1"
                      onClick={() => setTenantScope(s)}>
                      {s === 'active' ? t('accounting_active_only') : t('accounting_all_tenants')}
                    </Button>
                  ))}
                </div>
                <ul className="max-h-72 overflow-auto border border-border rounded-lg">
                  {tenantPickerGroups.map((g) => (
                    <Fragment key={g.branch}>
                      <li className="px-3 py-1.5 bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 z-10 border-b border-border">
                        {g.branch === '—' ? t('branch_shared') : g.branch}
                        <span className="ml-2 tabular-nums">({g.items.length})</span>
                      </li>
                      {g.items.map((tn) => (
                        <li key={tn.id} className="border-b border-border last:border-0">
                          <button
                            type="button"
                            className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted/50', selectedTenantId === tn.id && 'bg-primary/10 font-semibold')}
                            onClick={() => setSelectedTenantId(tn.id)}
                          >
                            {tn.fullName}
                            {tn.roomNumber && <span className="text-xs text-muted-foreground ml-1.5">· {tn.roomNumber}</span>}
                          </button>
                        </li>
                      ))}
                    </Fragment>
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
                  <div className="space-y-3 bg-background">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p className="font-semibold text-base">{tenantLedger.tenant.fullName}</p>
                        {tenantLedger.tenant.room && <p className="text-xs text-muted-foreground">{tenantLedger.tenant.room.roomNumber} · {tenantLedger.tenant.room.branch}</p>}
                      </div>
                      {canExport && (
                        <Button size="sm" variant="outline" onClick={handleExportTenantStatement}>
                          <FileText className="w-3.5 h-3.5 mr-1.5" />{t('accounting_download_statement')}
                        </Button>
                      )}
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
                            <td className="px-3 py-1.5 font-mono text-xs">{periodStart}</td>
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
            <CardTitle className="text-base">{t('accounting_period_lock')} — {rangeLabel}</CardTitle>
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
                {lockMonths.map((m) => {
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

      {/* ===== Hidden Audit Pack print template (captured to PDF) ===== */}
      <div aria-hidden style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
        <div ref={auditDocRef} style={{ width: 760, background: '#ffffff', color: '#111827', padding: '44px 48px', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', borderBottom: '2px solid #2563eb', paddingBottom: 18, marginBottom: 8 }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{title}</div>
            {subtitle && <div style={{ color: '#6b7280', marginTop: 2 }}>{subtitle}</div>}
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2563eb', marginTop: 14 }}>{t('accounting_audit_pack')}</div>
            <div style={{ color: '#374151', marginTop: 8 }}>{t('accounting_for_period')}: {periodStart} → {periodEnd}</div>
            <div style={{ color: '#6b7280', fontSize: 11, marginTop: 3 }}>{t('branch')}: {branchLabelText} · {t('accounting_generated')}: {generatedAt}</div>
          </div>

          {/* Income Statement */}
          {docStmtTitle(t('accounting_income_statement_annual'), `${rangeLabel} · ${branchLabelText} · ${periodStart} → ${periodEnd}`)}
          {docMatrix()}

          {/* Quarterly Summary (single year only) */}
          {isSingleYear && (
            <>
              {docStmtTitle(t('accounting_quarterly_summary'), `${fromYear} · ${branchLabelText}`)}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>&nbsp;</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{t('accounting_quarter_q1')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{t('accounting_quarter_q2')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{t('accounting_quarter_q3')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{t('accounting_quarter_q4')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{t('accounting_total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    [t('reports_revenue_billed'), quarters.map((q) => q.billed), rangeTotals.netRevenue, false],
                    [t('reports_revenue_collected'), quarters.map((q) => q.collected), rangeTotals.collected, false],
                    [t('reports_outstanding'), quarters.map((q) => q.outstanding), rangeTotals.outstanding, false],
                    [t('reports_total_expenses'), quarters.map((q) => q.expenses), rangeTotals.expenseTotal, false],
                    [t('reports_net_income'), quarters.map((q) => q.net), rangeTotals.netIncome, true],
                  ] as [string, number[], number, boolean][]).map(([label, vals, total, bold]) => (
                    <tr key={label} style={{ fontWeight: bold ? 700 : 400 }}>
                      <td style={tdStyle}>{label}</td>
                      {vals.map((v, i) => <td key={i} style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(v)}</td>)}
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{formatCurrency(total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Balance Sheet */}
          {docStmtTitle(t('accounting_balance_sheet'), `${t('accounting_balance_sheet_as_of')} ${balanceSheetCutoff} · ${branchLabelText}`)}
          {docSection('bs-a', t('accounting_assets'))}
          {docRow('bs-ar', t('accounting_accounts_receivable'), balanceSheet.accountsReceivable, { indent: true })}
          {docRow('bs-cash', t('accounting_cash_position'), balanceSheet.netCash, { indent: true, red: balanceSheet.netCash < 0 })}
          {docRow('bs-ta', t('accounting_total_assets'), balanceSheet.totalAssets, { bold: true, rule: true })}
          {docSection('bs-l', t('accounting_liabilities'))}
          {docRow('bs-dep', t('accounting_security_deposits'), balanceSheet.securityDeposits, { indent: true })}
          {docRow('bs-tl', t('accounting_total_liabilities'), balanceSheet.totalLiabilities, { bold: true, rule: true })}
          {docSection('bs-e', t('accounting_equity'))}
          {docRow('bs-re', t('accounting_retained_earnings'), balanceSheet.retainedEarnings, { indent: true, red: balanceSheet.retainedEarnings < 0 })}
          {docRow('bs-tle', t('accounting_total_liab_equity'), balanceSheet.totalLiabilities + balanceSheet.retainedEarnings, { bold: true, doubleRule: true })}

          {/* Cash Flow */}
          {docStmtTitle(t('accounting_cash_flow'), `${rangeLabel} · ${branchLabelText} · ${periodStart} → ${periodEnd}`)}
          {docSection('cf-o', t('accounting_cf_operating'))}
          {docRow('cf-rr', t('accounting_cf_rental_receipts'), cashFlow.rentalReceipts, { indent: true })}
          {docRow('cf-oe', t('accounting_cf_operating_expenses'), `(${formatCurrency(cashFlow.operatingExpenses)})`, { indent: true, muted: true })}
          {docRow('cf-no', t('accounting_cf_net_operating'), cashFlow.netOperating, { bold: true, rule: true, red: cashFlow.netOperating < 0 })}
          {docSection('cf-f', t('accounting_cf_financing'))}
          {docRow('cf-dr', t('accounting_cf_deposits_received'), cashFlow.depositsReceived, { indent: true })}
          {docRow('cf-drf', t('accounting_cf_deposits_refunded'), `(${formatCurrency(cashFlow.depositsRefunded)})`, { indent: true, muted: true })}
          {docRow('cf-nc', t('accounting_cf_net_change'), cashFlow.netChange, { bold: true, doubleRule: true, red: cashFlow.netChange < 0 })}

          {/* Security Deposits Schedule — grouped by branch */}
          {docStmtTitle(t('accounting_deposits_schedule'), branchLabelText)}
          {balanceSheet.activeDeposits.length === 0 ? (
            <div style={{ color: '#6b7280' }}>—</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t('tenant')}</th>
                  <th style={thStyle}>{t('room')}</th>
                  <th style={thStyle}>{t('accounting_move_in')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>{t('accounting_security_deposits')}</th>
                </tr>
              </thead>
              <tbody>
                {groupByBranch(balanceSheet.activeDeposits.map((tn) => ({ ...tn, roomNumber: tn.room?.roomNumber ?? '', branch: tn.room?.branch ?? '' }))).map((g) => {
                  const branchName = g.branch === '—' ? t('branch_shared') : g.branch
                  const subtotal = g.items.reduce((s, tn) => s + tn.depositAmount, 0)
                  return (
                    <Fragment key={g.branch}>
                      <tr>
                        <td colSpan={4} style={{ padding: '8px 6px 3px', fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: 0.4, background: '#f3f4f6' }}>
                          {branchName} ({g.items.length})
                        </td>
                      </tr>
                      {g.items.map((tn) => (
                        <tr key={tn.id}>
                          <td style={tdStyle}>{tn.fullName}</td>
                          <td style={tdStyle}>{tn.roomNumber || '—'}</td>
                          <td style={tdStyle}>{tn.moveInDate || '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(tn.depositAmount)}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 700 }}>
                        <td style={{ ...tdStyle, color: '#6b7280' }} colSpan={3}>{t('accounting_total')} · {branchName}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(subtotal)}</td>
                      </tr>
                    </Fragment>
                  )
                })}
                <tr style={{ fontWeight: 700 }}>
                  <td style={{ ...tdStyle, borderTop: '2px solid #9ca3af' }} colSpan={3}>{t('accounting_total')}</td>
                  <td style={{ ...tdStyle, borderTop: '2px solid #9ca3af', textAlign: 'right' }}>{formatCurrency(balanceSheet.securityDeposits)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ===== Hidden Tenant Statement print template (captured to PDF) ===== */}
      <div aria-hidden style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
        {tenantLedger && (
          <div ref={tenantDocRef} style={{ width: 760, background: '#ffffff', color: '#111827', padding: '44px 48px', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #2563eb', paddingBottom: 18, marginBottom: 8 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{title}</div>
              {subtitle && <div style={{ color: '#6b7280', marginTop: 2 }}>{subtitle}</div>}
              <div style={{ fontSize: 18, fontWeight: 700, color: '#2563eb', marginTop: 14 }}>{t('accounting_tenant_ledger')}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>{tenantLedger.tenant.fullName}</div>
              {tenantLedger.tenant.room && <div style={{ color: '#6b7280', fontSize: 12 }}>{tenantLedger.tenant.room.roomNumber} · {tenantLedger.tenant.room.branch}</div>}
              <div style={{ color: '#374151', marginTop: 8 }}>{t('accounting_for_period')}: {periodStart} → {periodEnd}</div>
              <div style={{ color: '#6b7280', fontSize: 11, marginTop: 3 }}>{t('accounting_generated')}: {generatedAt}</div>
            </div>

            {/* Summary */}
            {docSection('ts-sum', t('accounting_tenant_ledger'))}
            {docRow('ts-ob', t('accounting_opening_balance'), tenantLedger.openingBalance)}
            {docRow('ts-ch', t('accounting_period_charges'), tenantLedger.charges, { indent: true })}
            {docRow('ts-pm', t('accounting_period_payments'), `(${formatCurrency(tenantLedger.payments)})`, { indent: true, muted: true })}
            {docRow('ts-cb', t('accounting_closing_balance'), tenantLedger.closingBalance, { bold: true, doubleRule: true, red: tenantLedger.closingBalance > 0 })}

            {/* Ledger table */}
            <div style={{ height: 12 }} />
            <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t('expenses_col_date')}</th>
                  <th style={thStyle}>&nbsp;</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>{t('accounting_ledger_charge')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>{t('accounting_ledger_payment')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>{t('accounting_ledger_balance')}</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ color: '#6b7280' }}>
                  <td style={tdStyle}>{periodStart}</td>
                  <td style={{ ...tdStyle, fontStyle: 'italic' }}>{t('accounting_opening_balance')}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>—</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>—</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(tenantLedger.openingBalance)}</td>
                </tr>
                {tenantLedger.entries.map((e, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{e.date}</td>
                    <td style={tdStyle}>{e.description}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{e.kind === 'charge' ? formatCurrency(e.amount) : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{e.kind === 'payment' ? formatCurrency(-e.amount) : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// Compact figure for the income-statement matrix: no "$" (currency is stated
// once in the caption) and a thin minus for negatives, so values stay narrow
// enough to fit all 12 month columns without wrapping or horizontal scroll.
function fmtMatrixNum(n: number): string {
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `(${s})` : s
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
      <td className={cn('px-3 py-2 whitespace-nowrap', bold && 'font-semibold', muted && 'text-muted-foreground', indent && 'pl-6 text-muted-foreground')}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={cn('px-3 py-2 text-right tabular-nums whitespace-nowrap', muted && 'text-muted-foreground', bold && 'font-semibold')}>
          {v === 0 ? <span className="text-muted-foreground/40">·</span> : fmtMatrixNum(v)}
        </td>
      ))}
      <td className={cn('px-3 py-2 text-right tabular-nums whitespace-nowrap', bold ? 'font-bold' : 'font-medium', muted && 'text-muted-foreground')}>
        {fmtMatrixNum(total)}
      </td>
    </tr>
  )
}
