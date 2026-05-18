import { db } from '@/lib/db'
import { BatchPrintClient } from './batch-print-client'

export default async function BatchPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; month?: string }>
}) {
  const { branch, month } = await searchParams

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
    include: { tenant: true, room: true, payments: true },
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
    waterUsage: b.waterUsage,
    waterCostRiel: b.waterCostRiel,
    electricUsage: b.electricUsage,
    electricCostRiel: b.electricCostRiel,
    outstandingDebtUsd: b.outstandingDebtUsd,
    latePenaltyUsd: b.latePenaltyUsd,
    discountUsd: b.discountUsd,
    totalUsd: b.totalUsd,
    totalRiel: b.totalRiel,
    exchangeRate: b.exchangeRate,
    paymentStatus: b.paymentStatus,
    invoiceNumber: invoiceMap[b.id] ?? `${month}-${b.room?.roomNumber ?? b.id.slice(-4)}`,
    tenant: b.tenant ? { fullName: b.tenant.fullName, phone: b.tenant.phone } : null,
    room: b.room ? { roomNumber: b.room.roomNumber, branch: b.room.branch } : null,
    payments: b.payments.map((p) => ({ amountUsd: p.amountUsd })),
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
