import { auth } from '@/lib/auth'
import { listFloorsForBranch, loadRoomMapView } from '@/lib/room-map-service'
import { parseBranches } from '@/lib/branches'
import { getSettingsMap } from '@/lib/cached-queries'
import { RoomMapClient } from './room-map-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ branch?: string; floor?: string }>
}

export default async function RoomMapPage({ searchParams }: PageProps) {
  const [session, settings, sp] = await Promise.all([auth(), getSettingsMap(), searchParams])
  const branches = parseBranches(settings.branches)
  const branch = sp.branch && branches.some((b) => b.name === sp.branch) ? sp.branch : branches[0]?.name ?? 'Takmoa'
  const floors = await listFloorsForBranch(branch)
  const floor = sp.floor && floors.includes(sp.floor) ? sp.floor : floors[0] ?? '1'
  const view = await loadRoomMapView(branch, floor)
  const isAdmin = session?.user?.role === 'admin'
  return (
    <RoomMapClient
      isAdmin={isAdmin}
      initialBranch={branch}
      initialFloor={floor}
      initialFloors={floors}
      initialView={view}
    />
  )
}
