'use client'

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import { useBranches, useRoomLabel } from '@/contexts/branches-context'

export type NoticeType = 'move_in' | 'move_out' | 'repair' | 'complaint' | 'general'

/** One notice logged against a tenant. Date fields arrive as Date from the
 *  server component and as ISO strings from the API — both are handled. */
export interface TenantNotice {
  id: string
  type: NoticeType
  message: string
  expectedDate: string
  status: 'open' | 'resolved'
  resolvedAt: string | Date | null
  createdAt: string | Date
}

/** A tenant the notice can be filed against (used by the global Notices page). */
export interface NoticeTenantOption {
  id: string
  fullName: string
  roomId?: string | null
  room: { roomNumber: string; branch?: string | null } | null
}

/** A room shown in the picker — vacant rooms are pickable too, since a
 *  move-in notice happens before the tenant exists in the system. */
export interface NoticeRoomOption {
  id: string
  roomNumber: string
  branch: string | null
  status?: string
}

interface Props {
  /** Fixed tenant (tenant detail page) — no picker is shown. */
  tenantId?: string
  /** Tenant list for the picker (global Notices page) — shown on create. */
  tenants?: NoticeTenantOption[]
  /** Every room across every branch — required when `tenants` is provided. */
  rooms?: NoticeRoomOption[]
  notice?: TenantNotice | null
  /** Read-only tenant/room label shown while editing from the global page. */
  tenantLabel?: string
  onClose: () => void
  onSave: (record: TenantNotice) => void
}

/** Natural sort so "Room 2" comes before "Room 10". */
function compareRoomNumbers(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export function NoticeDialog({ tenantId, tenants, rooms, notice, tenantLabel, onClose, onSave }: Props) {
  const { t } = useLanguage()
  const branches = useBranches()
  const roomLabel = useRoomLabel()
  const isEdit = !!notice
  const showPicker = !isEdit && !tenantId && !!tenants

  const [branchFilter, setBranchFilter] = useState('')
  // Selected room id — the source of truth for the picker. Tenant is derived
  // from the room (occupied rooms auto-attach their active tenant).
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [type, setType] = useState<NoticeType>(notice?.type ?? 'general')
  const [message, setMessage] = useState(notice?.message ?? '')
  const [expectedDate, setExpectedDate] = useState(notice?.expectedDate ?? '')
  const [saving, setSaving] = useState(false)

  // Build the room-by-branch list sorted by room number, with the active
  // tenant attached when the room is occupied.
  const branchRooms = useMemo(() => {
    if (!rooms) return []
    const occupantByRoomId = new Map<string, NoticeTenantOption>()
    for (const tn of tenants ?? []) {
      if (tn.roomId) occupantByRoomId.set(tn.roomId, tn)
    }
    return rooms
      .filter((r) => !branchFilter || r.branch === branchFilter)
      .map((r) => ({ ...r, occupant: occupantByRoomId.get(r.id) ?? null }))
      .sort((a, b) => compareRoomNumbers(a.roomNumber, b.roomNumber))
  }, [rooms, tenants, branchFilter])

  async function handleSave() {
    if (!message.trim()) {
      toast({ title: t('notice_message_required'), variant: 'destructive' })
      return
    }
    setSaving(true)
    let url: string
    let body: Record<string, unknown>
    if (isEdit) {
      url = `/api/notices/${notice!.id}`
      body = { type, message, expectedDate }
    } else if (tenantId) {
      // Tenant detail page — keep existing tenant-scoped endpoint.
      url = `/api/tenants/${tenantId}/notices`
      body = { type, message, expectedDate }
    } else {
      // Global notices page — room-scoped, with auto-attached tenant.
      if (!selectedRoomId) {
        setSaving(false)
        toast({ title: t('notice_tenant_required'), variant: 'destructive' })
        return
      }
      const picked = branchRooms.find((r) => r.id === selectedRoomId)
      url = '/api/notices'
      body = {
        type,
        message,
        expectedDate,
        roomId: selectedRoomId,
        tenantId: picked?.occupant?.id ?? null,
      }
    }
    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (data.ok) {
      toast({ title: isEdit ? t('notice_updated') : t('notice_added') })
      onSave(data.record)
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('notice_edit') : t('notice_add')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Branch + Room picker — global page, create only. Lists every
              room (occupied + vacant) sorted by room number so move-in
              notices can target a room before a tenant exists. */}
          {showPicker && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('branch')} *</Label>
                <Select value={branchFilter} onValueChange={(v) => { setBranchFilter(v); setSelectedRoomId('') }}>
                  <SelectTrigger><SelectValue placeholder={t('maintenance_form_branch_placeholder')} /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('room')} *</Label>
                <Select value={selectedRoomId} onValueChange={setSelectedRoomId} disabled={!branchFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={branchFilter ? t('maintenance_form_room_placeholder') : t('maintenance_form_room_hint')} />
                  </SelectTrigger>
                  <SelectContent>
                    {branchRooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {t('room')} {roomLabel(r)}
                        {r.occupant ? ` · ${r.occupant.fullName}` : ` · ${t('room_status_vacant')}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Tenant shown read-only while editing from the global page */}
          {isEdit && tenantLabel && (
            <div className="space-y-1.5">
              <Label>{t('tenant')}</Label>
              <div className="h-10 px-3 flex items-center rounded-lg bg-muted/50 text-sm border border-input">
                {tenantLabel}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t('notice_type')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as NoticeType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="move_in">{t('notice_type_move_in')}</SelectItem>
                <SelectItem value="move_out">{t('notice_type_move_out')}</SelectItem>
                <SelectItem value="repair">{t('notice_type_repair')}</SelectItem>
                <SelectItem value="complaint">{t('notice_type_complaint')}</SelectItem>
                <SelectItem value="general">{t('notice_type_general')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('notice_message')} *</Label>
            <Textarea rows={3} value={message} placeholder={t('notice_message_ph')}
              onChange={(e) => setMessage(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t('notice_expected_date')}</Label>
            <DateInput value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t('notice_expected_date_hint')}</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t('saving') : isEdit ? t('update') : t('save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
