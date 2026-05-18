import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  try {
    const { month, branch } = await req.json()
    if (!month) return NextResponse.json({ ok: false, error: 'Month is required' }, { status: 400 })

    // Build where clause
    const where: Record<string, unknown> = { billingMonth: month }
    if (branch && branch !== 'all') {
      where.room = { branch }
    }

    const { count } = await db.billing.deleteMany({ where })
    return NextResponse.json({ ok: true, deleted: count })
  } catch (e) {
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
