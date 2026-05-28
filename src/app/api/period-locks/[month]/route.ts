import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'

export async function DELETE(_req: Request, ctx: { params: Promise<{ month: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  const { month } = await ctx.params
  await db.periodLock.deleteMany({ where: { month } })
  invalidate('period_locks')
  return NextResponse.json({ ok: true })
}
