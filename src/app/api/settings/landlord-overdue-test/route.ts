import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendTelegramMessage, buildLandlordPromiseOverdueMessage } from '@/lib/notifications'

/**
 * Send a sample of the landlord promise-overdue alert to the owner's Telegram
 * chat so the admin can preview exactly what the landlord receives when a
 * tenant misses a promised pay date. Admin-only.
 */
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  const today = new Date()
  const promised = new Date(today.getTime() - 3 * 86_400_000).toISOString().slice(0, 10)

  const sample = buildLandlordPromiseOverdueMessage({
    tenantName: 'Test Tenant',
    tenantPhone: '012 345 678',
    roomNumber: '101',
    branchName: 'Takmoa',
    billingMonth: new Date().toISOString().slice(0, 7),
    totalUsd: 100,
    totalRiel: 410000,
    balanceUsd: 100,
    promiseDate: promised,
    daysSincePromise: 3,
  })

  const msg =
    `🧪 <b>TEST — Landlord Overdue Alert preview</b>\n` +
    `This is what the landlord receives when a tenant misses a promise:\n\n` +
    sample

  const result = await sendTelegramMessage(msg)
  return NextResponse.json(result)
}
