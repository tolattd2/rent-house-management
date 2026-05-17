import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { BillingDetailClient } from './billing-detail-client'

async function getBilling(id: string) {
  return db.billing.findUnique({
    where: { id },
    include: {
      tenant: true,
      room: true,
      payments: {
        include: { receivedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}

export default async function BillingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const billing = await getBilling(id)
  if (!billing) notFound()
  return <BillingDetailClient billing={billing} />
}
