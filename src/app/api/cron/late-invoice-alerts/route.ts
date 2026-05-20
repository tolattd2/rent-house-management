import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendTelegramMessage } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

const LATE_THRESHOLD_DAYS = 10

/** Days past the due date (billing month + tenant pay day). */
function daysLate(billingMonth: string, payDay: number): number {
  const [year, month] = billingMonth.split('-').map(Number)
  if (!year || !month) return 0
  const due = new Date(year, month - 1, payDay || 1)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000)
}

/**
 * Daily job: pushes a Telegram alert for invoices that are more than
 * LATE_THRESHOLD_DAYS overdue. Each invoice is alerted once; the set of
 * already-alerted invoices is tracked in the `late_alert_sent` setting.
 * Honors the `late_alert_enabled` on/off setting.
 */
export async function GET(req: NextRequest) {
  // Optional hardening: if CRON_SECRET is set, require it (Vercel sends it).
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const settingRows = await db.setting.findMany({
    where: { key: { in: ['late_alert_enabled', 'late_alert_sent'] } },
  })
  const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]))

  if (settings.late_alert_enabled === 'false') {
    return NextResponse.json({ ok: true, skipped: 'disabled' })
  }

  let alreadySent: string[] = []
  try {
    const parsed = JSON.parse(settings.late_alert_sent || '[]')
    if (Array.isArray(parsed)) alreadySent = parsed
  } catch {
    alreadySent = []
  }
  const alreadySentSet = new Set(alreadySent)

  const billings = await db.billing.findMany({
    where: { paymentStatus: { not: 'paid' } },
    include: {
      tenant: { select: { id: true, fullName: true, payDay: true } },
      room: { select: { roomNumber: true } },
    },
  })

  const late = billings
    .filter((b) => b.tenant)
    .map((b) => ({ b, days: daysLate(b.billingMonth, b.tenant!.payDay) }))
    .filter((x) => x.days > LATE_THRESHOLD_DAYS)

  const lateIds = late.map((x) => x.b.id)
  const newly = late.filter((x) => !alreadySentSet.has(x.b.id))

  let sendOk = true
  if (newly.length > 0) {
    const lines = newly
      .map((x) => {
        const room = x.b.room?.roomNumber ?? '—'
        return `• Room ${room} — ${x.b.tenant!.fullName} (${x.b.billingMonth}) — $${x.b.totalUsd.toFixed(2)} · ${x.days} days late`
      })
      .join('\n')
    const msg =
      `⚠️ <b>Overdue Invoices — Takmao Rental</b>\n\n` +
      `${newly.length} invoice(s) are more than ${LATE_THRESHOLD_DAYS} days overdue:\n\n` +
      lines
    const result = await sendTelegramMessage(msg)
    sendOk = result.ok

    await Promise.all(
      newly.map((x) =>
        db.notification
          .create({
            data: {
              tenantId: x.b.tenant!.id,
              type: 'late_alert',
              message: `Invoice ${x.b.billingMonth} for ${x.b.tenant!.fullName} is ${x.days} days overdue.`,
              status: result.ok ? 'sent' : 'failed',
            },
          })
          .catch(() => null)
      )
    )
  }

  // Keep still-overdue invoices that were already alerted; add the new ones
  // only if the Telegram send succeeded (so a failed send retries tomorrow).
  const newSent = lateIds.filter(
    (id) => alreadySentSet.has(id) || (sendOk && newly.some((n) => n.b.id === id))
  )
  await db.setting.upsert({
    where: { key: 'late_alert_sent' },
    update: { value: JSON.stringify(newSent) },
    create: { key: 'late_alert_sent', value: JSON.stringify(newSent), label: 'Late alert state' },
  })

  return NextResponse.json({
    ok: true,
    overdue: late.length,
    alerted: sendOk ? newly.length : 0,
  })
}
