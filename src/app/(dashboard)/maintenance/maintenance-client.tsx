'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, Wrench, Trash2, Pencil, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatDate, roomLabel } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'

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
type Tenant = { id: string; fullName: string }

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
  const isAdmin = session?.user?.role === 'admin'
  const { t } = useLanguage()
  const [records, setRecords] = useState(initial)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<MaintenanceRecord | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const filtered = records.filter((r) => {
    const matchSearch =
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.room?.roomNumber ?? '').includes(search) ||
      (r.tenant?.fullName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    const matchBranch = branchFilter === 'all' || (r.room?.branch ?? 'Takmoa') === branchFilter
    return matchSearch && matchStatus && matchBranch
  })

  const totalFee = filtered.reduce((s, r) => s + r.repairFeeUsd, 0)

  const branches = [...new Set(rooms.map((r) => r.branch ?? 'Takmoa'))].sort()
  const filteredRooms = form.branch ? rooms.filter((r) => (r.branch ?? 'Takmoa') === form.branch) : []

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
      branch: r.room?.branch ?? 'Takmoa',
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

  async function handleDelete(id: string) {
    if (!confirm(t('maintenance_delete_confirm'))) return
    const res = await fetch(`/api/maintenance/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.ok) {
      setRecords((prev) => prev.filter((r) => r.id !== id))
      toast({ title: t('maintenance_deleted') })
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
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
        {isAdmin && (
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> {t('maintenance_add')}
          </Button>
        )}
      </div>

      {/* Branch filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', ...branches] as const).map((b) => {
          const branchRecords = b === 'all' ? records : records.filter((r) => (r.room?.branch ?? 'Takmoa') === b)
          const openCount = branchRecords.filter((r) => r.status !== 'completed').length
          return (
            <button
              key={b}
              onClick={() => setBranchFilter(b)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                branchFilter === b
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background border-border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {b === 'all' ? t('all_branches') : b}
              {openCount > 0 && (
                <span className={`ml-2 text-xs rounded-full px-1.5 py-0.5 ${branchFilter === b ? 'bg-white/20' : 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'}`}>
                  {openCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(['all', 'pending', 'in_progress', 'completed'] as const).map((s) => {
          const count = s === 'all' ? filtered.length : filtered.filter((r) => r.status === s).length
          return (
            <Card key={s} className={`p-4 cursor-pointer border-2 transition-colors ${statusFilter === s ? 'border-primary' : 'border-transparent'}`}
              onClick={() => setStatusFilter(s)}>
              <p className="text-xs text-muted-foreground capitalize">{s === 'all' ? t('maintenance_total') : t(`status_${s}` as Parameters<typeof t>[0])}</p>
              <p className="text-2xl font-bold mt-1">{count}</p>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('maintenance_search')} className="pl-9" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="text-sm text-muted-foreground self-center ml-auto">
          {t('maintenance_total_fees')} <span className="font-semibold text-foreground">{formatCurrency(totalFee)}</span>
        </div>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[950px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('maintenance_col_title')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('maintenance_col_branch')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('maintenance_col_room')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('maintenance_col_tenant')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('maintenance_col_reported')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('maintenance_col_completed')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('maintenance_col_fee')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('maintenance_col_status')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('maintenance_col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const sc = statusConfig[r.status]
                return (
                  <motion.tr key={r.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className={`border-b border-border last:border-0 hover:bg-muted/40 ${i % 2 ? 'bg-muted/10' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{r.category}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.room?.branch ?? '—'}
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
                      <Badge variant={sc.color} className="flex items-center gap-1 w-fit">
                        <sc.icon className="w-3 h-3" />
                        {t(`status_${r.status}` as Parameters<typeof t>[0])}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}
                            className="text-red-500 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
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
        </div>
      </Card>

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
                <Select value={form.branch} onValueChange={(v) => setForm((f) => ({ ...f, branch: v, roomId: '' }))}>
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
                <Select value={form.roomId} onValueChange={(v) => setForm((f) => ({ ...f, roomId: v }))}
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
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('maintenance_form_category')}</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Input type="date" value={form.reportedDate}
                  onChange={(e) => setForm((f) => ({ ...f, reportedDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('maintenance_form_completed')}</Label>
                <Input type="date" value={form.completedDate}
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
