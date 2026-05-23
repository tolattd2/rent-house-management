import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'
import { readPromise, setPromise, clearPromise } from '@/lib/promise-history'

/** Read the current promise + history for one billing. Admin-only. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const record = await readPromise(id)
  return NextResponse.json({ ok: true, ...record })
}

/** Set / update the promise date. Body: { date: "YYYY-MM-DD" }. Admin-only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const body = await req.json().catch(() => ({})) as { date?: string }
  const date = (body.date ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: 'date must be in YYYY-MM-DD format.' }, { status: 400 })
  }

  const billing = await db.billing.findUnique({ where: { id }, select: { id: true } })
  if (!billing) return NextResponse.json({ ok: false, error: 'Billing not found' }, { status: 404 })

  const record = await setPromise(id, date, session.user.email ?? session.user.name ?? undefined)
  invalidate('billings', 'invoices')
  return NextResponse.json({ ok: true, ...record })
}

/** Clear the current promise (keeps it in history). Admin-only. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const record = await clearPromise(id)
  invalidate('billings', 'invoices')
  return NextResponse.json({ ok: true, ...record })
}
