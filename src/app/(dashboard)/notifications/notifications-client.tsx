'use client'

import { Fragment, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Bell, Send, MessageSquare, Search, ImagePlus, AlertTriangle, Settings, History, RotateCcw, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TableScroll } from '@/components/ui/table-scroll'
import { formatCurrency, cn, groupByBranch } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import { useBranches, useRoomLabel } from '@/contexts/branches-context'
import { usePersistentState } from '@/hooks/use-persistent-state'
import { CustomReminderDialog } from '@/components/notifications/custom-reminder-dialog'

type Billing = {
  id: string; billingMonth: string; totalUsd: number; totalRiel: number; paymentStatus: string
  tenant: { id: string; fullName: string; phone: string; telegramChatId: string } | null
  room: { id: string; roomNumber: string; branch: string } | null
}

type NotificationRow = {
  id: string; type: string; message: string; status: string; createdAt: Date | string
  tenant: {
    id: string; fullName: string; phone: string; telegramChatId: string
    room: { branch: string; roomNumber: string } | null
  } | null
}

interface Props {
  notifications: NotificationRow[]
  unpaidBillings: Billing[]
  allBillings: Billing[]
  linkedTenants: Array<{ id: string; room: { branch: string } | null }>
}

type Tab = 'pending' | 'history'

const STATUS_BADGE_VARIANT: Record<string, 'success' | 'warning' | 'error'> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'error',
}

const NOTIF_STATUS_BADGE: Record<string, 'success' | 'warning' | 'error'> = {
  sent: 'success',
  pending: 'warning',
  failed: 'error',
}

const NOTIF_TYPE_KEY = {
  reminder: 'notif_type_reminder',
  late_reminder: 'notif_type_late_reminder',
  bulk_reminder: 'notif_type_bulk_reminder',
  custom: 'notif_type_custom',
} as const

function formatSentAt(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

export function NotificationsClient({ notifications, unpaidBillings, linkedTenants }: Props) {
  const router = useRouter()
  const { t } = useLanguage()
  const { data: session } = useSession()
  const canSend = session?.user?.role ? session.user.role !== 'guest' : false
  const roomLabel = useRoomLabel()
  const [sending, setSending] = useState<string | null>(null)
  const [sendingBulk, setSendingBulk] = useState<boolean>(false)
  const [resending, setResending] = useState<string | null>(null)
  const [branchFilter, setBranchFilter] = usePersistentState('notifications/branch', 'all')
  const [statusFilter, setStatusFilter] = usePersistentState<'all' | 'paid' | 'unpaid' | 'partial'>('notifications/status', 'all')
  const [historyStatus, setHistoryStatus] = usePersistentState<'all' | 'sent' | 'failed'>('notifications/historyStatus', 'all')
  const [search, setSearch] = usePersistentState('notifications/search', '')
  const [tab, setTab] = usePersistentState<Tab>('notifications/tab', 'pending')
  const [showCustom, setShowCustom] = useState(false)
  const [composeTenant, setComposeTenant] = useState<{ id: string; name: string } | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const branches = useBranches().map((b) => b.name)

  const linkedCount = useMemo(() => (
    branchFilter === 'all'
      ? linkedTenants.length
      : linkedTenants.filter((tn) => tn.room?.branch === branchFilter).length
  ), [linkedTenants, branchFilter])

  const matchesFilters = (b: Billing) => {
    const q = search.trim().toLowerCase()
    const matchBranch = branchFilter === 'all' || b.room?.branch === branchFilter
    const matchStatus = statusFilter === 'all' || b.paymentStatus === statusFilter
    const matchSearch =
      !q ||
      (b.tenant?.fullName ?? '').toLowerCase().includes(q) ||
      (b.room?.roomNumber ?? '').toLowerCase().includes(q) ||
      b.billingMonth.toLowerCase().includes(q)
    return matchBranch && matchStatus && matchSearch
  }

  const filteredUnpaid = useMemo(
    () => unpaidBillings.filter(matchesFilters),
    [unpaidBillings, branchFilter, statusFilter, search],
  )

  const unpaidGroups = useMemo(
    () => groupByBranch(filteredUnpaid.map((b) => ({ ...b, roomNumber: b.room?.roomNumber ?? '', branch: b.room?.branch ?? '' }))),
    [filteredUnpaid],
  )

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notifications.filter((n) => {
      const matchBranch = branchFilter === 'all' || n.tenant?.room?.branch === branchFilter
      const matchStatus = historyStatus === 'all' || n.status === historyStatus
      const matchSearch =
        !q ||
        (n.tenant?.fullName ?? '').toLowerCase().includes(q) ||
        (n.tenant?.phone ?? '').toLowerCase().includes(q) ||
        (n.tenant?.room?.roomNumber ?? '').toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q)
      return matchBranch && matchStatus && matchSearch
    })
  }, [notifications, branchFilter, historyStatus, search])

  const handleSendReminder = async (
    tenantId: string,
    billingId: string,
    kind: 'invoice' | 'late',
    lang: 'en' | 'km' = 'km',
  ) => {
    setSending(`${billingId}:${kind}`)
    const res = await fetch('/api/notifications/send-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, billingId, lang, kind }),
    })
    const data = await res.json()
    if (data.ok) {
      toast({ title: kind === 'late' ? t('notifications_late_notified') : t('notifications_invoice_notified') })
      router.refresh()
    } else {
      toast({ title: 'Failed to send', description: data.error, variant: 'destructive' })
    }
    setSending(null)
  }

  const handleBulkReminder = async () => {
    setSendingBulk(true)
    const res = await fetch('/api/notifications/send-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch: branchFilter === 'all' ? undefined : branchFilter }),
    })
    const data = await res.json()
    if (data.ok) {
      toast({ title: `Sent ${data.sent}, ${data.failed} failed, ${data.skipped ?? 0} not linked` })
      router.refresh()
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
    setSendingBulk(false)
  }

  const handleResend = async (notificationId: string) => {
    setResending(notificationId)
    const res = await fetch('/api/notifications/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId }),
    })
    const data = await res.json()
    if (data.ok) {
      toast({ title: t('notifications_resent') })
      router.refresh()
    } else {
      toast({ title: 'Failed to resend', description: data.error, variant: 'destructive' })
    }
    setResending(null)
  }

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('notifications_title')}</h1>
          <p className="text-muted-foreground text-sm">{filteredUnpaid.length} {t('notifications_unpaid')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          {canSend && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">{t('notifications_invoice_reminder')}</span>
              <Button
                size="sm"
                onClick={handleBulkReminder}
                loading={sendingBulk}
                disabled={filteredUnpaid.length === 0 || sendingBulk}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />{t('notifications_send_all_tenants')} ({filteredUnpaid.length})
              </Button>
            </div>
          )}
          {canSend && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">{t('notifications_custom_reminder')}</span>
              <Button size="sm" variant="outline" onClick={() => setShowCustom(true)}>
                <ImagePlus className="w-3.5 h-3.5 mr-1.5" />{t('notifications_custom_compose')}
              </Button>
            </div>
          )}
          {canSend && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">{t('settings_telegram_bot')}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push('/settings?tab=telegram')}
              >
                <Settings className="w-3.5 h-3.5 mr-1.5" />{t('nav_settings')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('notifications_search')}
            className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(['all', ...branches] as const).map((b) => {
          const count = (
            b === 'all'
              ? unpaidBillings
              : unpaidBillings.filter((bl) => bl.room?.branch === b)
          ).length
          return (
            <Button
              key={b}
              variant={branchFilter === b ? 'default' : 'outline'}
              size="sm"
              className="h-9 px-3 text-sm"
              onClick={() => setBranchFilter(b)}
            >
              {b === 'all' ? t('all_branches') : b}
              {count > 0 && (
                <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 ${branchFilter === b ? 'bg-white/20' : 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'}`}>
                  {count}
                </span>
              )}
            </Button>
          )
        })}
        {tab === 'pending' ? (
          <div className="flex items-center gap-1 ml-1">
            {(['all', 'paid', 'unpaid', 'partial'] as const).map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? 'default' : 'outline'}
                size="sm"
                className="h-9 px-3 text-sm"
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all'
                  ? t('billing_all_status')
                  : t(s === 'paid' ? 'status_paid' : s === 'partial' ? 'status_partial' : 'status_unpaid')}
              </Button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1 ml-1">
            {(['all', 'sent', 'failed'] as const).map((s) => (
              <Button
                key={s}
                variant={historyStatus === s ? 'default' : 'outline'}
                size="sm"
                className="h-9 px-3 text-sm"
                onClick={() => setHistoryStatus(s)}
              >
                {s === 'all'
                  ? t('billing_all_status')
                  : t(s === 'sent' ? 'notif_status_sent' : 'notif_status_failed')}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center bg-muted rounded-lg p-1 gap-0.5">
        {([
          { key: 'pending' as const, label: t('notifications_tab_pending'), count: filteredUnpaid.length, icon: Bell },
          { key: 'history' as const, label: t('notifications_tab_history'), count: filteredHistory.length, icon: History },
        ]).map(({ key, label, count, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all min-h-[32px]',
              tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
            <span className={cn(
              'ml-1 text-xs rounded-full px-1.5 py-0.5',
              tab === key
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                : 'bg-background/60 text-muted-foreground',
            )}>{count}</span>
          </button>
        ))}
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {tab === 'pending' ? (
          filteredUnpaid.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{t('notifications_empty')}</p>
            </div>
          ) : (
            unpaidGroups.map((group) => (
              <div key={group.branch} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{group.branch}</h2>
                  <span className="text-xs text-muted-foreground tabular-nums">({group.items.length})</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {group.items.map((b) => (
              <Card key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="font-bold leading-tight truncate">
                      {b.room ? `${t('room')} ${roomLabel(b.room)}` : '—'}
                    </p>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{b.tenant?.fullName ?? '—'}</p>
                    {b.tenant?.phone && (
                      <p className="text-xs text-muted-foreground tabular-nums">{b.tenant.phone}</p>
                    )}
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{b.billingMonth}</p>
                  </div>
                  <Badge variant={STATUS_BADGE_VARIANT[b.paymentStatus] ?? 'secondary'} className="shrink-0 capitalize">
                    {t(
                      b.paymentStatus === 'paid' ? 'status_paid'
                        : b.paymentStatus === 'partial' ? 'status_partial'
                          : 'status_unpaid',
                    )}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('branch')}</p>
                    <p className="truncate">{b.room?.branch ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('notifications_col_total')}</p>
                    <p className="font-semibold tabular-nums">{formatCurrency(b.totalUsd)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{Math.round(b.totalRiel).toLocaleString()} ៛</p>
                  </div>
                </div>
                {!b.tenant?.telegramChatId ? (
                  <p className="text-xs text-muted-foreground italic pt-2 border-t border-border">
                    {t('notifications_not_linked')}
                  </p>
                ) : canSend ? (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <Button
                      size="sm" variant="outline" className="flex-1 min-w-[6rem] h-10"
                      onClick={() => handleSendReminder(b.tenant!.id, b.id, 'invoice')}
                      loading={sending === `${b.id}:invoice`}
                      disabled={sending !== null}
                    >
                      <MessageSquare className="w-3.5 h-3.5 mr-1" />{t('notifications_invoice_notified')}
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="flex-1 min-w-[6rem] h-10 text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                      onClick={() => handleSendReminder(b.tenant!.id, b.id, 'late')}
                      loading={sending === `${b.id}:late`}
                      disabled={sending !== null}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 mr-1" />{t('notifications_late_notified')}
                    </Button>
                    <Button
                      size="sm" variant="outline" className="flex-1 min-w-[6rem] h-10"
                      onClick={() => setComposeTenant({ id: b.tenant!.id, name: b.tenant!.fullName })}
                    >
                      <ImagePlus className="w-3.5 h-3.5 mr-1" />{t('notifications_custom_compose')}
                    </Button>
                  </div>
                ) : null}
              </Card>
                ))}
              </div>
            ))
          )
        ) : (
          filteredHistory.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{t('notifications_history_empty')}</p>
            </div>
          ) : (
            filteredHistory.map((n) => {
              const typeKey = NOTIF_TYPE_KEY[n.type as keyof typeof NOTIF_TYPE_KEY]
              const typeLabel = typeKey ? t(typeKey) : n.type
              const StatusIcon = n.status === 'sent' ? CheckCircle2 : n.status === 'failed' ? XCircle : Clock
              const isExpanded = !!expanded[n.id]
              return (
                <Card key={n.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{n.tenant?.fullName ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {n.tenant?.room?.branch ?? '—'}
                        {n.tenant?.room?.roomNumber ? ` · ${t('room')} ${n.tenant.room.roomNumber}` : ''}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">{formatSentAt(n.createdAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant={NOTIF_STATUS_BADGE[n.status] ?? 'secondary'} className="inline-flex items-center gap-1">
                        <StatusIcon className="w-3 h-3" />
                        {t(n.status === 'sent' ? 'notif_status_sent' : n.status === 'failed' ? 'notif_status_failed' : 'notif_status_pending')}
                      </Badge>
                      <Badge variant="secondary" className="font-normal">{typeLabel}</Badge>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleExpanded(n.id)}
                    className={cn(
                      'block w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-pre-wrap break-words mb-2',
                      !isExpanded && 'line-clamp-2',
                    )}
                  >
                    {n.message}
                  </button>
                  {n.tenant?.telegramChatId && canSend && (
                    <div className="flex pt-2 border-t border-border">
                      <Button
                        size="sm" variant="outline" className="flex-1 h-10"
                        onClick={() => handleResend(n.id)}
                        loading={resending === n.id}
                        disabled={resending !== null}
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />{t('notifications_resend')}
                      </Button>
                    </div>
                  )}
                </Card>
              )
            })
          )
        )}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <TableScroll>
            {tab === 'pending' ? (
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('room')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('tenant')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('branch')}</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('notifications_col_total')}</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('status')}</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnpaid.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-muted-foreground">
                        <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>{t('notifications_empty')}</p>
                      </td>
                    </tr>
                  )}
                  {unpaidGroups.map((group) => (
                    <Fragment key={group.branch}>
                      <tr className="bg-muted/40">
                        <td colSpan={6} className="px-4 py-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.branch}</span>
                          <span className="ml-2 text-xs text-muted-foreground tabular-nums">({group.items.length})</span>
                        </td>
                      </tr>
                      {group.items.map((b, i) => (
                    <tr key={b.id} className={`border-b border-border last:border-0 hover:bg-muted/30 ${i % 2 ? 'bg-muted/10' : ''}`}>
                      <td className="px-4 py-3 font-medium">
                        {b.room ? `${t('room')} ${roomLabel(b.room)}` : '—'}
                        <p className="text-xs text-muted-foreground font-mono">{b.billingMonth}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{b.tenant?.fullName ?? '—'}</p>
                        {b.tenant?.phone && (
                          <p className="text-xs text-muted-foreground tabular-nums">{b.tenant.phone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{b.room?.branch ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-semibold tabular-nums">{formatCurrency(b.totalUsd)}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">{Math.round(b.totalRiel).toLocaleString()} ៛</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={STATUS_BADGE_VARIANT[b.paymentStatus] ?? 'secondary'} className="capitalize">
                          {t(
                            b.paymentStatus === 'paid' ? 'status_paid'
                              : b.paymentStatus === 'partial' ? 'status_partial'
                                : 'status_unpaid',
                          )}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {!b.tenant?.telegramChatId ? (
                          <span className="block text-right text-xs text-muted-foreground italic">
                            {t('notifications_not_linked')}
                          </span>
                        ) : canSend ? (
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <Button
                              size="sm" variant="outline"
                              title={t('notifications_invoice_notified')}
                              onClick={() => handleSendReminder(b.tenant!.id, b.id, 'invoice')}
                              loading={sending === `${b.id}:invoice`}
                              disabled={sending !== null}
                            >
                              <MessageSquare className="w-3.5 h-3.5 mr-1" />{t('notifications_invoice_notified')}
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              title={t('notifications_late_notified')}
                              onClick={() => handleSendReminder(b.tenant!.id, b.id, 'late')}
                              loading={sending === `${b.id}:late`}
                              disabled={sending !== null}
                              className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 mr-1" />{t('notifications_late_notified')}
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              title={t('notifications_custom_compose')}
                              onClick={() => setComposeTenant({ id: b.tenant!.id, name: b.tenant!.fullName })}
                            >
                              <ImagePlus className="w-3.5 h-3.5 mr-1" />{t('notifications_custom_compose')}
                            </Button>
                          </div>
                        ) : (
                          <span className="block text-right text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('notifications_history_col_sent_at')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('tenant')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('notifications_history_col_type')}</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('status')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('notifications_history_col_message')}</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-muted-foreground">
                        <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>{t('notifications_history_empty')}</p>
                      </td>
                    </tr>
                  )}
                  {filteredHistory.map((n, i) => {
                    const typeKey = NOTIF_TYPE_KEY[n.type as keyof typeof NOTIF_TYPE_KEY]
                    const typeLabel = typeKey ? t(typeKey) : n.type
                    const StatusIcon = n.status === 'sent' ? CheckCircle2 : n.status === 'failed' ? XCircle : Clock
                    const isExpanded = !!expanded[n.id]
                    return (
                      <tr key={n.id} className={`border-b border-border last:border-0 hover:bg-muted/30 ${i % 2 ? 'bg-muted/10' : ''}`}>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap align-top">
                          {formatSentAt(n.createdAt)}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="font-medium">{n.tenant?.fullName ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">
                            {n.tenant?.room?.branch ?? '—'}
                            {n.tenant?.room?.roomNumber ? ` · ${t('room')} ${n.tenant.room.roomNumber}` : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant="secondary" className="font-normal">{typeLabel}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center align-top">
                          <Badge variant={NOTIF_STATUS_BADGE[n.status] ?? 'secondary'} className="inline-flex items-center gap-1">
                            <StatusIcon className="w-3 h-3" />
                            {t(n.status === 'sent' ? 'notif_status_sent' : n.status === 'failed' ? 'notif_status_failed' : 'notif_status_pending')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-top max-w-[320px]">
                          <button
                            onClick={() => toggleExpanded(n.id)}
                            className={cn(
                              'text-left text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-pre-wrap break-words',
                              !isExpanded && 'line-clamp-2',
                            )}
                            title={isExpanded ? '' : n.message}
                          >
                            {n.message}
                          </button>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end">
                            {!n.tenant?.telegramChatId ? (
                              <span className="text-xs text-muted-foreground italic">
                                {t('notifications_not_linked')}
                              </span>
                            ) : canSend ? (
                              <Button
                                size="sm" variant="outline"
                                title={t('notifications_resend')}
                                onClick={() => handleResend(n.id)}
                                loading={resending === n.id}
                                disabled={resending !== null}
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-1" />{t('notifications_resend')}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </TableScroll>
        </CardContent>
      </Card>

      {showCustom && (
        <CustomReminderDialog
          mode="bulk"
          branch={branchFilter}
          recipientCount={linkedCount}
          onClose={() => setShowCustom(false)}
          onSent={() => router.refresh()}
        />
      )}

      {composeTenant && (
        <CustomReminderDialog
          mode="single"
          tenantId={composeTenant.id}
          tenantName={composeTenant.name}
          onClose={() => setComposeTenant(null)}
          onSent={() => router.refresh()}
        />
      )}
    </div>
  )
}
