import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-locks'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  try {
    const existing = await db.billing.findUnique({ where: { id }, select: { billingMonth: true } })
    if (!existing) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
    await assertPeriodOpen(existing.billingMonth)

    const body = await req.json().catch(() => ({}))
    const date = body.date ?? new Date().toISOString().slice(0, 10)

    await db.billing.update({
      where: { id },
      data: { paymentStatus: 'paid', paymentDate: date },
    })
    invalidate('billings', 'tenants', 'invoices')
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof PeriodLockedError) {
      return NextResponse.json(
        { ok: false, error: `Period ${e.month} is locked. Unlock it first to edit.`, code: 'period_locked' },
        { status: 423 },
      )
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
