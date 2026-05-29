import { getNoticesData } from '@/lib/cached-queries'
import { NoticesClient } from './notices-client'

export const dynamic = 'force-dynamic'

export default async function NoticesPage() {
  const { notices, tenants, rooms } = await getNoticesData()
  return <NoticesClient notices={notices} tenants={tenants} rooms={rooms} />
}
