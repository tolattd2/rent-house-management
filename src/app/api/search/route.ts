import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.toLowerCase()
  if (!q || q.length < 2) return NextResponse.json({ ok: true, data: { tenants: [], rooms: [], billings: [] } })

  const [tenants, rooms, billings] = await Promise.all([
    db.tenant.findMany({
      where: {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
        ],
      },
      include: { room: { select: { roomNumber: true } } },
      take: 5,
    }),
    db.room.findMany({
      where: { roomNumber: { contains: q, mode: 'insensitive' } },
      take: 5,
    }),
    db.billing.findMany({
      where: {
        OR: [
          { billingMonth: { contains: q } },
          { tenant: { fullName: { contains: q, mode: 'insensitive' } } },
        ],
      },
      include: { tenant: { select: { fullName: true } } },
      take: 5,
    }),
  ])

  return NextResponse.json({ ok: true, data: { tenants, rooms, billings } })
}
