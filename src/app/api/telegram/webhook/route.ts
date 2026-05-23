import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { telegramApi } from '@/lib/notifications'
import { invalidate } from '@/lib/revalidate'
import { recordChatId } from '@/lib/telegram-link-history'

export const dynamic = 'force-dynamic'

/** Reduce a phone number to its core digits (drops Cambodia country code / leading 0). */
function normalizePhone(p: string): string {
  let d = (p || '').replace(/\D/g, '')
  if (d.startsWith('855')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return d
}

const CONTACT_KEYBOARD = {
  keyboard: [[{ text: '📱 Share my phone number', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
}

/**
 * Telegram bot webhook. When a tenant taps "Share my phone number", Telegram
 * sends their phone + chat ID here; we match the phone to a tenant and store
 * the chat ID so reminders can be delivered to them directly.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify Telegram's secret token (set when the webhook is registered).
    const secretRow = await db.setting.findUnique({ where: { key: 'telegram_webhook_secret' } })
    const secret = secretRow?.value
    if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
      return NextResponse.json({ ok: true })
    }

    const update = await req.json()
    const message = update?.message
    const chatId = message?.chat?.id
    if (!chatId) return NextResponse.json({ ok: true })

    const contact = message.contact
    if (contact?.phone_number) {
      // Only accept the user's OWN contact (the request_contact button always is).
      if (contact.user_id && message.from?.id && contact.user_id !== message.from.id) {
        await telegramApi('sendMessage', {
          chat_id: chatId,
          text: '⚠️ Please use the button to share <b>your own</b> phone number.',
          parse_mode: 'HTML',
          reply_markup: CONTACT_KEYBOARD,
        })
        return NextResponse.json({ ok: true })
      }

      const phone = normalizePhone(contact.phone_number)
      const tenants = await db.tenant.findMany({
        select: { id: true, fullName: true, phone: true, phonesExtra: true, status: true },
      })
      // Match the shared phone against the tenant's primary phone OR any of
      // their alternate "phonesExtra" entries — tenants commonly link with a
      // secondary number and the bot used to fail silently in that case.
      const tenantPhoneMatches = (t: { phone: string; phonesExtra: string[] }) =>
        normalizePhone(t.phone) === phone ||
        (t.phonesExtra ?? []).some((p) => normalizePhone(p) === phone)
      const match =
        tenants.find((t) => t.status === 'active' && tenantPhoneMatches(t)) ||
        tenants.find((t) => tenantPhoneMatches(t))

      if (match) {
        const newChatId = String(chatId)
        await db.tenant.update({ where: { id: match.id }, data: { telegramChatId: newChatId } })
        await recordChatId(match.id, newChatId)
        invalidate('tenants')
        await telegramApi('sendMessage', {
          chat_id: chatId,
          text: `✅ Thank you, <b>${match.fullName}</b>! Your account is linked — you'll receive payment reminders here.`,
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true },
        })
      } else {
        await telegramApi('sendMessage', {
          chat_id: chatId,
          text: "❌ Sorry, we couldn't find a tenant with this phone number. Please contact the office.",
          reply_markup: { remove_keyboard: true },
        })
      }
      return NextResponse.json({ ok: true })
    }

    // /start or any other message → prompt to share contact.
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text:
        '👋 <b>Takmao Rental</b>\n\n' +
        "Tap the button below to link your account. Once linked, you'll receive your monthly payment reminders here.",
      parse_mode: 'HTML',
      reply_markup: CONTACT_KEYBOARD,
    })
    return NextResponse.json({ ok: true })
  } catch {
    // Always return 200 so Telegram does not retry-storm on errors.
    return NextResponse.json({ ok: true })
  }
}
