import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { invalidate } from '@/lib/revalidate'

export async function GET() {
  try {
    const records = await db.maintenance.findMany({
      include: {
        room: { select: { id: true, roomNumber: true, branch: true } },
        tenant: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(records)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch maintenance records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'guest') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json()
    const { title, description, category, status, repairFeeUsd, reportedDate, completedDate, notes, roomId, tenantId } = body

    if (!title || !roomId || !reportedDate) {
      return NextResponse.json({ error: 'title, roomId and reportedDate are required' }, { status: 400 })
    }

    const finalStatus = status ?? 'pending'
    const finalFee = repairFeeUsd ?? 0
    const finalCompleted = completedDate ?? ''

    const record = await db.maintenance.create({
      data: {
        title,
        description: description ?? '',
        category: category ?? 'general',
        status: finalStatus,
        repairFeeUsd: finalFee,
        reportedDate,
        completedDate: finalCompleted,
        notes: notes ?? '',
        roomId,
        tenantId: tenantId || null,
      },
      include: {
        room: { select: { id: true, roomNumber: true, branch: true } },
        tenant: { select: { id: true, fullName: true } },
      },
    })

    // Mirror the PATCH behaviour: a maintenance record that's already
    // completed (and has a fee) when it's first created spawns an Expense
    // row so the cost is visible on the expenses page.
    if (finalStatus === 'completed' && finalFee > 0) {
      await db.expense.create({
        data: {
          title,
          category: 'maintenance',
          amountUsd: finalFee,
          expenseDate: finalCompleted || reportedDate,
          notes: `Auto-created from maintenance #${record.id}`,
          roomId: roomId ?? null,
          maintenanceId: record.id,
        },
      })
      invalidate('maintenance', 'expenses')
    } else {
      invalidate('maintenance')
    }

    return NextResponse.json({ ok: true, record })
  } catch {
    return NextResponse.json({ error: 'Failed to create maintenance record' }, { status: 500 })
  }
}
