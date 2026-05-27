import { db } from '@/lib/db'

// Bidirectional lookup tables for cross-sheet foreign keys. Loaded once
// per export/import so we can both render human-readable references on
// export and resolve them back to ids on import.
export interface RefData {
  roomByKey: Map<string, string>            // 'roomNumber|branch' → roomId
  roomById: Map<string, { roomNumber: string; branch: string }>
  tenantByKey: Map<string, string>          // 'fullName|phone' → tenantId
  tenantById: Map<string, { fullName: string; phone: string }>
  billingByKey: Map<string, string>         // 'tenantId|billingMonth' → billingId
  billingById: Map<string, { tenantId: string; billingMonth: string }>
  maintenanceById: Map<string, { title: string; reportedDate: string }>
}

export const EMPTY_REFS: RefData = {
  roomByKey: new Map(),
  roomById: new Map(),
  tenantByKey: new Map(),
  tenantById: new Map(),
  billingByKey: new Map(),
  billingById: new Map(),
  maintenanceById: new Map(),
}

export const roomKey = (roomNumber: string, branch: string) => `${roomNumber}|${branch}`
export const tenantKey = (fullName: string, phone: string) => `${fullName}|${phone}`
export const billingKey = (tenantId: string, billingMonth: string) => `${tenantId}|${billingMonth}`

export async function loadRefs(): Promise<RefData> {
  const [rooms, tenants, billings, maintenances] = await Promise.all([
    db.room.findMany({ select: { id: true, roomNumber: true, branch: true } }),
    db.tenant.findMany({ select: { id: true, fullName: true, phone: true } }),
    db.billing.findMany({ select: { id: true, tenantId: true, billingMonth: true } }),
    db.maintenance.findMany({ select: { id: true, title: true, reportedDate: true } }),
  ])

  const refs: RefData = {
    roomByKey: new Map(),
    roomById: new Map(),
    tenantByKey: new Map(),
    tenantById: new Map(),
    billingByKey: new Map(),
    billingById: new Map(),
    maintenanceById: new Map(),
  }

  for (const r of rooms) {
    refs.roomByKey.set(roomKey(r.roomNumber, r.branch), r.id)
    refs.roomById.set(r.id, { roomNumber: r.roomNumber, branch: r.branch })
  }
  for (const t of tenants) {
    refs.tenantByKey.set(tenantKey(t.fullName, t.phone), t.id)
    refs.tenantById.set(t.id, { fullName: t.fullName, phone: t.phone })
  }
  for (const b of billings) {
    refs.billingByKey.set(billingKey(b.tenantId, b.billingMonth), b.id)
    refs.billingById.set(b.id, { tenantId: b.tenantId, billingMonth: b.billingMonth })
  }
  for (const m of maintenances) {
    refs.maintenanceById.set(m.id, { title: m.title, reportedDate: m.reportedDate })
  }

  return refs
}
