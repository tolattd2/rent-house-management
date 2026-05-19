import { getNotificationsData } from '@/lib/cached-queries'
import { NotificationsClient } from './notifications-client'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const data = await getNotificationsData()
  return <NotificationsClient {...data} />
}
