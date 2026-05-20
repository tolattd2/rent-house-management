'use client'

import { useState, useMemo } from 'react'
import {
  Plus, Search, TrendingDown, DollarSign, Tag, Calendar,
  Edit, Trash2, Download, Wrench, Zap, Users, Package, FileText, HelpCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TableScroll } from '@/components/ui/table-scroll'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { formatCurrency, formatCompact, exportToCSV } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useLanguage } from '@/contexts/language-context'
import { useDeleteWithUndo } from '@/hooks/use-delete-with-undo'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'

type Expense = {
  id: string
  title: string
  category: string
  amountUsd: number
  expenseDate: string
  paidTo: string
  receiptUrl: string
  notes: string
  createdAt: Date
  updatedAt: Date
  roomId: string | null
  maintenanceId: string | null
  room: { id: string; roomNumber: string; branch: string } | null
  maintenance: { id: string; title: string } | null
}

type Room = { id: string; roomNumber: string; branch: string }

interface Props {
  expenses: Expense[]
  rooms: Room[]
}

const CATEGORIES = [
  'maintenance', 'utilities', 'salary', 'supplies', 'administrative', 'other',
] as const

const categoryIcon: Record<string, React.ElementType> = {
  maintenance: Wrench,
  utilities: Zap,
  salary: Users,
  supplies: Package,
  administrative: FileText,
  other: HelpCircle,
}

const categoryColor: Record<string, string> = {
  maintenance: 'text-orange-600 bg-orange-50 dark:bg-orange-950/30',
  utilities: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30',
  salary: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30',
  supplies: 'text-teal-600 bg-teal-50 dark:bg-teal-950/30',
  administrative: 'text-slate-600 bg-slate-50 dark:bg-slate-900/30',
  other: 'text-gray-600 bg-gray-50 dark:bg-gray-900/30',
}

const emptyForm = {
  title: '',
  category: 'other',
  amountUsd: '',
  expenseDate: new Date().toISOString().slice(0, 10),
  paidTo: '',
  notes: '',
  roomId: '',
}

export function ExpensesClient({ expenses: initialExpenses, rooms }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const { t } = useLanguage()
  const [expenses, setExpenses] = useState(initialExpenses)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const { triggerDelete, dialogState, closeDialog } = useDeleteWithUndo()

  const currentMonth = new Date().toISOString().slice(0, 7)

  const months = useMemo(
    () => [...new Set(expenses.map((e) => e.expenseDate.slice(0, 7)))].sort().reverse(),
    [expenses]
  )

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        e.title.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.paidTo.toLowerCase().includes(q) ||
        (e.room?.roomNumber ?? '').toLowerCase().includes(q)
      const matchCat = categoryFilter === 'all' || e.category === categoryFilter
      const matchMonth = monthFilter === 'all' || e.expenseDate.startsWith(monthFilter)
      const matchBranch = branchFilter === 'all' || e.room?.branch === branchFilter
      return matchSearch && matchCat && matchMonth && matchBranch
    })
  }, [expenses, search, categoryFilter, monthFilter, branchFilter])

  const thisMonthTotal = expenses
    .filter((e) => e.expenseDate.startsWith(currentMonth))
    .reduce((s, e) => s + e.amountUsd, 0)

  const filteredTotal = filtered.reduce((s, e) => s + e.amountUsd, 0)

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.forEach((e) => { map[e.category] = (map[e.category] ?? 0) + e.amountUsd })
    return map
  }, [filtered])

  function openAdd() {
    setEditExpense(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(e: Expense) {
    setEditExpense(e)
    setForm({
      title: e.title,
      category: e.category,
      amountUsd: String(e.amountUsd),
      expenseDate: e.expenseDate,
      paidTo: e.paidTo,
      notes: e.notes,
      roomId: e.roomId ?? '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.title || !form.amountUsd || !form.expenseDate) {
      toast({ title: t('expense_missing_fields'), description: t('expense_missing_desc'), variant: 'destructive' })
      return
    }
    setLoading(true)
    const payload = {
      ...form,
      amountUsd: parseFloat(form.amountUsd) || 0,
      roomId: form.roomId || null,
    }
    const url = editExpense ? `/api/expenses/${editExpense.id}` : '/api/expenses'
    const method = editExpense ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (data.ok) {
      toast({ title: t(editExpense ? 'expense_updated' : 'expense_added') })
      router.refresh()
      setShowForm(false)
      if (editExpense) {
        setExpenses((prev) => prev.map((e) => e.id === editExpense.id ? data.data : e))
      } else {
        setExpenses((prev) => [data.data, ...prev])
      }
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
    setLoading(false)
  }

  function handleDelete(expense: Expense) {
    triggerDelete({
      itemName: expense.title,
      onRemove: () => setExpenses((prev) => prev.filter((e) => e.id !== expense.id)),
      onRestore: () => setExpenses((prev) => [expense, ...prev]),
      onExecute: () => fetch(`/api/expenses/${expense.id}`, { method: 'DELETE' }).then((r) => r.json()),
    })
  }

  function handleExport() {
    const headers = ['Date', 'Title', 'Category', 'Amount (USD)', 'Paid To', 'Room', 'Notes']
    const rows = filtered.map((e) => [
      e.expenseDate, e.title, e.category, e.amountUsd,
      e.paidTo, e.room ? `Room ${e.room.roomNumber} (${e.room.branch})` : '', e.notes,
    ])
    exportToCSV(headers, rows, `expenses-${monthFilter || 'all'}.csv`)
  }

  function catLabel(cat: string) {
    const key = `expense_cat_${cat}` as Parameters<typeof t>[0]
    return t(key)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('expenses_title')}</h1>
          <p className="text-muted-foreground text-sm">{t('expenses_subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />{t('billing_export')}
          </Button>
          {isAdmin && (
            <Button onClick={openAdd}>
              <Plus className="w-4 h-4 mr-2" />{t('expenses_add')}
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center flex-shrink-0">
              <TrendingDown className="w-4 h-4 text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('expenses_total_this_month')}</p>
              <p className="text-lg font-bold text-red-600 mt-0.5 tabular-nums">{formatCompact(thisMonthTotal)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-4 h-4 text-orange-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('expenses_total_all')}</p>
              <p className="text-lg font-bold mt-0.5 tabular-nums">{formatCompact(filteredTotal)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center flex-shrink-0">
              <Tag className="w-4 h-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('expenses_col_category')}</p>
              <p className="text-lg font-bold mt-0.5 tabular-nums">{Object.keys(byCategory).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-900/40 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-4 h-4 text-slate-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('billing_records')}</p>
              <p className="text-lg font-bold mt-0.5 tabular-nums">{filtered.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown */}
      {Object.keys(byCategory).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {CATEGORIES.filter((c) => byCategory[c]).map((cat) => {
            const Icon = categoryIcon[cat] ?? HelpCircle
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border border-border/50 shadow-sm transition-all duration-200 text-center hover:-translate-y-0.5 hover:shadow-md
                  ${categoryFilter === cat ? 'ring-2 ring-primary/70' : ''}
                  ${categoryColor[cat]}`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-xs font-medium leading-tight">{catLabel(cat)}</span>
                <span className="text-sm font-bold">{formatCurrency(byCategory[cat])}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('expenses_search')}
            className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(['all', 'Takmoa', 'Chamkadong'] as const).map((b) => (
          <Button key={b} variant={branchFilter === b ? 'default' : 'outline'} size="sm"
            className="h-9 px-3 text-sm"
            onClick={() => setBranchFilter(b)}>
            {b === 'all' ? t('all_branches') : b}
          </Button>
        ))}
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder={t('billing_all_months')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('billing_all_months')}</SelectItem>
            {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder={t('all')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{catLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <TrendingDown className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('expenses_empty')}</p>
          </div>
        )}
        {filtered.map((expense) => {
          const Icon = categoryIcon[expense.category] ?? HelpCircle
          return (
            <Card key={expense.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{expense.title}</p>
                  {expense.notes && <p className="text-xs text-muted-foreground truncate">{expense.notes}</p>}
                  {expense.maintenance && <p className="text-xs text-orange-600 mt-0.5">{t('maintenance_expense_auto')}</p>}
                </div>
                <p className="font-bold text-red-600 shrink-0">{formatCurrency(expense.amountUsd)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-3">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${categoryColor[expense.category]}`}>
                  <Icon className="w-3 h-3" />{catLabel(expense.category)}
                </span>
                <span>{expense.expenseDate}</span>
                {expense.paidTo && <span>{expense.paidTo}</span>}
                {expense.room && <span>{t('room')} {expense.room.roomNumber}</span>}
              </div>
              {isAdmin && (
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button variant="outline" size="sm" className="flex-1 h-10" onClick={() => openEdit(expense)}>
                    <Edit className="w-3.5 h-3.5 mr-1.5" />{t('edit')}
                  </Button>
                  {!expense.maintenanceId && (
                    <Button variant="outline" size="sm" className="h-10 px-3 text-destructive border-destructive/30"
                      onClick={() => handleDelete(expense)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <TableScroll>
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('expenses_col_date')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('expenses_col_title')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('expenses_col_category')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('expenses_col_paid_to')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('expenses_col_room')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('expenses_col_amount')}</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((expense, i) => {
                const Icon = categoryIcon[expense.category] ?? HelpCircle
                return (
                  <tr
                    key={expense.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 group ${i % 2 ? 'bg-muted/10' : ''}`}
                  >
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{expense.expenseDate}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{expense.title}</p>
                      {expense.notes && <p className="text-xs text-muted-foreground truncate max-w-40">{expense.notes}</p>}
                      {expense.maintenance && (
                        <p className="text-xs text-orange-600 mt-0.5">{t('maintenance_expense_auto')}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${categoryColor[expense.category]}`}>
                        <Icon className="w-3 h-3" />
                        {catLabel(expense.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{expense.paidTo || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {expense.room ? `${t('room')} ${expense.room.roomNumber}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">
                      {formatCurrency(expense.amountUsd)}
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin && (
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(expense)} className="h-8 w-8 p-0">
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          {!expense.maintenanceId && (
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(expense)} className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <TrendingDown className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('expenses_empty')}</p>
            </div>
          )}
        </TableScroll>
      </Card>

      <DeleteConfirmDialog
        open={dialogState.open}
        itemName={dialogState.itemName}
        onClose={closeDialog}
        onConfirm={dialogState.onConfirm}
      />

      {/* Add/Edit dialog */}
      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editExpense ? t('expenses_form_edit') : t('expenses_form_add')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('expenses_form_title_label')} *</Label>
                <Input
                  placeholder={t('expenses_form_title_placeholder')}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('expenses_form_category_label')}</Label>
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{catLabel(c)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('expenses_form_amount_label')} *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.amountUsd}
                    onChange={(e) => setForm((f) => ({ ...f, amountUsd: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('expenses_form_date_label')} *</Label>
                  <Input
                    type="date"
                    value={form.expenseDate}
                    onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('expenses_form_paid_to_label')}</Label>
                  <Input
                    placeholder={t('expenses_form_paid_to_placeholder')}
                    value={form.paidTo}
                    onChange={(e) => setForm((f) => ({ ...f, paidTo: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t('expenses_form_room_label')}</Label>
                <Select value={form.roomId || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, roomId: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder={t('expenses_form_room_placeholder')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('none')}</SelectItem>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{t('room')} {r.roomNumber} ({r.branch})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('expenses_form_notes_label')}</Label>
                <Textarea
                  placeholder={t('expenses_form_notes_placeholder')}
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowForm(false)}>{t('cancel')}</Button>
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? t('saving') : editExpense ? t('update') : t('save')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
