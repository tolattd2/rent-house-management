import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendSMS, telegramApi } from '@/lib/notifications'

/**
 * Resolve and cache the bot's @username. We need it to build the t.me/<bot>
 * deep link that tenants tap to start linking. Reads from the
 * telegram_bot_username setting first; on miss, calls Telegram's getMe and
 * caches the result so we don't hit the API on every invite.
 */
async function getBotUsername(): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key: 'telegram_bot_username' } })
  const cached = row?.value?.trim()
  if (cached) return cached.replace(/^@/, '')

  const me = await telegramApi('getMe', {})
  const result = me.result as { username?: string } | undefined
  const username = result?.username
  if (!username) return null

  await db.setting.upsert({
    where: { key: 'telegram_bot_username' },
    update: { value: username },
    create: { key: 'telegram_bot_username', value: username, label: 'Telegram bot username' },
  })
  return username
}

/**
 * Send the tenant an SMS containing a Telegram deep link to the rental bot.
 * One tap opens the bot, where they share their phone to re-link their
 * account. Used to recover linking without involving the tenant in person.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const tenant = await db.tenant.findUnique({
    where: { id },
    select: { id: true, fullName: true, phone: true },
  })
  if (!tenant) return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 })
  if (!tenant.phone?.trim()) {
    return NextResponse.json(
      { ok: false, error: 'Tenant has no phone number to text.' },
      { status: 400 },
    )
  }

  const username = await getBotUsername()
  if (!username) {
    return NextResponse.json(
      { ok: false, error: 'Could not resolve the Telegram bot username. Check the bot token in Settings.' },
      { status: 500 },
    )
  }

  const deepLink = `https://t.me/${username}?start=link`
  const text =
    `Takmao Rental: Hi ${tenant.fullName}, tap this link to receive your monthly bills on Telegram: ${deepLink}`

  const result = await sendSMS(tenant.phone, text)
  return NextResponse.json({ ok: result.ok, link: deepLink, error: result.error })
}
