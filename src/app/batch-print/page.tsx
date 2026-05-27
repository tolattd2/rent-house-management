import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { BatchPrintClient } from './batch-print-client'

export default async function BatchPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; month?: string }>
}) {
  const session = await auth()
  const { branch, month } = await searchParams

  if (!session || session.user.role === 'guest') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif', color: '#475569' }}>
        <p style={{ fontSize: '1.125rem', fontWeight: 600 }}>Access denied</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
          You do not have permission to print this page.
        </p>
      </div>
    )
  }

  if (!month || month === 'all') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif', color: '#475569' }}>
        <p style={{ fontSize: '1.125rem', fontWeight: 600 }}>No month selected</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
          Please go back to Billing, select a month filter, then click Batch Print.
        </p>
      </div>
    )
  }

  const billings = await db.billing.findMany({
    where: {
      billingMonth: month,
      ...(branch && branch !== 'all' ? { room: { branch } } : {}),
    },
    include: { tenant: true, room: true },
    orderBy: [{ room: { roomNumber: 'asc' } }],
  })

  const existingInvoices = await db.invoice.findMany({
    where: { billingId: { in: billings.map((b) => b.id) } },
  })
  const invoiceMap = Object.fromEntries(existingInvoices.map((inv) => [inv.billingId, inv.invoiceNumber]))

  const settings = await db.setting.findMany()
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  const data = billings.map((b) => ({
    id: b.id,
    billingMonth: b.billingMonth,
    roomRentUsd: b.roomRentUsd,
    prevWaterReading: b.prevWaterReading,
    currWaterReading: b.currWaterReading,
    waterUsage: b.waterUsage,
    waterCostRiel: b.waterCostRiel,
    prevElectricReading: b.prevElectricReading,
    currElectricReading: b.currElectricReading,
    electricUsage: b.electricUsage,
    electricCostRiel: b.electricCostRiel,
    outstandingDebtUsd: b.outstandingDebtUsd,
    lateDays: b.lateDays,
    latePenaltyUsd: b.latePenaltyUsd,
    discountUsd: b.discountUsd,
    totalUsd: b.totalUsd,
    totalRiel: b.totalRiel,
    exchangeRate: b.exchangeRate,
    paymentStatus: b.paymentStatus,
    invoiceNumber: invoiceMap[b.id] ?? `${month}-${b.room?.roomNumber ?? b.id.slice(-4)}`,
    payDay: b.tenant?.payDay,
    tenant: b.tenant ? { fullName: b.tenant.fullName, phone: b.tenant.phone, phonesExtra: b.tenant.phonesExtra } : null,
    room: b.room ? { roomNumber: b.room.roomNumber, branch: b.room.branch } : null,
  }))

  return (
    <BatchPrintClient
      billings={data}
      settings={settingsMap}
      month={month}
      branch={branch ?? 'all'}
    />
  )
}
