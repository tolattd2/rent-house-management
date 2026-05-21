import { getRoomsList, getSettingsMap } from '@/lib/cached-queries'
import { RoomsClient } from './rooms-client'

export const dynamic = 'force-dynamic'

export default async function RoomsPage() {
  const [rooms, settings] = await Promise.all([getRoomsList(), getSettingsMap()])
  return <RoomsClient rooms={rooms} settings={settings} />
}
