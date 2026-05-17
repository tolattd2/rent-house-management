import { db } from '@/lib/db'
import { MaintenanceClient } from './maintenance-client'

async function getData() {
  const [records, rooms, tenants] = await Promise.all([
    db.maintenance.findMany({
      include: {
        room: { select: { id: true, roomNumber: true, branch: true } },
        tenant: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.room.findMany({
      select: { id: true, roomNumber: true, branch: true },
      orderBy: { roomNumber: 'asc' },
    }),
    db.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    }),
  ])
  return { records, rooms, tenants }
}

export default async function MaintenancePage() {
  const { records, rooms, tenants } = await getData()
  return <MaintenanceClient records={records} rooms={rooms} tenants={tenants} />
}
