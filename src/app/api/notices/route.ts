import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { invalidate } from '@/lib/revalidate'

const NOTICE_TYPES = ['move_in', 'move_out', 'repair', 'complaint', 'general'] as const

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'guest') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  try {
    const { type, message, expectedDate, tenantId, roomId } = await req.json()

    if (!message || !String(message).trim()) {
      return NextResponse.json({ ok: false, error: 'Details are required' }, { status: 400 })
    }
    if (!tenantId && !roomId) {
      return NextResponse.json({ ok: false, error: 'Tenant or room is required' }, { status: 400 })
    }

    // Resolve room from tenant when not explicitly given, so vacant-room
    // notices and occupied-room notices land in the same shape downstream.
    let resolvedRoomId: string | null = roomId ?? null
    let resolvedTenantId: string | null = tenantId ?? null
    if (resolvedTenantId && !resolvedRoomId) {
      const tn = await db.tenant.findUnique({ where: { id: resolvedTenantId }, select: { roomId: true } })
      resolvedRoomId = tn?.roomId ?? null
    }
    // Auto-attach the room's current active tenant when filing a room-only
    // notice on an occupied room — keeps existing tenant-scoped views working.
    if (resolvedRoomId && !resolvedTenantId) {
      const occupant = await db.tenant.findFirst({
        where: { roomId: resolvedRoomId, status: 'active' },
        select: { id: true },
      })
      resolvedTenantId = occupant?.id ?? null
    }

    const record = await db.tenantNotice.create({
      data: {
        tenantId: resolvedTenantId,
        roomId: resolvedRoomId,
        type: NOTICE_TYPES.includes(type) ? type : 'general',
        message: String(message).trim(),
        expectedDate: expectedDate ?? '',
      },
      include: {
        tenant: {
          select: {
            id: true, fullName: true,
            room: { select: { id: true, roomNumber: true, branch: true } },
          },
        },
        room: { select: { id: true, roomNumber: true, branch: true } },
      },
    })

    invalidate('tenants')
    return NextResponse.json({ ok: true, record })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
