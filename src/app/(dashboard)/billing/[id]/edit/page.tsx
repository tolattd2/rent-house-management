import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { CreateBillingClient } from '../../create/create-billing-client'

export const dynamic = 'force-dynamic'

export default async function EditBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const billing = await db.billing.findUnique({
    where: { id },
    include: {
      tenant: {
        include: {
          room: true,
          notices: {
            where: { status: 'open' },
            orderBy: { createdAt: 'desc' },
            select: { id: true, type: true, message: true, expectedDate: true, createdAt: true },
          },
        },
      },
    },
  })
  if (!billing || !billing.tenant) notFound()

  const settingsRows = await db.setting.findMany()
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]))

  const room = billing.tenant.room
  const tenants = [{
    id: billing.tenant.id,
    fullName: billing.tenant.fullName,
    phone: billing.tenant.phone,
    monthlyRent: billing.tenant.monthlyRent,
    payDay: billing.tenant.payDay,
    room: room
      ? {
          id: room.id,
          roomNumber: room.roomNumber,
          branch: room.branch ?? undefined,
          rentPriceUsd: room.rentPriceUsd,
          waterRateRiel: room.waterRateRiel,
          electricRateRiel: room.electricRateRiel,
        }
      : null,
    billings: [],
    notices: billing.tenant.notices,
  }]

  return (
    <CreateBillingClient
      tenants={tenants}
      settings={settings}
      editBilling={{
        id: billing.id,
        tenantId: billing.tenantId,
        billingMonth: billing.billingMonth,
        prevWaterReading: billing.prevWaterReading,
        currWaterReading: billing.currWaterReading,
        prevElectricReading: billing.prevElectricReading,
        currElectricReading: billing.currElectricReading,
        roomRentUsd: billing.roomRentUsd,
        outstandingDebtUsd: billing.outstandingDebtUsd,
        lateDays: billing.lateDays,
        latePenaltyUsd: billing.latePenaltyUsd,
        discountUsd: billing.discountUsd,
        notes: billing.notes ?? '',
      }}
    />
  )
}
