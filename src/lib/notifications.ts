import { db } from './db'

export async function sendTelegramMessage(message: string): Promise<{ ok: boolean; error?: string }> {
  const settings = await getSettings()
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

export async function sendSMS(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const settings = await getSettings()
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

async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export function buildReminderMessage(params: {
  tenantName: string
  roomNumber: string
  billingMonth: string
  totalUsd: number
  totalRiel: number
}): string {
  const rielFormatted = Math.round(params.totalRiel).toLocaleString()
  return (
    `🏠 <b>Payment Reminder — Takmao Rental</b>\n\n` +
    `Tenant: ${params.tenantName}\n` +
    `Room: ${params.roomNumber}\n` +
    `Month: ${params.billingMonth}\n` +
    `Amount Due: $${params.totalUsd.toFixed(2)} / ${rielFormatted} ៛\n\n` +
    `Please pay promptly. Thank you!`
  )
}
