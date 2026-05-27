import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendTelegramTo } from '@/lib/notifications'
import { invalidate } from '@/lib/revalidate'

/**
 * Re-send a previously stored notification verbatim to the same tenant.
 * Writes a new history row with the same type so the audit trail shows
 * both the original and the resend.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'guest') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  try {
    const { notificationId } = await req.json()
    if (!notificationId) {
      return NextResponse.json({ ok: false, error: 'Missing notificationId' }, { status: 400 })
    }

    const original = await db.notification.findUnique({
      where: { id: notificationId },
      include: { tenant: true },
    })

    if (!original || !original.tenant) {
      return NextResponse.json({ ok: false, error: 'Notification not found' }, { status: 404 })
    }

    if (!original.tenant.telegramChatId) {
      return NextResponse.json(
        { ok: false, error: 'This tenant has not linked their Telegram yet.' },
        { status: 400 },
      )
    }

    const result = await sendTelegramTo(original.tenant.telegramChatId, original.message)

    await db.notification.create({
      data: {
        tenantId: original.tenantId,
        type: original.type,
        message: original.message,
        status: result.ok ? 'sent' : 'failed',
      },
    })

    invalidate('notifications')
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
