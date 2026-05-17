import { db } from '@/lib/db'
import { NotificationsClient } from './notifications-client'

async function getData() {
  const [notifications, unpaidBillings] = await Promise.all([
    db.notification.findMany({
      include: { tenant: { select: { id: true, fullName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.billing.findMany({
      where: { paymentStatus: { in: ['unpaid', 'partial'] } },
      include: {
        tenant: { select: { id: true, fullName: true, phone: true } },
        room: { select: { id: true, roomNumber: true } },
      },
    }),
  ])
  return { notifications, unpaidBillings }
}

export default async function NotificationsPage() {
  const data = await getData()
  return <NotificationsClient {...data} />
}
