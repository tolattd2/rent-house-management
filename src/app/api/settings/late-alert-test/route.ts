import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendTelegramMessage, buildLateReminderMessage } from '@/lib/notifications'

/**
 * Sends a sample of the auto overdue alert to the owner's Telegram chat so the
 * admin can preview exactly what a late tenant would receive. Admin-only.
 */
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  const rateRow = await db.setting.findUnique({ where: { key: 'late_penalty_usd' } })
  const penaltyPerDay = Number(rateRow?.value) || 0
  const sampleDays = 15

  const sample = await buildLateReminderMessage({
    tenantName: 'Test Tenant',
    roomNumber: '101',
    billingMonth: new Date().toISOString().slice(0, 7),
    totalUsd: 100,
    totalRiel: 410000,
    roomRentUsd: 80,
    prevWaterReading: 100,
    currWaterReading: 105,
    waterUsage: 5,
    waterCostRiel: 10000,
    prevElectricReading: 1200,
    currElectricReading: 1280,
    electricUsage: 80,
    electricCostRiel: 57600,
    discountUsd: 0,
    lateDays: sampleDays,
    penaltyUsd: penaltyPerDay * sampleDays,
    payDay: 1,
  })

  const msg =
    `🧪 <b>TEST — Auto Overdue Alert preview</b>\n` +
    `This is what a late tenant receives:\n\n` +
    sample

  const result = await sendTelegramMessage(msg)
  return NextResponse.json(result)
}
