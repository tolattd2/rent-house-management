import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { calculateBilling } from '@/lib/billing'
import { parseBranches, resolveBranchRates } from '@/lib/branches'
import { invalidate } from '@/lib/revalidate'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-locks'

function periodLockedResponse(err: PeriodLockedError) {
  return NextResponse.json(
    { ok: false, error: `Period ${err.month} is locked. Unlock it first to edit.`, code: 'period_locked' },
    { status: 423 },
  )
}

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
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  try {
    const body = await req.json()
    const recalcFields = ['currWaterReading', 'currElectricReading', 'lateDays', 'discountUsd', 'roomRentUsd', 'outstandingDebtUsd']

    // Resolve the billing's month for the period-lock guard. Need this even
    // when no recalc fields changed (e.g. notes-only update).
    const lockGuardExisting = await db.billing.findUnique({ where: { id }, select: { billingMonth: true, room: true } })
    if (!lockGuardExisting) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
    await assertPeriodOpen(lockGuardExisting.billingMonth)
    if (typeof body.billingMonth === 'string' && body.billingMonth !== lockGuardExisting.billingMonth) {
      await assertPeriodOpen(body.billingMonth)
    }

    if (Object.keys(body).some((k) => recalcFields.includes(k))) {
      const existing = await db.billing.findUnique({ where: { id }, include: { room: true } })
      if (!existing) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

      const settings = await db.setting.findMany()
      const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))
      const merged = { ...existing, ...body }
      const rates = resolveBranchRates(settingsMap, parseBranches(settingsMap.branches), existing.room?.branch)
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
        rates,
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
    invalidate('billings', 'tenants', 'invoices')
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof PeriodLockedError) return periodLockedResponse(e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  try {
    const existing = await db.billing.findUnique({ where: { id }, select: { billingMonth: true } })
    if (!existing) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
    await assertPeriodOpen(existing.billingMonth)
    await db.billing.delete({ where: { id } })
    invalidate('billings', 'tenants', 'invoices')
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof PeriodLockedError) return periodLockedResponse(e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
