import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { invalidate } from '@/lib/revalidate'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'guest') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await params
    const { type, message, expectedDate, status } = await req.json()

    const record = await db.tenantNotice.update({
      where: { id },
      data: {
        ...(type !== undefined && { type }),
        ...(message !== undefined && { message: String(message).trim() }),
        ...(expectedDate !== undefined && { expectedDate }),
        ...(status !== undefined && {
          status,
          resolvedAt: status === 'resolved' ? new Date() : null,
        }),
      },
    })

    invalidate('tenants')
    return NextResponse.json({ ok: true, record })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'guest') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await params
    await db.tenantNotice.delete({ where: { id } })
    invalidate('tenants')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
