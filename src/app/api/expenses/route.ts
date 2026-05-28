import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { invalidate } from '@/lib/revalidate'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-locks'
import { z } from 'zod'

const schema = z.object({
  title: z.string().min(1),
  category: z.string().default('other'),
  amountUsd: z.coerce.number().min(0),
  expenseDate: z.string().min(1),
  paidTo: z.string().default(''),
  receiptUrl: z.string().default(''),
  notes: z.string().default(''),
  roomId: z.string().nullable().optional(),
  maintenanceId: z.string().nullable().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const month = searchParams.get('month')
    const category = searchParams.get('category')

    const where: Record<string, unknown> = {}
    if (month) where.expenseDate = { startsWith: month }
    if (category && category !== 'all') where.category = category

    const expenses = await db.expense.findMany({
      where,
      include: {
        room: { select: { id: true, roomNumber: true, branch: true } },
        maintenance: { select: { id: true, title: true } },
      },
      orderBy: { expenseDate: 'desc' },
    })
    return NextResponse.json({ ok: true, data: expenses })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json()
    const data = schema.parse(body)
    await assertPeriodOpen(data.expenseDate.slice(0, 7))
    const expense = await db.expense.create({
      data: {
        title: data.title,
        category: data.category,
        amountUsd: data.amountUsd,
        expenseDate: data.expenseDate,
        paidTo: data.paidTo,
        receiptUrl: data.receiptUrl,
        notes: data.notes,
        roomId: data.roomId ?? null,
        maintenanceId: data.maintenanceId ?? null,
      },
      include: {
        room: { select: { id: true, roomNumber: true, branch: true } },
        maintenance: { select: { id: true, title: true } },
      },
    })
    invalidate('expenses')
    return NextResponse.json({ ok: true, data: expense })
  } catch (e) {
    if (e instanceof PeriodLockedError) {
      return NextResponse.json(
        { ok: false, error: `Period ${e.month} is locked. Unlock it first to edit.`, code: 'period_locked' },
        { status: 423 },
      )
    }
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
