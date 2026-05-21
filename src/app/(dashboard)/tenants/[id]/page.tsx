import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { TenantDetailClient } from './tenant-detail-client'

async function getTenant(id: string) {
  return db.tenant.findUnique({
    where: { id },
    include: {
      room: true,
      contracts: { orderBy: { createdAt: 'desc' } },
      billings: {
        include: { payments: true },
        orderBy: { billingMonth: 'desc' },
      },
      notifications: { orderBy: { createdAt: 'desc' }, take: 10 },
      notices: { orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] },
    },
  })
}

async function getRooms() {
  return db.room.findMany({
    select: { id: true, roomNumber: true, branch: true, status: true, rentPriceUsd: true },
    orderBy: { roomNumber: 'asc' },
  })
}

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [tenant, rooms] = await Promise.all([getTenant(id), getRooms()])
  if (!tenant) notFound()
  return <TenantDetailClient tenant={tenant} rooms={rooms} />
}
