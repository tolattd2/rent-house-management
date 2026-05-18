import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { generateInvoiceNumber } from '@/lib/utils'

function billingFilter(month: string, branch: string) {
  const base: Record<string, unknown> = {
    billingMonth: month,
    invoices: { none: {} },
  }
  if (branch && branch !== 'all') base.room = { branch }
  return base
}

// GET — preview count of billings without invoices for month+branch
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') ?? ''
  const branch = searchParams.get('branch') ?? 'all'
  if (!month) return NextResponse.json({ ok: false, error: 'Month required' }, { status: 400 })

  const billingWhere: Record<string, unknown> = { billingMonth: month }
  if (branch && branch !== 'all') billingWhere.room = { branch }

  const [willGenerate, alreadyExists] = await Promise.all([
    db.billing.count({ where: billingFilter(month, branch) }),
    db.invoice.count({ where: { billing: billingWhere } }),
  ])

  return NextResponse.json({ ok: true, willGenerate, alreadyExists })
}

// POST — bulk create invoice records for billings that don't have one
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  const { month, branch } = await req.json()
  if (!month) return NextResponse.json({ ok: false, error: 'Month required' }, { status: 400 })

  const billings = await db.billing.findMany({
    where: billingFilter(month, branch),
    select: { id: true, tenantId: true },
  })

  if (billings.length === 0) return NextResponse.json({ ok: true, created: 0 })

  const existingCount = await db.invoice.count()

  await Promise.all(
    billings.map((billing, i) =>
      db.invoice.create({
        data: {
          invoiceNumber: generateInvoiceNumber(existingCount + i + 1),
          tenantId: billing.tenantId,
          billingId: billing.id,
        },
      })
    )
  )

  return NextResponse.json({ ok: true, created: billings.length })
}
