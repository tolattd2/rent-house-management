import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { telegramApi } from '@/lib/notifications'

/**
 * Registers this app's /api/telegram/webhook URL with Telegram so tenants can
 * link their account by messaging the bot. Admin-only; run once after deploy.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  // Reuse the existing secret, or generate one.
  const existing = await db.setting.findUnique({ where: { key: 'telegram_webhook_secret' } })
  const secret = existing?.value || randomBytes(24).toString('hex')

  const host = req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  if (!host) return NextResponse.json({ ok: false, error: 'Could not determine app URL.' })
  const webhookUrl = `${proto}://${host}/api/telegram/webhook`

  const result = await telegramApi('setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message'],
  })
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || 'Failed to register webhook' })
  }

  await db.setting.upsert({
    where: { key: 'telegram_webhook_secret' },
    update: { value: secret },
    create: { key: 'telegram_webhook_secret', value: secret, label: 'Telegram webhook secret' },
  })

  return NextResponse.json({ ok: true, url: webhookUrl })
}
