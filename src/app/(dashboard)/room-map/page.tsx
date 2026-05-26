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
  const branchObj = findBranch(branches, branchName)
  const hasFloors = branchHasFloors(branchObj)
  // Union 1..floorCount with whatever floors already have rooms, so the
  // selector reflects both the configured count and any legacy data.
  const configured = Array.from({ length: Math.max(1, branchObj?.floorCount ?? 1) }, (_, i) => String(i + 1))
  const existing = hasFloors ? await listFloorsForBranch(branchName) : ['1']
  const merged = Array.from(new Set([...configured, ...existing]))
  const floors = hasFloors
    ? merged.sort((a, b) => {
        const na = parseInt(a, 10)
        const nb = parseInt(b, 10)
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
        return a.localeCompare(b)
      })
    : ['1']
  const floor = hasFloors
    ? (sp.floor && floors.includes(sp.floor) ? sp.floor : floors[0] ?? '1')
    : '1'
  const view = await loadRoomMapView(branchName, floor, hasFloors, branchObj?.floorCount ?? 1)
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
