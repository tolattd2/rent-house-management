import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const rows = await db.periodLock.findMany({
    include: { lockedBy: { select: { id: true, name: true } } },
    orderBy: { month: 'asc' },
  })
  return NextResponse.json({ ok: true, locks: rows })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const month = String(body.month ?? '')
  const notes = String(body.notes ?? '')
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ ok: false, error: 'Invalid month (expected YYYY-MM)' }, { status: 400 })
  }

  const lock = await db.periodLock.upsert({
    where: { month },
    create: { month, notes, lockedById: session.user.id },
    update: { notes, lockedById: session.user.id, lockedAt: new Date() },
    include: { lockedBy: { select: { id: true, name: true } } },
  })
  invalidate('period_locks')
  return NextResponse.json({ ok: true, lock })
}
