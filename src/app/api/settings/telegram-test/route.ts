import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { token?: string; chat_id?: string }

  let token = body.token?.trim()
  let chatId = body.chat_id?.trim()

  if (!token || !chatId) {
    const rows = await db.setting.findMany({
      where: { key: { in: ['telegram_token', 'telegram_chat_id'] } },
    })
    const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    if (!token) token = saved.telegram_token || process.env.TELEGRAM_BOT_TOKEN
    if (!chatId) chatId = saved.telegram_chat_id || process.env.TELEGRAM_CHAT_ID
  }

  if (!token || !chatId) {
    return NextResponse.json({ ok: false, error: 'Telegram not configured. Enter a bot token and chat ID first.' })
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '✅ <b>Takmao Rental</b> — Telegram bot is connected and working.',
        parse_mode: 'HTML',
      }),
    })
    const data = await res.json()
    if (data.ok) return NextResponse.json({ ok: true })
    return NextResponse.json({ ok: false, error: data.description || `Telegram API error (${data.error_code})` })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Network error' })
  }
}
