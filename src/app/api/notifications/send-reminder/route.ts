import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendTelegramMessage, buildReminderMessage } from '@/lib/notifications'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const { tenantId, billingId } = await req.json()

    const [tenant, billing] = await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId } }),
      db.billing.findUnique({ where: { id: billingId }, include: { room: true } }),
    ])

    if (!tenant || !billing) {
      return NextResponse.json({ ok: false, error: 'Tenant or billing not found' }, { status: 404 })
    }

    const msg = buildReminderMessage({
      tenantName: tenant.fullName,
      roomNumber: billing.room?.roomNumber ?? '—',
      billingMonth: billing.billingMonth,
      totalUsd: billing.totalUsd,
      totalRiel: billing.totalRiel,
    })

    const result = await sendTelegramMessage(msg)

    await db.notification.create({
      data: {
        tenantId,
        type: 'reminder',
        message: msg,
        status: result.ok ? 'sent' : 'failed',
      },
    })

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
