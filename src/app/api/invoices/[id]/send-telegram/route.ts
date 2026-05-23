import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendTelegramMessage, buildReminderMessage } from '@/lib/notifications'
import { invalidate } from '@/lib/revalidate'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const billing = await db.billing.findUnique({
    where: { id },
    include: { tenant: true, room: true },
  })
  if (!billing) return NextResponse.json({ ok: false, error: 'Billing not found' }, { status: 404 })

  const msg = buildReminderMessage({
    tenantName: billing.tenant?.fullName ?? 'Unknown',
    roomNumber: billing.room?.roomNumber ?? '—',
    billingMonth: billing.billingMonth,
    totalUsd: billing.totalUsd,
    totalRiel: billing.totalRiel,
    branchName: billing.room?.branch,
  })

  const result = await sendTelegramMessage(msg)

  const invoice = await db.invoice.findUnique({ where: { billingId: id } })
  if (invoice) {
    await db.invoice.update({ where: { id: invoice.id }, data: { sentTelegram: result.ok } })
  }

  if (billing.tenantId) {
    await db.notification.create({
      data: {
        tenantId: billing.tenantId,
        type: 'telegram',
        message: msg,
        status: result.ok ? 'sent' : 'failed',
      },
    })
  }

  if (invoice) invalidate('invoices', 'notifications')
  else if (billing.tenantId) invalidate('notifications')
  return NextResponse.json(result)
}
