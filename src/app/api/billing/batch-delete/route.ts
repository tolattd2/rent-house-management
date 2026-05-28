import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-locks'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  try {
    const { month, branch } = await req.json()
    if (!month) return NextResponse.json({ ok: false, error: 'Month is required' }, { status: 400 })
    await assertPeriodOpen(month)

    // Build where clause
    const where: Record<string, unknown> = { billingMonth: month }
    if (branch && branch !== 'all') {
      where.room = { branch }
    }

    const { count } = await db.billing.deleteMany({ where })
    if (count > 0) invalidate('billings', 'tenants', 'invoices')
    return NextResponse.json({ ok: true, deleted: count })
  } catch (e) {
    if (e instanceof PeriodLockedError) {
      return NextResponse.json(
        { ok: false, error: `Period ${e.month} is locked. Unlock it first to edit.`, code: 'period_locked' },
        { status: 423 },
      )
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

// GET — count matching records before confirming delete
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const branch = searchParams.get('branch')

  if (!month) return NextResponse.json({ ok: false, error: 'Month is required' }, { status: 400 })

  const where: Record<string, unknown> = { billingMonth: month }
  if (branch && branch !== 'all') {
    where.room = { branch }
  }

  const count = await db.billing.count({ where })
  return NextResponse.json({ ok: true, count })
}
