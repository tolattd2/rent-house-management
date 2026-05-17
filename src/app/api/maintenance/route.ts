import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

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
  try {
    const body = await req.json()
    const { title, description, category, repairFeeUsd, reportedDate, notes, roomId, tenantId } = body

    if (!title || !roomId || !reportedDate) {
      return NextResponse.json({ error: 'title, roomId and reportedDate are required' }, { status: 400 })
    }

    const record = await db.maintenance.create({
      data: {
        title,
        description: description ?? '',
        category: category ?? 'general',
        repairFeeUsd: repairFeeUsd ?? 0,
        reportedDate,
        notes: notes ?? '',
        roomId,
        tenantId: tenantId || null,
      },
      include: {
        room: { select: { id: true, roomNumber: true, branch: true } },
        tenant: { select: { id: true, fullName: true } },
      },
    })

    return NextResponse.json({ ok: true, record })
  } catch {
    return NextResponse.json({ error: 'Failed to create maintenance record' }, { status: 500 })
  }
}
