import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'

const SETTING_LABELS: Record<string, string> = {
  exchange_rate: 'USD to KHR Rate',
  water_rate_riel: 'Water Rate (KHR/unit)',
  electric_rate_riel: 'Electric Rate (KHR/unit)',
  late_penalty_usd: 'Late Penalty (USD/day)',
  company_name: 'Company Name',
  company_phone: 'Company Phone',
  company_address: 'Company Address',
  telegram_token: 'Telegram Bot Token',
  telegram_chat_id: 'Telegram Chat ID',
  smtp_host: 'SMTP Host',
  smtp_port: 'SMTP Port',
  smtp_user: 'SMTP Username',
  smtp_pass: 'SMTP Password',
  email_from: 'From Email',
  twilio_sid: 'Twilio Account SID',
  twilio_token: 'Twilio Auth Token',
  twilio_phone: 'Twilio Phone Number',
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const rows = await db.setting.findMany()
  const data = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  try {
    const data: Record<string, string> = await req.json()

    await Promise.all(
      Object.entries(data).map(([key, value]) =>
        db.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value, label: SETTING_LABELS[key] ?? key },
        })
      )
    )

    invalidate('settings')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
