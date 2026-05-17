import { db } from '@/lib/db'
import { TenantsClient } from './tenants-client'

async function getTenants() {
  return db.tenant.findMany({
    include: {
      room: { select: { id: true, roomNumber: true, branch: true, rentPriceUsd: true } },
      billings: {
        where: { paymentStatus: { in: ['unpaid', 'partial'] } },
        select: { id: true, totalUsd: true, paymentStatus: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

async function getRooms() {
  return db.room.findMany({
    where: { status: { in: ['vacant', 'occupied'] } },
    select: { id: true, roomNumber: true, branch: true, status: true, rentPriceUsd: true },
    orderBy: { roomNumber: 'asc' },
  })
}

export default async function TenantsPage() {
  const [tenants, rooms] = await Promise.all([getTenants(), getRooms()])
  return <TenantsClient tenants={tenants} rooms={rooms} />
}
