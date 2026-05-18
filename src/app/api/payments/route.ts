import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const paymentSchema = z.object({
  billingId: z.string().min(1),
  amountUsd: z.coerce.number().min(0.01),
  amountRiel: z.coerce.number().min(0).default(0),
  paymentMethod: z.enum(['Cash', 'ABA_Pay', 'Wing', 'TrueMoney', 'Bank_Transfer', 'Other']).default('Cash'),
  transactionRef: z.string().default(''),
  notes: z.string().default(''),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const data = paymentSchema.parse(body)

    const billing = await db.billing.findUnique({
      where: { id: data.billingId },
      include: { payments: true },
    })
    if (!billing) return NextResponse.json({ ok: false, error: 'Billing not found' }, { status: 404 })

    const payment = await db.payment.create({
      data: {
        billingId: data.billingId,
        amountUsd: data.amountUsd,
        amountRiel: data.amountRiel || data.amountUsd * (billing.exchangeRate || 4100),
        paymentMethod: data.paymentMethod,
        transactionRef: data.transactionRef,
        notes: data.notes,
        receivedById: session.user.id,
      },
    })

    // Recalculate payment status
    const allPayments = [...billing.payments, payment]
    const totalPaid = allPayments.reduce((s, p) => s + p.amountUsd, 0)

    let paymentStatus: 'paid' | 'partial' | 'unpaid'
    if (totalPaid >= billing.totalUsd) {
      paymentStatus = 'paid'
    } else if (totalPaid > 0) {
      paymentStatus = 'partial'
    } else {
      paymentStatus = 'unpaid'
    }

    await db.billing.update({
      where: { id: data.billingId },
      data: {
        paymentStatus,
        paymentDate: paymentStatus === 'paid' ? new Date().toISOString().slice(0, 10) : billing.paymentDate,
      },
    })

    return NextResponse.json({ ok: true, id: payment.id })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const billingId = searchParams.get('billingId')

  const payments = await db.payment.findMany({
    where: billingId ? { billingId } : undefined,
    include: { receivedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ ok: true, data: payments })
}
