'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  ArrowLeft, Bell, Plus, Pencil, Trash2, CheckCircle2, RotateCcw,
  LogIn, LogOut, Wrench, AlertTriangle, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'
import { NoticeDialog, type TenantNotice } from '@/components/tenants/notice-dialog'
import { formatDate } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useBack } from '@/hooks/use-back'
import { useLanguage } from '@/contexts/language-context'
import { useRoomLabel } from '@/contexts/branches-context'
import { useDeleteWithUndo } from '@/hooks/use-delete-with-undo'

type NoticeType = 'move_in' | 'move_out' | 'repair' | 'complaint' | 'general'

interface NoticeRow {
  id: string
  type: NoticeType
  message: string
  expectedDate: string
  status: 'open' | 'resolved'
  resolvedAt: Date | string | null
  createdAt: Date | string
  tenant: { id: string; fullName: string } | null
}

interface RoomData {
  id: string
  roomNumber: string
  branch: string
  status: string
  tenants: Array<{ id: string; fullName: string }>
  notices: NoticeRow[]
}

const NOTICE_META: Record<NoticeType, { icon: typeof Bell; badge: 'error' | 'warning' | 'secondary' | 'success' }> = {
  move_in: { icon: LogIn, badge: 'success' },
  move_out: { icon: LogOut, badge: 'error' },
  repair: { icon: Wrench, badge: 'warning' },
  complaint: { icon: AlertTriangle, badge: 'warning' },
  general: { icon: FileText, badge: 'secondary' },
}

export function RoomNoticeHistoryClient({ room }: { room: RoomData }) {
  const router = useRouter()
  const back = useBack(`/rooms`)
  const { data: session } = useSession()
  const canManage = session?.user?.role ? session.user.role !== 'guest' : false
  const { t } = useLanguage()
  const roomLabel = useRoomLabel()
  const [notices, setNotices] = useState(room.notices)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<NoticeRow | null>(null)
  const { triggerDelete, dialogState, closeDialog } = useDeleteWithUndo()

  const openCount = notices.filter((n) => n.status === 'open').length

  async function toggleResolved(n: NoticeRow) {
    const next = n.status === 'open' ? 'resolved' : 'open'
    const res = await fetch(`/api/notices/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    const data = await res.json()
    if (data.ok) {
      setNotices((prev) => prev.map((x) => (x.id === n.id ? { ...x, ...data.record } : x)))
      toast({ title: next === 'resolved' ? t('notice_resolved_toast') : t('notice_reopened_toast') })
      router.refresh()
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
  }

  function handleDelete(n: NoticeRow) {
    triggerDelete({
      itemName: `${t('notice_tab')} — ${t('room')} ${roomLabel(room)}`,
      onRemove: () => setNotices((prev) => prev.filter((x) => x.id !== n.id)),
      onRestore: () => setNotices((prev) => [n, ...prev]),
      onExecute: () => fetch(`/api/notices/${n.id}`, { method: 'DELETE' }).then((r) => r.json()),
      onSuccess: () => router.refresh(),
    })
  }

  function handleSaved(record: TenantNotice) {
    if (editing) {
      setNotices((prev) => prev.map((n) => (n.id === record.id ? { ...n, ...record } : n)))
    }
    setShowForm(false)
    setEditing(null)
    router.refresh()
  }

  const targetLabel = `${t('room')} ${roomLabel(room)} · ${room.branch}`

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={back} className="h-9 px-2">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {t('notice_tab')} — {t('room')} {roomLabel(room)}
            </h1>
            <p className="text-muted-foreground text-sm">
              {room.branch} · {openCount} {t('notice_open_count')}
            </p>
          </div>
        </div>
        {canManage && (
          <Button onClick={() => { setEditing(null); setShowForm(true) }}>
            <Plus className="w-4 h-4 mr-2" /> {t('notice_add')}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          {notices.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{t('notice_none')}</p>
            </div>
          )}
          {notices.map((n) => {
            const meta = NOTICE_META[n.type]
            const Icon = meta.icon
            const resolved = n.status === 'resolved'
            return (
              <div
                key={n.id}
                className={`p-4 border rounded-xl ${
                  resolved
                    ? 'border-border bg-muted/30'
                    : 'border-amber-300 dark:border-amber-900/70 bg-amber-50/60 dark:bg-amber-950/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      resolved ? 'bg-muted' : 'bg-amber-100 dark:bg-amber-900/40'
                    }`}>
                      <Icon className={`w-4 h-4 ${
                        resolved ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'
                      }`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={resolved ? 'secondary' : meta.badge}>
                          {t(`notice_type_${n.type}` as Parameters<typeof t>[0])}
                        </Badge>
                        <Badge variant={resolved ? 'success' : 'warning'}>
                          {t(resolved ? 'notice_status_resolved' : 'notice_status_open')}
                        </Badge>
                        {n.tenant && (
                          <Link
                            href={`/tenants/${n.tenant.id}`}
                            className="text-xs text-muted-foreground hover:text-primary"
                          >
                            · {n.tenant.fullName}
                          </Link>
                        )}
                      </div>
                      <p className={`text-sm mt-1.5 whitespace-pre-wrap break-words ${resolved ? 'text-muted-foreground' : ''}`}>
                        {n.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {n.expectedDate && (
                          <span className="font-medium text-amber-700 dark:text-amber-500">
                            {t('notice_expected')}: {formatDate(n.expectedDate)} ·{' '}
                          </span>
                        )}
                        {t('notice_added_on')} {formatDate(String(n.createdAt))}
                        {resolved && n.resolvedAt && ` · ${t('notice_status_resolved')} ${formatDate(String(n.resolvedAt))}`}
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost" size="sm" className="h-8 px-2"
                        title={resolved ? t('notice_reopen') : t('notice_resolve')}
                        onClick={() => toggleResolved(n)}
                      >
                        {resolved
                          ? <RotateCcw className="w-3.5 h-3.5" />
                          : <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-8 px-2"
                        onClick={() => { setEditing(n); setShowForm(true) }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-8 px-2 text-red-500 hover:text-red-600"
                        onClick={() => handleDelete(n)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={dialogState.open}
        itemName={dialogState.itemName}
        onClose={closeDialog}
        onConfirm={dialogState.onConfirm}
      />

      {showForm && (
        <NoticeDialog
          roomId={editing ? undefined : room.id}
          notice={editing}
          tenantLabel={targetLabel}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSave={handleSaved}
        />
      )}
    </div>
  )
}
