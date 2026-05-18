'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Send, CheckCircle, XCircle, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'

interface Props {
  notifications: Array<{
    id: string; type: string; message: string; status: string; createdAt: Date
    tenant: { id: string; fullName: string; phone: string } | null
  }>
  unpaidBillings: Array<{
    id: string; billingMonth: string; totalUsd: number; totalRiel: number; paymentStatus: string
    tenant: { id: string; fullName: string; phone: string } | null
    room: { id: string; roomNumber: string } | null
  }>
}

export function NotificationsClient({ notifications, unpaidBillings }: Props) {
  const router = useRouter()
  const { t } = useLanguage()
  const [sending, setSending] = useState<string | null>(null)
  const [sendingBulk, setSendingBulk] = useState(false)

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
    const res = await fetch('/api/notifications/send-bulk', { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      toast({ title: `Sent ${data.sent} reminders, ${data.failed} failed` })
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
          <p className="text-muted-foreground text-sm">{unpaidBillings.length} {t('notifications_unpaid')}</p>
        </div>
        <Button onClick={handleBulkReminder} loading={sendingBulk} disabled={unpaidBillings.length === 0}>
          <Send className="w-4 h-4 mr-2" />{t('notifications_send_all')} ({unpaidBillings.length})
        </Button>
      </div>

      {/* Unpaid billings needing reminders */}
      {unpaidBillings.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4 text-orange-500" />{t('notifications_pending_reminders')}
          </CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {unpaidBillings.map((bill, i) => (
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
                        {t('room')} {bill.room?.roomNumber} · {bill.billingMonth}
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
                    <Button size="sm" variant="outline"
                      onClick={() => handleSendReminder(bill.tenant!.id, bill.id)}
                      loading={sending === bill.id}
                      disabled={!bill.tenant}
                    >
                      <MessageSquare className="w-3.5 h-3.5 mr-1.5" />{t('notifications_remind')}
                    </Button>
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
            {notifications.map((n, i) => (
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
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
            {notifications.length === 0 && (
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
