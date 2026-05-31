import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { nextInvoiceNumber, isUniqueViolation } from '@/lib/invoice-number'
import { invalidate } from '@/lib/revalidate'

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

  // Create sequentially so each invoice number is derived from the previous
  // insert's max. Parallel creates would all read the same max and collide on
  // the unique invoiceNumber. Retry a number collision a few times; skip a
  // billing that already gained an invoice (unique billingId) concurrently.
  let created = 0
  for (const billing of billings) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await db.invoice.create({
          data: {
            invoiceNumber: await nextInvoiceNumber(),
            tenantId: billing.tenantId,
            billingId: billing.id,
          },
        })
        created++
        break
      } catch (err) {
        if (!isUniqueViolation(err)) throw err
        // billingId already has an invoice → nothing to do for this billing.
        if (await db.invoice.findUnique({ where: { billingId: billing.id }, select: { id: true } })) break
        // Otherwise the number raced another insert; retry with a fresh max.
      }
    }
  }

  invalidate('invoices')
  return NextResponse.json({ ok: true, created })
}
