'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, FileText, Printer, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TableScroll } from '@/components/ui/table-scroll'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/contexts/language-context'
import { useBranches } from '@/contexts/branches-context'
import { useSession } from 'next-auth/react'
import { toast } from '@/hooks/use-toast'
import { InvoiceBatchPrintDialog } from '@/components/invoices/batch-print-dialog'
import { InvoiceBatchDeleteDialog } from '@/components/invoices/batch-delete-dialog'
import { useDeleteWithUndo, runDeleteWithUndo } from '@/hooks/use-delete-with-undo'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'

interface Invoice {
  id: string
  invoiceNumber: string
  billingId: string
  tenant: { id: string; fullName: string } | null
  billing: {
    billingMonth: string
    totalUsd: number
    paymentStatus: string
    room: { id: string; roomNumber: string; branch: string | null } | null
  } | null
}

interface Props {
  invoices: Invoice[]
}

export function InvoicesClient({ invoices: initial }: Props) {
  const router = useRouter()
  const { t } = useLanguage()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const [invoices, setInvoices] = useState(initial)
  useEffect(() => { setInvoices(initial) }, [initial])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [showBatchPrint, setShowBatchPrint] = useState(false)
  const [showBatchDelete, setShowBatchDelete] = useState(false)
  const { triggerDelete, dialogState, closeDialog } = useDeleteWithUndo()

  const branches = useBranches().map((b) => b.name)
  const months = [...new Set(invoices.map((inv) => inv.billing?.billingMonth).filter(Boolean) as string[])].sort().reverse()

  const filtered = invoices.filter((inv) => {
    const matchSearch =
      (inv.tenant?.fullName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      (inv.billing?.billingMonth ?? '').includes(search) ||
      (inv.billing?.room?.roomNumber ?? '').includes(search)
    const matchStatus = statusFilter === 'all' || inv.billing?.paymentStatus === statusFilter
    const matchMonth = monthFilter === 'all' || inv.billing?.billingMonth === monthFilter
    const matchBranch = branchFilter === 'all' || inv.billing?.room?.branch === branchFilter
    return matchSearch && matchStatus && matchMonth && matchBranch
  })

  const totalAmount = filtered.reduce((s, inv) => s + (inv.billing?.totalUsd ?? 0), 0)
  const paidCount = filtered.filter((inv) => inv.billing?.paymentStatus === 'paid').length
  const unpaidCount = filtered.filter((inv) => inv.billing?.paymentStatus !== 'paid').length

  const handleDelete = (inv: Invoice) => {
    triggerDelete({
      itemName: `Invoice ${inv.invoiceNumber}`,
      onRemove: () => setInvoices((prev) => prev.filter((i) => i.id !== inv.id)),
      onRestore: () => setInvoices((prev) => [inv, ...prev]),
      onExecute: () => fetch(`/api/invoices/${inv.id}`, { method: 'DELETE' }).then((r) => r.json()),
    })
  }

  const handleBatchDelete = (month: string, branch: string, count: number) => {
    const affected = invoices.filter(
      (inv) =>
        inv.billing?.billingMonth === month &&
        (branch === 'all' || inv.billing?.room?.branch === branch)
    )
    if (affected.length === 0) return
    const ids = new Set(affected.map((i) => i.id))
    runDeleteWithUndo({
      onRemove: () => setInvoices((prev) => prev.filter((i) => !ids.has(i.id))),
      onRestore: () => setInvoices((prev) => [...affected, ...prev]),
      onExecute: () =>
        fetch('/api/invoices/batch-delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month, branch }),
        }).then((r) => r.json()),
      onSuccess: () => router.refresh(),
      toastTitle: `Deleted ${count} invoice${count !== 1 ? 's' : ''}`,
    })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('nav_invoices')}</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} {t('invoices_generated')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBatchPrint(true)}>
            <Printer className="w-4 h-4 mr-2" />{t('batch_print')}
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setShowBatchDelete(true)}>
              <Trash2 className="w-4 h-4 mr-2" />{t('batch_delete')}
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
          <div className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('invoices_generated')}</p>
            <p className="text-xl font-bold mt-1.5 tabular-nums">{filtered.length}</p>
          </div>
        </Card>
        <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
          <div className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_paid_count')}</p>
            <p className="text-xl font-bold text-green-600 mt-1.5 tabular-nums">{paidCount}</p>
          </div>
        </Card>
        <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
          <div className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_unpaid_count')}</p>
            <p className="text-xl font-bold text-orange-500 mt-1.5 tabular-nums">{unpaidCount}</p>
          </div>
        </Card>
        <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
          <div className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('amount')}</p>
            <p className="text-xl font-bold text-blue-600 mt-1.5 tabular-nums">{formatCurrency(totalAmount)}</p>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tenant, invoice #, room, month…"
            className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(['all', ...branches] as const).map((b) => (
          <Button key={b} variant={branchFilter === b ? 'default' : 'outline'} size="sm"
            className="h-9 px-3 text-sm"
            onClick={() => setBranchFilter(b)}>
            {b === 'all' ? t('all_branches') : b}
          </Button>
        ))}
        {(['all', 'paid', 'unpaid'] as const).map((s) => (
          <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm"
            className="h-9 px-3 text-sm"
            onClick={() => setStatusFilter(s)}>
            {s === 'all' ? t('billing_all_status') : s === 'paid' ? t('status_paid') : t('status_unpaid')}
          </Button>
        ))}
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All months" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('billing_all_months')}</SelectItem>
            {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <TableScroll>
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('invoices_col_invoice')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenant')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('branch')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('billing_col_month')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('amount')}</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">{t('status')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv, i) => (
                <tr key={inv.id}
                  className={`border-b border-border last:border-0 hover:bg-muted/30 ${i % 2 ? 'bg-muted/10' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">
                    <Link href={`/tenants/${inv.tenant?.id}`} className="hover:text-primary font-medium">
                      {inv.tenant?.fullName ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.billing?.room?.branch ?? '—'}</td>
                  <td className="px-4 py-3">{inv.billing?.billingMonth ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(inv.billing?.totalUsd ?? 0)}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={inv.billing?.paymentStatus === 'paid' ? 'success' : 'error'} className="capitalize">
                      {inv.billing?.paymentStatus === 'paid' ? t('status_paid') : t('status_unpaid')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/invoices/${inv.billingId}`}>
                        <Button variant="ghost" size="sm" className="text-xs h-8 px-2">{t('view')}</Button>
                      </Link>
                      <Button variant="ghost" size="sm" className="text-xs h-8 px-2"
                        onClick={() => window.open(`/invoices/${inv.billingId}`, '_blank')}>
                        <Printer className="w-3.5 h-3.5" />
                      </Button>
                      {isAdmin && (
                        <Button variant="ghost" size="sm" className="text-xs h-8 px-2 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(inv)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{t('invoices_empty')}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <DeleteConfirmDialog
        open={dialogState.open}
        itemName={dialogState.itemName}
        onClose={closeDialog}
        onConfirm={dialogState.onConfirm}
      />

      {showBatchPrint && (
        <InvoiceBatchPrintDialog
          months={months}
          branches={branches}
          onClose={() => setShowBatchPrint(false)}
        />
      )}

      {showBatchDelete && (
        <InvoiceBatchDeleteDialog
          months={months}
          branches={branches}
          onClose={() => setShowBatchDelete(false)}
          onConfirm={handleBatchDelete}
        />
      )}
    </div>
  )
}
