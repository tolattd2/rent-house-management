import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const date = body.date ?? new Date().toISOString().slice(0, 10)

  await db.billing.update({
    where: { id },
    data: { paymentStatus: 'paid', paymentDate: date },
  })
  invalidate('billings', 'tenants', 'invoices')
  return NextResponse.json({ ok: true })
}
