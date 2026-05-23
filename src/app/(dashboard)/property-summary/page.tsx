import { getPropertySummaryData, getSettingsMap } from '@/lib/cached-queries'
import { PropertySummaryClient } from './property-summary-client'

export const dynamic = 'force-dynamic'

export default async function PropertySummaryPage() {
  const [data, settings] = await Promise.all([
    getPropertySummaryData(),
    getSettingsMap(),
  ])

  return (
    <PropertySummaryClient
      rooms={data.rooms}
      tenants={data.tenants}
      billings={data.billings}
      expenses={data.expenses}
      maintenance={data.maintenance}
      settings={settings}
    />
  )
}
