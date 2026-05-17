import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { title, description, category, status, repairFeeUsd, reportedDate, completedDate, notes, roomId, tenantId } = body

    const existing = await db.maintenance.findUnique({
      where: { id },
      include: { expense: true },
    })

    const record = await db.maintenance.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(status !== undefined && { status }),
        ...(repairFeeUsd !== undefined && { repairFeeUsd }),
        ...(reportedDate !== undefined && { reportedDate }),
        ...(completedDate !== undefined && { completedDate }),
        ...(notes !== undefined && { notes }),
        ...(roomId !== undefined && { roomId }),
        ...(tenantId !== undefined && { tenantId: tenantId || null }),
      },
      include: {
        room: { select: { id: true, roomNumber: true, branch: true } },
        tenant: { select: { id: true, fullName: true } },
      },
    })

    // Auto-create or update an expense when status is completed and there's a repair fee
    const finalStatus = status ?? existing?.status
    const finalFee = repairFeeUsd ?? existing?.repairFeeUsd ?? 0
    const finalDate = completedDate ?? existing?.completedDate ?? new Date().toISOString().slice(0, 10)
    const finalRoomId = roomId ?? existing?.roomId ?? null
    const finalTitle = title ?? existing?.title ?? 'Maintenance'

    if (finalStatus === 'completed' && finalFee > 0) {
      if (existing?.expense) {
        await db.expense.update({
          where: { id: existing.expense.id },
          data: { amountUsd: finalFee, expenseDate: finalDate || new Date().toISOString().slice(0, 10), title: finalTitle },
        })
      } else {
        await db.expense.create({
          data: {
            title: finalTitle,
            category: 'maintenance',
            amountUsd: finalFee,
            expenseDate: finalDate || new Date().toISOString().slice(0, 10),
            notes: `Auto-created from maintenance #${id}`,
            roomId: finalRoomId,
            maintenanceId: id,
          },
        })
      }
    }

    return NextResponse.json({ ok: true, record })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.maintenance.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete maintenance record' }, { status: 500 })
  }
}
