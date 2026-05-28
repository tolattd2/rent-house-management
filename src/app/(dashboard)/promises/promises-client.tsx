'use client'

import Link from 'next/link'
import { CalendarClock, Search } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableScroll } from '@/components/ui/table-scroll'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { useLanguage } from '@/contexts/language-context'
import { useBranches } from '@/contexts/branches-context'
import { usePersistentState } from '@/hooks/use-persistent-state'

export type PromiseTimelineEntry = {
  billingId: string
  tenantId: string | null
  tenantName: string
  tenantPhone: string
  roomNumber: string
  branch: string
  billingMonth: string
  totalUsd: number
  balanceUsd: number
  paymentStatus: string
  date: string
  setAt: string
  by: string | null
  isCurrent: boolean
  isOverdue: boolean
}

export function PromisesClient({ entries }: { entries: PromiseTimelineEntry[] }) {
  const { t, language } = useLanguage()
  const branches = ['all', ...useBranches().map((b) => b.name)]
  const [search, setSearch] = usePersistentState('promises/search', '')
  const [branchFilter, setBranchFilter] = usePersistentState('promises/branch', 'all')
  const [outstandingOnly, setOutstandingOnly] = usePersistentState('promises/outstanding', false)
  const [currentOnly, setCurrentOnly] = usePersistentState('promises/current', false)

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase()
    const matchSearch =
      e.tenantName.toLowerCase().includes(q) ||
      e.roomNumber.toLowerCase().includes(q) ||
      e.billingMonth.includes(search)
    const matchBranch = branchFilter === 'all' || e.branch === branchFilter
    const matchOutstanding = !outstandingOnly || e.balanceUsd > 0
    const matchCurrent = !currentOnly || e.isCurrent
    return matchSearch && matchBranch && matchOutstanding && matchCurrent
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-blue-500" />
            {t('promises_title')}
          </h1>
          <p className="text-muted-foreground text-sm">{filtered.length} {t('promises_count')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('promises_search')} className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {branches.map((b) => (
          <Button key={b} variant={branchFilter === b ? 'default' : 'outline'} size="sm"
            className="h-9 px-3 text-sm" onClick={() => setBranchFilter(b)}>
            {b === 'all' ? t('all_branches') : b}
          </Button>
        ))}
        <Button variant={outstandingOnly ? 'default' : 'outline'} size="sm" className="h-9 px-3 text-sm"
          onClick={() => setOutstandingOnly(!outstandingOnly)}>
          {t('promises_outstanding_only')}
        </Button>
        <Button variant={currentOnly ? 'default' : 'outline'} size="sm" className="h-9 px-3 text-sm"
          onClick={() => setCurrentOnly(!currentOnly)}>
          {t('promises_current_only')}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarClock className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t('promises_empty')}</p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <TableScroll>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">{t('promise_col_date')}</th>
                  <th className="px-4 py-3 font-semibold">{t('promise_col_status')}</th>
                  <th className="px-4 py-3 font-semibold">{t('promise_col_tenant')}</th>
                  <th className="px-4 py-3 font-semibold">{t('promise_col_room')}</th>
                  <th className="px-4 py-3 font-semibold">{t('promise_col_month')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{t('promise_col_amount')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{t('promise_col_balance')}</th>
                  <th className="px-4 py-3 font-semibold">{t('promise_col_recorded')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, idx) => (
                  <tr key={`${e.billingId}-${e.setAt}-${idx}`} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium tabular-nums whitespace-nowrap">{formatDate(e.date, language)}</td>
                    <td className="px-4 py-3">
                      {e.isOverdue ? (
                        <Badge variant="error">{t('promise_status_overdue')}</Badge>
                      ) : e.isCurrent ? (
                        <Badge variant="success">{t('promise_status_current')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('promise_status_past')}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {e.tenantId ? (
                        <Link href={`/tenants/${e.tenantId}`} className="hover:text-primary">{e.tenantName}</Link>
                      ) : e.tenantName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium">{e.roomNumber}</span>
                      <span className="text-xs text-muted-foreground"> · {e.branch}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">{e.billingMonth}</td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatCurrency(e.totalUsd)}</td>
                    <td className={cn('px-4 py-3 text-right tabular-nums whitespace-nowrap', e.balanceUsd > 0 ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
                      {e.balanceUsd > 0 ? formatCurrency(e.balanceUsd) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {e.setAt ? formatDate(e.setAt, language) : '—'}{e.by ? ` · ${e.by}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      )}
    </div>
  )
}
