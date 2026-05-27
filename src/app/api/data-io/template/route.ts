import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildTemplateWorkbook } from '@/lib/data-io/template'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  const buf = await buildTemplateWorkbook()
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="data-template.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
