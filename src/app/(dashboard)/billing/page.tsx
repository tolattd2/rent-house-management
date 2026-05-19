import { db } from '@/lib/db'
import { BillingListClient } from './billing-list-client'

async function getBillings() {
  return db.billing.findMany({
    include: {
      tenant: { select: { id: true, fullName: true, phone: true, payDay: true } },
      room: { select: { id: true, roomNumber: true, branch: true } },
      payments: { select: { id: true, amountUsd: true } },
    },
    orderBy: [{ billingMonth: 'desc' }, { createdAt: 'desc' }],
  })
}

export default async function BillingPage() {
  const billings = await getBillings()
  return <BillingListClient billings={billings} />
}
