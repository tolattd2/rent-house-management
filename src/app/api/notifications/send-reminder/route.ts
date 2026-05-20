import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendTelegramTo, buildReminderMessage } from '@/lib/notifications'
import { invalidate } from '@/lib/revalidate'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const { tenantId, billingId, lang } = await req.json()
    const reminderLang = lang === 'km' ? 'km' : 'en'

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

    const msg = buildReminderMessage({
      tenantName: tenant.fullName,
      roomNumber: billing.room?.roomNumber ?? '—',
      billingMonth: billing.billingMonth,
      totalUsd: billing.totalUsd,
      totalRiel: billing.totalRiel,
      payDay: tenant.payDay,
      lang: reminderLang,
    })

    const result = await sendTelegramTo(tenant.telegramChatId, msg)

    await db.notification.create({
      data: {
        tenantId,
        type: 'reminder',
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
