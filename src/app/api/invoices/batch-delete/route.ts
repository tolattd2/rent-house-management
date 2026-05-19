import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

function buildWhere(month: string, branch: string) {
  const where: Record<string, unknown> = {
    billing: { billingMonth: month },
  }
  if (branch && branch !== 'all') {
    where.billing = { billingMonth: month, room: { branch } }
  }
  return where
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') ?? ''
  const branch = searchParams.get('branch') ?? 'all'
  if (!month) return NextResponse.json({ ok: false, error: 'Month required' }, { status: 400 })

  const count = await db.invoice.count({ where: buildWhere(month, branch) })
  return NextResponse.json({ ok: true, count })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  const { month, branch } = await req.json()
  if (!month) return NextResponse.json({ ok: false, error: 'Month required' }, { status: 400 })

  const { count } = await db.invoice.deleteMany({ where: buildWhere(month, branch) })
  return NextResponse.json({ ok: true, deleted: count })
}
