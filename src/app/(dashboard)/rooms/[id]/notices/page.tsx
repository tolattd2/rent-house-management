import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { RoomNoticeHistoryClient } from './notice-history-client'

export const dynamic = 'force-dynamic'

export default async function RoomNoticeHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const room = await db.room.findUnique({
    where: { id },
    select: {
      id: true, roomNumber: true, branch: true, status: true,
      tenants: {
        where: { status: 'active' },
        select: { id: true, fullName: true },
        take: 1,
      },
      notices: {
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          tenant: { select: { id: true, fullName: true } },
        },
      },
    },
  })
  if (!room) notFound()
  return <RoomNoticeHistoryClient room={room} />
}
