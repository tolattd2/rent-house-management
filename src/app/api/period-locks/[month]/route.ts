import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'

export async function DELETE(_req: Request, ctx: { params: Promise<{ month: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  const { month } = await ctx.params
  try {
    await db.periodLock.deleteMany({ where: { month } })
    invalidate('period_locks')
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('does not exist') || msg.includes('P2021') || msg.includes('P2010')) {
      return NextResponse.json(
        { ok: false, error: 'Period-lock table not found. Run `prisma db push` against the production database.', code: 'table_missing' },
        { status: 503 },
      )
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
