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
  const repeatMode = settings.late_alert_repeat === 'true'

  // Track per-invoice the last daysLate value we alerted at. Supports the
  // legacy array shape (just billing IDs) for back-compat with previous runs.
  const lastAlerted: Record<string, number> = {}
  try {
    const parsed = JSON.parse(settings.late_alert_sent || '{}')
    if (Array.isArray(parsed)) {
      for (const id of parsed) if (typeof id === 'string') lastAlerted[id] = threshold
    } else if (parsed && typeof parsed === 'object') {
      for (const [id, v] of Object.entries(parsed)) {
        const n = Number(v)
        if (Number.isFinite(n)) lastAlerted[id] = n
      }
    }
  } catch {
    /* ignore — start fresh */
  }

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

  // In once-mode: alert only if we've never alerted this invoice.
  // In repeat-mode: alert when the invoice has crossed into a new threshold
  // tier since the last alert (handles missed cron days gracefully).
  const newly = late.filter((x) => {
    const last = lastAlerted[x.b.id]
    if (last === undefined) return true
    if (!repeatMode) return false
    const currentTier = Math.floor(x.days / threshold) * threshold
    const lastTier = Math.floor(last / threshold) * threshold
    return currentTier > lastTier
  })

  let alerted = 0
  let skippedUnlinked = 0
  const successDays: Record<string, number> = {}

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
      successDays[x.b.id] = x.days
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

  // Keep prior per-invoice last-alerted day for invoices still overdue, then
  // overwrite with this run's successes. Unlinked / failed sends are left out
  // so they retry tomorrow.
  const lateIds = new Set(late.map((x) => x.b.id))
  const nextState: Record<string, number> = {}
  for (const [id, days] of Object.entries(lastAlerted)) {
    if (lateIds.has(id)) nextState[id] = days
  }
  for (const [id, days] of Object.entries(successDays)) {
    nextState[id] = days
  }
  await db.setting.upsert({
    where: { key: 'late_alert_sent' },
    update: { value: JSON.stringify(nextState) },
    create: { key: 'late_alert_sent', value: JSON.stringify(nextState), label: 'Late alert state' },
  })

  return NextResponse.json({
    ok: true,
    overdue: late.length,
    alerted,
    skippedUnlinked,
  })
}
