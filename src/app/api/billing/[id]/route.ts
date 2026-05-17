import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { calculateBilling } from '@/lib/billing'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const billing = await db.billing.findUnique({
    where: { id },
    include: {
      tenant: true,
      room: true,
      payments: { include: { receivedBy: { select: { id: true, name: true } } } },
      invoices: true,
    },
  })
  if (!billing) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, data: billing })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  try {
    const body = await req.json()
    const recalcFields = ['currWaterReading', 'currElectricReading', 'lateDays', 'discountUsd', 'roomRentUsd', 'outstandingDebtUsd']

    if (Object.keys(body).some((k) => recalcFields.includes(k))) {
      const existing = await db.billing.findUnique({ where: { id }, include: { room: true } })
      if (!existing) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

      const settings = await db.setting.findMany()
      const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))
      const merged = { ...existing, ...body }
      const calc = calculateBilling(
        {
          prevWaterReading: merged.prevWaterReading,
          currWaterReading: merged.currWaterReading,
          prevElectricReading: merged.prevElectricReading,
          currElectricReading: merged.currElectricReading,
          roomRentUsd: merged.roomRentUsd,
          outstandingDebtUsd: merged.outstandingDebtUsd,
          lateDays: merged.lateDays,
          discountUsd: merged.discountUsd,
        },
        settingsMap,
        existing.room
      )
      Object.assign(body, {
        waterUsage: calc.waterUsage,
        waterCostRiel: calc.waterCostRiel,
        electricUsage: calc.electricUsage,
        electricCostRiel: calc.electricCostRiel,
        latePenaltyUsd: calc.latePenaltyUsd,
        totalUsd: calc.totalUsd,
        totalRiel: calc.totalRiel,
        exchangeRate: calc.exchangeRate,
      })
    }

    await db.billing.update({ where: { id }, data: body })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  await db.billing.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
