import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const patchSchema = z.object({
  newPassword: z.string().min(6).optional(),
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  role: z.enum(['admin', 'manager', 'staff', 'guest']).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await req.json()
    const { newPassword, ...rest } = patchSchema.parse(body)

    const update: Record<string, unknown> = { ...rest }
    if (newPassword) {
      update.password = await bcrypt.hash(newPassword, 10)
    }

    await db.user.update({ where: { id }, data: update })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  const { id } = await params

  if (session.user.id === id) {
    return NextResponse.json({ ok: false, error: 'Cannot delete yourself' }, { status: 400 })
  }

  try {
    await db.user.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
