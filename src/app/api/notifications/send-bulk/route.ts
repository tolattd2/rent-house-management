import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendTelegramTo, buildReminderMessage } from '@/lib/notifications'
import { invalidate } from '@/lib/revalidate'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  // Optional branch filter — when set, only that branch's unpaid bills are reminded.
  // `lang` is accepted for backwards compatibility but no longer used: every reminder
  // is now bilingual (Khmer + English).
  const body = (await req.json().catch(() => ({}))) as { branch?: string; lang?: string }
  const branch = body.branch?.trim()

  const unpaid = await db.billing.findMany({
    where: {
      paymentStatus: { in: ['unpaid', 'partial'] },
      ...(branch ? { room: { branch } } : {}),
    },
    include: { tenant: true, room: true },
  })

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const billing of unpaid) {
    if (!billing.tenant) { failed++; continue }
    // Tenants who haven't linked their Telegram yet are skipped, not failed.
    if (!billing.tenant.telegramChatId) { skipped++; continue }

    const msg = await buildReminderMessage({
      tenantName: billing.tenant.fullName,
      roomNumber: billing.room?.roomNumber ?? '—',
      billingMonth: billing.billingMonth,
      totalUsd: billing.totalUsd,
      totalRiel: billing.totalRiel,
      waterUsage: billing.waterUsage,
      waterCostRiel: billing.waterCostRiel,
      electricUsage: billing.electricUsage,
      electricCostRiel: billing.electricCostRiel,
      lateDays: billing.lateDays,
      latePenaltyUsd: billing.latePenaltyUsd,
      discountUsd: billing.discountUsd,
      payDay: billing.tenant.payDay,
      branchName: billing.room?.branch,
    })

    const result = await sendTelegramTo(billing.tenant.telegramChatId, msg)

    await db.notification.create({
      data: {
        tenantId: billing.tenantId,
        type: 'bulk_reminder',
        message: msg,
        status: result.ok ? 'sent' : 'failed',
      },
    })

    if (result.ok) sent++
    else failed++
  }

  if (sent > 0 || failed > 0) invalidate('notifications')
  return NextResponse.json({ ok: true, sent, failed, skipped })
}
