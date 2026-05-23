import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'
import { parseBranches } from '@/lib/branches'

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
  branches: 'Branches',
  late_alert_enabled: 'Auto Overdue Alert (Tenant) Enabled',
  landlord_alert_enabled: 'Overdue Alert (Landlord) Enabled',
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

    let branchesChanged = false
    if (typeof data.branches === 'string') {
      const incoming = parseBranches(data.branches)
      const existingRow = await db.setting.findUnique({ where: { key: 'branches' } })
      const current = parseBranches(existingRow?.value)

      // Block deleting a branch that still has rooms.
      const removed = current.filter((c) => !incoming.some((b) => b.slug === c.slug))
      for (const r of removed) {
        const count = await db.room.count({ where: { branch: r.name } })
        if (count > 0) {
          return NextResponse.json(
            { ok: false, error: `Branch "${r.name}" still has ${count} room(s) — move or delete them first.` },
            { status: 400 },
          )
        }
      }

      // Cascade a renamed branch to its rooms.
      for (const b of incoming) {
        const prev = current.find((c) => c.slug === b.slug)
        if (prev && prev.name !== b.name) {
          await db.room.updateMany({ where: { branch: prev.name }, data: { branch: b.name } })
          branchesChanged = true
        }
      }
    }

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
    if (branchesChanged) invalidate('rooms')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
