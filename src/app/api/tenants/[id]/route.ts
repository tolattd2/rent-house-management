import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'
import { recordChatId } from '@/lib/telegram-link-history'

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
      phonesExtra: Array.isArray(body.phonesExtra) ? body.phonesExtra : [],
      nationalId: body.nationalId ?? '',
      emergencyName: body.emergencyName ?? '',
      emergencyPhone: body.emergencyPhone ?? '',
      occupation: body.occupation ?? '',
      age: Number(body.age ?? 0),
      nationality: body.nationality ?? '',
      moveInDate: body.moveInDate ?? '',
      moveOutDate: body.moveOutDate ?? '',
      depositAmount: Number(body.depositAmount ?? 0),
      monthlyRent: Number(body.monthlyRent ?? 0),
      payDay: Number(body.payDay ?? 1),
      notes: body.notes ?? '',
    }
    // Only overwrite the Telegram link when the request explicitly carries a
    // non-empty value. This protects already-linked tenants from being silently
    // unlinked by an edit form that forgot to include the chat ID.
    let newChatId: string | null = null
    if (typeof body.telegramChatId === 'string' && body.telegramChatId.trim() !== '') {
      newChatId = body.telegramChatId.trim()
      updateData.telegramChatId = newChatId
    }
    if (roomId !== undefined) {
      updateData.room = roomId
        ? { connect: { id: roomId } }
        : { disconnect: true }
    }
    await db.tenant.update({ where: { id }, data: updateData })
    if (newChatId) await recordChatId(id, newChatId)
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
