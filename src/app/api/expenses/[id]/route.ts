import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { z } from 'zod'

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
    const expense = await db.expense.update({
      where: { id },
      data,
      include: {
        room: { select: { id: true, roomNumber: true, branch: true } },
        maintenance: { select: { id: true, title: true } },
      },
    })
    return NextResponse.json({ ok: true, data: expense })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await params
    await db.expense.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
