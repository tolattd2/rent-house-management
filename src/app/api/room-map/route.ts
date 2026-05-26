import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { invalidate } from '@/lib/revalidate'
import { getSettingsMap } from '@/lib/cached-queries'
import { branchHasFloors, findBranch, parseBranches } from '@/lib/branches'
import { loadRoomMapView, saveRoomMapLayout, type RoomMapBlock } from '@/lib/room-map-service'

async function resolveHasFloors(branchName: string): Promise<boolean> {
  const settings = await getSettingsMap()
  const branches = parseBranches(settings.branches)
  return branchHasFloors(findBranch(branches, branchName))
}

// GET /api/room-map?branch=Takmoa&floor=1
// Anyone signed in can read the map; only admins write.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')
  const floor = searchParams.get('floor') ?? '1'
  if (!branch) return NextResponse.json({ ok: false, error: 'branch required' }, { status: 400 })
  const hasFloors = await resolveHasFloors(branch)
  const view = await loadRoomMapView(branch, hasFloors ? floor : '1', hasFloors)
  return NextResponse.json({ ok: true, view })
}

// POST /api/room-map  { branch, floor, blocks: [...] }
// Replaces the layout in the scope the branch uses — per-floor for
// apartments, branch-wide for houses.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }
  let body: { branch?: string; floor?: string; blocks?: Array<Partial<RoomMapBlock>> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }
  const branch = body.branch
  const floor = body.floor ?? '1'
  if (!branch) return NextResponse.json({ ok: false, error: 'branch required' }, { status: 400 })
  if (!Array.isArray(body.blocks)) {
    return NextResponse.json({ ok: false, error: 'blocks must be an array' }, { status: 400 })
  }
  const hasFloors = await resolveHasFloors(branch)
  await saveRoomMapLayout(branch, hasFloors ? floor : '1', hasFloors, body.blocks)
  invalidate('rooms')
  return NextResponse.json({ ok: true })
}
