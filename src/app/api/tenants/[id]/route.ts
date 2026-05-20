import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const tenant = await db.tenant.findUnique({
    where: { id },
    include: {
      room: true,
      contracts: true,
      billings: { include: { payments: true }, orderBy: { billingMonth: 'desc' } },
    },
  })
  if (!tenant) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, data: tenant })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  try {
    const body = await req.json()
    const existing = await db.tenant.findUnique({ where: { id } })

    if (body.roomId !== undefined && existing?.roomId !== body.roomId) {
      if (existing?.roomId) {
        await db.room.update({ where: { id: existing.roomId }, data: { status: 'vacant' } })
      }
      if (body.roomId) {
        await db.room.update({ where: { id: body.roomId }, data: { status: 'occupied' } })
      }
    }

    const roomId: string | undefined = body.roomId
    const updateData: Record<string, unknown> = {
      fullName: body.fullName,
      gender: body.gender ?? '',
      phone: body.phone ?? '',
      telegramChatId: body.telegramChatId ?? '',
      nationalId: body.nationalId ?? '',
      emergencyContact: body.emergencyContact ?? '',
      occupation: body.occupation ?? '',
      moveInDate: body.moveInDate ?? '',
      moveOutDate: body.moveOutDate ?? '',
      depositAmount: Number(body.depositAmount ?? 0),
      monthlyRent: Number(body.monthlyRent ?? 0),
      payDay: Number(body.payDay ?? 1),
      notes: body.notes ?? '',
    }
    if (roomId !== undefined) {
      updateData.room = roomId
        ? { connect: { id: roomId } }
        : { disconnect: true }
    }
    await db.tenant.update({ where: { id }, data: updateData })
    invalidate('tenants', 'rooms')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const tenant = await db.tenant.findUnique({ where: { id } })
  if (tenant?.roomId) {
    await db.room.update({ where: { id: tenant.roomId }, data: { status: 'vacant' } })
  }
  await db.tenant.delete({ where: { id } })
  invalidate('tenants', 'rooms', 'billings')
  return NextResponse.json({ ok: true })
}
