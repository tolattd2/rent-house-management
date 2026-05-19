import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const invoice = await db.invoice.findUnique({ where: { id } })
  if (!invoice) return NextResponse.json({ ok: false, error: 'Invoice not found' }, { status: 404 })

  await db.invoice.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
