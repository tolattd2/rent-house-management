import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  try {
    const { date } = await req.json()
    const tenant = await db.tenant.findUnique({ where: { id } })
    if (!tenant) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    await db.tenant.update({
      where: { id },
      data: { status: 'inactive', moveOutDate: date ?? new Date().toISOString().slice(0, 10) },
    })

    if (tenant.roomId) {
      await db.room.update({ where: { id: tenant.roomId }, data: { status: 'vacant' } })
    }

    await db.contract.updateMany({
      where: { tenantId: id, status: 'active' },
      data: { status: 'terminated' },
    })

    invalidate('tenants', 'rooms')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
