import { db } from '@/lib/db'
import { CreateBillingClient } from './create-billing-client'

async function getActiveTenantsWithRooms() {
  return db.tenant.findMany({
    where: { status: 'active', roomId: { not: null } },
    include: {
      room: true,
      billings: {
        orderBy: { billingMonth: 'desc' },
        take: 1,
        select: {
          billingMonth: true, currWaterReading: true, currElectricReading: true,
          totalUsd: true, paymentStatus: true,
        },
      },
      notices: {
        where: { status: 'open' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, message: true, expectedDate: true, createdAt: true },
      },
    },
    orderBy: { room: { roomNumber: 'asc' } },
  })
}

async function getSettings() {
  const rows = await db.setting.findMany()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

/** Every (tenant, month) pair that already has a bill — used to block duplicates.
 *  Two narrow columns only, so it stays cheap as the billing table grows. */
async function getBilledKeys() {
  const rows = await db.billing.findMany({ select: { tenantId: true, billingMonth: true } })
  return rows.map((r) => `${r.tenantId}|${r.billingMonth}`)
}

export default async function CreateBillingPage({ searchParams }: { searchParams: Promise<{ tenantId?: string }> }) {
  const [tenants, settings, billedKeys, params] = await Promise.all([
    getActiveTenantsWithRooms(), getSettings(), getBilledKeys(), searchParams,
  ])
  return (
    <CreateBillingClient
      tenants={tenants}
      settings={settings}
      preselectedTenantId={params.tenantId}
      billedKeys={billedKeys}
    />
  )
}
