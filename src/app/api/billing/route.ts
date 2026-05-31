import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { calculateBilling } from '@/lib/billing'
import { parseBranches, resolveBranchRates } from '@/lib/branches'
import { invalidate } from '@/lib/revalidate'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-locks'
import { z } from 'zod'

function periodLockedResponse(err: PeriodLockedError) {
  return NextResponse.json(
    { ok: false, error: `Period ${err.month} is locked. Unlock it first to edit.`, code: 'period_locked' },
    { status: 423 },
  )
}

const billingSchema = z.object({
  tenantId: z.string().min(1),
  billingMonth: z.string().min(1),
  prevWaterReading: z.coerce.number().min(0).default(0),
  currWaterReading: z.coerce.number().min(0).default(0),
  prevElectricReading: z.coerce.number().min(0).default(0),
  currElectricReading: z.coerce.number().min(0).default(0),
  roomRentUsd: z.coerce.number().min(0).default(0),
  outstandingDebtUsd: z.coerce.number().min(0).default(0),
  lateDays: z.coerce.number().int().min(0).default(0),
  latePenaltyUsd: z.coerce.number().min(0).optional(),
  discountUsd: z.coerce.number().min(0).default(0),
  notes: z.string().default(''),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const status = searchParams.get('status')

  const billings = await db.billing.findMany({
    where: {
      ...(month ? { billingMonth: month } : {}),
      ...(status ? { paymentStatus: status as 'paid' | 'unpaid' | 'partial' } : {}),
    },
    include: {
      tenant: { select: { id: true, fullName: true, phone: true } },
      room: { select: { id: true, roomNumber: true } },
      payments: true,
    },
    orderBy: [{ billingMonth: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ ok: true, data: billings })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const data = billingSchema.parse(body)
    await assertPeriodOpen(data.billingMonth)

    // Get tenant's room
    const tenant = await db.tenant.findUnique({
      where: { id: data.tenantId },
      include: { room: true },
    })
    if (!tenant) return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 })
    if (!tenant.roomId) return NextResponse.json({ ok: false, error: 'Tenant has no room assigned' }, { status: 400 })

    // Check duplicate
    const existing = await db.billing.findUnique({
      where: { tenantId_billingMonth: { tenantId: data.tenantId, billingMonth: data.billingMonth } },
    })
    if (existing) return NextResponse.json({ ok: false, error: 'Billing already exists for this tenant and month' }, { status: 400 })

    // Get settings
    const settings = await db.setting.findMany()
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))

    // Calculate using the rates configured for this room's branch
    const rates = resolveBranchRates(settingsMap, parseBranches(settingsMap.branches), tenant.room?.branch)
    const calc = calculateBilling(data, rates)

    const billing = await db.billing.create({
      data: {
        tenantId: data.tenantId,
        roomId: tenant.roomId,
        billingMonth: data.billingMonth,
        prevWaterReading: data.prevWaterReading,
        currWaterReading: data.currWaterReading,
        waterUsage: calc.waterUsage,
        waterCostRiel: calc.waterCostRiel,
        prevElectricReading: data.prevElectricReading,
        currElectricReading: data.currElectricReading,
        electricUsage: calc.electricUsage,
        electricCostRiel: calc.electricCostRiel,
        roomRentUsd: data.roomRentUsd,
        outstandingDebtUsd: data.outstandingDebtUsd,
        lateDays: data.lateDays,
        latePenaltyUsd: calc.latePenaltyUsd,
        discountUsd: data.discountUsd,
        totalUsd: calc.totalUsd,
        totalRiel: calc.totalRiel,
        exchangeRate: calc.exchangeRate,
        paymentStatus: 'unpaid',
        notes: data.notes,
      },
    })

    invalidate('billings', 'tenants')
    return NextResponse.json({ ok: true, id: billing.id })
  } catch (e) {
    if (e instanceof PeriodLockedError) return periodLockedResponse(e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
