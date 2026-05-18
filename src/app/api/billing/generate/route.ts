import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { calculateBilling } from '@/lib/billing'

// GET — preview: how many tenants would get invoices for month+branch
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const branch = searchParams.get('branch')

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ ok: false, error: 'Invalid month' }, { status: 400 })
  }

  const where: Record<string, unknown> = { status: 'active', roomId: { not: null } }
  if (branch && branch !== 'all') where.room = { branch }

  const tenants = await db.tenant.findMany({
    where,
    select: {
      id: true,
      billings: { where: { billingMonth: month }, select: { id: true } },
    },
  })

  const willGenerate = tenants.filter((t) => t.billings.length === 0).length
  const alreadyExists = tenants.filter((t) => t.billings.length > 0).length

  return NextResponse.json({ ok: true, willGenerate, alreadyExists })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  try {
    const { month, branch } = await req.json()
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ ok: false, error: 'Invalid month format (YYYY-MM)' }, { status: 400 })
    }

    const where: Record<string, unknown> = { status: 'active', roomId: { not: null } }
    if (branch && branch !== 'all') where.room = { branch }

    const [activeTenants, settings] = await Promise.all([
      db.tenant.findMany({
        where,
        include: {
          room: true,
          billings: { orderBy: { billingMonth: 'desc' }, take: 1 },
        },
      }),
      db.setting.findMany(),
    ])

    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))
    let created = 0
    let skipped = 0

    for (const tenant of activeTenants) {
      if (!tenant.roomId || !tenant.room) { skipped++; continue }

      const exists = await db.billing.findUnique({
        where: { tenantId_billingMonth: { tenantId: tenant.id, billingMonth: month } },
      })
      if (exists) { skipped++; continue }

      const prev = tenant.billings[0]
      const outstandingDebt = prev && prev.paymentStatus === 'unpaid' ? prev.totalUsd : 0

      const input = {
        prevWaterReading: prev?.currWaterReading ?? 0,
        currWaterReading: prev?.currWaterReading ?? 0,
        prevElectricReading: prev?.currElectricReading ?? 0,
        currElectricReading: prev?.currElectricReading ?? 0,
        roomRentUsd: tenant.monthlyRent > 0 ? tenant.monthlyRent : tenant.room.rentPriceUsd,
        outstandingDebtUsd: outstandingDebt,
        lateDays: 0,
        discountUsd: 0,
      }

      const calc = calculateBilling(input, settingsMap, tenant.room)

      await db.billing.create({
        data: {
          tenantId: tenant.id,
          roomId: tenant.roomId,
          billingMonth: month,
          prevWaterReading: input.prevWaterReading,
          currWaterReading: input.currWaterReading,
          waterUsage: calc.waterUsage,
          waterCostRiel: calc.waterCostRiel,
          prevElectricReading: input.prevElectricReading,
          currElectricReading: input.currElectricReading,
          electricUsage: calc.electricUsage,
          electricCostRiel: calc.electricCostRiel,
          roomRentUsd: input.roomRentUsd,
          outstandingDebtUsd: input.outstandingDebtUsd,
          lateDays: 0,
          latePenaltyUsd: 0,
          discountUsd: 0,
          totalUsd: calc.totalUsd,
          totalRiel: calc.totalRiel,
          exchangeRate: calc.exchangeRate,
          paymentStatus: 'unpaid',
          notes: 'Auto-generated',
        },
      })
      created++
    }

    return NextResponse.json({ ok: true, created, skipped })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
