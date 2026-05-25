import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendTelegramMessage, buildLandlordPromiseOverdueMessage } from '@/lib/notifications'
import { readPromise, markAlerted } from '@/lib/promise-history'

export const dynamic = 'force-dynamic'

/**
 * Daily landlord-side overdue alert. For each billing where the admin has
 * recorded a "Promise to pay" date and that date has passed without the bill
 * being fully paid, send the landlord (the shared admin Telegram chat) a
 * heads-up. Each promise date is alerted only once; updating the promise
 * re-arms the alert for the new date.
 *
 * Honors the `landlord_alert_enabled` on/off setting (defaults to off).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const settingRows = await db.setting.findMany()
  const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]))
  if (settings.landlord_alert_enabled !== 'true') {
    return NextResponse.json({ ok: true, skipped: 'disabled' })
  }

  // Find every promise_* setting we've ever written and pair it with its
  // billing. Rows whose billing has been deleted are skipped.
  const promiseRows = settingRows.filter((r) => r.key.startsWith('promise_'))
  if (promiseRows.length === 0) return NextResponse.json({ ok: true, alerted: 0, scanned: 0 })

  const billingIds = promiseRows.map((r) => r.key.slice('promise_'.length))
  const billings = await db.billing.findMany({
    where: { id: { in: billingIds } },
    include: {
      tenant: { select: { id: true, fullName: true, phone: true } },
      room: { select: { roomNumber: true, branch: true } },
      payments: { select: { amountUsd: true } },
    },
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let alerted = 0
  let skippedNoPromise = 0
  let skippedFuture = 0
  let skippedAlerted = 0
  let skippedPaid = 0

  for (const billing of billings) {
    const record = await readPromise(billing.id)
    if (!record.current) { skippedNoPromise++; continue }
    if (record.alerted.includes(record.current)) { skippedAlerted++; continue }

    const promise = new Date(record.current)
    promise.setHours(0, 0, 0, 0)
    if (Number.isNaN(promise.getTime())) { skippedNoPromise++; continue }
    if (promise > today) { skippedFuture++; continue }

    const paid = billing.payments.reduce((s, p) => s + p.amountUsd, 0)
    const balance = Math.max(0, billing.totalUsd - paid)
    if (balance <= 0) { skippedPaid++; continue }

    const daysSince = Math.floor((today.getTime() - promise.getTime()) / 86_400_000)
    const msg = await buildLandlordPromiseOverdueMessage({
      tenantName: billing.tenant?.fullName ?? 'Unknown tenant',
      tenantPhone: billing.tenant?.phone ?? undefined,
      roomNumber: billing.room?.roomNumber ?? '—',
      branchName: billing.room?.branch ?? null,
      billingMonth: billing.billingMonth,
      totalUsd: billing.totalUsd,
      totalRiel: billing.totalRiel,
      balanceUsd: balance,
      promiseDate: record.current,
      daysSincePromise: daysSince,
    })

    const result = await sendTelegramMessage(msg)
    if (result.ok) {
      alerted++
      await markAlerted(billing.id, record.current)
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: billings.length,
    alerted,
    skippedNoPromise,
    skippedFuture,
    skippedAlerted,
    skippedPaid,
  })
}
