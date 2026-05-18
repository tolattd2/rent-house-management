import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { generateInvoiceNumber } from '@/lib/utils'

function buildBillingWhere(month: string, branch: string) {
  const where: Record<string, unknown> = { billingMonth: month, invoice: null }
  if (branch && branch !== 'all') where.room = { branch }
  return where
}

// GET — preview count of billings without invoices for month+branch
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') ?? ''
  const branch = searchParams.get('branch') ?? 'all'
  if (!month) return NextResponse.json({ ok: false, error: 'Month required' }, { status: 400 })

  const willGenerate = await db.billing.count({ where: buildBillingWhere(month, branch) })
  const alreadyExists = await db.invoice.count({
    where: {
      billing: {
        billingMonth: month,
        ...(branch && branch !== 'all' ? { room: { branch } } : {}),
      },
    },
  })

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
    where: buildBillingWhere(month, branch),
    select: { id: true, tenantId: true },
  })

  const existingCount = await db.invoice.count()
  let created = 0

  for (const billing of billings) {
    await db.invoice.create({
      data: {
        invoiceNumber: generateInvoiceNumber(existingCount + created + 1),
        tenantId: billing.tenantId,
        billingId: billing.id,
      },
    })
    created++
  }

  return NextResponse.json({ ok: true, created })
}
