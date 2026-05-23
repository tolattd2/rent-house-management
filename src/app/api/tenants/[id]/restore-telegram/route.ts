import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'
import { latestChatId, readChatIdHistory } from '@/lib/telegram-link-history'

/**
 * Restore a tenant's Telegram link from history. Picks the most recent chat
 * ID we have on record and writes it back to the tenant. Admin-only.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const history = await readChatIdHistory(id)
  return NextResponse.json({ ok: true, history })
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const tenant = await db.tenant.findUnique({ where: { id }, select: { id: true, telegramChatId: true } })
  if (!tenant) return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 })

  const recovered = await latestChatId(id)
  if (!recovered) {
    return NextResponse.json(
      { ok: false, error: 'No previous link on record for this tenant.' },
      { status: 404 },
    )
  }

  if (tenant.telegramChatId === recovered) {
    return NextResponse.json({ ok: true, chatId: recovered, alreadyLinked: true })
  }

  await db.tenant.update({ where: { id }, data: { telegramChatId: recovered } })
  invalidate('tenants', 'notifications')
  return NextResponse.json({ ok: true, chatId: recovered, alreadyLinked: false })
}
