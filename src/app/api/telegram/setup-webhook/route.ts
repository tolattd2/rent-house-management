import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { telegramApi } from '@/lib/notifications'
import { invalidate } from '@/lib/revalidate'

async function setSetting(key: string, value: string, label: string) {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value, label },
  })
}

/**
 * Turns tenant Telegram linking on/off. On = register this app's webhook with
 * Telegram so tenants can link by messaging the bot. Off = remove the webhook.
 * Admin-only.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean }
  const enabled = body.enabled !== false // default to enabling

  if (!enabled) {
    const result = await telegramApi('deleteWebhook', {})
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error || 'Failed to disable' })
    }
    await setSetting('telegram_linking_enabled', 'false', 'Telegram tenant linking')
    invalidate('settings')
    return NextResponse.json({ ok: true, enabled: false })
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

  await setSetting('telegram_webhook_secret', secret, 'Telegram webhook secret')
  await setSetting('telegram_linking_enabled', 'true', 'Telegram tenant linking')
  invalidate('settings')
  return NextResponse.json({ ok: true, enabled: true, url: webhookUrl })
}
