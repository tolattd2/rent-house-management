'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, Wrench, Trash2, Pencil, CheckCircle2, Clock, AlertCircle, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TableScroll } from '@/components/ui/table-scroll'
import { SortableTh, type SortDir } from '@/components/ui/sortable-th'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatCurrency, formatDate, sortRoomsByNumber, cn } from '@/lib/utils'
import { CARD_STYLES, type CardColor } from '@/lib/card-colors'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import { useBranches, useRoomLabel } from '@/contexts/branches-context'
import { useDeleteWithUndo } from '@/hooks/use-delete-with-undo'
import { usePersistentState } from '@/hooks/use-persistent-state'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'

/** Gradient-wash colour for each maintenance status summary card. */
const STATUS_CARD_COLOR: Record<'all' | 'pending' | 'in_progress' | 'completed', CardColor> = {
  all: 'slate',
  pending: 'amber',
  in_progress: 'blue',
  completed: 'green',
}

type MaintenanceRecord = {
  id: string
  title: string
  description: string
  category: string
  status: 'pending' | 'in_progress' | 'completed'
  repairFeeUsd: number
  reportedDate: string
  completedDate: string
  notes: string
  createdAt: Date
  room: { id: string; roomNumber: string; branch?: string } | null
  tenant: { id: string; fullName: string } | null
}

type Room = { id: string; roomNumber: string; branch?: string }
type Tenant = { id: string; fullName: string; roomId: string | null }

interface Props {
  records: MaintenanceRecord[]
  rooms: Room[]
  tenants: Tenant[]
}

const CATEGORIES = ['general', 'electrical', 'plumbing', 'furniture', 'appliance', 'structural', 'cleaning', 'other']

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, color: 'warning' as const },
  in_progress: { label: 'In Progress', icon: AlertCircle, color: 'secondary' as const },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'success' as const },
}

const emptyForm: {
  title: string; description: string; category: string
  status: 'pending' | 'in_progress' | 'completed'
  repairFeeUsd: string; reportedDate: string; completedDate: string
  notes: string; branch: string; roomId: string; tenantId: string
} = {
  title: '', description: '', category: 'general', status: 'pending',
  repairFeeUsd: '', reportedDate: new Date().toISOString().slice(0, 10),
  completedDate: '', notes: '', branch: '', roomId: '', tenantId: 'none',
}

export function MaintenanceClient({ records: initial, rooms, tenants }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const canManage = session?.user?.role ? session.user.role !== 'guest' : false
  const { t, language } = useLanguage()
  const roomLabel = useRoomLabel()
  const [records, setRecords] = useState(initial)
  useEffect(() => { setRecords(initial) }, [initial])
  const [search, setSearch] = usePersistentState('maintenance/search', '')
  const [statusFilter, setStatusFilter] = usePersistentState('maintenance/status', 'all')
  const [branchFilter, setBranchFilter] = usePersistentState('maintenance/branch', 'all')
  const [categoryFilter, setCategoryFilter] = usePersistentState('maintenance/category', 'all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<MaintenanceRecord | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const { triggerDelete, dialogState, closeDialog } = useDeleteWithUndo()

  // Two filtered views (mirrors the expenses page): the breakdown cards run
  // off the category-agnostic view so clicking one card doesn't blank the
  // others. The table uses the fully-filtered view.
  const filteredNoCategory = records.filter((r) => {
    const matchSearch =
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.room?.roomNumber ?? '').includes(search) ||
      (r.tenant?.fullName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    const matchBranch = branchFilter === 'all' || r.room?.branch === branchFilter
    return matchSearch && matchStatus && matchBranch
  })
  const filtered = categoryFilter === 'all'
    ? filteredNoCategory
    : filteredNoCategory.filter((r) => r.category === categoryFilter)

  const totalFee = filtered.reduce((s, r) => s + r.repairFeeUsd, 0)

  // Per-category fee totals for the breakdown cards.
  const byCategory: Record<string, number> = {}
  filteredNoCategory.forEach((r) => { byCategory[r.category] = (byCategory[r.category] ?? 0) + r.repairFeeUsd })

  // Column sort. Default: reportedDate descending (newest first).
  type SortKey = 'title' | 'room' | 'branch' | 'tenant' | 'reportedDate' | 'completedDate' | 'repairFeeUsd' | 'status'
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'reportedDate', dir: 'desc' })
  const toggleSort = (key: SortKey) => setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  const sorted = [...filtered].sort((a, b) => {
    const sign = sort.dir === 'asc' ? 1 : -1
    switch (sort.key) {
      case 'title': return sign * a.title.localeCompare(b.title)
      case 'room': return sign * ((a.room?.roomNumber ?? '').localeCompare(b.room?.roomNumber ?? ''))
      case 'branch': return sign * ((a.room?.branch ?? '').localeCompare(b.room?.branch ?? ''))
      case 'tenant': return sign * ((a.tenant?.fullName ?? '').localeCompare(b.tenant?.fullName ?? ''))
      case 'reportedDate': return sign * a.reportedDate.localeCompare(b.reportedDate)
      case 'completedDate': return sign * (a.completedDate || '').localeCompare(b.completedDate || '')
      case 'repairFeeUsd': return sign * (a.repairFeeUsd - b.repairFeeUsd)
      case 'status': return sign * a.status.localeCompare(b.status)
    }
  })

  const branches = useBranches().map((b) => b.name)
  const filteredRooms = sortRoomsByNumber(
    form.branch ? rooms.filter((r) => r.branch === form.branch) : []
  )

  // When the user picks a room, auto-fill the tenant select with whichever
  // active tenant occupies that room (if any). Skips when the user has
  // already chosen a specific tenant, so a manual override isn't clobbered.
  useEffect(() => {
    if (!form.roomId) return
    if (form.tenantId && form.tenantId !== 'none') return
    const occupant = tenants.find((tn) => tn.roomId === form.roomId)
    if (occupant) setForm((f) => ({ ...f, tenantId: occupant.id }))
  }, [form.roomId, form.tenantId, tenants])

  // Categories: built-in plus any custom ones the user has added. Custom
  // categories are bilingual { en, km } pairs persisted to localStorage —
  // the English name is the canonical id stored on records.
  type CustomCat = { en: string; km: string }
  const CATEGORIES_STORAGE = 'maintenance/custom-categories'
  const [customCategories, setCustomCategories] = useState<CustomCat[]>([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CATEGORIES_STORAGE)
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      // Migrate legacy string[] entries: both en and km default to the string.
      const next: CustomCat[] = parsed.map((c) =>
        typeof c === 'string'
          ? { en: c, km: c }
          : { en: String((c as CustomCat).en ?? ''), km: String((c as CustomCat).km ?? '') }
      ).filter((c) => c.en)
      setCustomCategories(next)
    } catch { /* ignore */ }
  }, [])
  const allCategories = [
    ...CATEGORIES,
    ...customCategories.map((c) => c.en).filter((e) => e && !CATEGORIES.includes(e)),
  ]
  function catLabel(cat: string) {
    const key = `maint_cat_${cat}` as Parameters<typeof t>[0]
    const v = t(key)
    if (v !== key) return v
    const custom = customCategories.find((c) => c.en === cat)
    if (custom) return language === 'kh' ? (custom.km || custom.en) : custom.en
    return cat
  }
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCatEn, setNewCatEn] = useState('')
  const [newCatKm, setNewCatKm] = useState('')
  function commitNewCategory() {
    const en = newCatEn.trim()
    const km = newCatKm.trim()
    if (!en && !km) { setAddingCategory(false); return }
    const enFinal = en || km
    const kmFinal = km || en
    if (!allCategories.includes(enFinal)) {
      const next = [...customCategories, { en: enFinal, km: kmFinal }]
      setCustomCategories(next)
      try { localStorage.setItem(CATEGORIES_STORAGE, JSON.stringify(next)) } catch { /* ignore */ }
    }
    setForm((f) => ({ ...f, category: enFinal }))
    setNewCatEn('')
    setNewCatKm('')
    setAddingCategory(false)
  }
  function deleteCategory(en: string) {
    if ((CATEGORIES as readonly string[]).includes(en)) return
    const next = customCategories.filter((x) => x.en !== en)
    setCustomCategories(next)
    try { localStorage.setItem(CATEGORIES_STORAGE, JSON.stringify(next)) } catch { /* ignore */ }
    if (form.category === en) setForm((f) => ({ ...f, category: 'general' }))
  }

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(r: MaintenanceRecord) {
    setEditing(r)
    setForm({
      title: r.title,
      description: r.description,
      category: r.category,
      status: r.status,
      repairFeeUsd: String(r.repairFeeUsd),
      reportedDate: r.reportedDate,
      completedDate: r.completedDate,
      notes: r.notes,
      branch: r.room?.branch ?? '',
      roomId: r.room?.id ?? '',
      tenantId: r.tenant?.id ?? 'none',
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.title || !form.roomId || !form.reportedDate) {
      toast({ title: t('maintenance_validation_msg'), variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload = {
      title: form.title,
      description: form.description,
      category: form.category,
      status: form.status,
      repairFeeUsd: parseFloat(form.repairFeeUsd) || 0,
      reportedDate: form.reportedDate,
      completedDate: form.completedDate,
      notes: form.notes,
      roomId: form.roomId,
      tenantId: (form.tenantId && form.tenantId !== 'none') ? form.tenantId : null,
    }

    if (editing) {
      const res = await fetch(`/api/maintenance/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.ok) {
        setRecords((prev) => prev.map((r) => r.id === editing.id ? data.record : r))
        toast({ title: t('maintenance_updated') })
        setShowForm(false)
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } else {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.ok) {
        setRecords((prev) => [data.record, ...prev])
        toast({ title: t('maintenance_added') })
        setShowForm(false)
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    }
    setSaving(false)
    router.refresh()
  }

  function handleDelete(record: MaintenanceRecord) {
    triggerDelete({
      itemName: record.title,
      onRemove: () => setRecords((prev) => prev.filter((r) => r.id !== record.id)),
      onRestore: () => setRecords((prev) => [record, ...prev]),
      onExecute: () => fetch(`/api/maintenance/${record.id}`, { method: 'DELETE' }).then((r) => r.json()),
    })
  }

  async function handleStatusChange(record: MaintenanceRecord, status: MaintenanceRecord['status']) {
    if (record.status === status) return
    const prev = records
    const today = new Date().toISOString().slice(0, 10)
    const nextCompleted = status === 'completed' ? today : ''
    setRecords((rs) => rs.map((r) => r.id === record.id ? { ...r, status, completedDate: nextCompleted } : r))
    const res = await fetch(`/api/maintenance/${record.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, completedDate: nextCompleted }),
    })
    const data = await res.json()
    if (data.ok) {
      setRecords((rs) => rs.map((r) => r.id === record.id ? data.record : r))
      toast({ title: t('maintenance_updated') })
      router.refresh()
    } else {
      setRecords(prev)
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
  }

  const STATUS_PILL: Record<MaintenanceRecord['status'], string> = {
    pending: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/50',
    in_progress: 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50',
    completed: 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50',
  }

  function StatusControl({ record }: { record: MaintenanceRecord }) {
    const sc = statusConfig[record.status]
    if (!canManage) {
      return (
        <Badge variant={sc.color} className="flex items-center gap-1 w-fit">
          <sc.icon className="w-3 h-3" />
          {t(`status_${record.status}` as Parameters<typeof t>[0])}
        </Badge>
      )
    }
    return (
      <Select value={record.status} onValueChange={(v) => handleStatusChange(record, v as MaintenanceRecord['status'])}>
        <SelectTrigger
          className={cn(
            'h-7 w-fit rounded-full border-0 px-2.5 py-0.5 text-xs font-semibold gap-1.5 transition-colors',
            'focus:ring-2 focus:ring-ring focus:ring-offset-1',
            '[&>span]:flex [&>span]:items-center [&>span]:gap-1',
            STATUS_PILL[record.status],
          )}
        >
          <SelectValue>
            <sc.icon className="w-3 h-3" />
            {t(`status_${record.status}` as Parameters<typeof t>[0])}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">{t('status_pending')}</SelectItem>
          <SelectItem value="in_progress">{t('status_in_progress')}</SelectItem>
          <SelectItem value="completed">{t('status_completed')}</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('maintenance_title')}</h1>
          <p className="text-muted-foreground text-sm">
            {records.filter((r) => r.status !== 'completed').length} {t('maintenance_open_count')}
          </p>
        </div>
        {canManage && (
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> {t('maintenance_add')}
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(['all', 'pending', 'in_progress', 'completed'] as const).map((s) => {
          const count = s === 'all' ? filtered.length : filtered.filter((r) => r.status === s).length
          const cs = CARD_STYLES[STATUS_CARD_COLOR[s]]
          return (
            <Card key={s} className={cn('p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5', cs.card, statusFilter === s ? 'ring-2 ring-primary' : '')}
              onClick={() => setStatusFilter(s)}>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{s === 'all' ? t('maintenance_total') : t(`status_${s}` as Parameters<typeof t>[0])}</p>
              <p className={cn('text-2xl font-bold mt-1.5 tabular-nums', cs.value)}>{count}</p>
            </Card>
          )
        })}
      </div>

      {/* Category breakdown: click a card to filter by that category. Built
          from filteredNoCategory so clicking a card never empties the others. */}
      {Object.keys(byCategory).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.keys(byCategory).sort().map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)}
              className={cn(
                'flex flex-col items-center gap-1.5 p-3 rounded-2xl border border-border/50 bg-card shadow-sm text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                categoryFilter === cat && 'ring-2 ring-primary/70',
              )}>
              <Wrench className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium leading-tight capitalize">{catLabel(cat)}</span>
              <span className="text-sm font-bold tabular-nums">{formatCurrency(byCategory[cat])}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('maintenance_search')} className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        {(['all', ...branches] as const).map((b) => (
          <Button key={b} variant={branchFilter === b ? 'default' : 'outline'} size="sm"
            className="h-9 px-3 text-sm"
            onClick={() => setBranchFilter(b)}>
            {b === 'all' ? t('all_branches') : b}
          </Button>
        ))}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder={t('maintenance_form_category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            {allCategories.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">{catLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground ml-auto">
          {t('maintenance_total_fees')} <span className="font-semibold text-foreground">{formatCurrency(totalFee)}</span>
        </p>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('maintenance_empty')}</p>
          </div>
        )}
        {filtered.map((r) => {
          return (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">{catLabel(r.category)}</p>
                </div>
                <div className="shrink-0">
                  <StatusControl record={r} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('maintenance_col_room')}</p>
                  <p>{r.room ? `${t('room')} ${roomLabel(r.room)}` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('maintenance_col_fee')}</p>
                  <p className="font-medium">{r.repairFeeUsd > 0 ? formatCurrency(r.repairFeeUsd) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('maintenance_col_reported')}</p>
                  <p>{formatDate(r.reportedDate)}</p>
                </div>
                {r.tenant && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t('maintenance_col_tenant')}</p>
                    <p>{r.tenant.fullName}</p>
                  </div>
                )}
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  <Button variant="outline" size="sm" className="flex-1 min-w-[6rem] h-10" onClick={() => openEdit(r)}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />{t('edit')}
                  </Button>
                  <Button variant="outline" size="sm" className="h-10 px-3 shrink-0 text-destructive border-destructive/30"
                    onClick={() => handleDelete(r)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <TableScroll>
          <table className="w-full min-w-[950px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <SortableTh align="left" k="title" label={t('maintenance_col_title')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
                <SortableTh align="left" k="room" label={t('maintenance_col_room')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
                <SortableTh align="left" k="branch" label={t('maintenance_col_branch')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
                <SortableTh align="left" k="tenant" label={t('maintenance_col_tenant')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
                <SortableTh align="left" k="reportedDate" label={t('maintenance_col_reported')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
                <SortableTh align="left" k="completedDate" label={t('maintenance_col_completed')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
                <SortableTh align="left" k="repairFeeUsd" label={t('maintenance_col_fee')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
                <SortableTh align="left" k="status" label={t('maintenance_col_status')} active={sort.key} dir={sort.dir} onSort={toggleSort} />
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('maintenance_col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                return (
                  <tr key={r.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/40 ${i % 2 ? 'bg-muted/10' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{catLabel(r.category)}</p>
                    </td>
                    <td className="px-4 py-3">
                      {r.room ? (
                        <div className="flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{t('room')} {roomLabel(r.room)}</span>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.room?.branch ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.tenant?.fullName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.reportedDate)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.completedDate ? formatDate(r.completedDate) : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {r.repairFeeUsd > 0 ? formatCurrency(r.repairFeeUsd) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusControl record={r} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(r)}
                            className="text-red-500 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
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
              <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('maintenance_empty')}</p>
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

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('maintenance_form_edit') : t('maintenance_form_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>{t('maintenance_form_title_label')} *</Label>
              <Input placeholder={t('maintenance_form_title_placeholder')} value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('maintenance_form_branch')} *</Label>
                <Select value={form.branch} onValueChange={(v) => setForm((f) => ({ ...f, branch: v, roomId: '', tenantId: 'none' }))}>
                  <SelectTrigger><SelectValue placeholder={t('maintenance_form_branch_placeholder')} /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('maintenance_form_room')} *</Label>
                <Select value={form.roomId} onValueChange={(v) => setForm((f) => ({ ...f, roomId: v, tenantId: 'none' }))}
                  disabled={!form.branch}>
                  <SelectTrigger><SelectValue placeholder={form.branch ? t('maintenance_form_room_placeholder') : t('maintenance_form_room_hint')} /></SelectTrigger>
                  <SelectContent>
                    {filteredRooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>{t('room')} {roomLabel(room)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('maintenance_form_tenant')}</Label>
              <Select value={form.tenantId} onValueChange={(v) => setForm((f) => ({ ...f, tenantId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('maintenance_form_tenant_placeholder')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('none')}</SelectItem>
                  {/* Only the active tenant assigned to the selected room is
                      offered — picking a stranger here doesn't make sense for
                      a room-scoped maintenance ticket. */}
                  {form.roomId && (() => {
                    const occupant = tenants.find((tn) => tn.roomId === form.roomId)
                    return occupant ? (
                      <SelectItem key={occupant.id} value={occupant.id}>{occupant.fullName}</SelectItem>
                    ) : null
                  })()}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>{t('maintenance_form_category')}</Label>
                  {!addingCategory && (
                    <div className="flex items-center gap-2">
                      {customCategories.length > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button type="button" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
                              <Settings className="w-3.5 h-3.5" /> {t('manage')}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-2" align="end">
                            <p className="text-xs font-semibold text-muted-foreground px-1 pb-1">{t('expenses_manage_categories')}</p>
                            <ul className="space-y-0.5">
                              {customCategories.map((c) => (
                                <li key={c.en} className="flex items-center justify-between text-sm pl-2 pr-1 py-1 rounded hover:bg-muted">
                                  <span className="capitalize truncate">
                                    {c.en}
                                    {c.km && c.km !== c.en && (
                                      <span className="text-muted-foreground"> · {c.km}</span>
                                    )}
                                  </span>
                                  <button type="button" aria-label="Delete category"
                                    className="w-6 h-6 inline-flex items-center justify-center text-muted-foreground hover:text-destructive"
                                    onClick={() => deleteCategory(c.en)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </PopoverContent>
                        </Popover>
                      )}
                      <button type="button" className="text-xs text-primary hover:underline"
                        onClick={() => { setNewCatEn(''); setNewCatKm(''); setAddingCategory(true) }}>
                        + {t('add')}
                      </button>
                    </div>
                  )}
                </div>
                {addingCategory ? (
                  <div className="space-y-1">
                    <Input autoFocus placeholder={t('category_form_en_placeholder')} value={newCatEn}
                      onChange={(e) => setNewCatEn(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitNewCategory() }
                        if (e.key === 'Escape') { setAddingCategory(false); setNewCatEn(''); setNewCatKm('') }
                      }} />
                    <div className="flex gap-1">
                      <Input placeholder={t('category_form_km_placeholder')} value={newCatKm}
                        onChange={(e) => setNewCatKm(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitNewCategory() }
                          if (e.key === 'Escape') { setAddingCategory(false); setNewCatEn(''); setNewCatKm('') }
                        }} />
                      <Button type="button" size="sm" onClick={commitNewCategory}>{t('save')}</Button>
                    </div>
                  </div>
                ) : (
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allCategories.map((c) => (
                        <SelectItem key={c} value={c} className="capitalize">{catLabel(c)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{t('maintenance_form_status')}</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof form.status }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t('status_pending')}</SelectItem>
                    <SelectItem value="in_progress">{t('status_in_progress')}</SelectItem>
                    <SelectItem value="completed">{t('status_completed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('maintenance_form_reported')} *</Label>
                <DateInput value={form.reportedDate}
                  onChange={(e) => setForm((f) => ({ ...f, reportedDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('maintenance_form_completed')}</Label>
                <DateInput value={form.completedDate}
                  onChange={(e) => setForm((f) => ({ ...f, completedDate: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('maintenance_form_fee')}</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.repairFeeUsd}
                onChange={(e) => setForm((f) => ({ ...f, repairFeeUsd: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>{t('maintenance_form_description')}</Label>
              <Textarea placeholder={t('maintenance_form_description_placeholder')} rows={2} value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>{t('maintenance_form_notes')}</Label>
              <Textarea placeholder={t('maintenance_form_notes_placeholder')} rows={2} value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>{t('cancel')}</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? t('saving') : editing ? t('update') : t('save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
