import { getTenantsList, getTenantsRoomsLookup } from '@/lib/cached-queries'
import { TenantsClient } from './tenants-client'

export default async function TenantsPage() {
  const [tenants, rooms] = await Promise.all([getTenantsList(), getTenantsRoomsLookup()])
  return <TenantsClient tenants={tenants} rooms={rooms} />
}
