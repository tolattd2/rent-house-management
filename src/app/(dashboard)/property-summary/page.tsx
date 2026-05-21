import { getDashboardData, getMaintenanceData, getSettingsMap } from '@/lib/cached-queries'
import { PropertySummaryClient } from './property-summary-client'

export const dynamic = 'force-dynamic'

export default async function PropertySummaryPage() {
  const [data, maintenance, settings] = await Promise.all([
    getDashboardData(),
    getMaintenanceData(),
    getSettingsMap(),
  ])

  return (
    <PropertySummaryClient
      rooms={data.rooms}
      tenants={data.tenants}
      billings={data.billings}
      expenses={data.expenses}
      maintenance={maintenance.records.map((r) => ({ branch: r.room?.branch ?? null, status: r.status }))}
      settings={settings}
    />
  )
}
