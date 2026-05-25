import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  sendTelegramTo,
  buildReminderMessage,
  buildLateReminderMessage,
} from '@/lib/notifications'
import { invalidate } from '@/lib/revalidate'
import { parseBranches } from '@/lib/branches'
import { computeLateFee } from '@/lib/late-fees'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    // `lang` is accepted for backwards compatibility but no longer used: every reminder
    // is now bilingual (Khmer + English).
    const { tenantId, billingId, kind } = await req.json()
    const reminderKind = kind === 'late' ? 'late' : 'invoice'

    const [tenant, billing] = await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId } }),
      db.billing.findUnique({ where: { id: billingId }, include: { room: true } }),
    ])

    if (!tenant || !billing) {
      return NextResponse.json({ ok: false, error: 'Tenant or billing not found' }, { status: 404 })
    }

    if (!tenant.telegramChatId) {
      return NextResponse.json(
        { ok: false, error: 'This tenant has not linked their Telegram yet.' },
        { status: 400 },
      )
    }

    // For late reminders, compute days late + penalty from live data (tenant
    // pay day, today's date, per-branch penalty rate) so the manual button
    // always agrees with the auto-overdue cron, regardless of what's stored
    // on the billing row.
    let lateDays = 0
    let penaltyUsd = 0
    if (reminderKind === 'late') {
      const settingRows = await db.setting.findMany()
      const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]))
      const branchList = parseBranches(settings.branches)
      const fee = computeLateFee(
        settings,
        branchList,
        billing.room?.branch,
        billing.billingMonth,
        tenant.payDay,
      )
      lateDays = fee.days
      penaltyUsd = fee.penaltyUsd
    }

    const msg = reminderKind === 'late'
      ? await buildLateReminderMessage({
        tenantName: tenant.fullName,
        roomNumber: billing.room?.roomNumber ?? '—',
        billingMonth: billing.billingMonth,
        totalUsd: billing.totalUsd,
        totalRiel: billing.totalRiel,
        waterUsage: billing.waterUsage,
        waterCostRiel: billing.waterCostRiel,
        electricUsage: billing.electricUsage,
        electricCostRiel: billing.electricCostRiel,
        discountUsd: billing.discountUsd,
        lateDays,
        penaltyUsd,
        payDay: tenant.payDay,
        branchName: billing.room?.branch,
      })
      : await buildReminderMessage({
        tenantName: tenant.fullName,
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
        payDay: tenant.payDay,
        branchName: billing.room?.branch,
      })

    const result = await sendTelegramTo(tenant.telegramChatId, msg)

    await db.notification.create({
      data: {
        tenantId,
        type: reminderKind === 'late' ? 'late_reminder' : 'reminder',
        message: msg,
        status: result.ok ? 'sent' : 'failed',
      },
    })

    invalidate('notifications')
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
