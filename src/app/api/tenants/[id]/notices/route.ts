import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { invalidate } from '@/lib/revalidate'

const NOTICE_TYPES = ['move_in', 'move_out', 'repair', 'complaint', 'general'] as const

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'guest') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await params
    const { type, message, expectedDate } = await req.json()

    if (!message || !String(message).trim()) {
      return NextResponse.json({ ok: false, error: 'Details are required' }, { status: 400 })
    }

    const tenant = await db.tenant.findUnique({ where: { id }, select: { id: true, roomId: true } })
    if (!tenant) return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 })

    const record = await db.tenantNotice.create({
      data: {
        tenantId: id,
        roomId: tenant.roomId ?? null,
        type: NOTICE_TYPES.includes(type) ? type : 'general',
        message: String(message).trim(),
        expectedDate: expectedDate ?? '',
      },
    })

    invalidate('tenants')
    return NextResponse.json({ ok: true, record })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
