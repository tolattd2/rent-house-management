import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendTelegramTo, sendTelegramMediaTo } from '@/lib/notifications'
import { invalidate } from '@/lib/revalidate'

type Body = {
  message?: string
  mediaUrl?: string
  mediaKind?: 'photo' | 'video'
  branch?: string
  tenantId?: string
}

/** Sends a free-text Custom Reminder (with optional media) to one tenant or all linked tenants. */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const body = (await req.json().catch(() => ({}))) as Body
    const message = (body.message ?? '').trim()
    const mediaUrl = body.mediaUrl?.trim()
    const mediaKind = body.mediaKind === 'video' ? 'video' : 'photo'

    if (!message && !mediaUrl) {
      return NextResponse.json({ ok: false, error: 'Add a message or media to send.' }, { status: 400 })
    }

    // Resolve recipients: one specific tenant, or every active linked tenant.
    let recipients: { id: string; telegramChatId: string }[]
    if (body.tenantId) {
      const tenant = await db.tenant.findUnique({ where: { id: body.tenantId } })
      if (!tenant) return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 })
      if (!tenant.telegramChatId) {
        return NextResponse.json(
          { ok: false, error: 'This tenant has not linked their Telegram yet.' },
          { status: 400 },
        )
      }
      recipients = [{ id: tenant.id, telegramChatId: tenant.telegramChatId }]
    } else {
      const branch = body.branch?.trim()
      recipients = await db.tenant.findMany({
        where: {
          status: 'active',
          telegramChatId: { not: '' },
          ...(branch ? { room: { branch } } : {}),
        },
        select: { id: true, telegramChatId: true },
      })
    }

    if (recipients.length === 0) {
      return NextResponse.json({ ok: false, error: 'No tenants with a linked Telegram.' }, { status: 400 })
    }

    const historyMessage = mediaUrl
      ? `${mediaKind === 'video' ? '🎬' : '📷'} ${message || (mediaKind === 'video' ? 'Video' : 'Photo')}`
      : message

    let sent = 0
    let failed = 0
    for (const r of recipients) {
      const result = mediaUrl
        ? await sendTelegramMediaTo(r.telegramChatId, {
            kind: mediaKind,
            url: mediaUrl,
            caption: message || undefined,
          })
        : await sendTelegramTo(r.telegramChatId, message)

      await db.notification.create({
        data: {
          tenantId: r.id,
          type: 'custom',
          message: historyMessage,
          status: result.ok ? 'sent' : 'failed',
        },
      })

      if (result.ok) sent++
      else failed++
    }

    invalidate('notifications')
    return NextResponse.json({ ok: true, sent, failed })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
