import { db } from '@/lib/db'
import { RoomsClient } from './rooms-client'

async function getRooms() {
  return db.room.findMany({
    include: {
      tenants: {
        where: { status: 'active' },
        select: { id: true, fullName: true, phone: true, moveInDate: true },
        take: 1,
      },
    },
    orderBy: [{ roomNumber: 'asc' }],
  })
}

export default async function RoomsPage() {
  const rooms = await getRooms()
  return <RoomsClient rooms={rooms} />
}
