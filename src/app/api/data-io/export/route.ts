import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildExportWorkbook } from '@/lib/data-io/export'
import { buildExportCsvZip } from '@/lib/data-io/csv'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  const format = new URL(req.url).searchParams.get('format') === 'csv' ? 'csv' : 'xlsx'
  const stamp = new Date().toISOString().slice(0, 10)

  if (format === 'csv') {
    const buf = await buildExportCsvZip()
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="data-export-${stamp}.zip"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const buf = await buildExportWorkbook()
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="data-export-${stamp}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
