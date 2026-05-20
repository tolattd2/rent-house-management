'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Send, CheckCircle, XCircle, MessageSquare, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'

interface Props {
  notifications: Array<{
    id: string; type: string; message: string; status: string; createdAt: Date
    tenant: { id: string; fullName: string; phone: string; room: { branch: string } | null } | null
  }>
  unpaidBillings: Array<{
    id: string; billingMonth: string; totalUsd: number; totalRiel: number; paymentStatus: string
    tenant: { id: string; fullName: string; phone: string; telegramChatId: string } | null
    room: { id: string; roomNumber: string; branch: string } | null
  }>
}

export function NotificationsClient({ notifications, unpaidBillings }: Props) {
  const router = useRouter()
  const { t } = useLanguage()
  const [sending, setSending] = useState<string | null>(null)
  const [sendingBulk, setSendingBulk] = useState(false)
  const [branchFilter, setBranchFilter] = useState('all')
  const [search, setSearch] = useState('')

  const branches = useMemo(() => {
    const set = new Set<string>()
    unpaidBillings.forEach((b) => set.add(b.room?.branch ?? 'Takmoa'))
    notifications.forEach((n) => {
      if (n.tenant) set.add(n.tenant.room?.branch ?? 'Takmoa')
    })
    return [...set].sort()
  }, [unpaidBillings, notifications])

  const filteredUnpaid = useMemo(() => {
    const q = search.trim().toLowerCase()
    return unpaidBillings.filter((b) => {
      const matchBranch = branchFilter === 'all' || (b.room?.branch ?? 'Takmoa') === branchFilter
      const matchSearch =
        !q ||
        (b.tenant?.fullName ?? '').toLowerCase().includes(q) ||
        (b.room?.roomNumber ?? '').toLowerCase().includes(q) ||
        b.billingMonth.toLowerCase().includes(q)
      return matchBranch && matchSearch
    })
  }, [unpaidBillings, branchFilter, search])

  const filteredNotifications = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notifications.filter((n) => {
      const matchBranch =
        branchFilter === 'all' || (n.tenant?.room?.branch ?? 'Takmoa') === branchFilter
      const matchSearch =
        !q ||
        (n.tenant?.fullName ?? '').toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q)
      return matchBranch && matchSearch
    })
  }, [notifications, branchFilter, search])

  const handleSendReminder = async (tenantId: string, billingId: string) => {
    setSending(billingId)
    const res = await fetch('/api/notifications/send-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, billingId }),
    })
    const data = await res.json()
    if (data.ok) {
      toast({ title: 'Reminder sent!' })
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('notifications_title')}</h1>
          <p className="text-muted-foreground text-sm">{filteredUnpaid.length} {t('notifications_unpaid')}</p>
        </div>
        <Button onClick={handleBulkReminder} loading={sendingBulk} disabled={filteredUnpaid.length === 0}>
          <Send className="w-4 h-4 mr-2" />{t('notifications_send_all')} ({filteredUnpaid.length})
        </Button>
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
              : unpaidBillings.filter((bl) => (bl.room?.branch ?? 'Takmoa') === b)
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
      </div>

      {/* Unpaid billings needing reminders */}
      {filteredUnpaid.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4 text-orange-500" />{t('notifications_pending_reminders')}
          </CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filteredUnpaid.map((bill) => (
                <div key={bill.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                      <Bell className="w-4 h-4 text-orange-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{bill.tenant?.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {bill.room?.branch ?? 'Takmoa'} · {t('room')} {bill.room?.roomNumber} · {bill.billingMonth}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold text-sm">{formatCurrency(bill.totalUsd)}</p>
                      <Badge variant={bill.paymentStatus === 'partial' ? 'warning' : 'error'} className="capitalize text-xs">
                        {t(bill.paymentStatus === 'partial' ? 'status_partial' : 'status_unpaid')}
                      </Badge>
                    </div>
                    {bill.tenant?.telegramChatId ? (
                      <Button size="sm" variant="outline"
                        onClick={() => handleSendReminder(bill.tenant!.id, bill.id)}
                        loading={sending === bill.id}
                      >
                        <MessageSquare className="w-3.5 h-3.5 mr-1.5" />{t('notifications_remind')}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Not linked</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notification history */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('notifications_history')}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {filteredNotifications.map((n) => (
              <div key={n.id}
                className="flex items-start gap-3 px-4 py-3"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${n.status === 'sent' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                  {n.status === 'sent'
                    ? <CheckCircle className="w-4 h-4 text-green-600" />
                    : <XCircle className="w-4 h-4 text-red-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{n.tenant?.fullName ?? 'Unknown'}</p>
                    <Badge variant={n.status === 'sent' ? 'success' : 'error'} className="capitalize text-xs">{n.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {n.tenant?.room?.branch ? `${n.tenant.room.branch} · ` : ''}
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
            {filteredNotifications.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>{t('notifications_empty')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
