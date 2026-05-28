import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { invalidate } from '@/lib/revalidate'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-locks'
import { z } from 'zod'

function periodLockedResponse(err: PeriodLockedError) {
  return NextResponse.json(
    { ok: false, error: `Period ${err.month} is locked. Unlock it first to edit.`, code: 'period_locked' },
    { status: 423 },
  )
}

const schema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().optional(),
  amountUsd: z.coerce.number().min(0).optional(),
  expenseDate: z.string().optional(),
  paidTo: z.string().optional(),
  receiptUrl: z.string().optional(),
  notes: z.string().optional(),
  roomId: z.string().nullable().optional(),
  maintenanceId: z.string().nullable().optional(),
})

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const expense = await db.expense.findUnique({
    where: { id },
    include: {
      room: { select: { id: true, roomNumber: true, branch: true } },
      maintenance: { select: { id: true, title: true } },
    },
  })
  if (!expense) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, data: expense })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await params
    const body = await req.json()
    const data = schema.parse(body)
    const existing = await db.expense.findUnique({ where: { id }, select: { expenseDate: true } })
    if (!existing) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
    await assertPeriodOpen(existing.expenseDate.slice(0, 7))
    if (data.expenseDate && data.expenseDate.slice(0, 7) !== existing.expenseDate.slice(0, 7)) {
      await assertPeriodOpen(data.expenseDate.slice(0, 7))
    }
    const expense = await db.expense.update({
      where: { id },
      data,
      include: {
        room: { select: { id: true, roomNumber: true, branch: true } },
        maintenance: { select: { id: true, title: true } },
      },
    })
    invalidate('expenses')
    return NextResponse.json({ ok: true, data: expense })
  } catch (e) {
    if (e instanceof PeriodLockedError) return periodLockedResponse(e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await params
    const existing = await db.expense.findUnique({ where: { id }, select: { expenseDate: true } })
    if (!existing) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
    await assertPeriodOpen(existing.expenseDate.slice(0, 7))
    await db.expense.delete({ where: { id } })
    invalidate('expenses')
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof PeriodLockedError) return periodLockedResponse(e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
