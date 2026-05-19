import { getMaintenanceData } from '@/lib/cached-queries'
import { MaintenanceClient } from './maintenance-client'

export const dynamic = 'force-dynamic'

export default async function MaintenancePage() {
  const { records, rooms, tenants } = await getMaintenanceData()
  return <MaintenanceClient records={records} rooms={rooms} tenants={tenants} />
}
