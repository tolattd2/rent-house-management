import { db } from './db'

export const ROOM_MAP_MIN = { w: 40, h: 28 } as const
export const ROOM_MAP_MAX = { w: 800, h: 600 } as const

export type RoomMapBlock = {
  id: string
  roomId: string
  branch: string
  floor: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
}

export type RoomMapRoom = {
  id: string
  roomNumber: string
  branch: string
  floor: string
  status: 'occupied' | 'vacant' | 'maintenance'
  rentPriceUsd: number
  tenant: {
    id: string
    fullName: string
    phone: string
    moveInDate: string
  } | null
  outstandingUsd: number
  paymentStatus: 'paid' | 'partial' | 'unpaid' | null
  hasReservation: boolean
}

export type RoomMapView = {
  branch: string
  floor: string
  hasFloors: boolean
  layouts: RoomMapBlock[]
  rooms: RoomMapRoom[]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function sanitizeLayout(input: Partial<RoomMapBlock>): Omit<RoomMapBlock, 'id'> {
  return {
    roomId: String(input.roomId ?? ''),
    branch: String(input.branch ?? ''),
    floor: String(input.floor ?? '1'),
    x: Number.isFinite(input.x) ? Math.round(Number(input.x)) : 0,
    y: Number.isFinite(input.y) ? Math.round(Number(input.y)) : 0,
    width: clamp(Number.isFinite(input.width) ? Number(input.width) : 120, ROOM_MAP_MIN.w, ROOM_MAP_MAX.w),
    height: clamp(Number.isFinite(input.height) ? Number(input.height) : 80, ROOM_MAP_MIN.h, ROOM_MAP_MAX.h),
    rotation: Number.isFinite(input.rotation) ? Number(input.rotation) % 360 : 0,
    zIndex: Number.isFinite(input.zIndex) ? Math.round(Number(input.zIndex)) : 0,
  }
}

// Load layouts + room status/tenant info in one round-trip.
// - For houses (hasFloors=false): one big map for the whole branch, all
//   rooms and all layouts loaded together.
// - For apartments (hasFloors=true): the canvas is per floor — only that
//   floor's layouts load, but the picker still shows every room in the
//   branch so you can place rooms from any floor onto the current map.
export async function loadRoomMapView(branch: string, floor: string, hasFloors: boolean): Promise<RoomMapView> {
  const layoutWhere = hasFloors ? { branch, floor } : { branch }
  const [layouts, rooms] = await Promise.all([
    db.roomMapLayout.findMany({ where: layoutWhere }),
    db.room.findMany({
      where: { branch },
      include: {
        tenants: {
          where: { status: 'active' },
          select: {
            id: true,
            fullName: true,
            phone: true,
            moveInDate: true,
            notices: {
              where: { status: 'open', type: 'move_out' },
              select: { id: true },
              take: 1,
            },
          },
          take: 1,
        },
        billings: {
          where: { paymentStatus: { in: ['unpaid', 'partial'] } },
          select: {
            totalUsd: true,
            paymentStatus: true,
            payments: { select: { amountUsd: true } },
          },
        },
      },
    }),
  ])

  const mappedRooms: RoomMapRoom[] = rooms.map((r) => {
    const outstanding = r.billings.reduce((sum, b) => {
      const paid = b.payments.reduce((s, p) => s + p.amountUsd, 0)
      return sum + Math.max(0, b.totalUsd - paid)
    }, 0)
    const worst = r.billings.find((b) => b.paymentStatus === 'unpaid')
      ?? r.billings.find((b) => b.paymentStatus === 'partial')
    const tenant = r.tenants[0]
    const reservation = (tenant?.notices?.length ?? 0) > 0
    return {
      id: r.id,
      roomNumber: r.roomNumber,
      branch: r.branch,
      floor: r.floor,
      status: r.status,
      rentPriceUsd: r.rentPriceUsd,
      tenant: tenant
        ? { id: tenant.id, fullName: tenant.fullName, phone: tenant.phone, moveInDate: tenant.moveInDate }
        : null,
      outstandingUsd: Math.round(outstanding * 100) / 100,
      paymentStatus: worst?.paymentStatus ?? null,
      hasReservation: reservation,
    }
  })

  return {
    branch,
    floor,
    hasFloors,
    layouts: layouts.map((l) => ({
      id: l.id,
      roomId: l.roomId,
      branch: l.branch,
      floor: l.floor,
      x: l.x,
      y: l.y,
      width: l.width,
      height: l.height,
      rotation: l.rotation,
      zIndex: l.zIndex,
    })),
    rooms: mappedRooms,
  }
}

// Persist a full set of layouts in one transaction, scoped to match what
// the caller loaded:
// - hasFloors=true: scope is branch+floor. Other floors are untouched.
// - hasFloors=false: scope is the whole branch (houses have one big map),
//   so missing rooms are removed branch-wide and incoming blocks are
//   pinned to floor '1' regardless of what the client sent.
export async function saveRoomMapLayout(
  branch: string,
  floor: string,
  hasFloors: boolean,
  blocks: Array<Partial<RoomMapBlock>>,
) {
  const normalizedFloor = hasFloors ? floor : '1'
  const safe = blocks
    .map((b) => sanitizeLayout({ ...b, branch, floor: normalizedFloor }))
    .filter((b) => b.roomId)

  const keepRoomIds = new Set(safe.map((b) => b.roomId))
  const deleteWhere = hasFloors
    ? { branch, floor, NOT: { roomId: { in: Array.from(keepRoomIds) } } }
    : { branch, NOT: { roomId: { in: Array.from(keepRoomIds) } } }

  await db.$transaction([
    ...safe.map((b) =>
      db.roomMapLayout.upsert({
        where: { roomId: b.roomId },
        create: b,
        update: {
          branch: b.branch,
          floor: b.floor,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          rotation: b.rotation,
          zIndex: b.zIndex,
        },
      }),
    ),
    db.roomMapLayout.deleteMany({ where: deleteWhere }),
  ])
}

// Distinct floors that have at least one room in a branch, for the floor picker.
export async function listFloorsForBranch(branch: string): Promise<string[]> {
  const rows = await db.room.findMany({
    where: { branch },
    select: { floor: true },
    distinct: ['floor'],
  })
  const floors = rows
    .map((r) => r.floor || '1')
    .sort((a, b) => {
      const na = parseInt(a, 10)
      const nb = parseInt(b, 10)
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
      return a.localeCompare(b)
    })
  return floors.length > 0 ? floors : ['1']
}
