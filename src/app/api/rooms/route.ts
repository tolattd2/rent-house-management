import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'
import { z } from 'zod'

const roomSchema = z.object({
  roomNumber: z.string().min(1),
  branch: z.string().default('Takmoa'),
  floor: z.string().default('1'),
  roomType: z.string().default('Standard'),
  rentPriceUsd: z.coerce.number().min(0),
  depositAmount: z.coerce.number().min(0).default(0),
  status: z.enum(['occupied', 'vacant', 'maintenance']).default('vacant'),
  waterRateRiel: z.coerce.number().min(0).default(2000),
  electricRateRiel: z.coerce.number().min(0).default(720),
  notes: z.string().default(''),
})

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const rooms = await db.room.findMany({
    include: { tenants: { where: { status: 'active' }, select: { id: true, fullName: true, phone: true, moveInDate: true }, take: 1 } },
    orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }],
  })
  return NextResponse.json({ ok: true, data: rooms })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const data = roomSchema.parse(body)

    const existing = await db.room.findUnique({ where: { roomNumber_branch: { roomNumber: data.roomNumber, branch: data.branch } } })
    if (existing) return NextResponse.json({ ok: false, error: 'Room number already exists in this branch' }, { status: 400 })

    const room = await db.room.create({ data })
    invalidate('rooms')
    return NextResponse.json({ ok: true, id: room.id })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
