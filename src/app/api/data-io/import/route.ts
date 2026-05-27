import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { planAndApplyImport } from '@/lib/data-io/import'
import { invalidate } from '@/lib/revalidate'

export const dynamic = 'force-dynamic'
// xlsx parsing of a multi-MB workbook can blow past the default 4mb body
// limit; bump to 25mb which covers our realistic full-dataset round-trip.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 })
    }
    const dryRun = (form.get('dryRun') ?? '1') !== '0'
    const buf = Buffer.from(await file.arrayBuffer())

    const result = await planAndApplyImport(
      { name: file.name, data: buf },
      { dryRun },
    )

    if (result.applied) {
      invalidate('rooms', 'tenants', 'billings', 'payments', 'maintenance', 'expenses')
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Import failed' },
      { status: 400 },
    )
  }
}
