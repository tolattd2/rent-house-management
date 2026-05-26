import { auth } from '@/lib/auth'
import { listFloorsForBranch, loadRoomMapView } from '@/lib/room-map-service'
import { branchHasFloors, findBranch, parseBranches } from '@/lib/branches'
import { getSettingsMap } from '@/lib/cached-queries'
import { RoomMapClient } from './room-map-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ branch?: string; floor?: string }>
}

export default async function RoomMapPage({ searchParams }: PageProps) {
  const [session, settings, sp] = await Promise.all([auth(), getSettingsMap(), searchParams])
  const branches = parseBranches(settings.branches)
  const branchName = sp.branch && branches.some((b) => b.name === sp.branch) ? sp.branch : branches[0]?.name ?? 'Takmoa'
  const hasFloors = branchHasFloors(findBranch(branches, branchName))
  const floors = hasFloors ? await listFloorsForBranch(branchName) : ['1']
  const floor = hasFloors
    ? (sp.floor && floors.includes(sp.floor) ? sp.floor : floors[0] ?? '1')
    : '1'
  const view = await loadRoomMapView(branchName, floor, hasFloors)
  const isAdmin = session?.user?.role === 'admin'
  return (
    <RoomMapClient
      isAdmin={isAdmin}
      initialBranch={branchName}
      initialFloor={floor}
      initialFloors={floors}
      initialView={view}
    />
  )
}
