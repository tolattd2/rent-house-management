import { db } from '@/lib/db'
import { InvoicesClient } from './invoices-client'

async function getInvoices() {
  return db.invoice.findMany({
    include: {
      tenant: { select: { id: true, fullName: true } },
      billing: { select: { billingMonth: true, totalUsd: true, paymentStatus: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export default async function InvoicesPage() {
  const invoices = await getInvoices()
  return <InvoicesClient invoices={invoices} />
}
