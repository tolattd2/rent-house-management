import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const tenantSchema = z.object({
  fullName: z.string().min(1),
  gender: z.string().default(''),
  phone: z.string().default(''),
  nationalId: z.string().default(''),
  emergencyContact: z.string().default(''),
  occupation: z.string().default(''),
  moveInDate: z.string().default(''),
  depositAmount: z.coerce.number().min(0).default(0),
  payDay: z.coerce.number().int().min(1).max(31).default(1),
  roomId: z.string().optional().nullable(),
  notes: z.string().default(''),
  contractStart: z.string().default(''),
  contractEnd: z.string().default(''),
  monthlyRent: z.coerce.number().min(0).default(0),
})

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const tenants = await db.tenant.findMany({
    include: { room: { select: { id: true, roomNumber: true, floor: true, rentPriceUsd: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ ok: true, data: tenants })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const { contractStart, contractEnd, ...tenantData } = tenantSchema.parse(body)

    const tenant = await db.tenant.create({ data: tenantData })

    if (tenantData.roomId) {
      await db.room.update({ where: { id: tenantData.roomId }, data: { status: 'occupied' } })
    }

    if (contractStart) {
      await db.contract.create({
        data: {
          tenantId: tenant.id,
          contractStart,
          contractEnd: contractEnd ?? '',
          monthlyRent: tenantData.monthlyRent > 0 ? tenantData.monthlyRent : tenantData.depositAmount,
          depositAmount: tenantData.depositAmount,
          status: 'active',
        },
      })
    }

    return NextResponse.json({ ok: true, id: tenant.id })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
