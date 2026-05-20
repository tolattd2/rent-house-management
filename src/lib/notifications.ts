import { getSettingsMap } from './cached-queries'

export async function sendTelegramMessage(message: string): Promise<{ ok: boolean; error?: string }> {
  const settings = await getSettingsMap()
  const token = settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN
  const chatId = settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    return { ok: false, error: 'Telegram not configured.' }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    })
    const data = await res.json()
    return data.ok ? { ok: true } : { ok: false, error: data.description }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

/** Low-level Telegram Bot API call using the shared bot token from settings/env. */
export async function telegramApi(
  method: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const settings = await getSettingsMap()
  const token = settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { ok: false, error: 'Telegram not configured.' }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    return data.ok ? { ok: true, result: data.result } : { ok: false, error: data.description }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

/** Send a plain HTML message to a specific Telegram chat (e.g. a tenant's own chat). */
export async function sendTelegramTo(chatId: string, message: string): Promise<{ ok: boolean; error?: string }> {
  if (!chatId) return { ok: false, error: 'Tenant has not linked their Telegram.' }
  const r = await telegramApi('sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML' })
  return { ok: r.ok, error: r.error }
}

/**
 * Send a photo or video (referenced by a public URL) to a Telegram chat, with an
 * optional caption. Telegram fetches the media itself from the URL.
 */
export async function sendTelegramMediaTo(
  chatId: string,
  media: { kind: 'photo' | 'video'; url: string; caption?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!chatId) return { ok: false, error: 'Tenant has not linked their Telegram.' }
  const method = media.kind === 'video' ? 'sendVideo' : 'sendPhoto'
  const payload: Record<string, unknown> = { chat_id: chatId, [media.kind]: media.url }
  if (media.caption) {
    payload.caption = media.caption
    payload.parse_mode = 'HTML'
  }
  const r = await telegramApi(method, payload)
  return { ok: r.ok, error: r.error }
}

export async function sendSMS(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const settings = await getSettingsMap()
  const sid = settings.twilio_sid || process.env.TWILIO_ACCOUNT_SID
  const token = settings.twilio_token || process.env.TWILIO_AUTH_TOKEN
  const from = settings.twilio_phone || process.env.TWILIO_PHONE_NUMBER

  if (!sid || !token || !from) {
    return { ok: false, error: 'Twilio not configured.' }
  }

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64')
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: message }).toString(),
    })
    const data = await res.json()
    return data.sid ? { ok: true } : { ok: false, error: data.message }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export type ReminderLang = 'en' | 'km'

export function buildReminderMessage(params: {
  tenantName: string
  roomNumber: string
  billingMonth: string
  totalUsd: number
  totalRiel: number
  payDay?: number
  lang?: ReminderLang
}): string {
  const rielFormatted = Math.round(params.totalRiel).toLocaleString()
  const usd = params.totalUsd.toFixed(2)

  if (params.lang === 'km') {
    const closing = params.payDay
      ? `សូមមេត្តាទូទាត់ប្រាក់ឱ្យបានទាន់ពេលវេលា មុនថ្ងៃទី ${params.payDay}។ សូមអរគុណ!`
      : `សូមមេត្តាទូទាត់ប្រាក់ឱ្យបានទាន់ពេលវេលា។ សូមអរគុណ!`
    return (
      `🏠 <b>ការរំលឹកការទូទាត់ប្រាក់ — Takmao Rental</b>\n\n` +
      `អ្នកជួល៖ ${params.tenantName}\n` +
      `បន្ទប់៖ ${params.roomNumber}\n` +
      `ខែ៖ ${params.billingMonth}\n` +
      `ចំនួនទឹកប្រាក់ត្រូវបង់៖ $${usd} / ${rielFormatted} ៛\n\n` +
      closing
    )
  }

  const closingEn = params.payDay
    ? `Please pay on time, before day ${params.payDay} of the month. Thank you!`
    : `Please pay promptly. Thank you!`
  return (
    `🏠 <b>Payment Reminder — Takmao Rental</b>\n\n` +
    `Tenant: ${params.tenantName}\n` +
    `Room: ${params.roomNumber}\n` +
    `Month: ${params.billingMonth}\n` +
    `Amount Due: $${usd} / ${rielFormatted} ៛\n\n` +
    closingEn
  )
}

/**
 * Bilingual (Khmer + English) overdue warning sent to a late tenant by the
 * daily auto-alert cron. Warns how many days late they are and the late-fee
 * penalty they will be charged next month.
 */
export function buildLateReminderMessage(params: {
  tenantName: string
  roomNumber: string
  billingMonth: string
  totalUsd: number
  totalRiel: number
  lateDays: number
  penaltyUsd: number
}): string {
  const riel = Math.round(params.totalRiel).toLocaleString()
  const usd = params.totalUsd.toFixed(2)
  const penalty = params.penaltyUsd.toFixed(2)

  return (
    `🏠 <b>ការរំលឹកការទូទាត់ប្រាក់ / Payment Reminder — Takmao Rental</b>\n\n` +
    `អ្នកជួល / Tenant៖ ${params.tenantName}\n` +
    `បន្ទប់ / Room៖ ${params.roomNumber}\n` +
    `ខែ / Month៖ ${params.billingMonth}\n` +
    `ត្រូវបង់ / Amount Due៖ $${usd} / ${riel} ៛\n\n` +
    `⚠️ <b>ខ្មែរ</b>\n` +
    `អ្នកបានទូទាត់ថ្លៃខែនេះយឺត រហូតមកដល់ពេលនេះ ចំនួន ${params.lateDays} ថ្ងៃ។ ` +
    `ដូច្នេះ សូមមេត្តាទូទាត់ថ្លៃឈ្នួលឥឡូវនេះ បើមិនដូច្នោះទេ ` +
    `អ្នកនឹងត្រូវបង់ប្រាក់ពិន័យសម្រាប់ការទូទាត់យឺតនៅខែបន្ទាប់ ចំនួន $${penalty}។\n\n` +
    `⚠️ <b>English</b>\n` +
    `You have been paying late for this month's fee until now — ${params.lateDays} days. ` +
    `So please pay your fee now, or you will be charged a late-fee penalty in the upcoming month — $${penalty}.`
  )
}
