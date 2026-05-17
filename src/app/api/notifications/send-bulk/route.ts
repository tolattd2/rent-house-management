import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendTelegramMessage, buildReminderMessage } from '@/lib/notifications'

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const unpaid = await db.billing.findMany({
    where: { paymentStatus: { in: ['unpaid', 'partial'] } },
    include: { tenant: true, room: true },
  })

  let sent = 0
  let failed = 0

  for (const billing of unpaid) {
    if (!billing.tenant) { failed++; continue }

    const msg = buildReminderMessage({
      tenantName: billing.tenant.fullName,
      roomNumber: billing.room?.roomNumber ?? '—',
      billingMonth: billing.billingMonth,
      totalUsd: billing.totalUsd,
      totalRiel: billing.totalRiel,
    })

    const result = await sendTelegramMessage(msg)

    await db.notification.create({
      data: {
        tenantId: billing.tenantId,
        type: 'bulk_reminder',
        message: msg,
        status: result.ok ? 'sent' : 'failed',
      },
    })

    result.ok ? sent++ : failed++
  }

  return NextResponse.json({ ok: true, sent, failed })
}
