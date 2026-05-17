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
    },
    orderBy: { room: { roomNumber: 'asc' } },
  })
}

async function getSettings() {
  const rows = await db.setting.findMany()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export default async function CreateBillingPage({ searchParams }: { searchParams: Promise<{ tenantId?: string }> }) {
  const [tenants, settings, params] = await Promise.all([getActiveTenantsWithRooms(), getSettings(), searchParams])
  return <CreateBillingClient tenants={tenants} settings={settings} preselectedTenantId={params.tenantId} />
}
