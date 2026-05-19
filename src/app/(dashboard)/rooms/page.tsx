import { getRoomsList } from '@/lib/cached-queries'
import { RoomsClient } from './rooms-client'

export const dynamic = 'force-dynamic'

export default async function RoomsPage() {
  const rooms = await getRoomsList()
  return <RoomsClient rooms={rooms} />
}
