import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendTelegramTo, buildLateReminderMessage } from '@/lib/notifications'
import { parseBranches } from '@/lib/branches'
import { computeLateFee, daysLate } from '@/lib/late-fees'

export const dynamic = 'force-dynamic'

const DEFAULT_LATE_THRESHOLD_DAYS = 10

/**
 * Daily job: for every invoice at least `late_alert_threshold_days` overdue,
 * send the late tenant a bilingual (Khmer + English) overdue warning on their
 * own Telegram. Each invoice is alerted once; the set of already-alerted
 * invoices is tracked in the `late_alert_sent` setting. Tenants who haven't
 * linked their Telegram are skipped and retried daily until they link.
 * Honors the `late_alert_enabled` on/off setting.
 */
export async function GET(req: NextRequest) {
  // Optional hardening: if CRON_SECRET is set, require it (Vercel sends it).
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const settingRows = await db.setting.findMany()
  const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]))
  const branchList = parseBranches(settings.branches)

  if (settings.late_alert_enabled === 'false') {
    return NextResponse.json({ ok: true, skipped: 'disabled' })
  }

  const thresholdRaw = Number(settings.late_alert_threshold_days)
  const threshold = Number.isFinite(thresholdRaw) && thresholdRaw > 0
    ? Math.floor(thresholdRaw)
    : DEFAULT_LATE_THRESHOLD_DAYS

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
      tenant: { select: { id: true, fullName: true, payDay: true, telegramChatId: true } },
      room: { select: { roomNumber: true, branch: true } },
    },
  })

  const late = billings
    .filter((b) => b.tenant)
    .map((b) => ({ b, days: daysLate(b.billingMonth, b.tenant!.payDay) }))
    .filter((x) => x.days >= threshold)

  const newly = late.filter((x) => !alreadySentSet.has(x.b.id))

  let alerted = 0
  let skippedUnlinked = 0
  const successIds: string[] = []

  for (const x of newly) {
    const tenant = x.b.tenant!

    // Can't message a tenant who hasn't linked Telegram — retry tomorrow.
    if (!tenant.telegramChatId) {
      skippedUnlinked++
      continue
    }

    const { penaltyUsd } = computeLateFee(settings, branchList, x.b.room?.branch, x.b.billingMonth, tenant.payDay)

    const msg = buildLateReminderMessage({
      tenantName: tenant.fullName,
      roomNumber: x.b.room?.roomNumber ?? '—',
      billingMonth: x.b.billingMonth,
      totalUsd: x.b.totalUsd,
      totalRiel: x.b.totalRiel,
      lateDays: x.days,
      penaltyUsd,
      payDay: tenant.payDay,
      branchName: x.b.room?.branch,
    })

    const result = await sendTelegramTo(tenant.telegramChatId, msg)
    if (result.ok) {
      alerted++
      successIds.push(x.b.id)
    }

    await db.notification
      .create({
        data: {
          tenantId: tenant.id,
          type: 'late_alert',
          message: msg,
          status: result.ok ? 'sent' : 'failed',
        },
      })
      .catch(() => null)
  }

  // Keep already-alerted invoices that are still overdue, plus the ones sent
  // just now. Unlinked / failed sends are left out so they retry tomorrow.
  const lateIds = new Set(late.map((x) => x.b.id))
  const newSent = [...alreadySent.filter((id) => lateIds.has(id)), ...successIds]
  await db.setting.upsert({
    where: { key: 'late_alert_sent' },
    update: { value: JSON.stringify(newSent) },
    create: { key: 'late_alert_sent', value: JSON.stringify(newSent), label: 'Late alert state' },
  })

  return NextResponse.json({
    ok: true,
    overdue: late.length,
    alerted,
    skippedUnlinked,
  })
}
